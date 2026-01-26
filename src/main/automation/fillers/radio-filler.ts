
import { BaseFiller, AutomatedField, FillResult, FillStrategy, UILibrary, VerificationResult } from './base-filler';

export class RadioFiller extends BaseFiller {
  /**
   * Strategy 1: Native Playwright check (using semantic locator)
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
      await locator.check({ timeout: 3000 });
      
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
   * Strategy 2: Direct DOM manipulation (using semantic locator)
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
      const success = await locator.evaluate((el: Element) => {
        if (el instanceof HTMLInputElement && el.type === 'radio') {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      });
      
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
        case UILibrary.BOOTSTRAP: {
          // Bootstrap custom radio: click the label or parent
          const clicked = await locator.evaluate((el: Element) => {
            const radio = el as HTMLInputElement;
            if (!radio) return false;
            
            // Try clicking the parent label
            const label = radio.closest('label') || radio.parentElement?.querySelector('label');
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
              error: 'Bootstrap radio parent label not found',
            };
          }
          break;
        }
          
        case UILibrary.MATERIAL_UI:
          // MUI radio: click the parent span or label
          await locator.click();
          // Try to find and click the MUI radio root if available
          try {
            await this.page.locator('.MuiRadio-root').first().click({ timeout: 2000 });
          } catch {
            // Fallback to direct click
          }
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
   * Strategy 4: Keyboard-based (click + Space, using semantic locator)
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
      
      // Focus and select with Space key
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
   * Verification: Check if radio is checked (using semantic locator)
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    const locator = this.getLocator(field);
    if (!locator) {
      return {
        passed: false,
        actual: undefined,
        expected: 'true',
        reason: 'No locator available for verification',
      };
    }

    try {
      const isChecked = await locator.isChecked();
      
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
