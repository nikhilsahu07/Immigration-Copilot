
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * OtpFiller - Handles OTP input groups (multiple inputs for one code)
 * Behavior: OTP_GROUP
 */
export class OtpFiller extends BaseFiller {
  /**
   * Strategy 1: Try filling all OTP inputs with native fill
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      const code = String(field.value).replace(/\s/g, ''); // Remove spaces
      const digits = code.split('');
      
      // Find all OTP inputs (usually 4-6 inputs in a group)
      const inputs = await this.page.$$(field.selector);
      
      if (inputs.length === 0) {
        return {
          success: false,
          strategy: FillStrategy.NATIVE,
          error: 'No OTP inputs found',
          domSnapshot: await this.captureDOMSnapshot(field.selector),
        };
      }
      
      // Fill each input with corresponding digit
      for (let i = 0; i < Math.min(inputs.length, digits.length); i++) {
        await inputs[i].fill(digits[i], { timeout: 1000 });
      }
      
      return {
        success: true,
        strategy: FillStrategy.NATIVE,
        uiLibrary: await this.detectLibrary(field.selector),
      };
    } catch (error) {
      return {
        success: false,
        strategy: FillStrategy.NATIVE,
        error: String(error),
      };
    }
  }

  /**
   * Strategy 2: DOM manipulation for OTP group
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const code = String(field.value).replace(/\s/g, '');
      const digits = code.split('');
      
      const success = await this.page.evaluate(({ selector, codeDigits }) => {
        const inputs = document.querySelectorAll(selector);
        if (inputs.length === 0) return false;
        
        for (let i = 0; i < Math.min(inputs.length, codeDigits.length); i++) {
          const input = inputs[i];
          if (input instanceof HTMLInputElement) {
            input.value = codeDigits[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        
        return true;
      }, { selector: field.selector, codeDigits: digits });
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Failed to fill OTP inputs via DOM',
      };
    } catch (error) {
      return {
        success: false,
        strategy: FillStrategy.DOM,
        error: String(error),
      };
    }
  }

  /**
   * Strategy 3: UI Library-specific (not common for OTP)
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    return {
      success: false,
      strategy: FillStrategy.UI_LIBRARY,
      uiLibrary: UILibrary.UNKNOWN,
      error: 'No UI library handlers for OTP groups',
    };
  }

  /**
   * Strategy 4: Keyboard - Type one digit at a time
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      const code = String(field.value).replace(/\s/g, '');
      const digits = code.split('');
      
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Get all OTP inputs
      const inputs = await this.page.$$(field.selector);
      
      if (inputs.length === 0) {
        return {
          success: false,
          strategy: FillStrategy.KEYBOARD,
          error: 'No OTP inputs found',
        };
      }
      
      // Type in each input, auto-advances usually
      for (let i = 0; i < Math.min(inputs.length, digits.length); i++) {
        await inputs[i].click();
        await this.page.waitForTimeout(50);
        await this.page.keyboard.type(digits[i]);
        await this.page.waitForTimeout(50);
      }
      
      return {
        success: true,
        strategy: FillStrategy.KEYBOARD,
      };
    } catch (error) {
      return {
        success: false,
        strategy: FillStrategy.KEYBOARD,
        error: String(error),
      };
    }
  }

  /**
   * Verification: Check all inputs are filled
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const expected = String(field.value).replace(/\s/g, '');
      
      const actualValues = await this.page.evaluate((selector) => {
        const inputs = document.querySelectorAll(selector);
        return Array.from(inputs)
          .map(input => (input as HTMLInputElement).value)
          .join('');
      }, field.selector);
      
      const passed = actualValues === expected;
      
      return {
        passed,
        actual: actualValues,
        expected,
        reason: passed ? undefined : `OTP code mismatch: got ${actualValues}, expected ${expected}`,
      };
    } catch (error) {
      return {
        passed: false,
        actual: undefined,
        expected: String(field.value),
        reason: `Verification failed: ${String(error)}`,
      };
    }
  }
}
