import { Page } from 'playwright-core';

/**
 * CAPTCHA detection utilities
 * Detects reCAPTCHA, hCaptcha, and Cloudflare Turnstile
 */
export class CaptchaDetector {
  constructor(private page: Page) {}

  /**
   * Checks if a CAPTCHA element is relevant (visible and inside a form)
   */
  private async isRelevantCaptcha(selector: string): Promise<boolean> {
    return await this.page.evaluate((sel) => {
      const elements = document.querySelectorAll(sel);
      for (const el of Array.from(elements)) {
        // 1. Must be inside a form
        if (!el.closest('form')) continue;

        // 2. Must be visible
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        if (el.getBoundingClientRect().height === 0) continue;

        // 3. Must not be explicitly "invisible" type (reCAPTCHA v2 invisible)
        if (el.getAttribute('data-size') === 'invisible') continue;
        
        return true;
      }
      return false;
    }, selector);
  }

  /**
   * Detect if page contains a CAPTCHA
   */
  async detect(): Promise<{ detected: boolean; type?: string }> {
    // Check reCAPTCHA
    if (await this.isRelevantCaptcha('iframe[src*="google.com/recaptcha"]') ||
        await this.isRelevantCaptcha('.g-recaptcha, #g-recaptcha')) {
      return { detected: true, type: 'recaptcha' };
    }

    // Check hCaptcha
    if (await this.isRelevantCaptcha('iframe[src*="hcaptcha.com"]') ||
        await this.isRelevantCaptcha('.h-captcha')) {
      return { detected: true, type: 'hcaptcha' };
    }

    // Check Cloudflare Turnstile
    if (await this.isRelevantCaptcha('.cf-turnstile')) {
      return { detected: true, type: 'turnstile' };
    }

    return { detected: false };
  }
}
