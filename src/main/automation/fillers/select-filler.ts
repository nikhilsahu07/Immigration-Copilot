
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class SelectFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);

      // Try standard selectOption
      try {
        await this.page.selectOption(field.selector, { value: String(field.value) });
      } catch (e) {
        // Fallback: try selecting by label if value fails
        try {
            await this.page.selectOption(field.selector, { label: String(field.value) });
        } catch (e2) {
             // Fallback: JS force set
            logger.warn(`Standard select failed for ${field.selector}, trying JS fallback`);
            await this.page.evaluate(({selector, value}) => {
                const el = document.querySelector(selector) as HTMLSelectElement;
                if (el) {
                    el.value = value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, { selector: field.selector, value: String(field.value) });
        }
      }

      logger.info(`Selected option ${field.value} for ${field.fieldLabel}`);
      return true;
    } catch (error) {
      logger.error(`Failed to fill select field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
