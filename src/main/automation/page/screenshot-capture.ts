import { Page } from 'playwright-core';
import { logger } from '../../core/logger';

/**
 * Screenshot capture utilities for automation
 * Extracted from PageManager
 */
export class ScreenshotCapture {
  constructor(private page: Page) {}

  /**
   * Capture a screenshot of the current page
   * Returns base64-encoded JPEG
   */
  async capture(): Promise<string> {
    try {
      // Set fixed viewport for consistency and to control token usage
      await this.page.setViewportSize({ width: 1280, height: 800 });
      
      // Capture full page screenshot
      const result = await this.page.screenshot({ 
        type: 'jpeg', 
        quality: 50, 
        fullPage: true, 
        scale: 'css' 
      });
      
      return result.toString('base64');
    } catch (error) {
      logger.error('Failed to capture screenshot:', error);
      return '';
    }
  }
}
