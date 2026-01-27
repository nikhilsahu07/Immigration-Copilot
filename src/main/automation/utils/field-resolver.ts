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
   * Build a list of accessible name variants for robust role-based matching.
   * - Strips required markers like * and trailing punctuation
   * - Normalizes whitespace
   * - Adds a relaxed RegExp variant (e.g. /^Email Address/i)
   */
  private buildAccessibleNameVariants(accessibleName: string): Array<string | RegExp> {
    const variants: Array<string | RegExp> = [];
    if (!accessibleName) return variants;

    const original = accessibleName;

    // Normalize whitespace
    const normalized = original.replace(/\s+/g, ' ').trim();

    // Strip common required markers (*, :, trailing spaces)
    const stripped = normalized.replace(/[*:]+$/g, '').trim();

    // Base string variants (most specific to least)
    const seen = new Set<string>();
    const pushString = (v: string) => {
      const key = v.trim();
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      variants.push(key);
    };

    pushString(normalized);
    if (stripped !== normalized) {
      pushString(stripped);
    }

    // Relaxed regex variant: starts with stripped text, case-insensitive
    if (stripped) {
      try {
        const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        variants.push(new RegExp(`^${escaped}`, 'i'));
      } catch {
        // Ignore regex construction errors
      }
    }

    return variants;
  }

  /**
   * Check if a selector matches exactly one element on the page
   */
  private async isUniqueSelector(selector: string): Promise<boolean> {
    try {
      const count = await this.page.locator(selector).count();
      return count === 1;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a canonical field to a Playwright locator using semantic discovery
   * Returns the first working locator found, or null if all strategies fail
   * 
   * STRATEGY ORDER (semantic-first, selector-last):
   * 1. getByRole + accessibleName (PRIMARY) - with early fallback on ambiguity
   * 2. getByLabel (PRIMARY) - with early fallback on ambiguity
   * 3. getByPlaceholder (PRIMARY)
   * 4. Relative text → input (PRIMARY - find input near label)
   * 5. getByText for buttons/links (PRIMARY)
   * 6. FALLBACK: selector (used when semantic strategies are ambiguous or fail)
   */
  async resolveField(field: CanonicalField): Promise<{ locator: any; strategy: string } | null> {
    // Pre-check: Does the fallback selector exist and is it unique?
    // This enables early fallback when semantic lookups are ambiguous
    const hasUniqueFallback = field.fallback.selector 
      ? await this.isUniqueSelector(field.fallback.selector) 
      : false;

    // ============================================
    // PRIMARY STRATEGY 1: getByRole + accessibleName
    // ============================================
    // Most reliable for SPAs - uses ARIA role and accessible name
    // ENHANCEMENT: If multiple elements match and we have a unique fallback, use fallback immediately
    if (field.role && field.accessibleName) {
      const nameVariants = this.buildAccessibleNameVariants(field.accessibleName);
      for (const nameVariant of nameVariants) {
        try {
          const locator = this.page.getByRole(field.role as any, { 
            name: nameVariant as any, 
            exact: typeof nameVariant === 'string' ? false : undefined
          });
          const count = await locator.count();
          
          if (count === 1) {
            // Unique match - use it
            logger.debug(
              `[PRIMARY] Resolved field "${field.accessibleName}" via getByRole(${field.role}, ${String(nameVariant)})`
            );
            return { locator, strategy: `getByRole(${field.role}, ${String(nameVariant)})` };
          } else if (count > 1 && hasUniqueFallback) {
            // Multiple matches but we have a unique fallback - use fallback immediately
            // This prevents strict mode violations when forms have duplicate accessible names
            logger.warn(
              `[FALLBACK-EARLY] getByRole matched ${count} elements for "${field.accessibleName}", ` +
              `using unique fallback selector: ${field.fallback.selector}`
            );
            const fallbackLocator = this.page.locator(field.fallback.selector!);
            return { locator: fallbackLocator, strategy: `FALLBACK-EARLY:selector("${field.fallback.selector}")` };
          } else if (count > 1) {
            // Multiple matches and no unique fallback - log and continue to next strategy
            logger.debug(
              `[PRIMARY] getByRole matched ${count} elements for "${field.accessibleName}", ` +
              `no unique fallback available, trying next strategy`
            );
          }
        } catch (error) {
          logger.debug(
            `[PRIMARY] getByRole failed for ${field.accessibleName} with name=${String(nameVariant)}:`,
            error
          );
        }
      }
    }

    // ============================================
    // PRIMARY STRATEGY 2: getByLabel
    // ============================================
    // Semantic label association - works with <label for="id"> or wrapping labels
    // ENHANCEMENT: If multiple elements match and we have a unique fallback, use fallback immediately
    if (field.labels.labelText) {
      try {
        const locator = this.page.getByLabel(field.labels.labelText, { exact: false });
        const count = await locator.count();
        
        if (count === 1) {
          logger.debug(`[PRIMARY] Resolved field "${field.accessibleName}" via getByLabel`);
          return { locator, strategy: `getByLabel("${field.labels.labelText}")` };
        } else if (count > 1 && hasUniqueFallback) {
          // Multiple matches - use fallback immediately
          logger.warn(
            `[FALLBACK-EARLY] getByLabel matched ${count} elements for "${field.accessibleName}", ` +
            `using unique fallback selector: ${field.fallback.selector}`
          );
          const fallbackLocator = this.page.locator(field.fallback.selector!);
          return { locator: fallbackLocator, strategy: `FALLBACK-EARLY:selector("${field.fallback.selector}")` };
        } else if (count > 1) {
          logger.debug(
            `[PRIMARY] getByLabel matched ${count} elements for "${field.accessibleName}", ` +
            `no unique fallback available, trying next strategy`
          );
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
      const placeholder = field.labels.placeholder;
      try {
        const placeholderLocator = this.page.getByPlaceholder(placeholder, { exact: false });
        const count = await placeholderLocator.count();

        if (count === 1) {
          logger.debug(
            `[PRIMARY] Resolved field "${field.accessibleName}" via getByPlaceholder (unique match)`
          );
          return { locator: placeholderLocator, strategy: `getByPlaceholder("${placeholder}")` };
        }

        // If multiple elements share the same placeholder, refine using canonical fallback selector
        if (count > 1 && field.fallback.selector) {
          const fallbackLocator = this.page.locator(field.fallback.selector);
          const fallbackCount = await fallbackLocator.count();
          if (fallbackCount === 1) {
            logger.debug(
              `[PRIMARY] Resolved field "${field.accessibleName}" via getByPlaceholder+fallback ` +
              `(placeholder="${placeholder}", selector="${field.fallback.selector}")`
            );
            return {
              locator: fallbackLocator,
              strategy: `getByPlaceholder+fallback("${placeholder}", "${field.fallback.selector}")`,
            };
          }
          logger.debug(
            `[PRIMARY] getByPlaceholder ambiguous (${count} matches) and fallback selector ` +
            `"${field.fallback.selector}" matched ${fallbackCount} elements for "${field.accessibleName}"`
          );
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
      const nameVariants = this.buildAccessibleNameVariants(field.accessibleName);
      for (const nameVariant of nameVariants) {
        if (typeof nameVariant === 'string' && !nameVariant) continue;
        try {
          const locator = this.page.getByText(nameVariant as any, {
            exact: typeof nameVariant === 'string' ? false : undefined,
          });
          const count = await locator.count();
          if (count > 0) {
            logger.debug(
              `[PRIMARY] Resolved field "${field.accessibleName}" via getByText(${String(nameVariant)})`
            );
            return { locator, strategy: `getByText(${String(nameVariant)})` };
          }
        } catch (error) {
          logger.debug(
            `[PRIMARY] getByText failed for ${field.accessibleName} with name=${String(nameVariant)}:`,
            error
          );
        }
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
