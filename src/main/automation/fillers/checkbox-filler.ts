
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class CheckboxFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);
      
      // Normalize value - handle various formats Gemini might return
      const value = field.value;
      const shouldCheck = 
        value === true || 
        value === 'true' || 
        value === 'on' || 
        value === 'yes' || 
        value === 'checked' ||
        value === '1' ||
        value === 1 ||
        (typeof value === 'string' && value.toLowerCase().includes('agree')) ||
        (typeof value === 'string' && value.toLowerCase().includes('accept'));
      
      // Use locator for more reliable interaction
      const locator = this.page.locator(field.selector);
      const count = await locator.count();
      
      if (count === 0) {
        logger.warn(`Checkbox not found: ${field.selector}`);
        return false;
      }
      
      const checkbox = locator.first();
      
      // Check current state
      const isChecked = await checkbox.isChecked();
      
      if (shouldCheck && !isChecked) {
        await checkbox.check({ force: true });
        logger.info(`Checked checkbox: ${field.fieldLabel}`);
      } else if (!shouldCheck && isChecked) {
        await checkbox.uncheck({ force: true });
        logger.info(`Unchecked checkbox: ${field.fieldLabel}`);
      } else {
        logger.info(`Checkbox ${field.fieldLabel} already in desired state: ${isChecked}`);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to fill checkbox ${field.fieldLabel}:`, error);
      
      // Fallback: try clicking directly
      try {
        const element = await this.page.$(field.selector);
        if (element) {
          await element.click();
          logger.info(`Clicked checkbox ${field.fieldLabel} as fallback`);
          return true;
        }
      } catch {
        // Ignore fallback failure
      }
      
      return false;
    }
  }
}
