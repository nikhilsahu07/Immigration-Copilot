

import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * RangeSliderFiller - Handles range sliders and numeric input sliders
 * Behavior: RANGE_SLIDER
 */
export class RangeSliderFiller extends BaseFiller {
  /**
   * Strategy 1: Native fill for input[type="range"] (using semantic locator)
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
      const value = String(field.value);
      await locator.fill(value, { timeout: 3000 });
      
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
   * Strategy 2: DOM manipulation for range inputs (using semantic locator)
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
      const value = Number(field.value);
      
      const success = await locator.evaluate((el: Element, val: number) => {
        if (el instanceof HTMLInputElement && el.type === 'range') {
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, value);
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found or not a range input',
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
    const value = Number(field.value);
    
    try {
      // Try noUiSlider API
      const noUiSuccess = await locator.evaluate((el: Element, val: number) => {
        try {
          const sliderEl = el as any;
          if (sliderEl && sliderEl.noUiSlider) {
            sliderEl.noUiSlider.set(val);
            return true;
          }
        } catch {
          return false;
        }
        return false;
      }, value);
      
      if (noUiSuccess) {
        return {
          success: true,
          strategy: FillStrategy.UI_LIBRARY,
          uiLibrary: UILibrary.UNKNOWN,
        };
      }
      
      // Try ion.rangeSlider API
      const ionSuccess = await locator.evaluate((el: Element, val: number) => {
        try {
          const $el = (window as any).$(el);
          if ($el && $el.data && $el.data('ionRangeSlider')) {
            $el.data('ionRangeSlider').update({ from: val });
            return true;
          }
        } catch {
          return false;
        }
        return false;
      }, value);
      
      if (ionSuccess) {
        return {
          success: true,
          strategy: FillStrategy.UI_LIBRARY,
          uiLibrary: UILibrary.UNKNOWN,
        };
      }
      
      return {
        success: false,
        strategy: FillStrategy.UI_LIBRARY,
        uiLibrary: library,
        error: 'No slider library API detected',
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
   * Strategy 4: Keyboard - Arrow keys to adjust value (using semantic locator)
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
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      const targetValue = Number(field.value);
      
      // Focus the slider
      await locator.click();
      await this.page.waitForTimeout(100);
      
      // Get current value
      const currentValue = await locator.evaluate((el: Element) => {
        const inputEl = el as HTMLInputElement;
        return inputEl ? Number(inputEl.value) : 0;
      });
      
      // Calculate steps needed
      const diff = targetValue - currentValue;
      const steps = Math.abs(diff);
      const key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
      
      // Press arrow keys (max 50 steps to avoid infinite loop)
      for (let i = 0; i < Math.min(steps, 50); i++) {
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(50);
      }
      
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
   * Verification: Check slider value (using semantic locator)
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
      const expected = Number(field.value);
      
      const actual = await locator.evaluate((el: Element) => {
        const inputEl = el as HTMLInputElement;
        return inputEl ? Number(inputEl.value) : null;
      });
      
      // Allow small tolerance for slider precision
      const tolerance = 1;
      const passed = actual !== null && Math.abs(actual - expected) <= tolerance;
      
      return {
        passed,
        actual: String(actual),
        expected: String(expected),
        reason: passed ? undefined : `Slider value ${actual} does not match expected ${expected}`,
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
