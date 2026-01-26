
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

/**
 * ToggleFiller - Handles toggle switches and switch-like checkboxes
 * Behavior: BOOLEAN_TOGGLE
 */
export class ToggleFiller extends BaseFiller {
  /**
   * Strategy 1: Native check/uncheck (using semantic locator)
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
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      if (shouldCheck) {
        await locator.check({ timeout: 3000 });
      } else {
        await locator.uncheck({ timeout: 3000 });
      }
      
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
   * Strategy 2: DOM manipulation with class toggle (using semantic locator)
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
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      const success = await locator.evaluate((el: Element, checked: boolean) => {
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
      }, shouldCheck);
      
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
      switch (library) {
        case UILibrary.BOOTSTRAP:
          // Bootstrap toggle switch - click the toggle wrapper
          await locator.click();
          // Try to find and click the label if available
          try {
            await this.page.locator('.custom-control-label').first().click({ timeout: 2000 });
          } catch {
            // Fallback to direct click
          }
          break;
          
        case UILibrary.MATERIAL_UI:
          // MUI Switch - click the switch element
          await locator.click();
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
   * Strategy 4: Keyboard - Space key to toggle (using semantic locator)
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
      
      await locator.click();
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
   * Verification: Check toggle state (using semantic locator)
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
      const expectedState = field.value === true || field.value === 'true' || field.value === 'yes' || field.value === 'on';
      
      const actualState = await locator.evaluate((el: Element) => {
        // Check as input
        if (el instanceof HTMLInputElement) {
          return el.checked;
        }
        
        // Check as custom toggle
        return el.classList.contains('active') || 
               el.classList.contains('on') ||
               el.getAttribute('aria-checked') === 'true';
      });
      
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
