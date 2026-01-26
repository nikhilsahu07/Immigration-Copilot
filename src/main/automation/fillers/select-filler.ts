

import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class SelectFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright selectOption (using semantic locator)
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

    const value = String(field.value);
    
    try {
      await this.scrollToLocator(locator);
      
      // Try by value first
      try {
        await locator.selectOption({ value }, { timeout: 2000 });
        return {
          success: true,
          strategy: FillStrategy.NATIVE,
          uiLibrary: await this.detectLibrary(locator),
        };
      } catch {
        // Value didn't work
      }

      // Try by label (visible text)
      try {
        await locator.selectOption({ label: value }, { timeout: 2000 });
        return {
          success: true,
          strategy: FillStrategy.NATIVE,
          uiLibrary: await this.detectLibrary(locator),
        };
      } catch {
        // Label didn't work
      }

      return {
        success: false,
        strategy: FillStrategy.NATIVE,
        error: 'Neither value nor label match worked',
        domSnapshot: await this.captureDOMSnapshot(locator),
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
   * Strategy 2: Direct DOM manipulation with partial matching (using semantic locator)
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
      const value = String(field.value);
      
      const success = await locator.evaluate((el: Element, searchValue: string) => {
        const selectEl = el as HTMLSelectElement;
        if (!selectEl) return false;
        
        // Find option that contains the value (case-insensitive)
        const searchLower = searchValue.toLowerCase();
        const options = Array.from(el.options);
        
        // First try exact match
        let match = options.find(o => o.value === searchValue || o.text.trim() === searchValue);
        
        // Then try partial contains
        if (!match) {
          match = options.find(o => 
            o.value.toLowerCase().includes(searchLower) || 
            o.text.toLowerCase().includes(searchLower)
          );
        }
        
        // Try numeric match
        if (!match && !isNaN(Number(searchValue))) {
          match = options.find(o => o.value === searchValue);
        }
        
        if (match) {
          el.value = match.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        
        return false;
      }, value);
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'No matching option found',
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
   * Strategy 3: UI Library-specific handlers (using semantic locator)
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
    const value = String(field.value);
    
    try {
      switch (library) {
        case UILibrary.MATERIAL_UI:
          // MUI Select: click to open, find option, click
          await locator.click();
          await this.page.waitForSelector('[role="listbox"]', { timeout: 2000 });
          await this.page.click(`[role="option"]:has-text("${value}")`);
          break;
          
        case UILibrary.BOOTSTRAP: {
          // Bootstrap-select: click trigger, find option in menu
          await locator.click();
          await this.page.waitForSelector('.dropdown-menu', { state: 'visible', timeout: 2000 });
          await this.page.click(`.dropdown-menu >> text="${value}"`);
          break;
        }
          
        case UILibrary.SELECT2: {
          // Select2: use jQuery API if available
          const select2Success = await locator.evaluate((el: Element, val: string) => {
            try {
              const $el = (window as any).$(el);
              if ($el && $el.select2) {
                $el.val(val).trigger('change');
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, value);
          
          if (!select2Success) {
            return {
              success: false,
              strategy: FillStrategy.UI_LIBRARY,
              uiLibrary: library,
              error: 'Select2 jQuery API not available',
            };
          }
          break;
        }
          
        case UILibrary.TOM_SELECT: {
          // Tom Select: use instance API
          const tomSuccess = await locator.evaluate((el: Element, val: string) => {
            try {
              const selectEl = el as any;
              if (selectEl && selectEl.tomselect) {
                selectEl.tomselect.setValue(val);
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, value);
          
          if (!tomSuccess) {
            return {
              success: false,
              strategy: FillStrategy.UI_LIBRARY,
              uiLibrary: library,
              error: 'TomSelect instance not found',
            };
          }
          break;
        }
          
        default:
          // No specific handler for this library
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
   * Strategy 4: Keyboard-based filling (arrows + enter, using semantic locator)
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
      const value = String(field.value);
      
      // Press Escape first on retry
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus the select
      await locator.click();
      await this.page.waitForTimeout(100);
      
      // Open dropdown with arrow down
      await this.page.keyboard.press('ArrowDown');
      await this.page.waitForTimeout(100);
      
      // Type the value to search
      await this.page.keyboard.type(value, { delay: 50 });
      await this.page.waitForTimeout(200);
      
      // Press Enter to select
      await this.page.keyboard.press('Enter');
      
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
   * Verification: Check selected option (using semantic locator)
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
      const actual = await locator.evaluate((el: Element) => {
        const selectEl = el as HTMLSelectElement;
        if (!selectEl) return null;
        return selectEl.options[selectEl.selectedIndex]?.text || selectEl.value;
      });
      
      const expected = String(field.value);
      
      // Check exact match or partial contains (case-insensitive)
      const passed = actual === expected || 
                     actual?.toLowerCase().includes(expected.toLowerCase());
      
      return {
        passed: passed ? true : false,
        actual: actual || undefined,
        expected,
        reason: passed ? undefined : 'Selected option does not match expected value',
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
