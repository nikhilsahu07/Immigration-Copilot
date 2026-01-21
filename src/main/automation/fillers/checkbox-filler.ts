
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class CheckboxFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright check/uncheck
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes';
      
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
   * Strategy 3: UI Library-specific handling
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    const shouldCheck = field.value === true || field.value === 'true' || field.value === 'yes';
    
    try {
      switch (library) {
        case UILibrary.BOOTSTRAP: {
          // Bootstrap custom checkbox: click the label
          const clicked = await this.page.evaluate((selector) => {
            const checkbox = document.querySelector(selector) as HTMLInputElement;
            if (!checkbox) return false;
            
            const label = checkbox.closest('label') || checkbox.parentElement?.querySelector('label');
            if (label) {
              (label as HTMLElement).click();
              return true;
            }
            
            return false;
          }, field.selector);
          
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
            await this.page.check(field.selector, { timeout: 2000 });
          } else {
            await this.page.uncheck(field.selector, { timeout: 2000 });
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
   * Strategy 4: Keyboard-based (click + Space to toggle)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Click to focus, Space to toggle
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
   * Verification: Check if checkbox state matches expected
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const isChecked = await this.page.isChecked(field.selector);
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
