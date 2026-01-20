import { Page } from 'playwright-core';
import { logger } from '../../core/logger';

/**
 * Form submission handler with multiple submit button detection strategies
 */
export class FormSubmitHandler {
  constructor(private page: Page) {}

  /**
   * Find and click the submit/next button in the form
   * Tries multiple strategies to locate the submit button
   */
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
