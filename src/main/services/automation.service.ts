/**
 * Automation Service (Refactored)
 * 
 * Thin orchestrator that coordinates automation job lifecycle.
 * Delegates page processing to PageProcessor and form submission to FormSubmissionHandler.
 */

import { 
  AutomationJob, 
  AutomationCheckpoint,
  CreateJobInput, 
  FormMapping,
  AutomationState,
  PauseReason
} from '../../shared/types';
import { 
  automationJobRepository, 
  clientRepository, 
  portalRepository, 
  extractionRepository,
  chatRepository
} from '../database/repositories';
import { logger, automationLoopLogger } from '../core/logger';
import { createError } from '../core/error-handler';
import { ERROR_CODES } from '../../shared/constants';

import { getBrowserViewManager } from '../index';
import { browserConnector } from '../automation/browser-connector';
import { EventEmitter } from '../automation/core/event-emitter';
import { ModeManager } from '../automation/core/mode-manager';
import { CanonicalFieldsMap } from '../automation/utils/canonical-fields-map';

// Import new modular components
import { PageProcessor, PageIterationResult } from './automation/page-processor';
import { FormSubmissionHandler } from './automation/form-submission-handler';

export class AutomationService {
  // Job state
  private currentJob: AutomationJob | null = null;
  private currentMapping: FormMapping | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  // Managers and coordinators
  private modeManager: ModeManager = new ModeManager();
  private canonicalFieldsMap: CanonicalFieldsMap = new CanonicalFieldsMap();
  
  // Delegated handlers
  private pageProcessor: PageProcessor;
  private formSubmissionHandler: FormSubmissionHandler;

  constructor() {
    // Initialize page processor with dependency injection
    this.pageProcessor = new PageProcessor({
      getCurrentJob: () => this.currentJob,
      setCurrentJob: (job) => { this.currentJob = job; },
      getCanonicalFieldsMap: () => this.canonicalFieldsMap,
      isRunning: () => this.isRunning,
      isPaused: () => this.isPaused,
      setCurrentMapping: (mapping) => { this.currentMapping = mapping; },
      getCurrentMapping: () => this.currentMapping,
      getModeManager: () => this.modeManager,
    });

    // Initialize form submission handler
    this.formSubmissionHandler = new FormSubmissionHandler(
      () => this.currentJob,
      () => this.currentMapping,
      (mapping) => { this.currentMapping = mapping; }
    );
  }

