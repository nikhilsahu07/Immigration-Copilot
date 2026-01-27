
import { TextFiller } from './text-filler';
import { AutomatedField, FillResult, FillStrategy } from './base-filler';

/**
 * SearchSelectFiller - Handles searchable/filterable dropdowns.
 * Behavior: SEARCH_AND_SELECT.
 *
 * This builds on TextFiller strategies but adds:
 * - A DOM strategy that can operate directly on <select> elements and
 *   Bootstrap "selectpicker" widgets (as used on coursefinder.ai).
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
          selectEl = document.querySelector(`select[id="${selectId}"]`) as HTMLSelectElement | null;
        }

        if (!selectEl || !selectEl.options) {
          return false;
        }

        const searchLower = search.toLowerCase();
        const options = Array.from(selectEl.options);

        // 1) Try exact match on value or visible text
        let match = options.find(
          (o) => o.value === search || o.text.trim() === search,
        );

        // 2) Fallback: case-insensitive "contains" on value or text
        if (!match) {
          match = options.find(
            (o) =>
              o.value.toLowerCase().includes(searchLower) ||
              o.text.toLowerCase().includes(searchLower),
          );
        }

        // 3) If search is numeric, try exact value match again
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
}
