
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class RadioFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      // 1. Try clicking the element directly with Playwright
      // This handles radio buttons, button-style radios, and custom components
      try {
        await this.scrollToElement(field.selector);
        await this.page.click(field.selector, { timeout: 5000 });
        logger.info(`Clicked radio/button: ${field.fieldLabel} (${field.selector})`);
        return true;
      } catch {
        // Direct click failed, try other methods
      }

      // 2. Try by Value - find radio with matching value
      if (field.value) {
        try {
          // Try to find input[type="radio"] with the value
          const radioSelector = `input[type="radio"][value="${field.value}"]`;
          const radio = await this.page.$(radioSelector);
          if (radio) {
            await radio.check();
            logger.info(`Checked radio by value: ${field.value}`);
            return true;
          }
        } catch {
          // Continue
        }

        // 3. Try button-style element with text matching value
        try {
          // Use getByRole to find button with the text
          const btn = this.page.getByRole('button', { name: field.value as string });
          if (await btn.count() > 0 && await btn.first().isVisible()) {
            await btn.first().click();
            logger.info(`Clicked button by text: ${field.value}`);
            return true;
          }
        } catch {
          // Continue
        }
        
        // 4. Try any element with text matching
        try {
          const textElement = this.page.getByText(field.value as string, { exact: true });
          if (await textElement.count() > 0 && await textElement.first().isVisible()) {
            await textElement.first().click();
            logger.info(`Clicked element by text: ${field.value}`);
            return true;
          }
        } catch {
          // Continue
        }
      }
      
      // 5. Try clicking by Label Text (for semantic forms)
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
                 // Click the label itself
                 (matchingLabel as HTMLElement).click();
                 return true;
             }
             return false;
        }, field.fieldLabel);

        if (clicked) {
             logger.info(`Clicked radio/button by label: ${field.fieldLabel}`);
             return true;
        }
      }

      // 6. Last resort - use JavaScript to click
      if (field.selector) {
        try {
          const clicked = await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              (el as HTMLElement).click();
              return true;
            }
            return false;
          }, field.selector);
          
          if (clicked) {
            logger.info(`Clicked via JS: ${field.selector}`);
            return true;
          }
        } catch {
          // Ignore
        }
      }
      
      logger.warn(`Could not fill radio/button: ${field.fieldLabel}`);
      return false;
    } catch (error) {
      logger.error(`Failed to fill radio field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
