import {
  BaseFiller,
  AutomatedField,
  FillResult,
  FillStrategy,
  UILibrary,
  VerificationResult,
} from './base-filler';

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
        (opt) => opt.value !== null && String(opt.value) === raw,
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
   * Handles both native <select> elements and Bootstrap Select hidden selects
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    let locator = this.getLocator(field);
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

      // Check if this is a Bootstrap Select button - if so, find the hidden select
      const tagName = await locator.evaluate((el: Element) => el.tagName);
      if (tagName === 'BUTTON') {
        const dataId = await locator.getAttribute('data-id');
        if (dataId) {
          // Find the hidden select element by its ID
          const selectLocator = this.page.locator(`select[id="${dataId}"]`);
          const selectCount = await selectLocator.count();
          if (selectCount === 1) {
            locator = selectLocator;
          } else {
            return {
              success: false,
              strategy: FillStrategy.NATIVE,
              error: `Bootstrap Select: hidden select with id="${dataId}" not found`,
              domSnapshot: await this.captureDOMSnapshot(locator),
            };
          }
        }
      }

      // Try by value first
      try {
        await locator.selectOption(
          { value: valueForSelect },
          { timeout: 2000 },
        );
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
   * Handles both native <select> elements and Bootstrap Select trigger buttons
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
      const success = await locator.evaluate(
        (el: Element, searchValue: string) => {
          // Check if this is a native <select> or a Bootstrap Select button
          let selectEl: HTMLSelectElement | null = null;

          if (el.tagName === 'SELECT') {
            selectEl = el as HTMLSelectElement;
          } else if (el.tagName === 'BUTTON' && el.getAttribute('data-id')) {
            // Bootstrap Select: button has data-id pointing to the hidden select's id
            const selectId = el.getAttribute('data-id');
            if (selectId) {
              // The select element ID might have dots, so use attribute selector
              selectEl = document.querySelector(
                `select[id="${selectId}"]`,
              ) as HTMLSelectElement;
            }
          }

          if (!selectEl || !selectEl.options) {
            return false;
          }

          // Find option that contains the value (case-insensitive)
          const searchLower = searchValue.toLowerCase();
          const options = Array.from(selectEl.options);

          // First try exact match on data-country attribute (used by page's JavaScript)
          let match = options.find(
            (o) =>
              o.getAttribute('data-country')?.toLowerCase() === searchLower,
          );

          // Then try exact match on value or text
          if (!match) {
            match = options.find(
              (o) => o.value === searchValue || o.text.trim() === searchValue,
            );
          }

          // Then try partial contains on data-country, text, or value
          if (!match) {
            match = options.find((o) => {
              const dataCountry =
                o.getAttribute('data-country')?.toLowerCase() || '';
              return (
                dataCountry.includes(searchLower) ||
                o.value.toLowerCase().includes(searchLower) ||
                o.text.toLowerCase().includes(searchLower)
              );
            });
          }

          // Try numeric match on value for purely numeric search strings
          if (!match && !isNaN(Number(searchValue))) {
            match = options.find((o) => o.value === searchValue);
          }

          if (match) {
            selectEl.value = match.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));

            // If Bootstrap Select ("selectpicker") is present, refresh the widget
            try {
              const w = window as any;
              if (w.$ && typeof w.$ === 'function') {
                const $el = w.$(selectEl);
                if ($el && $el.selectpicker) {
                  $el.selectpicker('refresh');
                }
              }
            } catch {
              // Ignore jQuery/Bootstrap errors – core behavior still works
            }

            return true;
          }

          return false;
        },
        valueForSelect || displayText,
      );

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
          await this.page.waitForSelector('[role="listbox"]', {
            timeout: 2000,
          });
          await this.page.click(`[role="option"]:has-text("${displayText}")`);
          break;

        case UILibrary.BOOTSTRAP: {
          // Bootstrap-select: click trigger button, then handle dropdown
          await locator.click();
          await this.page.waitForTimeout(400); // Wait for dropdown animation

          // Get the dropdown menu ID from aria-owns attribute
          const ariaOwns = await locator.getAttribute('aria-owns');
          let dropdownMenuSelector = '.dropdown-menu.show, .inner.show';

          if (ariaOwns) {
            // Bootstrap Select uses aria-owns to link button to its dropdown
            dropdownMenuSelector = `#${ariaOwns}, .dropdown-menu.show`;
          }

          // Check if dropdown menu is visible
          let dropdownVisible = false;
          try {
            dropdownVisible = await this.page
              .locator(dropdownMenuSelector)
              .first()
              .isVisible({ timeout: 500 });
          } catch {
            dropdownVisible = false;
          }

          if (!dropdownVisible) {
            // Try opening via keyboard
            await this.page.keyboard.press('ArrowDown');
            await this.page.waitForTimeout(300);
          }

          // Bootstrap-select has a searchbox - try typing there first
          const searchBox = this.page.locator(
            '.bs-searchbox input:visible, .dropdown-menu.show input[type="search"]:visible',
          );
          let hasSearchBox = false;
          try {
            hasSearchBox = (await searchBox.count()) > 0;
          } catch {
            hasSearchBox = false;
          }

          if (hasSearchBox) {
            // Type in search box to filter
            await searchBox.first().fill(displayText);
            await this.page.waitForTimeout(400);

            // Click the first matching result (active item or highlighted)
            const activeOptions = [
              '.dropdown-menu.show .dropdown-item.active',
              '.dropdown-menu.show li.active a',
              '.inner.show .active',
              '.dropdown-menu.show .active',
            ].join(', ');

            const option = this.page.locator(activeOptions);
            if ((await option.count()) > 0) {
              await option.first().click();
            } else {
              // Look for option by text in any visible dropdown
              const textOption = this.page.locator(
                `.dropdown-menu.show >> text="${displayText}"`,
              );
              if ((await textOption.count()) > 0) {
                await textOption.first().click();
              } else {
                // Try clicking in inner list
                const innerOption = this.page.locator(
                  `.inner.show >> text="${displayText}"`,
                );
                if ((await innerOption.count()) > 0) {
                  await innerOption.first().click();
                } else {
                  return {
                    success: false,
                    strategy: FillStrategy.UI_LIBRARY,
                    uiLibrary: library,
                    error: `No option matching "${displayText}" found in Bootstrap Select`,
                  };
                }
              }
            }
          } else {
            // No search box - click option directly by text
            const textOption = this.page.locator(
              `.dropdown-menu.show >> text="${displayText}"`,
            );
            if ((await textOption.count()) > 0) {
              await textOption.first().click();
            } else {
              // Try inner list
              const innerOption = this.page.locator(
                `.inner.show >> text="${displayText}"`,
              );
              if ((await innerOption.count()) > 0) {
                await innerOption.first().click();
              } else {
                return {
                  success: false,
                  strategy: FillStrategy.UI_LIBRARY,
                  uiLibrary: library,
                  error: `No option matching "${displayText}" found in Bootstrap Select`,
                };
              }
            }
          }
          break;
        }

        case UILibrary.SELECT2: {
          // Select2: use jQuery API if available
          const select2Success = await locator.evaluate(
            (el: Element, val: string) => {
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
            },
            valueForSelect,
          );

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
          const tomSuccess = await locator.evaluate(
            (el: Element, val: string) => {
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
            },
            valueForSelect,
          );

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
   * Handles both native <select> elements and Bootstrap Select buttons
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
      // Wait a bit for Bootstrap Select widget to update after refresh
      await this.page.waitForTimeout(300);

      const actual = await locator.evaluate((el: Element) => {
        // Handle native <select> element
        if (el.tagName === 'SELECT') {
          const selectEl = el as HTMLSelectElement;
          const selectedOption = selectEl.options[selectEl.selectedIndex];
          if (selectedOption) {
            // Prefer data-country attribute if available, then text, then value
            return (
              selectedOption.getAttribute('data-country')?.trim() ||
              selectedOption.text?.trim() ||
              selectEl.value
            );
          }
          return selectEl.value || '';
        }

        // Handle Bootstrap Select button - the button text shows the selected value
        if (el.tagName === 'BUTTON') {
          // First check if there's a visible text in the button (not placeholder)
          const filterOption = el.querySelector('.filter-option-inner-inner');
          if (
            filterOption &&
            filterOption.textContent &&
            !filterOption.textContent.includes('Select')
          ) {
            return filterOption.textContent.trim();
          }

          // Try to get the selected value from the hidden select via data-id
          const dataId = el.getAttribute('data-id');
          if (dataId) {
            const hiddenSelect = document.querySelector(
              `select[id="${dataId}"]`,
            ) as HTMLSelectElement;
            if (hiddenSelect && hiddenSelect.selectedIndex >= 0) {
              const selectedOption =
                hiddenSelect.options[hiddenSelect.selectedIndex];
              if (selectedOption) {
                // Prefer data-country attribute if available, then text, then value
                return (
                  selectedOption.getAttribute('data-country')?.trim() ||
                  selectedOption.text?.trim() ||
                  hiddenSelect.value
                );
              }
            }
          }

          // Fallback to button text content
          return el.textContent?.trim() || '';
        }

        return null;
      });

      const { raw, valueForSelect, displayText } = this.resolveExpected(field);

      const expectedCandidates = new Set<string>();
      if (raw) expectedCandidates.add(raw);
      if (valueForSelect) expectedCandidates.add(valueForSelect);
      if (displayText) expectedCandidates.add(displayText);

      const actualStr = actual ?? '';
      const actualLower = actualStr.toLowerCase();

      const passed = Array.from(expectedCandidates).some(
        (exp) => exp === actualStr || actualLower.includes(exp.toLowerCase()),
      );

      return {
        passed: passed ? true : false,
        actual: actualStr || undefined,
        expected: displayText,
        reason: passed
          ? undefined
          : 'Selected option does not match expected value',
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
