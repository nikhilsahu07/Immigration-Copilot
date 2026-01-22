
import { 
  AutomationJob, 
  AutomationCheckpoint,
  CreateJobInput, 
  FormMapping,
  AutomationState,
  Client,
  Extraction,
  PauseReason,
  BehaviorField,
  WorkflowStep
} from '../../shared/types';
import { 
  automationJobRepository, 
  clientRepository, 
  portalRepository, 
  extractionRepository,
  documentRepository,
  chatRepository
} from '../database/repositories';
import { logger, rawHtmlContextLogger, automationBatchLogger, fieldFillLogger, automationLoopLogger, automationCheckpointLogger, automationNavigationLogger } from '../core/logger';
import { createError } from '../core/error-handler';
import { ERROR_CODES } from '../../shared/constants';

// ESM imports - replacing inline require() calls
import { getBrowserViewManager } from '../index';
import { browserConnector } from '../automation/browser-connector';
import { PageManager } from '../automation/page-manager';
import { aiService } from './ai.service';

// Import new refactored modules
import { EventEmitter } from '../automation/core/event-emitter';
import { ModeManager } from '../automation/core/mode-manager';
import { ErrorParser } from '../automation/errors/error-parser';
import { BehaviorFillerFactory } from '../automation/fillers/behavior-filler-factory';
import { ConcurrencyPool } from '../automation/utils/concurrency-pool';

type PageIterationResult =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'page_done' }
  | { kind: 'job_completed' }
  | { kind: 'job_failed'; reason?: string };

export class AutomationService {
  private currentJob: AutomationJob | null = null;
  private currentMapping: FormMapping | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private modeManager: ModeManager = new ModeManager();

  async start(
    companyId: string, 
    agentId: string, 
    input: CreateJobInput
  ): Promise<AutomationJob> {
    logger.info(`Starting automation for client ${input.clientId}`);

    // 1. Verify resources exist
    const [client, portal, extraction] = await Promise.all([
      clientRepository.findById(input.clientId, companyId),
      portalRepository.findById(input.portalId, companyId),
      extractionRepository.findById(input.extractionId, companyId),
    ]);

    if (!client) throw createError(ERROR_CODES.CLIENT_NOT_FOUND);
    if (!portal) throw createError(ERROR_CODES.PORTAL_NOT_FOUND, 'Portal not found');
    if (!extraction) throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);

    // 2. Create Job in DB
    const job = await automationJobRepository.create(companyId, agentId, {
      ...input,
    });

    // 2.5 Save custom prompt to chat history if present
    if (input.customPrompt) {
      try {
        await chatRepository.create(companyId, agentId, {
          clientId: input.clientId,
          content: input.customPrompt,
          role: 'user',
          jobId: job._id.toString()
        });
      } catch (err) {
        logger.error('Failed to save chat message', err);
        // Don't fail automation if chat save fails
      }
    }

    this.currentJob = job;
    this.isRunning = true;
    this.isPaused = false;

    // 3. Initialize Browser View
    EventEmitter.emitStatus('Loading portal...', 5);
    const bvm = getBrowserViewManager();
    if (bvm) {
      await bvm.loadURL(portal.url);
      bvm.show();
    } else {
      throw new Error('BrowserViewManager not available');
    }
    
    // 4. Connect via CDP and start processing
    try {
      EventEmitter.emitStatus('Connecting to browser...', 10);
      await browserConnector.connect();
      // Small delay to ensure Playwright sees the target
      await new Promise(r => setTimeout(r, 100));

      // Mark job as running and start the main job loop (fire-and-forget).
      await automationJobRepository.updateStatus(job._id, 'running');
      automationLoopLogger.info(`Starting automation job loop for job ${job._id}`);
      void this.runJobLoop(job._id);
    } catch (e) {
      logger.error('Failed to connect to browser', e);
      this.stop();
      throw e;
    }

