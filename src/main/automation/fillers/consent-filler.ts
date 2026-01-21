
import { CheckboxFiller } from './checkbox-filler';
import { AutomatedField, VerificationResult } from './base-filler';

/**
 * ConsentFiller - Specialized checkbox for terms & conditions
 * Behavior: CONSENT_CHECKBOX
 * Extends CheckboxFiller with additional validation
 */
export class ConsentFiller extends CheckboxFiller {
  /**
   * Override fill to add scroll-into-view and visibility check
   */
  async fill(field: AutomatedField): Promise<boolean> {
    // Ensure consent checkbox is fully visible
    await this.scrollToElement(field.selector);
    await this.page.waitForTimeout(200);  // Let scroll complete
    
    // Use parent checkbox fill logic
    return await super.fill(field);
  }

  /**
   * Enhanced verification - check "I agree" text is nearby
   */
  protected async verifyFill(field: AutomatedField): Promise<VerificationResult> {
    // First do standard checkbox verification
    const baseVerification = await super.verifyFill(field);
    
    if (!baseVerification.passed) {
      return baseVerification;
    }
    
    // Additionally verify consent-related text is present
    try {
      const hasConsentText = await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        // Check parent text for consent keywords
        const parent = el.closest('label') || el.parentElement;
        const text = parent?.textContent?.toLowerCase() || '';
        
        return text.includes('agree') || 
               text.includes('accept') ||
               text.includes('terms') ||
               text.includes('consent');
      }, field.selector);
      
      if (!hasConsentText) {
        return {
          passed: false,
          actual: baseVerification.actual,
          expected: baseVerification.expected,
          reason: 'Checkbox checked but no consent text found nearby',
        };
      }
      
      return baseVerification;
    } catch {
      // If consent text check fails, return base verification
      return baseVerification;
    }
  }
}
