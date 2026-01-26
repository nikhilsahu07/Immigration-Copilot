import { Page } from 'playwright-core';
import { CanonicalField } from '../../../shared/types/automation.types';
import { logger } from '../../core/logger';

/**
 * FieldResolver - Semantic field discovery using accessibleName, labels, etc.
 * 
 * This replaces selector-based discovery with semantic matching that works
 * robustly for SPAs where DOM structure changes frequently.
 * 
 * RESOLUTION ORDER (Playwright best practice):
 * 1. getByRole(role, accessibleName) - PRIMARY (most reliable, SPA-friendly)
 * 2. getByLabel(labelText) - PRIMARY (semantic label association)
 * 3. getByPlaceholder - PRIMARY (placeholder text matching)
 * 4. Relative text → input - PRIMARY (find input near label text)
 * 5. getByText - PRIMARY (for buttons/links with text content)
 * 6. FALLBACK: selector - LAST RESORT ONLY (fragile, DOM-dependent)
 * 
 * Selectors are explicitly marked as FALLBACK and should only be used
 * when all semantic strategies fail. This follows Playwright best practices.
 */
export class FieldResolver {
  constructor(private page: Page) {}

  /**
   * Resolve a canonical field to a Playwright locator using semantic discovery
   * Returns the first working locator found, or null if all strategies fail
   * 
   * STRATEGY ORDER (semantic-first, selector-last):
   * 1. getByRole + accessibleName (PRIMARY)
   * 2. getByLabel (PRIMARY)
   * 3. getByPlaceholder (PRIMARY)
   * 4. Relative text → input (PRIMARY - find input near label)
   * 5. getByText for buttons/links (PRIMARY)
   * 6. FALLBACK: selector (LAST RESORT - explicitly marked as fallback)
   */
  async resolveField(field: CanonicalField): Promise<{ locator: any; strategy: string } | null> {
    // ============================================
    // PRIMARY STRATEGY 1: getByRole + accessibleName
    // ============================================
    // Most reliable for SPAs - uses ARIA role and accessible name
    if (field.role && field.accessibleName) {
      try {
        const locator = this.page.getByRole(field.role as any, { 
          name: field.accessibleName, 
          exact: false 
        });
        const count = await locator.count();
        if (count > 0) {
          logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via getByRole(${field.role})`);
          return { locator, strategy: `getByRole(${field.role}, "${field.accessibleName}")` };
        }
      } catch (error) {
        logger.debug(`[PRIMARY] getByRole failed for ${field.accessibleName}:`, error);
      }
    }

    // ============================================
    // PRIMARY STRATEGY 2: getByLabel
    // ============================================
    // Semantic label association - works with <label for="id"> or wrapping labels
    if (field.labels.labelText) {
      try {
        const locator = this.page.getByLabel(field.labels.labelText, { exact: false });
        const count = await locator.count();
        if (count > 0) {
          logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via getByLabel`);
          return { locator, strategy: `getByLabel("${field.labels.labelText}")` };
        }
      } catch (error) {
        logger.debug(`[PRIMARY] getByLabel failed for ${field.accessibleName}:`, error);
      }
    }

    // ============================================
    // PRIMARY STRATEGY 3: getByPlaceholder
    // ============================================
    // Placeholder text matching - common for inputs without explicit labels
    if (field.labels.placeholder) {
      try {
        const locator = this.page.getByPlaceholder(field.labels.placeholder, { exact: false });
        const count = await locator.count();
        if (count > 0) {
          logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via getByPlaceholder`);
          return { locator, strategy: `getByPlaceholder("${field.labels.placeholder}")` };
        }
      } catch (error) {
        logger.debug(`[PRIMARY] getByPlaceholder failed for ${field.accessibleName}:`, error);
      }
    }

    // ============================================
    // PRIMARY STRATEGY 4: Relative text → input
    // ============================================
    // Find input/select/textarea near label text (for cases without explicit label association)
    // This handles cases where label text appears near the input but isn't formally associated
    // Strategy: Find label text, then locate input in same container or following the label
    if (field.labels.labelText && (field.tag === 'input' || field.tag === 'select' || field.tag === 'textarea')) {
      try {
        // Find label text element
        const labelLocator = this.page.getByText(field.labels.labelText, { exact: false });
        const labelCount = await labelLocator.count();
        if (labelCount > 0) {
          const labelElement = labelLocator.first();
          
          // Strategy 4a: Find input in the same parent container as the label
          // This handles cases like: <div><label>Text</label><input></div>
          try {
            const parentContainer = labelElement.locator('..');
            const inputInContainer = parentContainer.locator(field.tag).first();
            const containerCount = await inputInContainer.count();
            if (containerCount > 0) {
              logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via relative text → input (same container)`);
              return { locator: inputInContainer, strategy: `relativeTextToInput("${field.labels.labelText}")` };
            }
          } catch {
            // Continue to next strategy
          }
          
