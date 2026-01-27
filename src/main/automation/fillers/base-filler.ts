

import { Page } from 'playwright-core';
import { logger } from '../../core/logger';
import { FieldResolver } from '../utils/field-resolver';
import { CanonicalField } from '../../../shared/types/automation.types';

// Strategy: How we attempt to fill (broad categories)
export enum FillStrategy {
  NATIVE = 'native',           // Playwright's built-in methods
  DOM = 'dom',                 // Direct DOM manipulation
  UI_LIBRARY = 'ui-library',   // Library-specific handlers
  KEYBOARD = 'keyboard'        // Human-like keyboard input
}

// UI Library: What framework is detected (specific implementations)
export enum UILibrary {
  VANILLA = 'vanilla',
  BOOTSTRAP = 'bootstrap',
  MATERIAL_UI = 'mui',
  SELECT2 = 'select2',
  TOM_SELECT = 'tom-select',
  ANTD = 'antd',
  CHAKRA = 'chakra',
  UNKNOWN = 'unknown'
}

// Result of a fill attempt
export interface FillResult {
  success: boolean;
  strategy: FillStrategy;
  uiLibrary?: UILibrary;
  error?: string;
  verificationPassed?: boolean;
  duration?: number;
  domSnapshot?: {
    tag?: string;
    classes?: string[];
    ariaDisabled?: string;
    ariaHidden?: string;
  };
}

// Verification result
export interface VerificationResult {
  passed: boolean;
  actual?: string;
  expected?: string;
  reason?: string;
}

export interface AutomatedField {
    fieldIndex: number;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    selector?: string;  // Optional - kept for backward compatibility
    value: unknown;
    confidence?: string;
    reasoning?: string;
    // New semantic fields
    fieldId?: string;  // Primary identifier from canonical schema
    accessibleName?: string;  // Semantic name for field discovery
    role?: string;  // ARIA role
    labels?: {
      labelText?: string | null;
      ariaLabel?: string | null;
      placeholder?: string | null;
    };
    // Resolved locator (set by FieldResolver)
    resolvedLocator?: any;
    resolvedStrategy?: string;
}

export abstract class BaseFiller {
  protected fieldResolver: FieldResolver;
  protected canonicalField?: CanonicalField;

  constructor(protected page: Page, protected options: Record<string, unknown> = {}) {
    this.fieldResolver = new FieldResolver(page);
  }

  /**
   * Set canonical field for semantic discovery
   */
  setCanonicalField(field: CanonicalField): void {
    this.canonicalField = field;
  }

