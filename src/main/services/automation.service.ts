import { 
  AutomationJob, 
  CreateJobInput, 
  FormMapping,
  AutomationState,
  Client,
  Extraction,
  PauseReason,
  BehaviorField
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
      EventEmitter.emitStatus('Downloading page structure...', 15);
      EventEmitter.emitPageChanged(this.currentJob?.currentPage || 1, this.currentJob?.totalPages || 10);
      
      // Get the page from Playwright
      const portalDomain = new URL(portalUrl || 'http://localhost').hostname;
      let page;
      try {
        page = await browserConnector.getPageByUrl(portalDomain);
      } catch (_e) {
        logger.warn(`Could not find page for ${portalDomain}, waiting for page load...`);
        EventEmitter.emitStatus('Waiting for page load...', 15);
        setTimeout(() => this.processPage(client, extraction, portalUrl, customPrompt), 100);
        return;
      }
      
      const pageManager = new PageManager(page);
      
      // Update job with current URL for resume support
      const currentUrl = page.url();
      if (this.currentJob) {
        // Update local state
        this.currentJob.currentUrl = currentUrl;
        // Fire and forget update
        automationJobRepository.updateCurrentUrl(this.currentJob._id, currentUrl).catch(e => {
            logger.warn('Failed to update currentUrl', e);
        });
      }

      // 1. Extract HTML
      const cleaned = await pageManager.extractHtml();
      EventEmitter.emitStatus('Page structure ready', 20);

      // 3. Capture Screenshot (if enabled)
      let screenshotBase64: string | undefined;
      if (this.currentJob?.attachScreenshots) {
        EventEmitter.emitStatus('Capturing screenshot...', 25);
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
      EventEmitter.emitStatus('Processing with AI...', 30);
      const aiResult = await aiService.analyzePageAndMapFields(
        cleaned, 
        extraction.extractedData,
        documentList,
        customPrompt,
        screenshotBase64
      );
      EventEmitter.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);

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
      const errorMessage = ErrorParser.parseGeminiError(error);
      EventEmitter.emitError(errorMessage);
      EventEmitter.emitStatus('Error: ' + errorMessage.title, 0);
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
    EventEmitter.emitStatus('Dashboard detected - executing navigation...', 60);

    const actions = aiResult.actions || [];
    if (actions.length === 0) {
      logger.warn('No actions found for dashboard page');
      EventEmitter.emitStatus('No navigation actions found', 50);
      return;
    }

    // SAFETY: Only take the first action (primary action)
    if (actions.length > 1) {
      logger.warn(`Gemini returned ${actions.length} actions, but only executing the first one`, {
        allActions: actions.map((a: any) => a.expectedText)
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

    logger.info('Executing dashboard action', {
      intent: primaryAction.intent,
      expectedText: primaryAction.expectedText,
      selector: mappedAction.selector
    });

    // Execute action (singular)
    const success = await pageManager.executeActions([mappedAction]);

    if (success) {
      EventEmitter.emitStatus('Navigation executed, waiting for new page...', 80);

      // Wait for navigation and then process next page
      // await new Promise(r => setTimeout(r, 2000)); // Removed for speed


      if (this.isRunning && !this.isPaused) {
        this.processPage(client, extraction, portalUrl, customPrompt);
      }
    } else {
      EventEmitter.emitStatus('Navigation action failed', 50);
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


    // NEW: Confidence-based filtering
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

    // Fill high confidence fields ONLY
    EventEmitter.emitStatus('Filling high-confidence fields...', 60);
    for (const field of highConfidence) {
      try {
        // Use BehaviorFillerFactory to get appropriate filler
        const filler = BehaviorFillerFactory.getFiller(field.behavior, pageManager.getPage());
        const fillerName = BehaviorFillerFactory.getFillerName(field.behavior);
        
        // Map BehaviorField to AutomatedField format
        const automatedField = {
          fieldIndex: 0,
          fieldName: field.fieldName,
          fieldLabel: field.fieldName,
          fieldType: field.behavior,
          selector: field.selector,
          value: field.expectedValue,  // ← Map expectedValue to value
          confidence: field.confidence,
          reasoning: field.reason
        };
        
        logger.info('Filling field with behavior-based filler', {
          field: field.fieldName,
          behavior: field.behavior,
          filler: fillerName,
          confidence: field.confidence,
          value: field.expectedValue,  // ← Log the actual value
          selector: field.selector
        });
        
        const success = await filler.fill(automatedField);
        
        if (!success && field.constraints?.required) {
          logger.error('Required high-confidence field failed to fill', {
            field: field.fieldName,
            selector: field.selector
          });
          
          EventEmitter.emitError({
            title: 'Required Field Failed',
            message: `Could not fill required field: ${field.fieldName}`,
            type: 'fill_error' as any
          });
        }
      } catch (error) {
        logger.error(`Error filling field ${field.fieldName}`, error);
      }
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

    EventEmitter.emitStatus('Submitting form...', 90);

    try {
      // Fetch fresh data
      const portal = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);

      const portalDomain = new URL(portal?.url || 'http://localhost').hostname;
      const page = await browserConnector.getPageByUrl(portalDomain);
      const pageManager = new PageManager(page);

      // Click submit button using our robust method
      const clicked = await pageManager.clickSubmitButton();

      if (!clicked) {
        EventEmitter.emitStatus('Could not find submit button', 90);
        logger.warn('No submit button found on page');
        return;
      }

      EventEmitter.emitStatus('Waiting for navigation...', 95);

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

      // Resume loop
      if (this.isPaused) {
        this.isPaused = false;

        const c = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId);
        const e = await extractionRepository.findById(this.currentJob.extractionId, this.currentJob.companyId);
        const p = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);

        if (c && e && p) {
          // Use the last visited URL if available, otherwise portal start URL
          const resumeUrl = this.currentJob.currentUrl || p.url;
          logger.info(`Resuming automation at URL: ${resumeUrl}`);
          this.processPage(c, e, resumeUrl);
        }
      }
    }
    this.isPaused = false;
    EventEmitter.emitStatus('Resuming...', 0);
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
