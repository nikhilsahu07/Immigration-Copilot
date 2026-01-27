/**
 * Page Processor
 * 
 * Orchestrates single-page workflow: field extraction, AI analysis,
 * and routing to appropriate handlers (dashboard or form).
 * Also manages checkpoint saving and resuming.
 */

import { Page } from 'playwright-core';
import { PageManager } from '../../automation/page-manager';
import { browserConnector } from '../../automation/browser-connector';
import { 
  automationJobRepository, 
  documentRepository 
} from '../../database/repositories';
import { 
  logger, 
  rawHtmlContextLogger, 
  automationCheckpointLogger 
} from '../../core/logger';
import { createError } from '../../core/error-handler';
import { ERROR_CODES } from '../../../shared/constants';
import { EventEmitter } from '../../automation/core/event-emitter';
import { ErrorParser } from '../../automation/errors/error-parser';
import { CanonicalFieldsMap } from '../../automation/utils/canonical-fields-map';
import { aiService } from '../ai.service';
import { getConfig } from './automation.config';
import { DashboardHandler } from './dashboard-handler';
import { FormFillingCoordinator } from './form-filling-coordinator';
import { 
  AutomationJob, 
  Client, 
  Extraction, 
  AutomationCheckpoint,
  WorkflowStep,
  BehaviorField
} from '../../../shared/types';

export type PageIterationResult =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'page_done' }
  | { kind: 'job_completed' }
  | { kind: 'job_failed'; reason?: string };

export interface PageProcessorDependencies {
  getCurrentJob: () => AutomationJob | null;
  setCurrentJob: (job: AutomationJob | null) => void;
  getCanonicalFieldsMap: () => CanonicalFieldsMap;
  isRunning: () => boolean;
  isPaused: () => boolean;
  setCurrentMapping: (mapping: any) => void;
  getCurrentMapping: () => any | null;
  getModeManager: () => { isAutoMode: () => boolean };
}

export class PageProcessor {
  private dashboardHandler: DashboardHandler | null = null;
  private formFillingCoordinator: FormFillingCoordinator | null = null;

  constructor(private deps: PageProcessorDependencies) {}

