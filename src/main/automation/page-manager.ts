
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

  async fillForm(fields: AutomatedField[]): Promise<void> {
      for (const field of fields) {
          if (!field.value) continue;

          const filler = this.fillers[field.fieldType] || this.fillers['text'];
          const success = await filler.fill(field);
          
          if (!success) {
              logger.warn(`Skipped field ${field.fieldLabel} (${field.selector})`);
          }
          
          // Small delay for realism
          await this.page.waitForTimeout(200);
      }
  }
}