  /**
   * Main fill method - progressive resolution with EARLY EXIT
   * Uses SEMANTIC-FIRST field discovery (Playwright best practice)
   * 
   * RESOLUTION PRIORITY:
   * 1. Semantic discovery via FieldResolver (getByRole, getByLabel, etc.) - PRIMARY
   * 2. Selector fallback - ONLY if semantic discovery fails - FALLBACK
   * 
   * Fill strategy order: NATIVE → DOM → UI_LIBRARY → KEYBOARD (with retry)
   */
  async fill(field: AutomatedField): Promise<boolean> {
    const startTime = Date.now();
    const attempts: FillResult[] = [];

    // ============================================
    // PRIMARY: Semantic field discovery
    // ============================================
    // Use FieldResolver to find field via semantic locators (getByRole, getByLabel, etc.)
    // This is the PRIMARY resolution path - selectors are FALLBACK only
    if (this.canonicalField && !field.resolvedLocator) {
      const resolved = await this.fieldResolver.resolveField(this.canonicalField);
      if (resolved) {
        field.resolvedLocator = resolved.locator;
        field.resolvedStrategy = resolved.strategy;
        logger.debug(`[PRIMARY] Resolved field "${field.fieldLabel}" using semantic strategy: ${resolved.strategy}`);
      } else {
        // Semantic discovery failed - try FALLBACK selector if available
        if (field.selector) {
          logger.warn(
            `[FALLBACK] Semantic discovery failed for "${field.fieldLabel}", ` +
            `using selector fallback: ${field.selector}`
          );
          field.resolvedLocator = this.page.locator(field.selector);
          field.resolvedStrategy = `FALLBACK:selector("${field.selector}")`;
        } else {
          logger.error(
            `Cannot resolve field "${field.fieldLabel}" - ` +
            `semantic discovery failed and no fallback selector available`
          );
          return false;
        }
      }
    } else if (field.selector && !field.resolvedLocator) {
      // No canonical field available - use selector as last resort
      // This should be rare - ideally all fields have canonical data
      logger.warn(
        `[FALLBACK] No canonical field for "${field.fieldLabel}", ` +
        `using selector fallback: ${field.selector}`
      );
      field.resolvedLocator = this.page.locator(field.selector);
      field.resolvedStrategy = `FALLBACK:selector("${field.selector}")`;
    }

    if (!field.resolvedLocator) {
      logger.error(`Cannot fill field "${field.fieldLabel}" - no locator available (semantic or fallback)`);
      return false;
    }
    
    // Define strategy chain for clear logging
    const strategies: Array<{ name: string; executor: () => Promise<FillResult> }> = [
      { name: 'NATIVE', executor: () => this.tryNativeFill(field) },
      { name: 'DOM', executor: () => this.tryDomFill(field) },
      { name: 'UI_LIBRARY', executor: () => this.tryUILibraryFill(field) },
      { name: 'KEYBOARD_1', executor: () => this.tryKeyboardFill(field, 0) },
      { name: 'KEYBOARD_2', executor: () => this.tryKeyboardFill(field, 1) },
    ];

    // Try each strategy in order with early exit on success + verification
    for (const strategy of strategies) {
      logger.debug(`Trying ${strategy.name} strategy for field: ${field.fieldLabel}`);
      
      const result = await strategy.executor();
      result.duration = Date.now() - startTime;
      attempts.push(result);

      if (!result.success) {
        // Strategy failed, log and continue to next
        logger.debug(`${strategy.name} failed for ${field.fieldLabel}: ${result.error || 'unknown error'}`);
        continue;
      }

      // Strategy succeeded, now verify
      logger.debug(`${strategy.name} reported success for ${field.fieldLabel}, verifying...`);
      const verification = await this.verifyFill(field);
      result.verificationPassed = verification.passed;

      if (verification.passed) {
        // SUCCESS + VERIFIED = EARLY EXIT
        logger.info(`EARLY EXIT: ${strategy.name} succeeded and verified for ${field.fieldLabel}`);
        this.logSuccess(field, attempts, verification);
        return true;
      } else {
        // Strategy succeeded but verification failed, continue to next strategy
        logger.debug(`${strategy.name} succeeded but verification failed for ${field.fieldLabel}: ${verification.reason}`);
      }
    }

    // All strategies exhausted without success
    this.logFailure(field, attempts);
    return false;
  }

  // Abstract methods - must be implemented by subclasses
  protected abstract tryNativeFill(field: AutomatedField): Promise<FillResult>;
  protected abstract tryDomFill(field: AutomatedField): Promise<FillResult>;
  protected abstract tryUILibraryFill(field: AutomatedField): Promise<FillResult>;
  protected abstract tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult>;
  protected abstract verifyFill(field: AutomatedField): Promise<VerificationResult>;

