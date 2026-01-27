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
        // Use attribute selector for IDs with special characters to avoid CSS parsing errors
        const id = el.id;
        const selector = id 
          ? (/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~ ]/.test(id)
              ? `[id="${id.replace(/"/g, '\\"')}"]`
              : `#${id}`)
          : `[name="${(otpInput as HTMLInputElement).name}"]`;
        return { detected: true, selector };
      }
      return { detected: false };
    });
  }
}
