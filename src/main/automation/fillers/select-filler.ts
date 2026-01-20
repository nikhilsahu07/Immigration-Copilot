
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class SelectFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright selectOption (multi-attempt)
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    const value = String(field.value);
    
    try {
      await this.scrollToElement(field.selector);
      
      // Try by value first
      try {
        await this.page.selectOption(field.selector, { value }, { timeout: 2000 });
        return {
          success: true,
          strategy: FillStrategy.NATIVE,
          uiLibrary: await this.detectLibrary(field.selector),
        };
      } catch {
        // Value didn't work
      }

      // Try by label (visible text)
      try {
        await this.page.selectOption(field.selector, { label: value }, { timeout: 2000 });
        return {
          success: true,
          strategy: FillStrategy.NATIVE,
          uiLibrary: await this.detectLibrary(field.selector),
        };
      } catch {
        // Label didn't work
      }

      return {
        success: false,
        strategy: FillStrategy.NATIVE,
        error: 'Neither value nor label match worked',
        domSnapshot: await this.captureDOMSnapshot(field.selector),
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
   * Strategy 2: Direct DOM manipulation with partial matching
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const value = String(field.value);
      
      const success = await this.page.evaluate(({ selector, searchValue }) => {
        const el = document.querySelector(selector) as HTMLSelectElement;
        if (!el) return false;
        
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
      }, { selector: field.selector, searchValue: value });
      
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
   * Strategy 3: UI Library-specific handlers
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    const value = String(field.value);
    
    try {
      switch (library) {
        case UILibrary.MATERIAL_UI:
          // MUI Select: click to open, find option, click
          await this.page.click(field.selector);
          await this.page.waitForSelector('[role="listbox"]', { timeout: 2000 });
          await this.page.click(`[role="option"]:has-text("${value}")`);
          break;
          
        case UILibrary.BOOTSTRAP:
          // Bootstrap-select: click trigger, find option in menu
          await this.page.click(`${field.selector} + .dropdown-toggle`);
          await this.page.waitForSelector('.dropdown-menu', { state: 'visible', timeout: 2000 });
          await this.page.click(`.dropdown-menu >> text="${value}"`);
          break;
          
        case UILibrary.SELECT2:
          // Select2: use jQuery API if available
          const select2Success = await this.page.evaluate(({ sel, val }) => {
            try {
              const $el = (window as any).$(sel);
              if ($el && $el.select2) {
                $el.val(val).trigger('change');
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, { sel: field.selector, val: value });
          
          if (!select2Success) {
            return {
              success: false,
              strategy: FillStrategy.UI_LIBRARY,
              uiLibrary: library,
              error: 'Select2 jQuery API not available',
            };
          }
          break;
          
        case UILibrary.TOM_SELECT:
          // Tom Select: use instance API
          const tomSuccess = await this.page.evaluate(({ sel, val }) => {
            try {
              const el = document.querySelector(sel) as any;
              if (el && el.tomselect) {
                el.tomselect.setValue(val);
                return true;
              }
            } catch {
              return false;
            }
            return false;
          }, { sel: field.selector, val: value });
          
          if (!tomSuccess) {
            return {
              success: false,
              strategy: FillStrategy.UI_LIBRARY,
              uiLibrary: library,
              error: 'TomSelect instance not found',
            };
          }
          break;
          
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
   * Strategy 4: Keyboard-based filling (arrows + enter)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      const value = String(field.value);
      
      // Press Escape first on retry
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus the select
      await this.page.click(field.selector);
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
   * Verification: Check selected option
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const actual = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLSelectElement;
        if (!el) return null;
        return el.options[el.selectedIndex]?.text || el.value;
      }, field.selector);
      
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
