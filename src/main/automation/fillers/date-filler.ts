import {
  BaseFiller,
  AutomatedField,
  FillResult,
  FillStrategy,
  UILibrary,
  VerificationResult,
} from './base-filler';

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
      // Convert to DD/MM/YYYY for datetime inputs (Bootstrap datetimepicker format)
      const dateParts = dateString.split('-');
      const ddMMyyyy =
        dateParts.length === 3
          ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
          : dateString;

      // Check input type to determine format
      const inputType = await locator.evaluate((el: Element) => {
        if (el instanceof HTMLInputElement) {
          return el.type;
        }
        return '';
      });

      const fillValue = inputType === 'date' ? dateString : ddMMyyyy;
      await locator.fill(fillValue, { timeout: 3000 });

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
      // Convert to DD/MM/YYYY for datetime inputs
      const dateParts = dateString.split('-');
      const ddMMyyyy =
        dateParts.length === 3
          ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
          : dateString;

      const success = await locator.evaluate(
        (el: Element, value: string, formattedValue: string) => {
          if (el instanceof HTMLInputElement) {
            // For type="datetime" (Bootstrap datetimepicker), use DD/MM/YYYY format
            if (el.type === 'datetime' || el.type === 'text') {
              el.value = formattedValue;
            } else if (el.type === 'date') {
              el.value = value; // YYYY-MM-DD for HTML5 date inputs
            } else {
              el.value = formattedValue; // Default to DD/MM/YYYY
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
          return false;
        },
        dateString,
        ddMMyyyy,
      );

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
          // Bootstrap datetimepicker: set via data API if available
          // The page uses format DD/MM/YYYY, so convert YYYY-MM-DD to DD/MM/YYYY
          const dateParts = dateString.split('-');
          const ddMMyyyy =
            dateParts.length === 3
              ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
              : dateString;

          const bootstrapSuccess = await locator.evaluate(
            (el: Element, val: string, formattedVal: string) => {
              try {
                const $el = (window as any).$(el);
                // Try datetimepicker first (Bootstrap datetimepicker)
                if ($el && $el.datetimepicker) {
                  $el.datetimepicker('date', formattedVal);
                  return true;
                }
                // Fallback to datepicker (Bootstrap datepicker)
                if ($el && $el.datepicker) {
                  $el.datepicker('setDate', formattedVal);
                  return true;
                }
              } catch {
                return false;
              }
              return false;
            },
            dateString,
            ddMMyyyy,
          );

          if (!bootstrapSuccess) {
            // Fallback to regular fill with DD/MM/YYYY format
            await locator.fill(ddMMyyyy);
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
  protected async tryKeyboardFill(
    field: AutomatedField,
    retryCount: number,
  ): Promise<FillResult> {
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
      // Convert to DD/MM/YYYY for datetime inputs
      const dateParts = dateString.split('-');
      const ddMMyyyy =
        dateParts.length === 3
          ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
          : dateString;

      // Check input type to determine format
      const inputType = await locator.evaluate((el: Element) => {
        if (el instanceof HTMLInputElement) {
          return el.type;
        }
        return '';
      });

      const typeValue = inputType === 'date' ? dateString : ddMMyyyy;

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
      await this.page.keyboard.type(typeValue, { delay: 50 });
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
  protected async verifyFill(
    field: AutomatedField,
  ): Promise<VerificationResult> {
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
      // Wait a bit for datetimepicker to update
      await this.page.waitForTimeout(300);

      // Try to get value from input
      let actual: string;
      try {
        actual = await locator.inputValue();
      } catch {
        // If inputValue fails, try getting value attribute directly
        actual = await locator.evaluate((el: Element) => {
          if (el instanceof HTMLInputElement) {
            return el.value || '';
          }
          return '';
        });
      }

      const expected = this.normalizeDate(field.value);

      // Normalize both for comparison - handle both YYYY-MM-DD and DD/MM/YYYY formats
      const actualNormalized = this.normalizeDate(actual);
      const expectedNormalized = this.normalizeDate(expected);

      // Also try comparing as-is (in case formats match)
      const passed =
        actualNormalized === expectedNormalized ||
        this.areDatesEqual(actual, expected);

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
   * Compare dates in different formats (DD/MM/YYYY vs YYYY-MM-DD)
   */
  private areDatesEqual(date1: string, date2: string): boolean {
    try {
      // Parse DD/MM/YYYY format
      const parseDDMMYYYY = (d: string): Date | null => {
        const parts = d.split('/');
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0]),
          );
        }
        return null;
      };

      // Parse YYYY-MM-DD format
      const parseYYYYMMDD = (d: string): Date | null => {
        const parts = d.split('-');
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2]),
          );
        }
        return null;
      };

      const d1 =
        parseDDMMYYYY(date1) || parseYYYYMMDD(date1) || new Date(date1);
      const d2 =
        parseDDMMYYYY(date2) || parseYYYYMMDD(date2) || new Date(date2);

      return d1.getTime() === d2.getTime();
    } catch {
      return false;
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