          // Strategy 4b: Find input that follows the label (next sibling or in form)
          // Look for input that appears after the label in DOM order within the same form/container
          try {
            // Find the form or container that contains the label
            const formOrContainer = labelElement.locator('ancestor::form, ancestor::div, ancestor::section').first();
            const followingInput = formOrContainer.locator(`${field.tag}`).first();
            const followingCount = await followingInput.count();
            if (followingCount > 0) {
              logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via relative text → input (following in container)`);
              return { locator: followingInput, strategy: `relativeTextToInput("${field.labels.labelText}")` };
            }
          } catch {
            // Continue
          }
        }
      } catch (error) {
        logger.debug(`[PRIMARY] Relative text → input failed for ${field.accessibleName}:`, error);
      }
    }

    // ============================================
    // PRIMARY STRATEGY 5: getByText (for buttons/links)
    // ============================================
    // Text content matching - primarily for interactive elements like buttons and links
    if (field.tag === 'button' || field.tag === 'a') {
      try {
        const locator = this.page.getByText(field.accessibleName, { exact: false });
        const count = await locator.count();
        if (count > 0) {
          logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via getByText`);
          return { locator, strategy: `getByText("${field.accessibleName}")` };
        }
      } catch (error) {
        logger.debug(`[PRIMARY] getByText failed for ${field.accessibleName}:`, error);
      }
    }

    // ============================================
    // FALLBACK STRATEGY: Selector (LAST RESORT)
    // ============================================
    // ⚠️ SELECTORS ARE FRAGILE AND DOM-DEPENDENT
    // Only use when all semantic strategies fail
    // This is explicitly marked as FALLBACK - not a primary resolution path
    if (field.fallback.selector) {
      try {
        const locator = this.page.locator(field.fallback.selector);
        const count = await locator.count();
        if (count > 0) {
          logger.warn(
            `[FALLBACK] Resolved field "${field.accessibleName}" via selector - ` +
            `all semantic strategies failed. Selector: ${field.fallback.selector}`
          );
          return { locator, strategy: `FALLBACK:selector("${field.fallback.selector}")` };
        }
      } catch (error) {
        logger.debug(`[FALLBACK] Selector failed for ${field.accessibleName}:`, error);
      }
    }

    logger.warn(
      `Failed to resolve field "${field.accessibleName}" (fieldId: ${field.fieldId}) - ` +
      `all PRIMARY semantic strategies and FALLBACK selector exhausted`
    );
    return null;
  }

  /**
   * Find field by accessible name
   */
  async findByAccessibleName(name: string, role?: string): Promise<any | null> {
    if (role) {
      try {
        const locator = this.page.getByRole(role as any, { name, exact: false });
        if (await locator.count() > 0) {
          return locator.first();
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Try getByLabel
    try {
      const locator = this.page.getByLabel(name, { exact: false });
      if (await locator.count() > 0) {
        return locator.first();
      }
    } catch {
      // Continue
    }

    // Try getByPlaceholder
    try {
      const locator = this.page.getByPlaceholder(name, { exact: false });
      if (await locator.count() > 0) {
        return locator.first();
      }
    } catch {
      // Continue
    }

    return null;
  }

  /**
   * Find field by label text
   */
  async findByLabelText(text: string): Promise<any | null> {
    try {
      const locator = this.page.getByLabel(text, { exact: false });
      if (await locator.count() > 0) {
        return locator.first();
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Find field by placeholder
   */
  async findByPlaceholder(placeholder: string): Promise<any | null> {
    try {
      const locator = this.page.getByPlaceholder(placeholder, { exact: false });
      if (await locator.count() > 0) {
        return locator.first();
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Find element by role and name
   */
  async findByRoleAndName(role: string, name: string): Promise<any | null> {
    try {
      const locator = this.page.getByRole(role as any, { name, exact: false });
      if (await locator.count() > 0) {
        return locator.first();
      }
    } catch {
      // Ignore
    }
    return null;
  }
}
