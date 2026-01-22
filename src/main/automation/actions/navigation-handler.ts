import { Page } from 'playwright-core';
import { ClickHandler } from './click-handler';
import { logger, automationNavigationLogger } from '../../core/logger';

/**
 * Navigation handler for dashboard pages
 * Executes dashboard actions and transitions
 */
export class NavigationHandler {
  private clickHandler: ClickHandler;

  constructor(private page: Page) {
    this.clickHandler = new ClickHandler(page);
  }

  /**
   * Execute navigation actions for dashboard pages
   */
  // 
  async executeNavigation(actions: any[]): Promise<boolean> {
    const currentUrl = this.page.url();
    const startTime = Date.now();

    automationNavigationLogger.info('NavigationHandler: Starting navigation execution', {
      currentUrl,
      actionCount: actions.length,
      actions: actions.map((a: any) => ({
        type: a.type,
        selector: a.selector,
        expectedText: a.expectedText,
        description: a.description
      }))
    });

    if (actions.length === 0) {
      logger.warn('No navigation actions found for dashboard page');
      automationNavigationLogger.warn('No navigation actions provided', {
        currentUrl
      });
      return false;
    }

    // Execute actions (clicks, navigations)
    const actionStartTime = Date.now();
    const success = await this.clickHandler.executeActions(actions);
    const actionDuration = Date.now() - actionStartTime;
    
    if (success) {
      logger.info('Navigation executed successfully');
      automationNavigationLogger.info('Navigation actions executed successfully', {
        currentUrl,
        actionDuration,
        actionCount: actions.length
      });
      
      // Wait for navigation
      try {
        automationNavigationLogger.info('Waiting for page load state after navigation', {
          currentUrl,
          waitStrategy: 'domcontentloaded',
          timeout: 5000
        });

        const waitStartTime = Date.now();
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        const waitDuration = Date.now() - waitStartTime;
        const newUrl = this.page.url();
        const urlChanged = newUrl !== currentUrl;

        automationNavigationLogger.info('Page load state reached', {
          previousUrl: currentUrl,
          newUrl,
          urlChanged,
          waitDuration,
          totalDuration: Date.now() - startTime
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        automationNavigationLogger.warn('Navigation wait timeout (expected for SPAs)', {
          currentUrl,
          error: errorMessage,
          note: 'Timeout is okay, page might not navigate'
        });
        // Timeout is okay, page might not navigate
      }
      
      return true;
    }

    logger.error('Failed to execute dashboard actions');
    automationNavigationLogger.error('Navigation actions execution failed', {
      currentUrl,
      actionDuration,
      actionCount: actions.length,
      totalDuration: Date.now() - startTime
    });
    return false;
  }
}
