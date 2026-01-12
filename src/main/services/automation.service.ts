import { 
  AutomationJob, 
  CreateJobInput, 
  FormMapping,
  AutomationState,
  Client,
  Extraction,
  PauseReason
} from '../../shared/types';
import { 
  automationJobRepository, 
  clientRepository, 
  portalRepository, 
  extractionRepository,
  documentRepository
} from '../database/repositories';
import { logger } from '../core/logger';
import { createError } from '../core/error-handler';
import { ERROR_CODES, IPC_CHANNELS } from '../../shared/constants';

// ESM imports - replacing inline require() calls
import { getWindowManager, getBrowserViewManager } from '../index';
import { browserConnector } from '../automation/browser-connector';
import { PageManager } from '../automation/page-manager';
import { aiService } from './ai.service';
import type { AutomatedField } from '../automation/fillers/base-filler';

export class AutomationService {
  private currentJob: AutomationJob | null = null;
  private currentMapping: FormMapping | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

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

    this.currentJob = job;
    this.isRunning = true;
    this.isPaused = false;

    // 3. Initialize Browser View
    this.emitStatus('Loading portal...', 5);
    const bvm = getBrowserViewManager();
    if (bvm) {
      await bvm.loadURL(portal.url);
      bvm.show();
    } else {
      throw new Error('BrowserViewManager not available');
    }
    
    // 4. Connect via CDP and start processing
    try {
      this.emitStatus('Connecting to browser...', 10);
      await browserConnector.connect();
      // Small delay to ensure Playwright sees the target
      await new Promise(r => setTimeout(r, 1000));
      this.processPage(client, extraction, portal.url, input.customPrompt);
    } catch (e) {
      logger.error('Failed to connect to browser', e);
      this.stop();
      throw e;
    }

