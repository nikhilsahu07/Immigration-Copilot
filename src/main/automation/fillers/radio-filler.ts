
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class RadioFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      // 1. Try clicking by Label Text (Most reliable for semantic forms)
      if (field.fieldLabel) {
        const clicked = await this.page.evaluate((labelText) => {
             const labels = Array.from(document.querySelectorAll('label'));
             const matchingLabel = labels.find(l => 
                l.textContent?.trim() === labelText || l.textContent?.includes(labelText)
             );
             
             if (matchingLabel) {
                 // Check 'for' attribute
                 const forId = matchingLabel.getAttribute('for');
                 if (forId) {
                     const input = document.getElementById(forId);
                     if (input && (input as HTMLInputElement).type === 'radio') {
                         (input as HTMLElement).click();
                         return true;
                     }
                 }
                 // Check nested
                 const nestedInput = matchingLabel.querySelector('input[type="radio"]');
                 if (nestedInput) {
                     (nestedInput as HTMLElement).click();
                     return true;
                 }
             }
             return false;
        }, field.fieldLabel);

        if (clicked) {
             logger.info(`Clicked radio by label: ${field.fieldLabel}`);
             return true;
        }
      }

      // 2. Try by Selector
      const el = await this.page.$(field.selector);
      if (el) {
          await el.check(); // Playwright's check() is smart
          logger.info(`Checked radio by selector: ${field.selector}`);
          return true;
      }
      
      // 3. Try by Value in Group (if selector fails but we know value)
      // This requires knowing the 'name' attribute which might be what the selector uses.
      
      return false;
    } catch (error) {
      logger.error(`Failed to fill radio field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
