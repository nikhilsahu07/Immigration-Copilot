import { Page } from 'playwright-core';
import { CaptchaDetector } from './captcha-detector';
import { OtpDetector } from './otp-detector';
import { DetectionResult } from '../types/internal-types';

/**
 * Main detector for special page elements (CAPTCHA, OTP, etc.)
 * Coordinates multiple detection strategies
 */
export class SpecialElementsDetector {
  private captchaDetector: CaptchaDetector;
  private otpDetector: OtpDetector;

  constructor(page: Page) {
    this.captchaDetector = new CaptchaDetector(page);
    this.otpDetector = new OtpDetector(page);
  }

  /**
   * Detect special elements on the page
   */
  async detect(): Promise<DetectionResult> {
    const result: DetectionResult = {
      hasCaptcha: false,
      hasOtp: false,
      reason: '',
      selector: ''
    };

    // Check for CAPTCHA
    const captchaResult = await this.captchaDetector.detect();
    if (captchaResult.detected) {
      result.hasCaptcha = true;
      result.reason = `${captchaResult.type || 'CAPTCHA'} found inside form`;
      return result;
    }

    // Check for OTP
    const otpResult = await this.otpDetector.detect();
    if (otpResult.detected) {
      result.hasOtp = true;
      result.selector = otpResult.selector || '';
      result.reason = 'OTP input found';
      return result;
    }

    return result;
  }
}
