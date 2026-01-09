
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';


export class DateFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);

      // We expect field.value to be YYYY-MM-DD from AI or similar standard.
      // We might need to detect the input's expected format if standard fill fails,
      // but usually standard input[type=date] takes YYYY-MM-DD.
      // If it's a text field acting as date, we might need specific format.
      
      const dateVal = String(field.value);
      // Ensure YYYY-MM-DD
      let formattedDate = dateVal;
      // Simple check if it's already YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) {
              formattedDate = d.toISOString().split('T')[0];
          }
      }

      // Try standard fill
      await this.page.fill(field.selector, formattedDate);
      
      // Dispatch events
      await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (el) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, field.selector);

      logger.info(`Filled date field ${field.fieldLabel} with ${formattedDate}`);
      return true;
    } catch (error) {
      logger.error(`Failed to fill date field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
