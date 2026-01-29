import { TextFiller } from './text-filler';
import {
  AutomatedField,
  FillResult,
  FillStrategy,
  UILibrary,
  VerificationResult,
} from './base-filler';

/**
 * SearchSelectFiller - Handles searchable/filterable dropdowns.
 * Behavior: SEARCH_AND_SELECT.
 *
 * This builds on TextFiller strategies but adds:
 * - A DOM strategy that can operate directly on <select> elements and
 *   Bootstrap "selectpicker" widgets (as used on coursefinder.ai).
 * - Bootstrap select detection in tryUILibraryFill so we use selectOption/Bootstrap path instead of text fill.
 * - Select-aware verification so DOM success on <select> / Bootstrap select passes verifyFill.
 * - An enhanced keyboard strategy that presses Enter to confirm the first match.
 */
export class SearchSelectFiller extends TextFiller {
  /**
   * Enhanced keyboard fill for search - adds Enter key after typing.
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number) {
    const result = await super.tryKeyboardFill(field, retryCount);

    if (result.success) {
      try {
        // Wait for dropdown/suggestions
        await this.page.waitForTimeout(300);

        // Press Enter to select first match
        await this.page.keyboard.press('Enter');
      } catch {
        // Ignore if Enter fails
      }
    }

    return result;
  }

  /**
   * Override DOM strategy to support native <select> and Bootstrap Select ("selectpicker")
   * components, which back the searchable country/state/nationality dropdowns.
   *
   * This avoids brittle click-based interaction on the overlaid <button> and instead
   * sets the underlying <select> value directly, dispatching the proper events and,
   * when available, calling $.selectpicker('refresh').
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

    const searchValue = String(field.value ?? '');

    try {
      const success = await locator.evaluate((el: Element, search: string) => {
        // Resolve the underlying <select> element:
        // - If the locator is already the <select>, use it.
        // - If it's the Bootstrap Select trigger <button>, follow data-id to the hidden <select>.
        let selectEl: HTMLSelectElement | null = null;

        if (el.tagName === 'SELECT') {
          selectEl = el as HTMLSelectElement;
        } else if (el.tagName === 'BUTTON' && el.getAttribute('data-id')) {
          const selectId = el.getAttribute('data-id')!;
          selectEl = document.querySelector(
            `select[id="${selectId}"]`,
          ) as HTMLSelectElement | null;
        }

        if (!selectEl || !selectEl.options) {
          return false;
        }

        const searchLower = search.toLowerCase();
        const options = Array.from(selectEl.options);

        // 1) Try exact match on data-country attribute (used by page's JavaScript)
        let match = options.find(
          (o) => o.getAttribute('data-country')?.toLowerCase() === searchLower,
        );

        // 2) Try exact match on value or visible text
        if (!match) {
          match = options.find(
            (o) => o.value === search || o.text.trim() === search,
          );
        }

        // 3) Fallback: case-insensitive "contains" on data-country, value, or text
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

        // 4) If search is numeric, try exact value match again
        if (!match && !isNaN(Number(search))) {
          match = options.find((o) => o.value === search);
        }

        if (!match) {
          return false;
        }

        // Set the selected value and dispatch standard events
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
      }, searchValue);

      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'No matching option found',
        domSnapshot: await this.captureDOMSnapshot(locator),
      };
    } catch (error) {
      return {
        success: false,
        strategy: FillStrategy.DOM,
        error: String(error),
        domSnapshot: await this.captureDOMSnapshot(locator),
      };
    }
  }

  /**
   * When the field is a <select> or Bootstrap selectpicker, verify using selected option
   * (so DOM fill success is accepted instead of failing on TextFiller's inputValue()).
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
      const isSelectOrBootstrap = await locator.evaluate((el: Element) => {
        if (el.tagName === 'SELECT') return true;
        if (
          el.tagName === 'BUTTON' &&
          (el.getAttribute('data-id') ||
            el.classList.contains('dropdown-toggle'))
        )
          return true;
        return false;
      });

      if (isSelectOrBootstrap) {
        const actual = await locator.evaluate((el: Element) => {
          if (el.tagName === 'SELECT') {
            const selectEl = el as HTMLSelectElement;
            return (
              selectEl.options[selectEl.selectedIndex]?.text?.trim() ||
              selectEl.value ||
              ''
            );
          }
          if (el.tagName === 'BUTTON') {
            const filterOption = el.querySelector('.filter-option-inner-inner');
            if (filterOption?.textContent)
              return filterOption.textContent.trim();
            const dataId = el.getAttribute('data-id');
            if (dataId) {
              const hiddenSelect = document.querySelector(
                `select[id="${dataId}"]`,
              ) as HTMLSelectElement;
              if (hiddenSelect?.selectedIndex >= 0)
                return (
                  hiddenSelect.options[
                    hiddenSelect.selectedIndex
                  ]?.text?.trim() ||
                  hiddenSelect.value ||
                  ''
                );
            }
            return el.textContent?.trim() || '';
          }
          return '';
        });
        const expected = String(field.value ?? '').trim();
        const actualLower = (actual ?? '').toLowerCase();
        const expectedLower = expected.toLowerCase();
        const passed =
          actualLower === expectedLower ||
          actualLower.includes(expectedLower) ||
          expectedLower.includes(actualLower);
        return {
          passed,
          actual: actual ?? undefined,
          expected,
          reason: passed
            ? undefined
            : 'Selected option does not match expected value',
        };
      }

      return await super.verifyFill(field);
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
   * When Bootstrap selectpicker is detected, use Bootstrap select path (click dropdown, search, select)
   * instead of TextFiller's generic fill so we don't return UNKNOWN and skip.
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
    const displayText = String(field.value ?? '').trim();

    if (library === UILibrary.BOOTSTRAP) {
      try {
        await this.scrollToLocator(locator);
        await locator.click();
        await this.page.waitForTimeout(400);

        const ariaOwns = await locator.getAttribute('aria-owns');
        const dropdownMenuSelector = ariaOwns
          ? `#${ariaOwns}, .dropdown-menu.show`
          : '.dropdown-menu.show, .inner.show';
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
          await this.page.keyboard.press('ArrowDown');
          await this.page.waitForTimeout(300);
        }

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
          await searchBox.first().fill(displayText);
          await this.page.waitForTimeout(400);
        }

        const activeOptions =
          '.dropdown-menu.show .dropdown-item.active, .dropdown-menu.show li.active a, .inner.show .active, .dropdown-menu.show .active';
        const option = this.page.locator(activeOptions);
        if ((await option.count()) > 0) {
          await option.first().click();
        } else {
          const textOption = this.page.locator(
            `.dropdown-menu.show >> text="${displayText}"`,
          );
          if ((await textOption.count()) > 0) {
            await textOption.first().click();
          } else {
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

    return await super.tryUILibraryFill(field);
  }
}
