
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';

export class SelectFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);
      
      const value = String(field.value);

      // 1. Try standard selectOption by value
      try {
        await this.page.selectOption(field.selector, { value }, { timeout: 3000 });
        logger.info(`Selected option by value: ${value} for ${field.fieldLabel}`);
        return true;
      } catch {
        // Value didn't work, try label
      }

      // 2. Try selecting by label (visible text)
      try {
        await this.page.selectOption(field.selector, { label: value }, { timeout: 3000 });
        logger.info(`Selected option by label: ${value} for ${field.fieldLabel}`);
        return true;
      } catch {
        // Label didn't work, try index matching
      }

      // 3. Try partial matching via JavaScript
      try {
        const succeeded = await this.page.evaluate(({selector, searchValue}) => {
          const el = document.querySelector(selector) as HTMLSelectElement;
          if (!el) return false;
          
          // Find option that contains the value (case-insensitive)
          const searchLower = searchValue.toLowerCase();
          const options = Array.from(el.options);
          
          // First try exact match
          let match = options.find(o => o.value === searchValue || o.text.trim() === searchValue);
          
          // Then try contains
          if (!match) {
            match = options.find(o => 
              o.value.toLowerCase().includes(searchLower) || 
              o.text.toLowerCase().includes(searchLower)
            );
          }
          
          // Try numeric match (for things like "500000" matching option with value "500000")
          if (!match && !isNaN(Number(searchValue))) {
            match = options.find(o => o.value === searchValue);
          }
          
          if (match) {
            el.value = match.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          
          return false;
        }, { selector: field.selector, searchValue: value });
        
        if (succeeded) {
          logger.info(`Selected option via JS matching: ${value} for ${field.fieldLabel}`);
          return true;
        }
      } catch {
        // JS fallback failed
      }

      // 4. Last resort: force set value
      try {
        await this.page.evaluate(({selector, value: _value}) => {
          const el = document.querySelector(selector) as HTMLSelectElement;
          if (el && el.options.length > 1) {
            // Select the first non-empty option if value doesn't match
            for (let i = 0; i < el.options.length; i++) {
              if (el.options[i].value && el.options[i].value !== '') {
                el.selectedIndex = i;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }
        }, { selector: field.selector, value });
        logger.warn(`Force-selected first option for ${field.fieldLabel} (value "${value}" not found)`);
        return true;
      } catch {
        // All methods failed
      }

      logger.warn(`Could not select value "${value}" for ${field.fieldLabel}`);
      return false;
    } catch (error) {
      logger.error(`Failed to fill select field ${field.fieldLabel}:`, error);
      return false;
    }
  }
}
