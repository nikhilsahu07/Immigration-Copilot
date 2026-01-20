
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * ToggleFiller - Handles toggle switches and switch-like checkboxes
 * Behavior: BOOLEAN_TOGGLE
 */
export class ToggleFiller extends BaseFiller {
  /**
   * Strategy 1: Native check/uncheck
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      if (shouldCheck) {
        await this.page.check(field.selector, { timeout: 3000 });
      } else {
        await this.page.uncheck(field.selector, { timeout: 3000 });
      }
      
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
   * Strategy 2: DOM manipulation with class toggle
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      const success = await this.page.evaluate(({ selector, checked }) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        // Try as checkbox/input
        if (el instanceof HTMLInputElement) {
          el.checked = checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        // Try as custom toggle (add/remove active class)
        if (checked) {
          el.classList.add('active', 'on', 'checked');
          el.setAttribute('aria-checked', 'true');
        } else {
          el.classList.remove('active', 'on', 'checked');
          el.setAttribute('aria-checked', 'false');
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, { selector: field.selector, checked: shouldCheck });
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found',
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
   * Strategy 3: UI Library-specific handling
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    
    try {
      switch (library) {
        case UILibrary.BOOTSTRAP:
          // Bootstrap toggle switch - click the toggle wrapper
          await this.page.click(`${field.selector} ~ .custom-control-label`);
          break;
          
        case UILibrary.MATERIAL_UI:
          // MUI Switch - click the switch element
          await this.page.click(field.selector);
          break;
          
        default:
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
   * Strategy 4: Keyboard - Space key to toggle
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      await this.page.click(field.selector);
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Space');
      
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
   * Verification: Check toggle state
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const expectedState = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      const actualState = await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        
        // Check as input
        if (el instanceof HTMLInputElement) {
          return el.checked;
        }
        
        // Check as custom toggle
        return el.classList.contains('active') || 
               el.classList.contains('on') ||
               el.getAttribute('aria-checked') === 'true';
      }, field.selector);
      
      const passed = actualState === expectedState;
      
      return {
        passed,
        actual: String(actualState),
        expected: String(expectedState),
        reason: passed ? undefined : 'Toggle state does not match expected value',
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
