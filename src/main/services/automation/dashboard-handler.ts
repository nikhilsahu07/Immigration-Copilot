/**
 * Dashboard Handler
 * 
 * Handles dashboard/navigation pages - executes click actions to navigate
 * through the portal workflow.
 */

import { Page } from 'playwright-core';
import { PageManager } from '../../automation/page-manager';
import { automationJobRepository } from '../../database/repositories';
import { logger, automationNavigationLogger, automationLoopLogger } from '../../core/logger';
import { EventEmitter } from '../../automation/core/event-emitter';
import { getConfig } from './automation.config';

export interface DashboardAction {
  type: string;
  selector: string;
  expectedText: string;
  description: string;
  fieldId?: string;
  intent?: string;
}

export interface DashboardResult {
  success: boolean;
  navigated: boolean;
  newUrl?: string;
  duration: number;
}

export class DashboardHandler {
  constructor(
    private page: Page,
    private getCurrentJobId: () => string | undefined
  ) {}

  /**
   * Process a dashboard page by executing the primary navigation action
   * Returns true if navigation was successful, false otherwise
   */
  async processDashboardPage(
    pageManager: PageManager,
    aiResult: any
  ): Promise<boolean> {
    EventEmitter.emitStatus('Dashboard detected - executing navigation...', 60);

    const currentUrl = this.page.url();
    const jobId = this.getCurrentJobId() || 'unknown';

    automationNavigationLogger.info('=== DASHBOARD NAVIGATION START ===', {
      jobId,
      currentUrl,
      pageType: aiResult.pageType,
      timestamp: new Date().toISOString()
    });

    const actions = aiResult.actions || [];
    if (actions.length === 0) {
      logger.warn('No actions found for dashboard page');
      EventEmitter.emitStatus('No navigation actions found', 50);
      automationNavigationLogger.warn('No navigation actions found for dashboard page', {
        jobId,
        currentUrl,
        pageType: aiResult.pageType
      });
      return false;
    }

    // SAFETY: Only take the first action (primary action)
    if (actions.length > 1) {
      logger.warn(`Gemini returned ${actions.length} actions, but only executing the first one`, {
        allActions: actions.map((a: any) => a.expectedText)
      });
      automationNavigationLogger.warn('Multiple actions detected, using first action only', {
        jobId,
        totalActions: actions.length,
        allActions: actions.map((a: any) => ({
          intent: a.intent,
          expectedText: a.expectedText,
          selector: a.selector || a.selectorHint
        }))
      });
    }
    const primaryAction = actions[0];

    // Map Gemini's action - use fieldId if available, otherwise use expectedText for semantic discovery
    const mappedAction: DashboardAction = {
      type: primaryAction.type || 'click',
      selector: primaryAction.selectorHint || primaryAction.selector || '', // Fallback only
      expectedText: primaryAction.expectedText || primaryAction.description || '',
      description: primaryAction.description || primaryAction.expectedText || '',
      fieldId: primaryAction.fieldId, // For semantic discovery
      intent: primaryAction.intent,
    };

    automationNavigationLogger.info('Preparing to execute dashboard navigation action', {
      jobId,
      currentUrl,
      action: {
        intent: primaryAction.intent,
        type: mappedAction.type,
        expectedText: mappedAction.expectedText,
        selector: mappedAction.selector,
        description: mappedAction.description
      }
    });

    logger.info('Executing dashboard action', {
      intent: primaryAction.intent,
      expectedText: primaryAction.expectedText,
      selector: mappedAction.selector
    });

    // Execute action (singular)
    const actionStartTime = Date.now();
    const success = await pageManager.executeActions([mappedAction]);
    const actionDuration = Date.now() - actionStartTime;

    if (success) {
      automationNavigationLogger.info('Navigation action executed successfully', {
        jobId,
        actionDuration,
        action: {
          intent: primaryAction.intent,
          expectedText: mappedAction.expectedText,
          selector: mappedAction.selector
        }
      });

      EventEmitter.emitStatus('Navigation executed, waiting for new page...', 80);

      // Wait for page navigation
      await this.waitForNavigation(jobId, currentUrl, actionStartTime);

      automationNavigationLogger.info('=== DASHBOARD NAVIGATION COMPLETE ===', {
        jobId,
        success: true,
        totalDuration: Date.now() - actionStartTime
      });

      return true;
    } else {
      EventEmitter.emitStatus('Navigation action failed', 50);
      logger.error('Failed to execute dashboard actions');
      automationNavigationLogger.error('=== DASHBOARD NAVIGATION FAILED ===', {
        jobId,
        currentUrl,
        action: {
          intent: primaryAction.intent,
          expectedText: mappedAction.expectedText,
          selector: mappedAction.selector
        },
        duration: actionDuration,
        reason: 'Action execution returned false'
      });
      return false;
    }
  }

  /**
   * Wait for page navigation to complete after an action
   */
  private async waitForNavigation(
    jobId: string,
    previousUrl: string,
    actionStartTime: number
  ): Promise<void> {
    const config = getConfig();

    try {
      logger.info('Waiting for page navigation and load to complete...');

      automationNavigationLogger.info('Waiting for page navigation to complete', {
        jobId,
        currentUrl: previousUrl,
        waitStrategy: 'domcontentloaded',
        timeout: config.navigation.waitAfterClick
      });

      // Wait for navigation to complete
      const waitStartTime = Date.now();
      await this.page.waitForLoadState('domcontentloaded', { 
        timeout: config.navigation.waitAfterClick 
      });
      const waitDuration = Date.now() - waitStartTime;

      automationNavigationLogger.info('Page load state reached', {
        jobId,
        waitDuration,
        loadState: 'domcontentloaded'
      });

      // Additional small delay to ensure DOM is fully rendered
      await this.page.waitForTimeout(config.navigation.postNavigationDelay);

      // Get the new URL after navigation
      const newUrl = this.page.url();
      const urlChanged = newUrl !== previousUrl;

      automationNavigationLogger.info('Navigation completed', {
        jobId,
        previousUrl,
        newUrl,
        urlChanged,
        navigationDuration: Date.now() - actionStartTime
      });

      logger.info(`Page loaded successfully. New URL: ${newUrl}`);

      // CRITICAL: Update job URL and clear checkpoint so next iteration processes the NEW page
      const currentJobId = this.getCurrentJobId();
      if (currentJobId) {
        await automationJobRepository.updateCurrentUrl(currentJobId, newUrl);
        await automationJobRepository.clearCheckpoint(currentJobId);
        automationLoopLogger.info(`Dashboard navigation complete. Cleared checkpoint for job ${currentJobId}. New URL: ${newUrl}`);

        automationNavigationLogger.info('Job state updated after navigation', {
          jobId: currentJobId,
          newUrl,
          checkpointCleared: true
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn('Navigation wait timeout (page might not have navigated)', err);
      automationNavigationLogger.warn('Navigation wait timeout', {
        jobId,
        currentUrl: previousUrl,
        error: errorMessage,
        note: 'Page might be SPA without full reload'
      });
      // Still proceed - might be SPA without full reload
    }
  }
}
