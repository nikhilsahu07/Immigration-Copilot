

import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class DateFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright fill (using semantic locator)
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
      await this.scrollToLocator(locator);
      const dateString = this.normalizeDate(field.value);
      await locator.fill(dateString, { timeout: 3000 });
      
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
        domSnapshot: await this.captureDOMSnapshot(locator),
      };
    }
  }

  /**
   * Strategy 2: Direct DOM manipulation (using semantic locator)
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
      const dateString = this.normalizeDate(field.value);
      
      const success = await locator.evaluate((el: Element, value: string) => {
        if (el instanceof HTMLInputElement && el.type === 'date') {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        return false;
      }, dateString);
      
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
      const dateString = this.normalizeDate(field.value);
      
      switch (library) {
        case UILibrary.BOOTSTRAP: {
          // Bootstrap datepicker: set via data API if available
          const bootstrapSuccess = await locator.evaluate((el: Element, val: string) => {
            try {
              const $el = (window as any).$(el);
              if ($el && $el.datepicker) {
                $el.datepicker('setDate', val);
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, dateString);
          
          if (!bootstrapSuccess) {
            // Fallback to regular fill
            await locator.fill(dateString);
          }
          break;
        }
          
        case UILibrary.MATERIAL_UI:
          // MUI DatePicker: click and type
          await locator.click();
          await locator.fill(dateString);
          await this.page.keyboard.press('Tab');
          break;
          
        default:
          // Standard fill for unknown libraries
          await locator.fill(dateString);
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
   * Strategy 4: Keyboard-based typing (using semantic locator)
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
      const dateString = this.normalizeDate(field.value);
      
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus and clear
      await locator.click();
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
   * Verification: Check if date was set correctly (using semantic locator)
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
      const actual = await locator.inputValue();
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
  private normalizeDate(dateValue: unknown): string {
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
