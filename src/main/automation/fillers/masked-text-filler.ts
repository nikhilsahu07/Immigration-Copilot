
import { TextFiller } from './text-filler';
import { AutomatedField, FillResult, VerificationResult } from './base-filler';

/**
 * MaskedTextFiller - Handles formatted text inputs (phone, SSN, postal code)
 * Behavior: MASKED_INPUT
 * Extends TextFiller with format handling
 */
export class MaskedTextFiller extends TextFiller {
  /**
   * Enhanced native fill - try multiple format variations
   */
  protected async tryNativeFill(field: AutomatedField): Promise<FillResult> {
    const value = String(field.value);
    
    // Try original value first
    let result = await super.tryNativeFill(field);
    if (result.success) return result;
    
    // Try without formatting (remove spaces, dashes, parentheses)
    try {
      const unformatted = value.replace(/[\s\-()]/g, '');
      const fieldCopy = { ...field, value: unformatted };
      result = await super.tryNativeFill(fieldCopy);
      if (result.success) return result;
    } catch {
      // Continue to next attempt
    }
    
    return result;
  }

  /**
   * DOM fill with format stripping
   */
  protected async tryDomFill(field: AutomatedField): Promise<FillResult> {
    try {
      // Try both formatted and unformatted
      const formatted = String(field.value);
      const unformatted = formatted.replace(/[\s\-()]/g, '');
      
      const success = await this.page.evaluate(({ selector, vals }) => {
        const el = document.querySelector(selector);
        if (!el || !(el instanceof HTMLInputElement)) return false;
        
        // Try unformatted first (masks usually handle formatting)
        el.value = vals.unformatted;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        
        return true;
      }, { selector: field.selector, vals: { formatted, unformatted } });
      
      return {
        success,
        strategy: FillStrategy.DOM,
        error: success ? undefined : 'Failed to fill masked input',
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
   * Enhanced verification - compare unformatted values
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    try {
      const actualRaw = await this.page.inputValue(field.selector);
      const expectedRaw = String(field.value);
      
      // Strip formatting from both
      const actual = actualRaw.replace(/[\s\-()]/g, '');
      const expected = expectedRaw.replace(/[\s\-()]/g, '');
      
      const passed = actual.toLowerCase() === expected.toLowerCase();
      
      return {
        passed,
        actual: actualRaw,
        expected: expectedRaw,
        reason: passed ? undefined : 'Masked input value mismatch (unformatted comparison)',
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