  /**
   * Start automation for a client
   */
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
      modelName: input.modelName || 'gemini-3-flash-preview',
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
      }
    }

    this.currentJob = job;
    this.isRunning = true;
    this.isPaused = false;

    // 3. Initialize Browser View
    const bvm = getBrowserViewManager();
    if (!bvm) {
      throw new Error('BrowserViewManager not available');
    }

    // Handle current URL vs portal URL
    const currentURL = bvm.getCurrentURL();
    const portalURL = portal.url;
    const normalizedCurrentURL = currentURL ? this.normalizeURL(currentURL) : null;
    const normalizedPortalURL = this.normalizeURL(portalURL);

    // CRITICAL: Show BrowserView FIRST before loading URL or connecting to CDP
    // This ensures it's visible throughout the entire process
    bvm.show();
    
    // CRITICAL: Lock BrowserView to prevent it from being hidden during automation
    bvm.lockHide();

    if (normalizedCurrentURL && normalizedCurrentURL !== normalizedPortalURL) {
      logger.info(`Starting from current page: ${currentURL}`);
      EventEmitter.emitStatus('Starting from current page...', 5);
      await automationJobRepository.updateCurrentUrl(job._id, currentURL!);
      job.currentUrl = currentURL!;
    } else {
      EventEmitter.emitStatus('Loading portal...', 5);
      await bvm.loadURL(portalURL);
      await automationJobRepository.updateCurrentUrl(job._id, portalURL);
      job.currentUrl = portalURL;
    }

    // Wait for page to be ready before connecting to CDP
    // This ensures the page is fully loaded when we connect
    EventEmitter.emitStatus('Waiting for page load...', 7);
    try {
      await bvm.waitForPageLoad(15000); // Wait up to 15 seconds for page to load
      logger.info('Page load confirmed');
    } catch (error) {
      logger.warn('Page load wait failed, proceeding anyway', error);
      // Continue anyway - page might be ready even if wait failed
    }
    
    // 4. Connect via CDP and start processing
    try {
      EventEmitter.emitStatus('Connecting to browser...', 10);
      await browserConnector.connect();
      await new Promise(r => setTimeout(r, 100));

      // CRITICAL: Ensure BrowserView is visible after CDP connection
      // CDP connection might cause BrowserView to be hidden, so we re-show it
      bvm.show();

      await automationJobRepository.updateStatus(job._id, 'running');
      
      // CRITICAL: Re-show BrowserView after status update
      // Status update might trigger something that hides BrowserView, so ensure it stays visible
      bvm.show();
      
      // Small delay to ensure BrowserView visibility is set before starting job loop
      await new Promise(r => setTimeout(r, 200));
      
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
   * Main job loop - coordinates page processing iterations
   */
  private async runJobLoop(jobId: string): Promise<void> {
    this.isRunning = true;
    automationLoopLogger.info(`runJobLoop started for job ${jobId}`);
    
    // CRITICAL: Ensure BrowserView is visible when job loop starts
    // This prevents it from being hidden during automation
    const bvm = getBrowserViewManager();
    if (bvm && bvm.isShowing()) {
      // Already showing, but ensure it stays visible
      bvm.show();
    } else if (bvm) {
      // Not showing, show it now
      bvm.show();
    }

    try {
      while (this.isRunning) {
        if (this.isPaused) {
          automationLoopLogger.info(`runJobLoop exiting - paused`);
          return;
        }

        const job = await automationJobRepository.findById(jobId);
        if (!job) {
          automationLoopLogger.warn(`Job ${jobId} not found`);
          break;
        }

        this.currentJob = job;

        if (job.status === 'completed' || job.status === 'failed') {
          automationLoopLogger.info(`Job has terminal status=${job.status}`);
          break;
        }

        if (job.status !== 'running') {
          await automationJobRepository.updateStatus(jobId, 'running');
        }

        // Load resources
        const [client, portal, extraction] = await Promise.all([
          clientRepository.findById(job.clientId, job.companyId),
          portalRepository.findById(job.portalId, job.companyId),
          extractionRepository.findById(job.extractionId, job.companyId),
        ]);

        if (!client || !portal || !extraction) {
          automationLoopLogger.error(`Missing resources for job ${jobId}`);
          await automationJobRepository.setError(jobId, 'Missing resources');
          this.isRunning = false;
          break;
        }

        const portalUrl = job.currentUrl || portal.url;
        const customPrompt = job.customPrompt;
        const checkpoint: AutomationCheckpoint | null = job.checkpoint ?? null;

        // CRITICAL: Check if we're waiting for user approval before processing
        // If a mapping exists, we're waiting for approval - don't process the same page again
        if (this.currentMapping) {
          automationLoopLogger.info('Waiting for user approval - pausing loop iteration');
          // Wait a bit before checking again (don't spin the CPU)
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        // Delegate to PageProcessor
        let result: PageIterationResult;
        if (checkpoint) {
          result = await this.pageProcessor.resumeFromCheckpoint(
            job, client, extraction, portalUrl, customPrompt, checkpoint
          );
        } else {
          result = await this.pageProcessor.executeWorkflowForCurrentPage(
            job, client, extraction, portalUrl, customPrompt
          );
        }

        // Handle result
        if (!this.isRunning || this.isPaused) break;

        if (result.kind === 'retry') {
          await new Promise(r => setTimeout(r, result.delayMs));
          continue;
        }

        if (result.kind === 'page_done') {
          // After page_done, check if we're now waiting for approval
          // If so, the next loop iteration will pause (checked above)
          // If not, continue to process next page
          continue;
        }

        if (result.kind === 'job_completed') {
          await automationJobRepository.updateStatus(jobId, 'completed');
          this.isRunning = false;
          
          // Unlock BrowserView when automation completes
          const bvm = getBrowserViewManager();
          if (bvm) {
            bvm.unlockHide();
          }
          
          break;
        }

        if (result.kind === 'job_failed') {
          await automationJobRepository.setError(jobId, result.reason || 'Automation failed');
          this.isRunning = false;
          
          // Unlock BrowserView when automation fails
          const bvm = getBrowserViewManager();
          if (bvm) {
            bvm.unlockHide();
          }
          
          break;
        }
      }
    } catch (error) {
      automationLoopLogger.error(`runJobLoop error: ${(error as Error).message}`);
      await automationJobRepository.setError(jobId, (error as Error).message);
      this.isRunning = false;
      
      // Unlock BrowserView on error
      const bvm = getBrowserViewManager();
      if (bvm) {
        bvm.unlockHide();
      }
    } finally {
      automationLoopLogger.info(`runJobLoop finished for job ${jobId}`);
    }
  }

  // --- Lifecycle Methods ---

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
    
    // Unlock BrowserView when automation stops
    const bvm = getBrowserViewManager();
    if (bvm) {
      bvm.unlockHide();
    }
    
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

  // --- Delegated Methods ---

  async approveMapping(mapping: FormMapping): Promise<void> {
    await this.formSubmissionHandler.approveMapping(mapping);
  }

  async executeAction(actionIndex: number): Promise<void> {
    await this.formSubmissionHandler.executeAction(actionIndex);
  }

  // --- State & Mode ---

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

  setMode(mode: 'auto' | 'manual'): void {
    this.modeManager.setMode(mode);
    EventEmitter.emitStatus(`Mode switched to ${mode}`, 0);

    if (mode === 'auto' && this.currentMapping && this.isRunning && !this.isPaused) {
      logger.info('Switched to auto while waiting - triggering approval');
      this.approveMapping(this.currentMapping);
    }
  }

  // --- Helpers ---

  private normalizeURL(url: string): string {
    try {
      const urlObj = new URL(url);
      urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}

export const automationService = new AutomationService();