    return job;
  }

  /**
   * Main job loop: single authoritative coordinator for page processing.
   * This replaces recursive processPage() calls and setTimeout recursion.
   */
  private async runJobLoop(jobId: string): Promise<void> {
    this.isRunning = true;
    automationLoopLogger.info(`runJobLoop started for job ${jobId}`);

    try {
      while (this.isRunning) {
        if (this.isPaused) {
          automationLoopLogger.info(`runJobLoop exiting for job ${jobId} because isPaused=true`);
          return;
        }

        const job = await automationJobRepository.findById(jobId);
        if (!job) {
          automationLoopLogger.warn(`Job ${jobId} not found. Exiting loop.`);
          break;
        }

        this.currentJob = job;

        if (job.status === 'completed' || job.status === 'failed') {
          automationLoopLogger.info(`Job ${jobId} has terminal status=${job.status}. Exiting loop.`);
          break;
        }

        // Ensure DB status is running
        if (job.status !== 'running') {
          await automationJobRepository.updateStatus(jobId, 'running');
        }

        // Load current resources on each iteration to keep them fresh
        const [client, portal, extraction] = await Promise.all([
          clientRepository.findById(job.clientId, job.companyId),
          portalRepository.findById(job.portalId, job.companyId),
          extractionRepository.findById(job.extractionId, job.companyId),
        ]);

        if (!client || !portal || !extraction) {
          automationLoopLogger.error(`Missing resources for job ${jobId}. client=${!!client}, portal=${!!portal}, extraction=${!!extraction}`);
          await automationJobRepository.setError(jobId, 'Missing client/portal/extraction resources');
          this.isRunning = false;
          break;
        }

        const portalUrl = job.currentUrl || portal.url;
        const customPrompt = job.customPrompt;
        const checkpoint: AutomationCheckpoint | null = job.checkpoint ?? null;

        let result: PageIterationResult;

        if (checkpoint) {
          automationLoopLogger.info(`Job ${jobId} resuming from checkpoint step=${checkpoint.step}`);
          result = await this.resumeFromCheckpoint(job, client, extraction, portalUrl, customPrompt, checkpoint);
        } else {
          result = await this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);
        }

        if (!this.isRunning) {
          automationLoopLogger.info(`runJobLoop stopped for job ${jobId} because isRunning=false`);
          break;
        }
        if (this.isPaused) {
          automationLoopLogger.info(`runJobLoop exiting for job ${jobId} because isPaused=true after iteration`);
          return;
        }

        if (result.kind === 'retry') {
          automationLoopLogger.info(`Job ${jobId} retrying current page after delayMs=${result.delayMs}`);
          await new Promise(r => setTimeout(r, result.delayMs));
          continue;
        }

        if (result.kind === 'page_done') {
          automationLoopLogger.info(`Job ${jobId} completed one page iteration. Continuing loop.`);
          continue;
        }

        if (result.kind === 'job_completed') {
          automationLoopLogger.info(`Job ${jobId} marked completed by workflow.`);
          await automationJobRepository.updateStatus(jobId, 'completed');
          this.isRunning = false;
          break;
        }

        if (result.kind === 'job_failed') {
          automationLoopLogger.warn(`Job ${jobId} marked failed by workflow. Reason=${result.reason || 'unknown'}`);
          await automationJobRepository.setError(jobId, result.reason || 'Automation failed');
          this.isRunning = false;
          break;
        }
      }
    } catch (error) {
      automationLoopLogger.error(`runJobLoop encountered error for job ${jobId}: ${(error as Error).message}`, {
        stack: (error as Error).stack,
      });
      await automationJobRepository.setError(jobId, (error as Error).message);
      this.isRunning = false;
    } finally {
      automationLoopLogger.info(`runJobLoop finished for job ${jobId}`);
    }
  }

  /**
   * Single-page workflow. This is the non-recursive replacement for processPage().
   * It returns a PageIterationResult consumed by runJobLoop.
   */
  private async executeWorkflowForCurrentPage(
    job: AutomationJob,
    client: Client,
    extraction: Extraction,
    portalUrl: string,
    customPrompt?: string
  ): Promise<PageIterationResult> {
    if (!this.isRunning || this.isPaused) {
      return { kind: 'page_done' };
    }

    try {
      EventEmitter.emitStatus('Downloading page structure...', 15);
      EventEmitter.emitPageChanged(job.currentPage || 1, job.totalPages || 10);

      // Get the page from Playwright
      const portalDomain = new URL(portalUrl || 'http://localhost').hostname;
      let page;
      try {
        page = await browserConnector.getPageByUrl(portalDomain);
      } catch {
        logger.warn(`Could not find page for ${portalDomain}, waiting for page load...`);
        EventEmitter.emitStatus('Waiting for page load...', 15);
        return { kind: 'retry', delayMs: 100 };
      }

      const pageManager = new PageManager(page);

      // Update job with current URL for resume support
      const currentUrl = page.url();
      if (this.currentJob) {
        this.currentJob.currentUrl = currentUrl;
        automationJobRepository.updateCurrentUrl(this.currentJob._id, currentUrl).catch(e => {
          logger.warn('Failed to update currentUrl', e);
        });
      }

      // 1. Extract structured form fields
      EventEmitter.emitStatus('Extracting form structure...', 18);
      const htmlFields = await pageManager.extractFields();
      EventEmitter.emitStatus('Form structure extracted', 20);

      await this.saveCheckpoint('fields_extracted', {
        currentUrl,
        htmlFields,
      });

      // 2. Always log raw HTML/DOM structure for debugging (not sent to Gemini)
      try {
        const cleaned = await pageManager.extractHtml();
        rawHtmlContextLogger.info(
          `--- RAW HTML CONTEXT ---\n` +
            `TIMESTAMP: ${new Date().toISOString()}\n` +
            `URL: ${currentUrl}\n\n` +
            `${cleaned}\n` +
            `------------------------\n`
        );
      } catch {
        // Logging failure should never break automation
      }

      // 3. Capture Screenshot (if enabled)
      let screenshotBase64: string | undefined;
      if (job.attachScreenshots) {
        EventEmitter.emitStatus('Capturing screenshot...', 25);
        screenshotBase64 = await pageManager.captureScreenshot();
        await this.saveCheckpoint('screenshot_captured', {
          currentUrl,
          htmlFields,
          screenshotBase64,
        });
      }

      // 4. Fetch documents for context (include s3Key for file uploads)
      const documents = await documentRepository.findByClient(client._id, job.companyId || '');
      const documentList = documents.map(d => ({ 
        name: d.originalName, 
        category: d.documentType,
        s3Key: d.s3Key,
      }));

      // Create lookup map for resolving document names to S3 keys
      const documentLookup = new Map(documents.map(d => [d.originalName, d.s3Key]));

      // 5. AI Analysis with structured fields
      EventEmitter.emitStatus('Processing with AI...', 30);
      const aiResult = await aiService.analyzePageAndMapFields(
        htmlFields,  // structured fields instead of raw HTML
        extraction.extractedData,
        documentList,
        customPrompt,
        screenshotBase64
      );
      EventEmitter.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);

      await this.saveCheckpoint('ai_analysis_done', {
        currentUrl,
        htmlFields,
        screenshotBase64,
        aiResult,
      });

      logger.info(`Page classified as: ${aiResult.pageType} - ${aiResult.pageSummary}`);

      // Route based on page type
      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        const ok = await this.processDashboardPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt);
        if (!ok) {
          logger.warn('Dashboard navigation failed – stopping job for manual intervention.');
          return { kind: 'job_failed', reason: 'Dashboard navigation failed' };
        }
      } else {
        await this.processFormPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt, documentLookup);
      }

      return { kind: 'page_done' };
    } catch (error: any) {
      logger.error('Page processing failed:', error);

      const errorMessage = ErrorParser.parseGeminiError(error);
      EventEmitter.emitError(errorMessage);
      EventEmitter.emitStatus('Error: ' + errorMessage.title, 0);

      return { kind: 'job_failed', reason: errorMessage.message || errorMessage.title };
    }
  }

  /**
   * Resume the current page processing from a previously saved checkpoint.
   * For now we implement the most valuable resume point: ai_analysis_done.
   */
  private async resumeFromCheckpoint(
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

    // Reconnect to current page
    const portalDomain = new URL(checkpoint.currentUrl || portalUrl || 'http://localhost').hostname;
    let page;
    try {
      page = await browserConnector.getPageByUrl(portalDomain);
    } catch {
      logger.warn(`Checkpoint resume: could not find page for ${portalDomain}, will retry.`);
      EventEmitter.emitStatus('Waiting for page load (checkpoint resume)...', 15);
      return { kind: 'retry', delayMs: 100 };
    }

    const pageManager = new PageManager(page);
    const currentPageUrl = page.url();

    // CRITICAL: If the actual page URL differs from checkpoint URL, the page has changed.
    // Clear checkpoint and process the new page fresh.
    if (checkpoint.currentUrl && currentPageUrl !== checkpoint.currentUrl) {
      automationCheckpointLogger.warn(
        `URL mismatch detected for job ${job._id}. Checkpoint URL: ${checkpoint.currentUrl}, Actual URL: ${currentPageUrl}. Clearing checkpoint to process new page.`
      );
      if (job._id) {
        await automationJobRepository.updateCurrentUrl(job._id, currentPageUrl);
        await automationJobRepository.clearCheckpoint(job._id);
      }
      // Fall back to fresh workflow for the new page
      return this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);
    }

    // For now, only special-case ai_analysis_done. Other steps fall back to full workflow.
    if (checkpoint.step === 'ai_analysis_done' && checkpoint.aiResult) {
      automationCheckpointLogger.info(
        `Using cached AI result for job ${job._id} to avoid re-calling Gemini.`
      );

      // Fetch documents for context (for file uploads) as in fresh run
      const documents = await documentRepository.findByClient(client._id, job.companyId || '');
      const documentLookup = new Map(documents.map(d => [d.originalName, d.s3Key]));

      const aiResult = checkpoint.aiResult;

      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        const ok = await this.processDashboardPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt);
        if (!ok) {
          logger.warn('Dashboard navigation failed during checkpoint resume – stopping job for manual intervention.');
          return { kind: 'job_failed', reason: 'Dashboard navigation failed (resume)' };
        }
      } else {
        await this.processFormPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt, documentLookup);
      }

      return { kind: 'page_done' };
    }

    automationCheckpointLogger.warn(
      `Checkpoint step=${checkpoint.step} not specifically handled, falling back to full workflow for job ${job._id}`
    );

    // Fall back to full workflow (this will also overwrite checkpoint with newer data).
    return this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);
  }

  /**
   * Persist a checkpoint snapshot for the current job (if any).
   */
  private async saveCheckpoint(step: WorkflowStep, data: Partial<AutomationCheckpoint>): Promise<void> {
    if (!this.currentJob?._id) return;

    const checkpoint: AutomationCheckpoint = {
      step,
      currentUrl: data.currentUrl || this.currentJob.currentUrl || '',
      htmlFields: data.htmlFields,
      screenshotBase64: data.screenshotBase64,
      aiResult: data.aiResult,
      fillResults: data.fillResults,
      currentMapping: data.currentMapping,
      timestamp: new Date(),
    };

    await automationJobRepository.saveCheckpoint(this.currentJob._id, checkpoint);
    automationCheckpointLogger.info(
      `Checkpoint saved for job ${this.currentJob._id} at step=${step} url=${checkpoint.currentUrl}`
    );
  }


  // Handle dashboard/navigation pages - execute click actions
  // Returns true if a navigation action was successfully executed, false otherwise.
  private async processDashboardPage(
    pageManager: PageManager,
    aiResult: any,
    _client: Client,
    _extraction: Extraction,
    _portalUrl: string,
    _customPrompt?: string
  ): Promise<boolean> {
    EventEmitter.emitStatus('Dashboard detected - executing navigation...', 60);

    const page = pageManager.getPage();
    const currentUrl = page.url();
    const jobId = this.currentJob?._id || 'unknown';

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

    // Map Gemini's selectorHint to selector for action execution
    const mappedAction = {
      type: primaryAction.type || 'click',
      selector: primaryAction.selectorHint || primaryAction.selector || '',
      expectedText: primaryAction.expectedText || primaryAction.description || '',
      description: primaryAction.description || primaryAction.expectedText || '',
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

      // Proper navigation wait - CRITICAL for dashboard actions
      // Rule: Wait for page to be fully loaded before starting field extraction
      try {
        logger.info('Waiting for page navigation and load to complete...');
        
        automationNavigationLogger.info('Waiting for page navigation to complete', {
          jobId,
          currentUrl,
          waitStrategy: 'domcontentloaded',
          timeout: 10000
        });
        
        // Wait for navigation to complete (either domcontentloaded or networkidle)
        const waitStartTime = Date.now();
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        const waitDuration = Date.now() - waitStartTime;
        
        automationNavigationLogger.info('Page load state reached', {
          jobId,
          waitDuration,
          loadState: 'domcontentloaded'
        });
        
        // Additional small delay to ensure DOM is fully rendered
        await new Promise(r => setTimeout(r, 500));
        
        // Get the new URL after navigation
        const newUrl = page.url();
        const urlChanged = newUrl !== currentUrl;
        
        automationNavigationLogger.info('Navigation completed', {
          jobId,
          previousUrl: currentUrl,
          newUrl,
          urlChanged,
          navigationDuration: Date.now() - actionStartTime
        });
        
        logger.info(`Page loaded successfully. New URL: ${newUrl}`);
        
        // CRITICAL: Update job URL and clear checkpoint so next iteration processes the NEW page
        if (this.currentJob?._id) {
          await automationJobRepository.updateCurrentUrl(this.currentJob._id, newUrl);
          await automationJobRepository.clearCheckpoint(this.currentJob._id);
          automationLoopLogger.info(`Dashboard navigation complete. Cleared checkpoint for job ${this.currentJob._id}. New URL: ${newUrl}`);
          
          automationNavigationLogger.info('Job state updated after navigation', {
            jobId: this.currentJob._id,
            newUrl,
            checkpointCleared: true
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.warn('Navigation wait timeout (page might not have navigated)', err);
        automationNavigationLogger.warn('Navigation wait timeout', {
          jobId,
          currentUrl,
          error: errorMessage,
          note: 'Page might be SPA without full reload'
        });
        // Still proceed - might be SPA without full reload
      }

      automationNavigationLogger.info('=== DASHBOARD NAVIGATION COMPLETE ===', {
        jobId,
        success: true,
        totalDuration: Date.now() - actionStartTime
      });

      // No recursive call here; the main runJobLoop will pick up the next page.
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

  // Handle form pages - fill fields and handle approval
  private async processFormPage(
    pageManager: PageManager,
    aiResult: any,
    _client: Client,
    _extraction: Extraction,
    _portalUrl: string,
    _customPrompt?: string,
    _documentLookup?: Map<string, string>
  ) {
    // Ensure fields is an array
    const allFields = Array.isArray(aiResult.fields) ? aiResult.fields : [];

    // FILTER: Exclude dashboard filters and search fields that aren't part of the actual form
    // Common patterns: fields with intent containing "filter", "search", or status "missing_data" for filters
    const fields = allFields.filter((f: any) => {
      // Exclude if intent suggests it's a filter/search
      if (f.intent && (
        f.intent.includes('filter_') || 
        f.intent.includes('search_') ||
        f.fieldName?.toLowerCase().includes('filter') ||
        f.fieldName?.toLowerCase().includes('search keyword')
      )) {
        logger.info(`Excluding dashboard filter field: ${f.fieldName} (${f.intent})`);
        return false;
      }
      return true;
    });

    if (fields.length === 0) {
      EventEmitter.emitStatus('No form fields detected on this page', 50);
    }

    logger.info(`Processing form with ${fields.length} fields (excluded ${allFields.length - fields.length} filter/search fields)`);

    // Confidence-based filtering and parallel field filling
    const behaviorFields = fields as BehaviorField[];
    const highConfidence = behaviorFields.filter(f => f.confidence === 'high');
    const mediumConfidence = behaviorFields.filter(f => f.confidence === 'medium');
    const lowConfidence = behaviorFields.filter(f => f.confidence === 'low');
    const missingData = behaviorFields.filter(f => f.status === 'missing_data' || f.expectedValue === '__MISSING__');

    logger.info('Field confidence breakdown', {
      total: fields.length,
      high: highConfidence.length,
      medium: mediumConfidence.length,
      low: lowConfidence.length,
      missing: missingData.length
    });

    // Determine eligible fields for parallel filling
    // - Always include high confidence fields with values
    // - Include medium confidence in auto mode only
    // - Exclude low confidence and missing data
    const isAutoMode = this.modeManager.isAutoMode();
    const eligibleFields = [
      ...highConfidence.filter(f => f.expectedValue !== '__MISSING__'),
      ...(isAutoMode ? mediumConfidence.filter(f => f.expectedValue !== '__MISSING__') : [])
    ];

    automationBatchLogger.info('Starting parallel field fill batch', {
      url: pageManager.getPage().url(),
      pageType: 'form',
      totalFields: fields.length,
      eligibleForParallel: eligibleFields.length,
      excluded: {
        lowConfidence: lowConfidence.length,
        missingData: missingData.length,
        mediumInManualMode: !isAutoMode ? mediumConfidence.length : 0
      },
      concurrencyCap: 10,
      mode: isAutoMode ? 'auto' : 'manual'
    });

    // Parallel fill eligible fields with concurrency cap of 10
    if (eligibleFields.length > 0) {
      EventEmitter.emitStatus(`Filling ${eligibleFields.length} field(s) in parallel...`, 60);
      const batchStartTime = Date.now();

      // Build tasks for concurrency pool
      const fillTasks = eligibleFields.map((field, index) => ({
        id: `${field.fieldName}_${index}`,
        execute: async () => {
          const fieldStartTime = Date.now();
          
          // Map BehaviorField to AutomatedField format
          const automatedField = {
            fieldIndex: index,
            fieldName: field.fieldName,
            fieldLabel: field.fieldName,
            fieldType: field.behavior,
            selector: field.selector,
            value: field.expectedValue,
            confidence: field.confidence,
            reasoning: field.reason
          };

          const filler = BehaviorFillerFactory.getFiller(field.behavior, pageManager.getPage(), field.fieldName, field.selector);
          const fillerName = BehaviorFillerFactory.getFillerName(field.behavior);

          fieldFillLogger.info('Starting field fill', {
            fieldName: field.fieldName,
            intent: field.intent,
            behavior: field.behavior,
            filler: fillerName,
            selector: field.selector,
            confidence: field.confidence,
            required: field.constraints?.required || false,
          });

          try {
            const success = await filler.fill(automatedField);
            const duration = Date.now() - fieldStartTime;

            fieldFillLogger.info('Field fill completed', {
              fieldName: field.fieldName,
              success,
              duration,
              required: field.constraints?.required || false,
            });

            return {
              fieldName: field.fieldName,
              intent: field.intent,
              behavior: field.behavior,
              selector: field.selector,
              confidence: field.confidence,
              required: field.constraints?.required || false,
              success,
              duration,
            };
          } catch (error) {
            const duration = Date.now() - fieldStartTime;

            fieldFillLogger.error('Field fill threw error', {
              fieldName: field.fieldName,
              error: error instanceof Error ? error.message : String(error),
              duration,
              required: field.constraints?.required || false,
            });

            return {
              fieldName: field.fieldName,
              intent: field.intent,
              behavior: field.behavior,
              selector: field.selector,
              confidence: field.confidence,
              required: field.constraints?.required || false,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              duration,
            };
          }
        }
      }));

      // Run with concurrency cap of 10
      const results = await ConcurrencyPool.runBatched(fillTasks, 10);
      const batchDuration = Date.now() - batchStartTime;

      automationBatchLogger.info('Parallel batch completed', {
        totalFields: eligibleFields.length,
        succeeded: results.filter(r => r.success && r.result?.success).length,
        failed: results.filter(r => !r.success || !r.result?.success).length,
        duration: batchDuration,
        avgTimePerField: Math.round(batchDuration / eligibleFields.length),
      });

      // Required field error handling
      const requiredFieldFailures = results.filter(
        r => r.result?.required && (!r.success || !r.result?.success)
      );

      if (requiredFieldFailures.length > 0) {
        automationBatchLogger.error('Required field(s) failed to fill', {
          count: requiredFieldFailures.length,
          fields: requiredFieldFailures.map(r => ({
            fieldName: r.result?.fieldName,
            selector: r.result?.selector,
            behavior: r.result?.behavior,
            error: r.error?.message || r.result?.error || 'unknown error'
          }))
        });

        // Emit error for first required field failure
        const firstFailure = requiredFieldFailures[0];
        EventEmitter.emitError({
          title: 'Required Field Failed',
          message: `Could not fill required field: ${firstFailure.result?.fieldName}`,
          type: 'fill_error' as any
        });
      }

      EventEmitter.emitStatus('Parallel fill completed', 70);
    }

    // Handle medium confidence - require review in manual mode
    if (mediumConfidence.length > 0 && !this.modeManager.isAutoMode()) {
      EventEmitter.emitStatus(`${mediumConfidence.length} medium-confidence field(s) need review`, 70);
      EventEmitter.emitManualInputRequired(mediumConfidence.map(f => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldName,
        selector: f.selector,
        reason: `Medium confidence (${f.confidence}): ${f.reason}`
      })));
      this.pause('manual_input');
      return;
    }

    // Handle low confidence - always require review
    if (lowConfidence.length > 0) {
      EventEmitter.emitStatus(`${lowConfidence.length} low-confidence field(s) require input`, 70);
      EventEmitter.emitManualInputRequired(lowConfidence.map(f => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldName,
        selector: f.selector,
        reason: `Low confidence (${f.confidence}): ${f.reason}`
      })));
      this.pause('manual_input');
      return;
    }

    // Handle missing data - always require input
    if (missingData.length > 0) {
      EventEmitter.emitStatus(`${missingData.length} field(s) have missing data`, 70);
      EventEmitter.emitManualInputRequired(missingData.map(f => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldName,
        selector: f.selector,
        reason: 'Missing client data'
      })));
      this.pause('manual_input');
      return;
    }

    EventEmitter.emitStatus('Form filled. Please review.', 80);

    // Handle Special States (Captcha/OTP) - AFTER filling
    const detection = await pageManager.detectSpecialElements();

    const geminiSaysCaptchaInside = aiResult.captcha && aiResult.captcha.detected && aiResult.captcha.isInsideForm;
    const localSaysCaptcha = detection.hasCaptcha;

    if (localSaysCaptcha || geminiSaysCaptchaInside) {
      this.pause('captcha');
      EventEmitter.emitCaptchaDetected('generic');
      return;
    }

    if (detection.hasOtp || (aiResult.otp && aiResult.otp.detected)) {
      this.pause('otp');
      EventEmitter.emitOtpRequired(detection.selector || (aiResult.otp && aiResult.otp.selector) || 'input[name*="otp"]');
      return;
    }

    // Map behavior fields to the format expected by the UI
    const mappedFields = behaviorFields.map(f => ({
      fieldLabel: f.fieldName,
      fieldType: f.behavior,
      selector: f.selector,
      value: f.expectedValue !== '__MISSING__' ? f.expectedValue : '',
      confidence: f.confidence,
      reason: f.reason
    }));

    // SAFETY: Only take the primary action (first one) for form submission
    const allActions = Array.isArray(aiResult.actions) ? aiResult.actions : [];
    if (allActions.length > 1) {
      logger.warn(`Form page: Gemini returned ${allActions.length} actions, but only using the first one`, {
        allActions: allActions.map((a: any) => a.expectedText)
      });
    }
    
    const primaryAction = allActions.length > 0 ? allActions[0] : null;
    const actions = primaryAction ? [{
      type: primaryAction.type || 'click',
      selector: primaryAction.selectorHint || primaryAction.selector || '',
      expectedText: primaryAction.expectedText || primaryAction.description || '',
      description: primaryAction.description || primaryAction.expectedText || '',
    }] : [];

    const mapping = {
      fields: mappedFields,
      actions,
      captcha: { detected: false },
      otp: { detected: false },
      submitButton: { selector: 'button[type="submit"]', text: 'Submit' },
    };

    this.currentMapping = mapping as unknown as FormMapping;
    EventEmitter.emitMapping(mapping);

    // If in AUTO mode, auto-approve immediately
    if (this.modeManager.isAutoMode()) {
      logger.info('Auto mode active - approving mapping immediately...');
      EventEmitter.emitStatus('Auto-approving immediately...', 85);

      if (this.isRunning && !this.isPaused && this.currentMapping) {
        this.approveMapping(this.currentMapping);
      }
    }
  }

  // Called when user clicks "Approve/Proceed" - clicks submit button
  async approveMapping(_mapping: FormMapping) {
    if (!this.currentJob) return;

    const jobId = this.currentJob._id;
    EventEmitter.emitStatus('Submitting form...', 90);

    try {
      // Fetch fresh data
      const portal = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);

      const portalDomain = new URL(portal?.url || 'http://localhost').hostname;
      const page = await browserConnector.getPageByUrl(portalDomain);
      const pageManager = new PageManager(page);
      const currentUrl = page.url();

      automationNavigationLogger.info('=== FORM SUBMISSION NAVIGATION START ===', {
        jobId,
        currentUrl,
        timestamp: new Date().toISOString()
      });

      // Click submit button using our robust method
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

      try {
        automationNavigationLogger.info('Waiting for form submission navigation', {
          jobId,
          currentUrl,
          waitStrategy: 'domcontentloaded',
          timeout: 10000
        });

        const waitStartTime = Date.now();
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        const waitDuration = Date.now() - waitStartTime;
        
        automationNavigationLogger.info('Page load state reached after form submission', {
          jobId,
          waitDuration,
          loadState: 'domcontentloaded'
        });
        
        // Additional small delay to ensure DOM is fully rendered
        await new Promise(r => setTimeout(r, 500));
        
        // Get the new URL after form submission navigation
        const newUrl = page.url();
        const urlChanged = newUrl !== currentUrl;
        
        automationNavigationLogger.info('Form submission navigation completed', {
          jobId,
          previousUrl: currentUrl,
          newUrl,
          urlChanged,
          totalNavigationDuration: Date.now() - submitStartTime
        });
        
        logger.info(`Form submission navigation completed. New URL: ${newUrl}`);
        
        // CRITICAL: Update job URL and clear checkpoint so next iteration processes the NEW page
        if (this.currentJob?._id) {
          await automationJobRepository.updateCurrentUrl(this.currentJob._id, newUrl);
          await automationJobRepository.clearCheckpoint(this.currentJob._id);
          automationLoopLogger.info(`Form submission complete. Cleared checkpoint for job ${this.currentJob._id}. New URL: ${newUrl}`);
          
          automationNavigationLogger.info('Job state updated after form submission', {
            jobId: this.currentJob._id,
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
          currentUrl,
          error: errorMessage,
          note: 'Page might be SPA or URL might have changed'
        });
      }

      // Loop to next page will be handled by runJobLoop based on updated URL/state.

    } catch (error) {
      logger.error('Execution failed:', error);
      EventEmitter.emitStatus('Execution failed', 0);
    }
  }

  async stop(): Promise<void> {
    if (this.currentJob) {
      await automationJobRepository.update(
        this.currentJob._id,
        this.currentJob.companyId,
        { status: 'failed', completedAt: new Date() }
      );
      this.currentJob = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.currentMapping = null;

    // NOTE: Do NOT disconnect browser on stop - keep it open for user to continue manually
    // Browser will be closed via separate BROWSER_CLOSE IPC call from UI

    // NOTE: Also keep browser view visible so user can see the portal
    // Hide only when user explicitly closes browser

    EventEmitter.emitStatus('Automation stopped', 0);
  }

  async pause(reason?: PauseReason): Promise<void> {
    if (this.currentJob) {
      const updated = await automationJobRepository.update(
        this.currentJob._id,
        this.currentJob.companyId,
        { status: 'paused', pauseReason: reason || 'user_paused' }
      );
      if (updated) this.currentJob = updated;
    }
    this.isPaused = true;
    // Also stop the loop; resume() will start a new runJobLoop.
    this.isRunning = false;
    EventEmitter.emitStatus('Paused', 0);
  }

  async resume(): Promise<void> {
    if (this.currentJob) {
      const updated = await automationJobRepository.update(
        this.currentJob._id,
        this.currentJob.companyId,
        { status: 'running', pauseReason: undefined }
      );
      if (updated) this.currentJob = updated;
    }

    if (!this.currentJob) {
      logger.warn('Resume called but no current job found.');
      return;
    }

    this.isPaused = false;
    this.isRunning = true;
    EventEmitter.emitStatus('Resuming...', 0);

    automationLoopLogger.info(`Resuming automation loop for job ${this.currentJob._id}`);
    void this.runJobLoop(this.currentJob._id);
  }

  async resumeAfterCaptcha(): Promise<void> {
    logger.info('Resuming after captcha...');
    await this.resume();
  }

  async executeAction(actionIndex: number): Promise<void> {
    if (!this.currentMapping || !this.currentMapping.actions) {
      throw new Error('No actions available');
    }

    const action = this.currentMapping.actions[actionIndex];
    if (!action) {
      throw new Error(`Action at index ${actionIndex} not found`);
    }

    logger.info(`Executing action: ${action.expectedText || action.description}`);
    EventEmitter.emitStatus(`Executing: ${action.expectedText || action.description}`, 70);

    try {
      // Get Playwright page from the current portal
      if (!this.currentJob) {
        throw new Error('No current job');
      }
      const portal = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);
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
      this.currentMapping = null;
    } catch (error) {
      logger.error('Failed to execute action:', error);
      EventEmitter.emitStatus('Action failed', 0);
      throw error;
    }
  }

  async getState(): Promise<AutomationState> {
    return {
      isRunning: this.isRunning,
      currentJob: this.currentJob || undefined,
      currentMapping: this.currentMapping || undefined,
      progress: 0,
      statusMessage: this.isRunning ? (this.isPaused ? 'Paused' : 'Running') : 'Idle',
      needsApproval: !!this.currentMapping,
      captchaDetected: false,
      otpDetected: false,
      mode: this.modeManager.getMode(),
    };
  }

  setMode(mode: 'auto' | 'manual') {
    this.modeManager.setMode(mode);
    EventEmitter.emitStatus(`Mode switched to ${mode}`, 0);

    // If we switch to auto and are waiting for approval, trigger it
    if (mode === 'auto' && this.currentMapping && this.isRunning && !this.isPaused) {
       logger.info('Switched to auto while waiting - triggering approval');
       this.approveMapping(this.currentMapping);
    }
  }
}

export const automationService = new AutomationService();
