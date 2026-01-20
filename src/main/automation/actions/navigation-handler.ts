import { Page } from 'playwright-core';
import { ClickHandler } from './click-handler';
import { logger } from '../../core/logger';

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
  async executeNavigation(actions: any[]): Promise<boolean> {
    if (actions.length === 0) {
      logger.warn('No navigation actions found for dashboard page');
      return false;
    }

    // Execute actions (clicks, navigations)
    const success = await this.clickHandler.executeActions(actions);
    
    if (success) {
      logger.info('Navigation executed successfully');
      
      // Wait for navigation
      try {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {
        // Timeout is okay, page might not navigate
      }
      
      return true;
    }

    logger.error('Failed to execute dashboard actions');
    return false;
  }
}
