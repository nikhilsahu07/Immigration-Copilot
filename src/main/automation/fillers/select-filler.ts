

import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class SelectFiller extends BaseFiller {
  /**
   * Resolve how we should interpret the expected value for a select:
   * - raw: original expected value from Gemini (e.g. "99")
   * - valueForSelect: best candidate for the underlying <select>.value
   * - displayText: best candidate for visible option text (for UI libraries / keyboard)
   *
   * Uses canonicalField.options when available to:
   * - Map backend values like "99" -> label "India"
   * - Optionally interpret numeric strings as 1-based index into options if no direct value match
   */
  private resolveExpected(field: AutomatedField): {
    raw: string;
    valueForSelect: string;
    displayText: string;
  } {
    const raw = String(field.value ?? '');
    let valueForSelect = raw;
    let displayText = raw;

    const options = this.canonicalField?.options ?? [];

    if (options.length > 0) {
      // 1) Prefer direct match by option.value
      const byValue = options.find(
        (opt) => opt.value !== null && String(opt.value) === raw
      );
      if (byValue) {
        valueForSelect = String(byValue.value ?? raw);
        displayText = byValue.label || raw;
        return { raw, valueForSelect, displayText };
      }

      // 2) If raw is numeric and no value match, interpret as 1-based index into options
      const numeric = Number(raw);
      if (!Number.isNaN(numeric) && Number.isInteger(numeric)) {
        const idx = numeric - 1; // 1-based -> 0-based
        if (idx >= 0 && idx < options.length) {
          const opt = options[idx];
          valueForSelect = String(opt.value ?? opt.label ?? raw);
          displayText = opt.label || String(opt.value ?? raw);
          return { raw, valueForSelect, displayText };
        }
      }
    }

    // Fallback: no canonical options or no match, use raw as-is
    return { raw, valueForSelect, displayText };
  }

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

    const { valueForSelect, displayText } = this.resolveExpected(field);
    
    try {
      await this.scrollToLocator(locator);
      
      // Try by value first
      try {
        await locator.selectOption({ value: valueForSelect }, { timeout: 2000 });
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
        await locator.selectOption({ label: displayText }, { timeout: 2000 });
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

    const { valueForSelect, displayText } = this.resolveExpected(field);

    try {
      const success = await locator.evaluate((el: Element, searchValue: string) => {
        const selectEl = el as HTMLSelectElement;
        if (!selectEl) return false;
        
        // Find option that contains the value (case-insensitive)
        const searchLower = searchValue.toLowerCase();
        const options = Array.from(selectEl.options);
        
        // First try exact match on value or text
        let match = options.find(
          (o) => o.value === searchValue || o.text.trim() === searchValue
        );
        
        // Then try partial contains
        if (!match) {
          match = options.find(o => 
            o.value.toLowerCase().includes(searchLower) || 
            o.text.toLowerCase().includes(searchLower)
          );
        }
        
        // Try numeric match on value for purely numeric search strings
        if (!match && !isNaN(Number(searchValue))) {
          match = options.find((o) => o.value === searchValue);
        }
        
        if (match) {
          selectEl.value = match.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        
        return false;
      }, valueForSelect || displayText);
      
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
    const { valueForSelect, displayText } = this.resolveExpected(field);
    
    try {
      switch (library) {
        case UILibrary.MATERIAL_UI:
          // MUI Select: click to open, find option, click
          await locator.click();
          await this.page.waitForSelector('[role="listbox"]', { timeout: 2000 });
          await this.page.click(`[role="option"]:has-text("${displayText}")`);
          break;
          
        case UILibrary.BOOTSTRAP: {
          // Bootstrap-select: click trigger, find option in menu
          await locator.click();
          await this.page.waitForSelector('.dropdown-menu', { state: 'visible', timeout: 2000 });
          await this.page.click(`.dropdown-menu >> text="${displayText}"`);
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
          }, valueForSelect);
          
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
          }, valueForSelect);
          
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
      const { displayText } = this.resolveExpected(field);
      
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
      await this.page.keyboard.type(displayText, { delay: 50 });
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
      
      const { raw, valueForSelect, displayText } = this.resolveExpected(field);

      const expectedCandidates = new Set<string>();
      if (raw) expectedCandidates.add(raw);
      if (valueForSelect) expectedCandidates.add(valueForSelect);
      if (displayText) expectedCandidates.add(displayText);

      const actualStr = actual ?? '';
      const actualLower = actualStr.toLowerCase();

      const passed =
        Array.from(expectedCandidates).some(
          (exp) =>
            exp === actualStr ||
            actualLower.includes(exp.toLowerCase())
        );
      
      return {
        passed: passed ? true : false,
        actual: actualStr || undefined,
        expected: displayText,
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