  /**
   * Single-page workflow - non-recursive processing
   */
  async executeWorkflowForCurrentPage(
    job: AutomationJob,
    client: Client,
    extraction: Extraction,
    portalUrl: string,
    customPrompt?: string
  ): Promise<PageIterationResult> {
    if (!this.deps.isRunning() || this.deps.isPaused()) {
      return { kind: 'page_done' };
    }

    try {
      // CRITICAL: Check if we're already waiting for user approval
      // If a mapping exists, we're waiting for approval - don't process the same page again
      const currentMapping = this.deps.getCurrentMapping();
      if (currentMapping) {
        logger.info('Waiting for user approval - skipping page processing');
        EventEmitter.emitStatus('Waiting for approval...', 70);
        return { kind: 'page_done' };
      }

      EventEmitter.emitStatus('Downloading page structure...', 15);
      EventEmitter.emitPageChanged(job.currentPage || 1, job.totalPages || 10);

      // Get the page from Playwright
      const actualUrl = job.currentUrl || portalUrl || 'http://localhost';
      const portalDomain = new URL(actualUrl).hostname;
      let page: Page;
      try {
        page = await browserConnector.getPageByUrl(portalDomain);
        // Verify page URL matches
        const pageUrl = page.url();
        if (job.currentUrl && pageUrl !== job.currentUrl) {
          logger.info(
            `Page URL changed. Previous: ${job.currentUrl}, Current: ${pageUrl}. Processing new page.`
          );
          await automationJobRepository.updateCurrentUrl(job._id, pageUrl);
          job.currentUrl = pageUrl;
        } else if (job.currentUrl && pageUrl === job.currentUrl) {
          // Same URL - check if we've already processed this page recently
          // This prevents infinite loops when waiting for approval
          logger.debug(`Processing page at URL: ${pageUrl}`);
        }
      } catch {
        logger.warn(`Could not find page for ${portalDomain}, waiting...`);
        EventEmitter.emitStatus('Waiting for page load...', 15);
        return { kind: 'retry', delayMs: 100 };
      }

      const pageManager = new PageManager(page);
      const currentUrl = page.url();

      // Wait for page to be fully loaded
      await this.waitForPageLoad(page);

      // Update job URL
      const currentJob = this.deps.getCurrentJob();
      if (currentJob) {
        currentJob.currentUrl = currentUrl;
        automationJobRepository.updateCurrentUrl(currentJob._id, currentUrl).catch(e => {
          logger.warn('Failed to update currentUrl', e);
        });
      }

      // 1. Extract structured form fields
      EventEmitter.emitStatus('Extracting form structure...', 18);
      const canonicalFields = await pageManager.extractCanonicalFields();
      EventEmitter.emitStatus('Form structure extracted', 20);

      // Initialize canonical fields map
      const canonicalFieldsMap = this.deps.getCanonicalFieldsMap();
      canonicalFieldsMap.initialize(canonicalFields);

      await this.saveCheckpoint('fields_extracted', {
        currentUrl,
        canonicalFields,
      });

      // 2. Log raw HTML for debugging
      this.logRawHtml(pageManager, currentUrl);

      // 3. Capture screenshot if enabled
      let screenshotBase64: string | undefined;
      if (job.attachScreenshots) {
        EventEmitter.emitStatus('Capturing screenshot...', 25);
        screenshotBase64 = await pageManager.captureScreenshot();
        await this.saveCheckpoint('screenshot_captured', {
          currentUrl,
          canonicalFields,
          screenshotBase64,
        });
      }

      // 4. Fetch documents for context
      const documents = await documentRepository.findByClient(client._id, job.companyId || '');
      const documentList = documents.map(d => ({
        name: d.originalName,
        category: d.documentType,
        s3Key: d.s3Key,
      }));
      const documentLookup = new Map(documents.map(d => [d.originalName, d.s3Key]));

      // 5. Get API key and model
      const { credentialRepository } = await import('../../database/repositories/credential.repository');
      const activeCredential = await credentialRepository.findActive(job.companyId || '');

      if (!activeCredential) {
        throw createError(ERROR_CODES.VALIDATION_ERROR, 'No active Gemini API key found.');
      }

      const modelName = job.modelName || 'gemini-3-flash-preview';

      // 6. AI Analysis
      EventEmitter.emitStatus('Processing with AI...', 30);
      const aiResult = await aiService.analyzePageAndMapFields(
        canonicalFields,
        extraction.extractedData,
        documentList,
        activeCredential.apiKey,
        modelName,
        customPrompt,
        screenshotBase64
      );
      EventEmitter.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);

      await this.saveCheckpoint('ai_analysis_done', {
        currentUrl,
        canonicalFields,
        screenshotBase64,
        aiResult,
      });

      logger.info(`Page classified as: ${aiResult.pageType} - ${aiResult.pageSummary}`);

      // Route based on page type
      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        return await this.handleDashboardPage(page, pageManager, aiResult);
      } else {
        return await this.handleFormPage(page, pageManager, aiResult, documentLookup);
      }
    } catch (error: any) {
      logger.error('Page processing failed:', error);
      const errorMessage = ErrorParser.parseGeminiError(error);
      EventEmitter.emitError(errorMessage);
      EventEmitter.emitStatus('Error: ' + errorMessage.title, 0);
      return { kind: 'job_failed', reason: errorMessage.message || errorMessage.title };
    }
  }

  /**
   * Resume from checkpoint
   */
  async resumeFromCheckpoint(
    job: AutomationJob,
    client: Client,
    extraction: Extraction,
    portalUrl: string,
    customPrompt: string | undefined,
    checkpoint: AutomationCheckpoint
  ): Promise<PageIterationResult> {
    automationCheckpointLogger.info(
      `Resuming job ${job._id} from checkpoint step=${checkpoint.step} at URL=${checkpoint.currentUrl}`
    );

    const portalDomain = new URL(checkpoint.currentUrl || portalUrl || 'http://localhost').hostname;
    let page: Page;
    try {
      page = await browserConnector.getPageByUrl(portalDomain);
    } catch {
      logger.warn(`Checkpoint resume: could not find page for ${portalDomain}`);
      EventEmitter.emitStatus('Waiting for page load (checkpoint resume)...', 15);
      return { kind: 'retry', delayMs: 100 };
    }

    const pageManager = new PageManager(page);
    const currentPageUrl = page.url();

    // If URL changed, clear checkpoint and process fresh
    if (checkpoint.currentUrl && currentPageUrl !== checkpoint.currentUrl) {
      automationCheckpointLogger.warn(
        `URL mismatch for job ${job._id}. Clearing checkpoint.`
      );
      if (job._id) {
        await automationJobRepository.updateCurrentUrl(job._id, currentPageUrl);
        await automationJobRepository.clearCheckpoint(job._id);
      }
      return this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);
    }

    // Handle ai_analysis_done checkpoint
    if (checkpoint.step === 'ai_analysis_done' && checkpoint.aiResult) {
      automationCheckpointLogger.info(`Using cached AI result for job ${job._id}`);

      // Initialize canonical fields from checkpoint
      if (checkpoint.canonicalFields) {
        this.deps.getCanonicalFieldsMap().initialize(checkpoint.canonicalFields);
      }

      const documents = await documentRepository.findByClient(client._id, job.companyId || '');
      const documentLookup = new Map(documents.map(d => [d.originalName, d.s3Key]));
      const aiResult = checkpoint.aiResult;

      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        return await this.handleDashboardPage(page, pageManager, aiResult);
      } else {
        return await this.handleFormPage(page, pageManager, aiResult, documentLookup);
      }
    }

    // Fall back to full workflow
    return this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);
  }

  /**
   * Save checkpoint for current job
   */
  async saveCheckpoint(step: WorkflowStep, data: Partial<AutomationCheckpoint>): Promise<void> {
    const currentJob = this.deps.getCurrentJob();
    if (!currentJob?._id) return;

    const checkpoint: AutomationCheckpoint = {
      step,
      currentUrl: data.currentUrl || currentJob.currentUrl || '',
      htmlFields: data.htmlFields,
      canonicalFields: data.canonicalFields,
      screenshotBase64: data.screenshotBase64,
      aiResult: data.aiResult,
      fillResults: data.fillResults,
      currentMapping: data.currentMapping,
      timestamp: new Date(),
    };

    await automationJobRepository.saveCheckpoint(currentJob._id, checkpoint);
    automationCheckpointLogger.info(
      `Checkpoint saved for job ${currentJob._id} at step=${step}`
    );
  }

  // --- Private helpers ---

  private async waitForPageLoad(page: Page): Promise<void> {
    const config = getConfig();
    try {
      logger.info('Waiting for page load...');
      await page.waitForLoadState('domcontentloaded', { 
        timeout: config.pageLoad.domContentLoaded 
      });
      try {
        await page.waitForLoadState('networkidle', { 
          timeout: config.pageLoad.networkIdle 
        });
      } catch {
        logger.debug('networkidle timeout');
      }
      await page.waitForTimeout(config.pageLoad.postLoadDelay);
      logger.info('Page load confirmed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`Page load wait timeout: ${errorMessage}. Proceeding anyway.`);
    }
  }

  private async logRawHtml(pageManager: PageManager, currentUrl: string): Promise<void> {
    try {
      const rawHtml = await pageManager.getRawHtml();
      rawHtmlContextLogger.info(
        `--- RAW HTML CONTEXT ---\n` +
        `TIMESTAMP: ${new Date().toISOString()}\n` +
        `URL: ${currentUrl}\n` +
        `Length: ${rawHtml.length} chars\n\n` +
        `${rawHtml}\n` +
        `------------------------\n`
      );
    } catch {
      // Logging failure should never break automation
    }
  }

  private async handleDashboardPage(
    page: Page,
    pageManager: PageManager,
    aiResult: any
  ): Promise<PageIterationResult> {
    // Lazily initialize dashboard handler
    if (!this.dashboardHandler) {
      this.dashboardHandler = new DashboardHandler(
        page,
        () => this.deps.getCurrentJob()?._id
      );
    }

    const ok = await this.dashboardHandler.processDashboardPage(pageManager, aiResult);
    if (!ok) {
      logger.warn('Dashboard navigation failed');
      return { kind: 'job_failed', reason: 'Dashboard navigation failed' };
    }
    return { kind: 'page_done' };
  }

  private async handleFormPage(
    page: Page,
    pageManager: PageManager,
    aiResult: any,
    documentLookup: Map<string, string>
  ): Promise<PageIterationResult> {
    const canonicalFieldsMap = this.deps.getCanonicalFieldsMap();

    // Initialize form filling coordinator
    if (!this.formFillingCoordinator) {
      this.formFillingCoordinator = new FormFillingCoordinator(page, canonicalFieldsMap);
    }

    const fields: BehaviorField[] = aiResult.fields || [];
    const isAutoMode = this.deps.getModeManager().isAutoMode();

    // Filter eligible fields
    const eligibleFields = FormFillingCoordinator.filterEligibleFields(fields, isAutoMode);

    if (eligibleFields.length > 0) {
      EventEmitter.emitStatus(`Filling ${eligibleFields.length} field(s)...`, 60);
      await this.formFillingCoordinator.fillFieldsSequentially(eligibleFields, documentLookup);
      EventEmitter.emitStatus('Fields filled', 70);
    }

    // Emit mapping for UI review
    const mapping = {
      pageType: aiResult.pageType,
      pageSummary: aiResult.pageSummary,
      isFormPage: aiResult.isFormPage,
      fields: fields,
      actions: aiResult.actions || [],
      captcha: aiResult.captcha,
      otp: aiResult.otp
    };
    this.deps.setCurrentMapping(mapping);
    EventEmitter.emitMapping(mapping);

    // CRITICAL: In auto mode, auto-submit the form
    // Otherwise, return page_done and wait for user approval
    if (isAutoMode && mapping.actions.length > 0) {
      logger.info('Auto mode: Auto-submitting form after filling fields');
      EventEmitter.emitStatus('Auto-submitting form...', 80);
      
      // Import FormSubmissionHandler dynamically to avoid circular dependency
      const { FormSubmissionHandler } = await import('./form-submission-handler');
      const formSubmissionHandler = new FormSubmissionHandler(
        () => this.deps.getCurrentJob(),
        () => this.deps.getCurrentMapping(),
        (mapping) => { this.deps.setCurrentMapping(mapping); }
      );
      
      await formSubmissionHandler.approveMapping(mapping);
      
      // After submission, wait a bit for navigation
      await page.waitForTimeout(1000);
      
      // Check if URL changed (form was submitted)
      const newUrl = page.url();
      const currentJob = this.deps.getCurrentJob();
      if (currentJob && newUrl !== currentJob.currentUrl) {
        logger.info(`Form submitted. URL changed from ${currentJob.currentUrl} to ${newUrl}`);
        await automationJobRepository.updateCurrentUrl(currentJob._id, newUrl);
        await automationJobRepository.clearCheckpoint(currentJob._id);
        this.deps.setCurrentMapping(null); // Clear mapping after submission
        return { kind: 'page_done' }; // Process the new page in next iteration
      }
    }

    // Not in auto mode or no actions - wait for user approval
    logger.info('Form filled. Waiting for user approval before submission.');
    return { kind: 'page_done' };
  }
}
