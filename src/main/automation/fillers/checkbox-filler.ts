
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class CheckboxFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);
      
      const shouldCheck = field.value === true || field.value === 'true' || field.value === 'on';
      
      if (shouldCheck) {
          await this.page.check(field.selector);
      } else {
          await this.page.uncheck(field.selector);
      }

      logger.info(`Set checkbox ${field.fieldLabel} to ${shouldCheck}`);
      return true;
    } catch (error) {
      logger.error(`Failed to fill checkbox ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
