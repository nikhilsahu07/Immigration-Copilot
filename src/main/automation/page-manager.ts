
import { Page } from 'playwright-core';
import { logger } from '../core/logger';
import { cleanHtml } from '../utils/html-cleaner';
import { BaseFiller, AutomatedField } from './fillers/base-filler';
import { TextFiller } from './fillers/text-filler';
import { SelectFiller } from './fillers/select-filler';
import { RadioFiller } from './fillers/radio-filler';
import { CheckboxFiller } from './fillers/checkbox-filler';
import { FileUploadFiller } from './fillers/file-upload-filler';
import { DateFiller } from './fillers/date-filler';

export interface DetectionResult {
    hasCaptcha: boolean;
    hasOtp: boolean;
    reason?: string;
    selector?: string;
}

export class PageManager {
  private fillers: Record<string, BaseFiller> = {};

  constructor(private page: Page) {
      this.initializeFillers();
  }

  private initializeFillers() {
      this.fillers['text'] = new TextFiller(this.page);
      this.fillers['email'] = new TextFiller(this.page);
      this.fillers['tel'] = new TextFiller(this.page);
      this.fillers['number'] = new TextFiller(this.page);
      this.fillers['textarea'] = new TextFiller(this.page);
      
      this.fillers['select'] = new SelectFiller(this.page);
      this.fillers['dropdown'] = new SelectFiller(this.page);
      
      this.fillers['radio'] = new RadioFiller(this.page);
      this.fillers['checkbox'] = new CheckboxFiller(this.page);
      
      this.fillers['date'] = new DateFiller(this.page);
      this.fillers['file'] = new FileUploadFiller(this.page);
      
      // Additional aliases for button-style radios
      this.fillers['button'] = new RadioFiller(this.page);
  }

  async extractHtml(): Promise<string> {
      try {
           const raw = await this.page.content();
           return cleanHtml(raw);
      } catch (e) {
          logger.error('Failed to extract HTML', e);
          throw e;
      }
  }

  async detectSpecialElements(): Promise<DetectionResult> {
      // Ported logic from toyVersion
      return await this.page.evaluate(() => {
        const result = { hasCaptcha: false, hasOtp: false, reason: '', selector: '' };

        // CAPTCHA
        if (
            document.querySelector('iframe[src*="google.com/recaptcha"]') ||
            document.querySelector('.g-recaptcha, #g-recaptcha') ||
            document.querySelector('iframe[src*="hcaptcha.com"]') ||
            document.querySelector('.h-captcha') ||
            document.querySelector('.cf-turnstile')
        ) {
            result.hasCaptcha = true;
            result.reason = 'Standard Captcha found';
            return result;
        }

        // OTP
        const otpInput = document.querySelector('input[name*="otp"], input[id*="otp"], input[placeholder*="otp"]');
        if (otpInput) {
            result.hasOtp = true;
            result.selector = (otpInput as HTMLElement).id ? `#${(otpInput as HTMLElement).id}` : `[name="${(otpInput as HTMLInputElement).name}"]`;
            result.reason = 'OTP input found';
            return result;
        }
        
        return result;
      });
  }

  // Detect field type from selector by querying the actual DOM element
  private async detectFieldType(selector: string, providedType: string): Promise<string> {
    // If selector contains 'select', it's definitely a select
    if (selector.toLowerCase().includes('select[') || selector.toLowerCase().includes('select#')) {
      return 'select';
    }
    
    // If selector contains 'input[type="radio"]' or similar
    if (selector.includes('type="radio"') || selector.includes("type='radio'")) {
      return 'radio';
    }
    
    if (selector.includes('type="checkbox"') || selector.includes("type='checkbox'")) {
      return 'checkbox';
    }
    
    // Try to detect from DOM
    try {
      const elementType = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'select') return 'select';
        if (tagName === 'textarea') return 'textarea';
        if (tagName === 'button') return 'button';
        
        if (tagName === 'input') {
          const type = (el as HTMLInputElement).type.toLowerCase();
          if (type === 'radio') return 'radio';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'date') return 'date';
          if (type === 'file') return 'file';
          if (type === 'email') return 'email';
          if (type === 'tel') return 'tel';
          if (type === 'number') return 'number';
          return 'text';
        }
        
        return null;
      }, selector);
      
      if (elementType) {
        return elementType;
      }
    } catch {
      // Ignore detection errors
    }
    
    return providedType || 'text';
  }

  async fillForm(fields: AutomatedField[]): Promise<void> {
      for (const field of fields) {
          if (!field.value) continue;

          // Detect correct field type from DOM if needed
          const actualFieldType = await this.detectFieldType(field.selector, field.fieldType);
          
          if (actualFieldType !== field.fieldType) {
            logger.info(`Detected field type ${actualFieldType} for ${field.fieldLabel} (was: ${field.fieldType})`);
          }

          const filler = this.fillers[actualFieldType] || this.fillers['text'];
          const success = await filler.fill({ ...field, fieldType: actualFieldType });
          
          if (!success) {
              logger.warn(`Skipped field ${field.fieldLabel} (${field.selector})`);
          }
          
          // Small delay for realism
          await this.page.waitForTimeout(200);
      }
  }

  // Find and click the submit/next button in the form
  async clickSubmitButton(): Promise<boolean> {
    try {
      // Try multiple strategies to find submit button
      const submitSelectors = [
        'form button[type="submit"]',
        'form input[type="submit"]',
        'form button:not([type="button"])',
        'button[type="submit"]',
        'input[type="submit"]',
        '.submit-btn',
        '.btn-submit',
        '[class*="submit"]',
      ];
      
      // Try text-based matching with Playwright's getByRole/getByText
      const textMatches = ['Submit', 'Next', 'Continue', 'Proceed', 'Go', 'Get Quote', 'View Plans'];
      
      // First try standard selectors
      for (const selector of submitSelectors) {
        try {
          const btn = await this.page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.scrollIntoViewIfNeeded();
            await btn.click();
            logger.info(`Clicked submit button: ${selector}`);
            return true;
          }
        } catch {
          continue;
        }
      }
      
      // Try text-based matching
      for (const text of textMatches) {
        try {
          const btn = this.page.getByRole('button', { name: text });
          if (await btn.count() > 0 && await btn.first().isVisible()) {
            await btn.first().click();
            logger.info(`Clicked button by text: ${text}`);
            return true;
          }
        } catch {
          continue;
        }
      }
      
      // Last resort: find any button in form
      try {
        const formButton = await this.page.$('form button');
        if (formButton && await formButton.isVisible()) {
          await formButton.click();
          logger.info('Clicked first form button');
          return true;
        }
      } catch {
        // Ignore
      }
      
      logger.warn('No submit button found');
      return false;
    } catch (error) {
      logger.error('Failed to click submit button:', error);
      return false;
    }
  }
}
