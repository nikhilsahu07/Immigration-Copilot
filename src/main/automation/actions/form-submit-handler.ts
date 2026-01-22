import { Page } from 'playwright-core';
import { logger, automationNavigationLogger } from '../../core/logger';

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
    const currentUrl = this.page.url();
    const startTime = Date.now();

    automationNavigationLogger.info('FormSubmitHandler: Starting submit button search', {
      currentUrl,
      timestamp: new Date().toISOString()
    });

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
      
      automationNavigationLogger.info('Trying selector-based strategies', {
        currentUrl,
        selectorCount: submitSelectors.length,
        selectors: submitSelectors
      });

      // First try standard selectors
      for (const selector of submitSelectors) {
        try {
          const btn = await this.page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.scrollIntoViewIfNeeded();
            const clickStartTime = Date.now();
            await btn.click();
            const clickDuration = Date.now() - clickStartTime;
            
            logger.info(`Clicked submit button: ${selector}`);
            automationNavigationLogger.info('Submit button clicked via selector', {
              currentUrl,
              strategy: 'selector',
              selector,
              clickDuration,
              totalDuration: Date.now() - startTime
            });
            return true;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          automationNavigationLogger.debug('Selector strategy failed', {
            currentUrl,
            selector,
            error: errorMessage
          });
          continue;
        }
      }
      
      automationNavigationLogger.info('Selector strategies failed, trying text-based strategies', {
        currentUrl,
        textMatches
      });

      // Try text-based matching
      for (const text of textMatches) {
        try {
          const btn = this.page.getByRole('button', { name: text });
          if (await btn.count() > 0 && await btn.first().isVisible()) {
            const clickStartTime = Date.now();
            await btn.first().click();
            const clickDuration = Date.now() - clickStartTime;
            
            logger.info(`Clicked button by text: ${text}`);
            automationNavigationLogger.info('Submit button clicked via text match', {
              currentUrl,
              strategy: 'text-match',
              text,
              clickDuration,
              totalDuration: Date.now() - startTime
            });
            return true;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          automationNavigationLogger.debug('Text match strategy failed', {
            currentUrl,
            text,
            error: errorMessage
          });
          continue;
        }
      }
      
      automationNavigationLogger.info('Text-based strategies failed, trying fallback', {
        currentUrl
      });

      // Last resort: find any button in form
      try {
        const formButton = await this.page.$('form button');
        if (formButton && await formButton.isVisible()) {
          const clickStartTime = Date.now();
          await formButton.click();
          const clickDuration = Date.now() - clickStartTime;
          
          logger.info('Clicked first form button');
          automationNavigationLogger.info('Submit button clicked via fallback', {
            currentUrl,
            strategy: 'fallback',
            selector: 'form button',
            clickDuration,
            totalDuration: Date.now() - startTime
          });
          return true;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        automationNavigationLogger.debug('Fallback strategy failed', {
          currentUrl,
          error: errorMessage
        });
        // Ignore
      }
      
      logger.warn('No submit button found');
      automationNavigationLogger.warn('All submit button strategies failed', {
        currentUrl,
        strategiesTried: {
          selectors: submitSelectors.length,
          textMatches: textMatches.length,
          fallback: true
        },
        totalDuration: Date.now() - startTime
      });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to click submit button:', error);
      automationNavigationLogger.error('Submit button click failed with exception', {
        currentUrl,
        error: errorMessage,
        totalDuration: Date.now() - startTime
      });
      return false;
    }
  }
}
