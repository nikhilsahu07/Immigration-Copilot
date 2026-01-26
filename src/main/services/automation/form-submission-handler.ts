/**
 * Form Submission Handler
 * 
 * Handles form approval and submission, including clicking submit buttons
 * and waiting for navigation after form submission.
 */

import { Page } from 'playwright-core';
import { PageManager } from '../../automation/page-manager';
import { browserConnector } from '../../automation/browser-connector';
import { automationJobRepository, portalRepository } from '../../database/repositories';
import { logger, automationNavigationLogger, automationLoopLogger } from '../../core/logger';
import { EventEmitter } from '../../automation/core/event-emitter';
import { getConfig } from './automation.config';
import { FormMapping, AutomationJob } from '../../../shared/types';

export interface SubmissionResult {
  success: boolean;
  newUrl?: string;
  duration: number;
  error?: string;
}

export class FormSubmissionHandler {
  constructor(
    private getCurrentJob: () => AutomationJob | null,
    private getCurrentMapping: () => FormMapping | null,
    private setCurrentMapping: (mapping: FormMapping | null) => void
  ) {}

  /**
   * Called when user clicks "Approve/Proceed" - clicks submit button
   */
  async approveMapping(_mapping: FormMapping): Promise<void> {
    const currentJob = this.getCurrentJob();
    if (!currentJob) return;

    const jobId = currentJob._id;
    EventEmitter.emitStatus('Submitting form...', 90);

    try {
      // Fetch fresh data
      const portal = await portalRepository.findById(currentJob.portalId, currentJob.companyId);

      const portalDomain = new URL(portal?.url || 'http://localhost').hostname;
      const page = await browserConnector.getPageByUrl(portalDomain);
      const pageManager = new PageManager(page);
      const currentUrl = page.url();

      automationNavigationLogger.info('=== FORM SUBMISSION NAVIGATION START ===', {
        jobId,
        currentUrl,
        timestamp: new Date().toISOString()
      });

      // Click submit button using robust method
      const submitStartTime = Date.now();
      const clicked = await pageManager.clickSubmitButton();
      const submitDuration = Date.now() - submitStartTime;

      if (!clicked) {
        EventEmitter.emitStatus('Could not find submit button', 90);
        logger.warn('No submit button found on page');
        automationNavigationLogger.error('Submit button not found', {
          jobId,
          currentUrl,
          duration: submitDuration
        });
        return;
      }

      automationNavigationLogger.info('Submit button clicked successfully', {
        jobId,
        currentUrl,
        clickDuration: submitDuration
      });

      EventEmitter.emitStatus('Waiting for navigation...', 95);

      // Wait for form submission navigation
      await this.waitForFormSubmission(page, jobId, currentUrl, submitStartTime);

    } catch (error) {
      logger.error('Execution failed:', error);
      EventEmitter.emitStatus('Execution failed', 0);
    }
  }

  /**
   * Wait for form submission navigation to complete
   */
  private async waitForFormSubmission(
    page: Page,
    jobId: string,
    previousUrl: string,
    submitStartTime: number
  ): Promise<void> {
    const currentJob = this.getCurrentJob();
    const config = getConfig();

    try {
      automationNavigationLogger.info('Waiting for form submission navigation', {
        jobId,
        currentUrl: previousUrl,
        waitStrategy: 'domcontentloaded',
        timeout: config.navigation.formSubmitTimeout
      });

      const waitStartTime = Date.now();
      await page.waitForLoadState('domcontentloaded', { 
        timeout: config.navigation.formSubmitTimeout 
      });
      const waitDuration = Date.now() - waitStartTime;

      automationNavigationLogger.info('Page load state reached after form submission', {
        jobId,
        waitDuration,
        loadState: 'domcontentloaded'
      });

      // Additional small delay to ensure DOM is fully rendered
      await page.waitForTimeout(config.navigation.postNavigationDelay);

      // Get the new URL after form submission navigation
      const newUrl = page.url();
      const urlChanged = newUrl !== previousUrl;

      automationNavigationLogger.info('Form submission navigation completed', {
        jobId,
        previousUrl,
        newUrl,
        urlChanged,
        totalNavigationDuration: Date.now() - submitStartTime
      });

      logger.info(`Form submission navigation completed. New URL: ${newUrl}`);

      // CRITICAL: Update job URL and clear checkpoint so next iteration processes the NEW page
      if (currentJob?._id) {
        await automationJobRepository.updateCurrentUrl(currentJob._id, newUrl);
        await automationJobRepository.clearCheckpoint(currentJob._id);
        automationLoopLogger.info(`Form submission complete. Cleared checkpoint for job ${currentJob._id}. New URL: ${newUrl}`);

        automationNavigationLogger.info('Job state updated after form submission', {
          jobId: currentJob._id,
          newUrl,
          checkpointCleared: true
        });
      }

      automationNavigationLogger.info('=== FORM SUBMISSION NAVIGATION COMPLETE ===', {
        jobId,
        success: true,
        totalDuration: Date.now() - submitStartTime
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn('Nav timeout, checking if URL changed');
      automationNavigationLogger.warn('Form submission navigation wait timeout', {
        jobId,
        currentUrl: previousUrl,
        error: errorMessage,
        note: 'Page might be SPA or URL might have changed'
      });
    }
  }

  /**
   * Execute a specific action by index from the current mapping
   */
  async executeAction(actionIndex: number): Promise<void> {
    const currentMapping = this.getCurrentMapping();
    const currentJob = this.getCurrentJob();

    if (!currentMapping || !currentMapping.actions) {
      throw new Error('No actions available');
    }

    const action = currentMapping.actions[actionIndex];
    if (!action) {
      throw new Error(`Action at index ${actionIndex} not found`);
    }

    logger.info(`Executing action: ${action.expectedText || action.description}`);
    EventEmitter.emitStatus(`Executing: ${action.expectedText || action.description}`, 70);

    try {
      if (!currentJob) {
        throw new Error('No current job');
      }
      const portal = await portalRepository.findById(currentJob.portalId, currentJob.companyId);
      if (!portal) {
        throw new Error('Portal not found');
      }
      const portalDomain = new URL(portal.url).hostname;
      const page = await browserConnector.getPageByUrl(portalDomain);
      const pageManager = new PageManager(page);

      // Execute the action using pageManager
      await pageManager.executeActions([action]);

      EventEmitter.emitStatus('Action executed, processing next page...', 80);

      // Continue to next page will be handled by the main runJobLoop.
      this.setCurrentMapping(null);
    } catch (error) {
      logger.error('Failed to execute action:', error);
      EventEmitter.emitStatus('Action failed', 0);
      throw error;
    }
  }
}
