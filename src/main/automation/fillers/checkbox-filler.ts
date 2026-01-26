
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class CheckboxFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright check/uncheck (using semantic locator)
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
      
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes';
      
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
   * Strategy 2: Direct DOM manipulation
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes';
      
      const success = await this.page.evaluate(({ selector, checked }) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          el.checked = checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        
        return false;
      }, { selector: field.selector, checked: shouldCheck });
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found or not a checkbox',
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
    const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes';
    
    try {
      switch (library) {
        case UILibrary.BOOTSTRAP: {
          // Bootstrap custom checkbox: click the label
          const clicked = await locator.evaluate((el: Element) => {
            const checkbox = el as HTMLInputElement;
            if (!checkbox) return false;
            
            const label = checkbox.closest('label') || checkbox.parentElement?.querySelector('label');
            if (label) {
              (label as HTMLElement).click();
              return true;
            }
            return false;
          });
          
          if (!clicked) {
            return {
              success: false,
              strategy: FillStrategy.UI_LIBRARY,
              uiLibrary: library,
              error: 'Bootstrap checkbox parent label not found',
            };
          }
          break;
        }
          
        case UILibrary.MATERIAL_UI:
          // MUI checkbox: click the checkbox wrapper
          if (shouldCheck) {
            await locator.check({ timeout: 2000 });
          } else {
            await locator.uncheck({ timeout: 2000 });
          }
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
   * Strategy 4: Keyboard-based (click + Space to toggle, using semantic locator)
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
      
      // Click to focus, Space to toggle
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
   * Verification: Check if checkbox state matches expected (using semantic locator)
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
      const isChecked = await locator.isChecked();
      const expectedChecked = field.value === true || field.value === 'true' || field.value === 'yes';
      
      const passed = isChecked === expectedChecked;
      
      return {
        passed,
        actual: String(isChecked),
        expected: String(expectedChecked),
        reason: passed ? undefined : 'Checkbox state does not match expected value',
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
