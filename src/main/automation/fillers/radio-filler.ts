
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class RadioFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright check
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    try {
      await this.scrollToElement(field.selector);
      await this.page.check(field.selector, { timeout: 3000 });
      
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
      const success = await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        if (el instanceof HTMLInputElement && el.type === 'radio') {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        
        return false;
      }, field.selector);
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Element not found or not a radio button',
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
   * Strategy 3: UI Library-specific handling (custom radio buttons)
   */
  protected async tryUILibraryFill(field: AutomatedField): Promise<FillResult> {
    const library = await this.detectLibrary(field.selector);
    
    try {
      switch (library) {
        case UILibrary.BOOTSTRAP:
          // Bootstrap custom radio: click the label or parent
          const clicked = await this.page.evaluate((selector) => {
            const radio = document.querySelector(selector) as HTMLInputElement;
            if (!radio) return false;
            
            // Try clicking the parent label
            const label = radio.closest('label') || radio.parentElement?.querySelector('label');
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
              error: 'Bootstrap radio parent label not found',
            };
          }
          break;
          
        case UILibrary.MATERIAL_UI:
          // MUI radio: click the parent span or label
          await this.page.click(`${field.selector} ~ .MuiRadio-root`, { timeout: 2000 });
          break;
          
        default:
          // No specific handler
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
   * Strategy 4: Keyboard-based (click + Space)
   */
  protected async tryKeyboardFill(field: AutomatedField, retryCount: number): Promise<FillResult> {
    try {
      if (retryCount > 0) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(100);
      }
      
      // Focus and select with Space key
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
   * Verification: Check if radio is checked
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const isChecked = await this.page.isChecked(field.selector);
      
      return {
        passed: isChecked,
        actual: String(isChecked),
        expected: 'true',
        reason: isChecked ? undefined : 'Radio button not checked after fill',
      };
    } catch (error) {
      return {
        passed: false,
        actual: undefined,
        expected: 'true',
        reason: `Verification failed: ${String(error)}`,
      };
    }
  }
}