    return job;
  }

  // Main processing loop - routes to appropriate handler based on page type
  private async processPage(
    client: Client, 
    extraction: Extraction, 
    portalUrl: string,
    customPrompt?: string
  ) {
    if (!this.isRunning || this.isPaused) return;

    try {
      this.emitStatus('Downloading page structure...', 15);
      this.emitPageChanged(this.currentJob?.currentPage || 1, this.currentJob?.totalPages || 10);
      
      // Get the page from Playwright
      const portalDomain = new URL(portalUrl || 'http://localhost').hostname;
      let page;
      try {
        page = await browserConnector.getPageByUrl(portalDomain);
      } catch (_e) {
        logger.warn(`Could not find page for ${portalDomain}, waiting for page load...`);
        this.emitStatus('Waiting for page load...', 15);
        setTimeout(() => this.processPage(client, extraction, portalUrl, customPrompt), 3000);
        return;
      }
      
      const pageManager = new PageManager(page);

      // 1. Extract HTML
      const cleaned = await pageManager.extractHtml();
      this.emitStatus('Page structure ready', 20);

      // 2. Fetch documents for context
      const documents = await documentRepository.findByClient(client._id, this.currentJob?.companyId || '');
      const documentList = documents.map(d => ({ 
        name: d.originalName, 
        category: d.documentType 
      }));

      // 3. AI Analysis with page type classification
      this.emitStatus('Processing with AI...', 30);
      const aiResult = await aiService.analyzePageAndMapFields(
        cleaned, 
        extraction.extractedData,
        documentList,
        customPrompt
      );
      this.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);

      logger.info(`Page classified as: ${aiResult.pageType} - ${aiResult.pageSummary}`);

      // 4. Route based on page type
      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        await this.processDashboardPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt);
      } else {
        await this.processFormPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt);
      }

    } catch (error) {
      logger.error('Page processing failed:', error);
      this.emitStatus('Error processing page', 0);
    }
  }

  // Handle dashboard/navigation pages - execute click actions
  private async processDashboardPage(
    pageManager: PageManager,
    aiResult: any,
    client: Client,
    extraction: Extraction,
    portalUrl: string,
    customPrompt?: string
  ) {
    this.emitStatus('Dashboard detected - executing navigation...', 60);

    const actions = aiResult.actions || [];
    if (actions.length === 0) {
      logger.warn('No actions found for dashboard page');
      this.emitStatus('No navigation actions found', 50);
      return;
    }

    // Execute actions (clicks, navigations)
    const success = await pageManager.executeActions(actions);
    
    if (success) {
      this.emitStatus('Navigation executed, waiting for new page...', 80);
      
      // Wait for navigation and then process next page
      await new Promise(r => setTimeout(r, 2000));
      
      if (this.isRunning && !this.isPaused) {
        this.processPage(client, extraction, portalUrl, customPrompt);
      }
    } else {
      this.emitStatus('Navigation action failed', 50);
      logger.error('Failed to execute dashboard actions');
    }
  }

  // Handle form pages - fill fields and handle approval
  private async processFormPage(
    pageManager: PageManager,
    aiResult: any,
    _client: Client,
    _extraction: Extraction,
    _portalUrl: string,
    _customPrompt?: string
  ) {
    // Ensure fields is an array
    const fields = Array.isArray(aiResult.fields) ? aiResult.fields : [];
    
    if (fields.length === 0) {
      this.emitStatus('No form fields detected on this page', 50);
      logger.warn('AI returned no fields or invalid fields structure');
    }

    // Fill form
    this.emitStatus('Filling form...', 60);
    const mappedFields: AutomatedField[] = fields.map((f: any, i: number) => ({
      fieldIndex: i,
      fieldName: (f.fieldName as string) || '',
      fieldLabel: (f.fieldName as string) || '',
      fieldType: (f.fieldType as string) || 'text',
      selector: (f.selector as string) || '',
      value: (f.value as string) || '',
      confidence: 'high',
      reasoning: (f.reason as string) || '',
    }));

    await pageManager.fillForm(mappedFields);
    this.emitStatus('Form filled. Please review.', 80);

    // Handle Special States (Captcha/OTP) - AFTER filling
    const detection = await pageManager.detectSpecialElements();
    
    const geminiSaysCaptchaInside = aiResult.captcha && aiResult.captcha.detected && aiResult.captcha.isInsideForm;
    const localSaysCaptcha = detection.hasCaptcha;

    if (localSaysCaptcha || geminiSaysCaptchaInside) {
      this.pause('captcha');
      this.emitCaptchaDetected('generic');
      return;
    }

    if (detection.hasOtp || (aiResult.otp && aiResult.otp.detected)) {
      this.pause('otp');
      this.emitOtpRequired(detection.selector || (aiResult.otp && aiResult.otp.selector) || 'input[name*="otp"]');
      return;
    }

    // Emit mapping for approval
    const mapping = {
      fields: mappedFields,
      captcha: { detected: false },
      otp: { detected: false },
      submitButton: { selector: 'button[type="submit"]', text: 'Submit' },
    };

    this.currentMapping = mapping as unknown as FormMapping;
    this.emitMapping(mapping);
  }

  // Called when user clicks "Approve/Proceed" - clicks submit button
  async approveMapping(_mapping: FormMapping) {
    if (!this.currentJob) return;
    
    this.emitStatus('Submitting form...', 90);
    
    try {
      // Fetch fresh data
      const portal = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);
      
      const portalDomain = new URL(portal?.url || 'http://localhost').hostname;
      const page = await browserConnector.getPageByUrl(portalDomain);
      const pageManager = new PageManager(page);

      // Click submit button using our robust method
      const clicked = await pageManager.clickSubmitButton();
      
      if (!clicked) {
        this.emitStatus('Could not find submit button', 90);
        logger.warn('No submit button found on page');
        return;
      }
      
      this.emitStatus('Waiting for navigation...', 95);
      
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      } catch (_e) {
        logger.warn('Nav timeout, checking if URL changed');
      }

      // Loop to next page
      setTimeout(async () => {
        if (this.currentJob && this.isRunning && !this.isPaused) {
          try {
            const c = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId);
            const e = await extractionRepository.findById(this.currentJob.extractionId, this.currentJob.companyId);
            const p = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);
            
            if (c && e && p) {
              this.processPage(c, e, p.url);
            }
          } catch (err) {
            logger.error('Failed to restart loop', err);
          }
        }
      }, 3000);

    } catch (error) {
      logger.error('Execution failed:', error);
      this.emitStatus('Execution failed', 0);
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
    
    // Disconnect browser
    await browserConnector.disconnect();
    
    // Hide browser view
    const bvm = getBrowserViewManager();
    if (bvm) {
      bvm.hide();
    }
    
    this.emitStatus('Automation stopped', 0);
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
    this.emitStatus('Paused', 0);
  }

  async resume(): Promise<void> {
    if (this.currentJob) {
      const updated = await automationJobRepository.update(
        this.currentJob._id, 
        this.currentJob.companyId, 
        { status: 'running', pauseReason: undefined }
      );
      if (updated) this.currentJob = updated;
      
      // Resume loop
      if (this.isPaused) {
        this.isPaused = false;
         
        const c = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId);
        const e = await extractionRepository.findById(this.currentJob.extractionId, this.currentJob.companyId);
        const p = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);

        if (c && e && p) {
          this.processPage(c, e, p.url);
        }
      }
    }
    this.isPaused = false;
    this.emitStatus('Resuming...', 0);
  }

  async resumeAfterCaptcha(): Promise<void> {
    logger.info('Resuming after captcha...');
    await this.resume();
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
    };
  }

  // --- Helper to emit events to renderer ---
  private emitStatus(message: string, progress: number) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_STATUS_UPDATE, { message, progress });
  }

  private emitPageChanged(page: number, total: number) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_PAGE_CHANGED, { page, total });
  }

  private emitMapping(mapping: Record<string, unknown>) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_FORM_PREVIEW, mapping);
  }

  private emitCaptchaDetected(type: string) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_CAPTCHA_DETECTED, { type });
  }

  private emitOtpRequired(selector: string) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_OTP_REQUIRED, { fieldSelector: selector });
  }
}

export const automationService = new AutomationService();
