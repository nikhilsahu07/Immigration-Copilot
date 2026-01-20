
import { TextFiller } from './text-filler';
import { AutomatedField } from './base-filler';

/**
 * SearchSelectFiller - Handles searchable/filterable dropdowns
 * Behavior: SEARCH_AND_SELECT
 * Prioritizes keyboard strategy over native select
 */
export class SearchSelectFiller extends TextFiller {
  /**
   * Override fill to prioritize keyboard typing for search
   * This works better for autocomplete/combobox fields
   */
  async fill(field: AutomatedField): Promise<boolean> {
    // For searchable selects, keyboard is often more reliable than native
    // So we override the progressive order slightly
    
    const attempts: any[] = [];
    
    // 1. Try Keyboard first (best for search)
    const keyboardResult = await this.tryKeyboardFill(field, 0);
    attempts.push(keyboardResult);
    if (keyboardResult.success && (await this.verifyFill(field)).passed) {
      this.logSuccess(field, attempts, await this.verifyFill(field));
      return true;
    }
    
    // 2. Try Native
    const nativeResult = await this.tryNativeFill(field);
    attempts.push(nativeResult);
    if (nativeResult.success && (await this.verifyFill(field)).passed) {
      this.logSuccess(field, attempts, await this.verifyFill(field));
      return true;
    }
    
    // 3. Try DOM
    const domResult = await this.tryDomFill(field);
    attempts.push(domResult);
    if (domResult.success && (await this.verifyFill(field)).passed) {
      this.logSuccess(field, attempts, await this.verifyFill(field));
      return true;
    }
    
    // 4. Try UI Library
    const libraryResult = await this.tryUILibraryFill(field);
    attempts.push(libraryResult);
    if (libraryResult.success && (await this.verifyFill(field)).passed) {
      this.logSuccess(field, attempts, await this.verifyFill(field));
      return true;
    }
    
    // All failed
    this.logFailure(field, attempts);
    return false;
  }
  
  /**
   * Enhanced keyboard fill for search - adds Enter key
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
}