  // Helper methods
  protected async detectLibrary(locatorOrSelector: any): Promise<UILibrary> {
    try {
      // Handle both locator and selector
      const selector = typeof locatorOrSelector === 'string' 
        ? locatorOrSelector 
        : await locatorOrSelector.evaluate((el: Element) => {
            // Generate a selector for the element
            // Use attribute selector for IDs with special characters to avoid CSS parsing errors
            if (el.id) {
              const id = el.id;
              return /[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~ ]/.test(id)
                ? `[id="${id.replace(/"/g, '\\"')}"]`
                : `#${id}`;
            }
            if (el.className) return `.${Array.from(el.classList)[0]}`;
            return el.tagName.toLowerCase();
          }).catch(() => '');

      if (!selector) return UILibrary.UNKNOWN;

      const result = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return UILibrary.UNKNOWN;

        // Material UI
        if (el.closest('.MuiInputBase-root') || 
            el.closest('.MuiTextField-root') ||
            el.classList.contains('MuiInput-input')) {
          return UILibrary.MATERIAL_UI;
        }

        // Bootstrap
        if (el.classList.contains('selectpicker') ||
            el.classList.contains('select2') ||
            el.closest('.bootstrap-select')) {
          return UILibrary.BOOTSTRAP;
        }

        // Select2
        if (el.closest('.select2-container') ||
            (el as any).select2) {
          return UILibrary.SELECT2;
        }

        // Tom Select
        if ((el as any).tomselect) {
          return UILibrary.TOM_SELECT;
        }

        // Ant Design
        if (el.closest('.ant-select') ||
            el.closest('.ant-input') ||
            el.classList.contains('ant-input')) {
          return UILibrary.ANTD;
        }

        // Chakra UI
        if (el.closest('[data-chakra-component]') ||
            el.classList.contains('chakra-input')) {
          return UILibrary.CHAKRA;
        }

        // Vanilla HTML
        return UILibrary.VANILLA;
      }, selector);
      
      return result as UILibrary;
    } catch {
      return UILibrary.UNKNOWN;
    }
  }

  protected async captureDOMSnapshot(locatorOrSelector: any): Promise<FillResult['domSnapshot']> {
    try {
      // Handle both locator and selector
      if (typeof locatorOrSelector === 'string') {
        return await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return undefined;
          return {
            tag: el.tagName.toLowerCase(),
            classes: Array.from(el.classList),
            ariaDisabled: el.getAttribute('aria-disabled') || undefined,
            ariaHidden: el.getAttribute('aria-hidden') || undefined,
          };
        }, locatorOrSelector);
      } else {
        // It's a locator
        return await locatorOrSelector.evaluate((el: Element) => {
          return {
            tag: el.tagName.toLowerCase(),
            classes: Array.from(el.classList),
            ariaDisabled: el.getAttribute('aria-disabled') || undefined,
            ariaHidden: el.getAttribute('aria-hidden') || undefined,
          };
        });
      }
    } catch {
      return undefined;
    }
  }

  protected logSuccess(field: AutomatedField, attempts: FillResult[], verification: VerificationResult): void {
    const successAttempt = attempts[attempts.length - 1];
    logger.info('Fill succeeded (early exit)', {
      field: field.fieldLabel,
      selector: field.selector,
      totalAttempts: attempts.length,
      successStrategy: successAttempt.strategy,
      uiLibrary: successAttempt.uiLibrary,
      verificationPassed: verification.passed,
      attemptSequence: attempts.map(a => `${a.strategy}:${a.success ? 'ok' : 'fail'}${a.verificationPassed !== undefined ? (a.verificationPassed ? ':verified' : ':verify-fail') : ''}`).join(' → '),
    });
  }

  protected logFailure(field: AutomatedField, attempts: FillResult[]): void {
    logger.error('Fill failed - all strategies exhausted', {
      field: field.fieldLabel,
      selector: field.selector,
      value: field.value,
      totalAttempts: attempts.length,
      attempts: attempts.map(a => ({
        strategy: a.strategy,
        success: a.success,
        uiLibrary: a.uiLibrary,
        verificationPassed: a.verificationPassed,
        error: a.error,
        duration: a.duration,
        domSnapshot: a.domSnapshot,
      })),
    });
  }

  // Helper methods for working with locators
  protected async scrollToLocator(locator: any) {
    try {
      await locator.scrollIntoViewIfNeeded();
    } catch {
      // Ignore scroll errors
    }
  }

  protected getLocator(field: AutomatedField): any {
    return field.resolvedLocator || (field.selector ? this.page.locator(field.selector) : null);
  }
}
