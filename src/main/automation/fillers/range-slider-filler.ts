

import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * RangeSliderFiller - Handles range sliders and numeric input sliders
 * Behavior: RANGE_SLIDER
 */
export class RangeSliderFiller extends BaseFiller {
  /**
   * Strategy 1: Native fill for input[type="range"]
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      const value = String(field.value);
      await this.page.fill(field.selector, value, { timeout: 3000 });
      
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
   * Strategy 2: DOM manipulation for range inputs
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const value = Number(field.value);
      
      const success = await this.page.evaluate(({ selector, val }) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        if (el instanceof HTMLInputElement && el.type === 'range') {
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      }, { selector: field.selector, val: value });
      
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
   * Strategy 3: UI Library-specific handling (noUiSlider, ion.rangeSlider, etc.)
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    const value = Number(field.value);
    
    try {
      // Try noUiSlider API
      const noUiSuccess = await this.page.evaluate(({ sel, val }) => {
        try {
          const el = document.querySelector(sel) as any;
          if (el && el.noUiSlider) {
            el.noUiSlider.set(val);
            return true;
          }
        } catch {
          return false;
        }
        return false;
      }, { sel: field.selector, val: value });
      
      if (noUiSuccess) {
        return {
          success: true,
          strategy: FillStrategy.UI_LIBRARY,
          uiLibrary: UILibrary.UNKNOWN,
        };
      }
      
      // Try ion.rangeSlider API
      const ionSuccess = await this.page.evaluate(({ sel, val }) => {
        try {
          const $el = (window as any).$(sel);
          if ($el && $el.data && $el.data('ionRangeSlider')) {
            $el.data('ionRangeSlider').update({ from: val });
            return true;
          }
        } catch {
          return false;
        }
        return false;
      }, { sel: field.selector, val: value });
      
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
   * Strategy 4: Keyboard - Arrow keys to adjust value
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      const targetValue = Number(field.value);
      
      // Focus the slider
      await this.page.click(field.selector);
      await this.page.waitForTimeout(100);
      
      // Get current value
      const currentValue = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        return el ? Number(el.value) : 0;
      }, field.selector);
      
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
   * Verification: Check slider value
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const expected = Number(field.value);
      
      const actual = await this.page.evaluate((selector) => {
        const el = document.querySelector(selector) as HTMLInputElement;
        return el ? Number(el.value) : null;
      }, field.selector);
      
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
