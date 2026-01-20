import { Page } from 'playwright-core';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger, automationPageLogger } from '../../core/logger';

/**
 * Screenshot capture utilities for automation
 * Extracted from PageManager
 */
export class ScreenshotCapture {
  constructor(private page: Page) {}

  /**
   * Capture a screenshot of the current page
   * Returns base64-encoded JPEG and also saves a copy to disk
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

      // Persist screenshot to disk for debugging/audit
      try {
        const baseDir = app.isPackaged ? app.getPath('userData') : process.cwd();
        const screenshotsDir = path.join(baseDir, 'resources', 'screenshots');

        fs.mkdirSync(screenshotsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${timestamp}.jpg`;
        const filePath = path.join(screenshotsDir, filename);

        fs.writeFileSync(filePath, result);
        automationPageLogger.info(`Saved screenshot to ${filePath}`);
      } catch (fileError) {
        logger.warn('Failed to persist screenshot to disk', fileError as Error);
      }

      return result.toString('base64');
    } catch (error) {
      logger.error('Failed to capture screenshot:', error);
      return '';
    }
  }
}
