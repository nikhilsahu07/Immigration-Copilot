
import { Page } from 'playwright-core';
import { logger } from '../../core/logger';

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
    selector: string;
    value: any;
    confidence?: string;
    reasoning?: string;
}

export abstract class BaseFiller {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(protected page: Page, protected options: any = {}) {}

  /**
   * Main fill method - progressive resolution with EARLY EXIT
   * Phase 2: Exit immediately when a strategy succeeds AND verification passes
   * Order: NATIVE → DOM → UI_LIBRARY → KEYBOARD (with retry)
   */
  async fill(field: AutomatedField): Promise<boolean> {
    const startTime = Date.now();
    const attempts: FillResult[] = [];
    
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
  protected async detectLibrary(selector: string): Promise<UILibrary> {
    try {
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

  protected async captureDOMSnapshot(selector: string): Promise<FillResult['domSnapshot']> {
    try {
      return await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return undefined;
        return {
          tag: el.tagName.toLowerCase(),
          classes: Array.from(el.classList),
          ariaDisabled: el.getAttribute('aria-disabled') || undefined,
          ariaHidden: el.getAttribute('aria-hidden') || undefined,
        };
      }, selector);
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

  // Legacy helper methods (for backward compatibility)
  protected async scrollToElement(selector: string) {
    try {
      const element = await this.page.$(selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
      }
    } catch {
       // Ignore scroll errors
    }
  }

  protected async findElement(selector: string) {
    try {
      return await this.page.$(selector);
    } catch {
      return null;
    }
  }
}
