
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class TextFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright fill (using semantic locator)
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      const locator = this.getLocator(field);
      if (!locator) {
        return {
          success: false,
          strategy: FillStrategy.NATIVE,
          error: 'No locator available',
        };
      }

      await this.scrollToLocator(locator);
      await locator.fill(String(field.value), { timeout: 3000 });
      
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
        domSnapshot: await this.captureDOMSnapshot(this.getLocator(field)),
      };
    }
  }

  /**
   * Strategy 2: Direct DOM manipulation (using semantic locator)
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const locator = this.getLocator(field);
      if (!locator) {
        return {
          success: false,
          strategy: FillStrategy.DOM,
          error: 'No locator available',
        };
      }

      const value = String(field.value);
      
      const success = await locator.evaluate((el: Element, val: string) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        return false;
      }, value);
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found or wrong type',
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
   * Strategy 3: UI Library-specific handling (using semantic locator)
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        success: false,
        strategy: FillStrategy.UI_LIBRARY,
        error: 'No locator available',
      };
    }

    const library = await this.detectLibrary(locator);
    
    try {
      const value = String(field.value);
      
      switch (library) {
        case UILibrary.MATERIAL_UI:
          // MUI inputs often need focus + clear + fill
          await locator.click();
          await locator.fill(''); // Clear
          await locator.fill(value);
          await this.page.keyboard.press('Tab'); // Trigger blur
          break;
          
        case UILibrary.BOOTSTRAP:
        case UILibrary.VANILLA:
          // Standard fill usually works
          await locator.fill(value);
          break;
          
        default:
          // Unknown library, skip this strategy
          return {
            success: false,
            strategy: FillStrategy.UI_LIBRARY,
            uiLibrary: library,
            error: `No specific handler for library: ${library}`,
          };
      }
      
      return {
        success: true,
        strategy: FillStrategy.UI_LIBRARY,
        uiLibrary: library,
      };
    } catch (error) {
      return {
        success: false,
        strategy: FillStrategy.UI_LIBRARY,
        uiLibrary: library,
        error: String(error),
      };
    }
  }

  /**
   * Strategy 4: Keyboard-based filling (human-like, using semantic locator)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      const locator = this.getLocator(field);
      if (!locator) {
        return {
          success: false,
          strategy: FillStrategy.KEYBOARD,
          error: 'No locator available',
        };
      }

      const value = String(field.value);
      
      // Press Escape first to clear any focus traps (especially helpful on retry)
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus the field
      await locator.click();
      await this.page.waitForTimeout(100);
      
      // Clear existing value
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.press('Backspace');
      
      // Type with human-like delay
      await this.page.keyboard.type(value, { delay: 50 });
      
      // Trigger blur event
      await this.page.keyboard.press('Tab');
      
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
   * Verification: Check if value was actually set (using semantic locator)
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const locator = this.getLocator(field);
      if (!locator) {
        return {
          passed: false,
          actual: undefined,
          expected: String(field.value),
          reason: 'No locator available for verification',
        };
      }

      const actual = await locator.inputValue();
      const expected = String(field.value);
      
      // Normalize for comparison (trim and lowercase)
      const actualNormalized = actual.trim().toLowerCase();
      const expectedNormalized = expected.trim().toLowerCase();
      
      const passed = actualNormalized === expectedNormalized;
      
      return {
        passed,
        actual,
        expected,
        reason: passed ? undefined : 'Value mismatch after fill',
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
