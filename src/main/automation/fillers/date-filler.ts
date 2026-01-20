
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class DateFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright fill
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      const dateString = this.normalizeDate(field.value);
      await this.page.fill(field.selector, dateString, { timeout: 3000 });
      
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
      const dateString = this.normalizeDate(field.value);
      
      const success = await this.page.evaluate(({ selector, value }) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        if (el instanceof HTMLInputElement && el.type === 'date') {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        
        return false;
      }, { selector: field.selector, value: dateString });
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found or not a date input',
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
   * Strategy 3: UI Library-specific handling (datepickers)
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    
    try {
      const dateString = this.normalizeDate(field.value);
      
      switch (library) {
        case UILibrary.BOOTSTRAP:
          // Bootstrap datepicker: set via data API if available
          const bootstrapSuccess = await this.page.evaluate(({ sel, val }) => {
            try {
              const $el = (window as any).$(sel);
              if ($el && $el.datepicker) {
                $el.datepicker('setDate', val);
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, { sel: field.selector, val: dateString });
          
          if (!bootstrapSuccess) {
            // Fallback to regular fill
            await this.page.fill(field.selector, dateString);
          }
          break;
          
        case UILibrary.MATERIAL_UI:
          // MUI DatePicker: click and type
          await this.page.click(field.selector);
          await this.page.fill(field.selector, dateString);
          await this.page.keyboard.press('Tab');
          break;
          
        default:
          // Standard fill for unknown libraries
          await this.page.fill(field.selector, dateString);
          break;
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
   * Strategy 4: Keyboard-based typing
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      const dateString = this.normalizeDate(field.value);
      
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus and clear
      await this.page.click(field.selector);
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.press('Backspace');
      
      // Type the date
      await this.page.keyboard.type(dateString, { delay: 50 });
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
   * Verification: Check if date was set correctly
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const actual = await this.page.inputValue(field.selector);
      const expected = this.normalizeDate(field.value);
      
      // Normalize both for comparison
      const actualNormalized = this.normalizeDate(actual);
      const passed = actualNormalized === expected;
      
      return {
        passed,
        actual,
        expected: field.value,
        reason: passed ? undefined : 'Date value mismatch after fill',
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

  /**
   * Normalize date to YYYY-MM-DD format
   */
  private normalizeDate(dateValue: any): string {
    if (!dateValue) return '';
    
    const dateStr = String(dateValue);
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Try parsing common formats
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch {
      // Invalid date
    }
    
    return dateStr;
  }
}
