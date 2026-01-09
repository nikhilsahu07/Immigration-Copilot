
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class TextFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);
      
      // Clear and fill
      await this.page.fill(field.selector, String(field.value));
      
      // Dispatch events manually just in case
      await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (el) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, field.selector);

      logger.info(`Filled text field ${field.fieldLabel} (${field.selector})`);
      return true;
    } catch (error) {
      logger.error(`Failed to fill text field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
