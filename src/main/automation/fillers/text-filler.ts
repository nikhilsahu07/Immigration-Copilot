
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class TextFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright fill
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      await this.page.fill(field.selector, String(field.value), { timeout: 3000 });
      
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
        domSnapshot: await this.captureDOMSnapshot(field.selector),
      };
    }
  }

  /**
   * Strategy 2: Direct DOM manipulation
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const value = String(field.value);
      
      const success = await this.page.evaluate(({ selector, val }) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        
        return false;
      }, { selector: field.selector, val: value });
      
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
   * Strategy 3: UI Library-specific handling
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    
    try {
      const value = String(field.value);
      
      switch (library) {
        case UILibrary.MATERIAL_UI:
          // MUI inputs often need focus + clear + fill
          await this.page.click(field.selector);
          await this.page.fill(field.selector, ''); // Clear
          await this.page.fill(field.selector, value);
          await this.page.keyboard.press('Tab'); // Trigger blur
          break;
          
        case UILibrary.BOOTSTRAP:
        case UILibrary.VANILLA:
          // Standard fill usually works
          await this.page.fill(field.selector, value);
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
   * Strategy 4: Keyboard-based filling (human-like)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      const value = String(field.value);
      
      // Press Escape first to clear any focus traps (especially helpful on retry)
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus the field
      await this.page.click(field.selector);
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
   * Verification: Check if value was actually set
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const actual = await this.page.inputValue(field.selector);
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
