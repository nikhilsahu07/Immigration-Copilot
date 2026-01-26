
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * OtpFiller - Handles OTP input groups (multiple inputs for one code)
 * Behavior: OTP_GROUP
 */
export class OtpFiller extends BaseFiller {
  /**
   * Strategy 1: Try filling all OTP inputs with native fill (using semantic locator)
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        success: false,
        strategy: FillStrategy.NATIVE,
        error: 'No locator available',
      };
    }

    try {
      const code = String(field.value).replace(/\s/g, ''); // Remove spaces
      const digits = code.split('');
      
      // Find all OTP inputs (usually 4-6 inputs in a group)
      // For OTP groups, we need to find all matching inputs
      const inputCount = await locator.count();
      
      if (inputCount === 0) {
        return {
          success: false,
          strategy: FillStrategy.NATIVE,
          error: 'No OTP inputs found',
          domSnapshot: await this.captureDOMSnapshot(locator),
        };
      }
      
      // Fill each input with corresponding digit
      for (let i = 0; i < Math.min(inputCount, digits.length); i++) {
        await locator.nth(i).fill(digits[i], { timeout: 1000 });
      }
      
      return {
        success: true,
        strategy: FillStrategy.NATIVE,
        uiLibrary: await this.detectLibrary(locator),
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
   * Strategy 2: DOM manipulation for OTP group (using semantic locator)
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        success: false,
        strategy: FillStrategy.DOM,
        error: 'No locator available',
      };
    }

    try {
      const code = String(field.value).replace(/\s/g, '');
      const digits = code.split('');
      
      const success = await locator.first().evaluate((el: Element, codeDigits: string[]) => {
        // Find all OTP inputs starting from the first one
        const container = el.closest('form') || el.closest('div') || document.body;
        const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]'))
          .filter((input, idx, arr) => {
            // Heuristic: OTP inputs are usually consecutive and have similar attributes
            return input === el || (idx < arr.length && arr[idx - 1] === el);
          })
          .slice(0, codeDigits.length) as HTMLInputElement[];
        
        if (inputs.length === 0) return false;
        
        for (let i = 0; i < Math.min(inputs.length, codeDigits.length); i++) {
          inputs[i].value = codeDigits[i];
          inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        return true;
      }, digits);
      
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
  protected async tryUILibraryFill(_field: AutomatedField): Promise<FillResult> {
    return {
      success: false,
      strategy: FillStrategy.UI_LIBRARY,
      uiLibrary: UILibrary.UNKNOWN,
      error: 'No UI library handlers for OTP groups',
    };
  }

  /**
   * Strategy 4: Keyboard - Type one digit at a time (using semantic locator)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        success: false,
        strategy: FillStrategy.KEYBOARD,
        error: 'No locator available',
      };
    }

    try {
      const code = String(field.value).replace(/\s/g, '');
      const digits = code.split('');
      
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Get all OTP inputs count
      const inputCount = await locator.count();
      
      if (inputCount === 0) {
        return {
          success: false,
          strategy: FillStrategy.KEYBOARD,
          error: 'No OTP inputs found',
        };
      }
      
      // Type in each input, auto-advances usually
      for (let i = 0; i < Math.min(inputCount, digits.length); i++) {
        await locator.nth(i).click();
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
   * Verification: Check all inputs are filled (using semantic locator)
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        passed: false,
        actual: undefined,
        expected: String(field.value),
        reason: 'No locator available for verification',
      };
    }

    try {
      const expected = String(field.value).replace(/\s/g, '');
      
      const actualValues = await locator.first().evaluate((el: Element) => {
        // Find all OTP inputs in the same container
        const container = el.closest('form') || el.closest('div') || document.body;
        const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]'))
          .filter((input) => {
            // Heuristic: OTP inputs are usually consecutive
            return input === el || input.previousElementSibling === el;
          }) as HTMLInputElement[];
        
        return inputs.map(input => input.value).join('');
      });
      
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
