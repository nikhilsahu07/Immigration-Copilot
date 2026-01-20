import { Page } from 'playwright-core';

/**
 * OTP (One-Time Password) field detection
 */
export class OtpDetector {
  constructor(private page: Page) {}

  /**
   * Detect if page contains an OTP input field
   */
  async detect(): Promise<{ detected: boolean; selector?: string }> {
    return await this.page.evaluate(() => {
      const otpInput = document.querySelector('input[name*="otp"], input[id*="otp"], input[placeholder*="otp"]');
      if (otpInput) {
        const el = otpInput as HTMLElement;
        const selector = el.id ? `#${el.id}` : `[name="${(otpInput as HTMLInputElement).name}"]`;
        return { detected: true, selector };
      }
      return { detected: false };
    });
  }
}
