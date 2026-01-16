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
  documentRepository,
  chatRepository
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
  private mode: 'auto' | 'manual' = 'manual';

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
      // Small delay to ensure Playwright sees the target
      await new Promise(r => setTimeout(r, 100));
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
        setTimeout(() => this.processPage(client, extraction, portalUrl, customPrompt), 100);
        return;
      }
      
      const pageManager = new PageManager(page);

      // 1. Extract HTML
      const cleaned = await pageManager.extractHtml();
      this.emitStatus('Page structure ready', 20);

      // 3. Capture Screenshot (if enabled)
      let screenshotBase64: string | undefined;
      if (this.currentJob?.attachScreenshots) {
        this.emitStatus('Capturing screenshot...', 25);
        screenshotBase64 = await pageManager.captureScreenshot();
      }

      // 4. Fetch documents for context (include s3Key for file uploads)
      const documents = await documentRepository.findByClient(client._id, this.currentJob?.companyId || '');
      const documentList = documents.map(d => ({ 
        name: d.originalName, 
        category: d.documentType,
        s3Key: d.s3Key,
      }));

      // Create lookup map for resolving document names to S3 keys
      const documentLookup = new Map(documents.map(d => [d.originalName, d.s3Key]));

      // 3. AI Analysis with page type classification
      this.emitStatus('Processing with AI...', 30);
      const aiResult = await aiService.analyzePageAndMapFields(
        cleaned, 
        extraction.extractedData,
        documentList,
        customPrompt,
        screenshotBase64
      );
      this.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);

      logger.info(`Page classified as: ${aiResult.pageType} - ${aiResult.pageSummary}`);

      // 4. Route based on page type
      if (aiResult.pageType === 'dashboard' || !aiResult.isFormPage) {
        await this.processDashboardPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt);
      } else {
        await this.processFormPage(pageManager, aiResult, client, extraction, portalUrl, customPrompt, documentLookup);
      }

    } catch (error: any) {
      logger.error('Page processing failed:', error);
      
      // Parse and emit user-friendly error
      const errorMessage = this.parseGeminiError(error);
      this.emitError(errorMessage);
      this.emitStatus('Error: ' + errorMessage.title, 0);
    }
  }

  // Parse Gemini API errors into user-friendly messages
  private parseGeminiError(error: any): { title: string; message: string; type: string; retryAfter?: number } {
    const errorString = String(error.message || error);
    
    // Rate limit / quota exceeded
    if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('Too Many Requests')) {
      const retryMatch = errorString.match(/retry.*?(\d+)/i);
      const retryAfter = retryMatch ? parseInt(retryMatch[1]) : 60;
      return {
        title: 'API Rate Limit Exceeded',
        message: `You have exceeded your Gemini API quota. Please wait ${retryAfter} seconds or upgrade your plan.`,
        type: 'rate_limit',
        retryAfter,
      };
    }
    
    // Token limit exceeded
    if (errorString.includes('token') && (errorString.includes('limit') || errorString.includes('exceeded'))) {
      return {
        title: 'Token Limit Exceeded',
        message: 'The page content is too large for the AI to process. Try simplifying the form or reducing content.',
        type: 'token_limit',
      };
    }
    
    // Invalid API key
    if (errorString.includes('401') || errorString.includes('API key') || errorString.includes('unauthorized')) {
      return {
        title: 'Invalid API Key',
        message: 'Your Gemini API key is invalid or expired. Please check your configuration.',
        type: 'auth_error',
      };
    }
    
    // Network error
    if (errorString.includes('network') || errorString.includes('ECONNREFUSED') || errorString.includes('fetch')) {
      return {
        title: 'Network Error',
        message: 'Could not connect to Gemini API. Please check your internet connection.',
        type: 'network_error',
      };
    }
    
    // JSON parse error
    if (errorString.includes('JSON') || errorString.includes('parse')) {
      return {
        title: 'Invalid AI Response',
        message: 'The AI returned an invalid response. This page may be too complex. Try adding custom instructions.',
        type: 'parse_error',
      };
    }
    
    // Generic error
    return {
      title: 'Processing Error',
      message: errorString.substring(0, 200),
      type: 'unknown',
    };
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
      // await new Promise(r => setTimeout(r, 2000)); // Removed for speed
      
      
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
    _customPrompt?: string,
    documentLookup?: Map<string, string>
  ) {
    // Ensure fields is an array
    const fields = Array.isArray(aiResult.fields) ? aiResult.fields : [];
    
    if (fields.length === 0) {
      this.emitStatus('No form fields detected on this page', 50);
      logger.warn('AI returned no fields or invalid fields structure');
    }

    // Fill form
    this.emitStatus('Filling form...', 60);
    const mappedFields: AutomatedField[] = fields.map((f: any, i: number) => {
      let value = (f.value as string) || '';
      
      // For file fields, resolve document name to S3 key
      if (f.fieldType === 'file' && value && documentLookup) {
        const s3Key = documentLookup.get(value);
        if (s3Key) {
          value = s3Key;
          logger.info(`Resolved document "${f.value}" to S3 key: ${s3Key}`);
        }
      }
      
      return {
        fieldIndex: i,
        fieldName: (f.fieldName as string) || '',
        fieldLabel: (f.fieldName as string) || '',
        fieldType: (f.fieldType as string) || 'text',
        selector: (f.selector as string) || '',
        value,
        confidence: 'high',
        reasoning: (f.reason as string) || '',
      };
    });

    // Check for empty fields before filling
    const emptyFields = mappedFields.filter(f => !f.value || f.value.trim() === '' || f.value === 'N/A');
    
    await pageManager.fillForm(mappedFields);
    
    // If there are empty fields, emit event for manual input
    if (emptyFields.length > 0) {
      this.emitStatus(`${emptyFields.length} field(s) need manual input`, 70);
      this.emitManualInputRequired(emptyFields);
      this.pause('manual_input');
      return;
    }
    
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

    // Emit mapping for approval with actions for UI buttons
    const actions = Array.isArray(aiResult.actions) ? aiResult.actions.map((a: any) => ({
      type: a.type || 'click',
      selector: a.selector || '',
      expectedText: a.expectedText || a.description || '',
      description: a.description || a.expectedText || '',
    })) : [];

    const mapping = {
      fields: mappedFields,
      actions,
      captcha: { detected: false },
      otp: { detected: false },
      submitButton: { selector: 'button[type="submit"]', text: 'Submit' },
    };

    this.currentMapping = mapping as unknown as FormMapping;
    this.emitMapping(mapping);

    // If in AUTO mode, auto-approve immediately
    if (this.mode === 'auto') {
      logger.info('Auto mode active - approving mapping immediately...');
      this.emitStatus('Auto-approving immediately...', 85);
      
      if (this.isRunning && !this.isPaused && this.currentMapping) {
        this.approveMapping(this.currentMapping);
      }
    }
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
      
      // Loop to next page - removed delay
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
    
    // NOTE: Do NOT disconnect browser on stop - keep it open for user to continue manually
    // Browser will be closed via separate BROWSER_CLOSE IPC call from UI
    // await browserConnector.disconnect();
    
    // NOTE: Also keep browser view visible so user can see the portal
    // Hide only when user explicitly closes browser
    
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

  async executeAction(actionIndex: number): Promise<void> {
    if (!this.currentMapping || !this.currentMapping.actions) {
      throw new Error('No actions available');
    }

    const action = this.currentMapping.actions[actionIndex];
    if (!action) {
      throw new Error(`Action at index ${actionIndex} not found`);
    }

    logger.info(`Executing action: ${action.expectedText || action.description}`);
    this.emitStatus(`Executing: ${action.expectedText || action.description}`, 70);

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
      
      this.emitStatus('Action executed, processing next page...', 80);
      
      // Continue to next page
      if (this.currentJob) {
        const c = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId);
        const e = await extractionRepository.findById(this.currentJob.extractionId, this.currentJob.companyId);
        const p = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);

        if (c && e && p) {
          // Small delay for page navigation
          // Continue to next page immediately
          this.currentMapping = null;
          this.processPage(c, e, p.url);
        }
      }
    } catch (error) {
      logger.error('Failed to execute action:', error);
      this.emitStatus('Action failed', 0);
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
      mode: this.mode,
    };
  }

  setMode(mode: 'auto' | 'manual') {
    this.mode = mode;
    logger.info(`Automation mode set to: ${mode}`);
    this.emitStatus(`Mode switched to ${mode}`, 0);
    
    // If we switch to auto and are waiting for approval, trigger it
    if (mode === 'auto' && this.currentMapping && this.isRunning && !this.isPaused) {
       logger.info('Switched to auto while waiting - triggering approval');
       this.approveMapping(this.currentMapping);
    }
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

  private emitManualInputRequired(emptyFields: { fieldName: string; fieldLabel: string; selector: string }[]) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_MANUAL_INPUT_REQUIRED, { 
      fields: emptyFields.map(f => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldLabel,
        selector: f.selector,
      })),
      message: `${emptyFields.length} field(s) could not be filled automatically. Please fill them manually or provide additional instructions.`
    });
  }

  private emitError(error: { title: string; message: string; type: string; retryAfter?: number }) {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_ERROR, error);
    
    // Also pause the automation on error
    this.pause('error');
  }
}

export const automationService = new AutomationService();
