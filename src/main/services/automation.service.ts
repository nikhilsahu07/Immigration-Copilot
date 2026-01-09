
import { 
  AutomationJob, 
  CreateJobInput, 
  JobStatus, 
  UpdateJobInput, 
  FormMapping,
  AutomationState
} from '../../shared/types';
import { 
  automationJobRepository, 
  clientRepository, 
  portalRepository, 
  extractionRepository 
} from '../database/repositories';
import { logger } from '../core/logger';
import { createError } from '../core/error-handler';
import { ERROR_CODES, IPC_CHANNELS } from '../../shared/constants';


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
      status: 'running',
    });

    this.currentJob = job;
    this.isRunning = true;
    this.isPaused = false;

    // 3. Initialize Browser View
    this.emitStatus('Loading portal...', 0);
    const bvm = require('../index').getBrowserViewManager();
    if (bvm) {
        await bvm.loadURL(portal.url);
        bvm.show();
    } else {
        throw new Error('BrowserViewManager not available');
    }
    
    // 4. Start the loop
    const { browserConnector } = require('../automation/browser-connector');
    try {
        await browserConnector.connect();
        // Small delay to ensure Playwright sees the target
        await new Promise(r => setTimeout(r, 1000));
        this.processPage(client, extraction, portal.url);
    } catch (e) {
        logger.error('Failed to connect to browser', e);
        this.stop();
        throw e;
    }

    return job;
  }

  // Main processing loop
  private async processPage(client: any, extraction: any, portalUrl: string) {
    if (!this.isRunning || this.isPaused) return;

    try {
      this.emitStatus('Analyzing page...', 10);
      this.emitPageChanged(this.currentJob?.currentPage || 1, this.currentJob?.totalPages || 10);
      
      const { browserConnector } = require('../automation/browser-connector');
      const { PageManager } = require('../automation/page-manager');
      
      // Get the page from Playwright
      const portalDomain = new URL(portalUrl || 'http://localhost').hostname;
      let page;
      try {
          page = await browserConnector.getPageByUrl(portalDomain);
      } catch (e) {
          logger.warn(`Could not find page for ${portalDomain}, trying generic get`);
          this.emitStatus('Waiting for page load...', 10);
          setTimeout(() => this.processPage(client, extraction, portalUrl), 3000);
          return;
      }
      
      const pageManager = new PageManager(page);

      // 1. Extract HTML
      const cleaned = await pageManager.extractHtml();

      // 2. AI Analysis
      this.emitStatus('Consulting AI Agent...', 30);
      const { aiService } = require('./ai.service');
      const aiResult = await aiService.analyzePageAndMapFields(
        cleaned, 
        { 
            clientProfile: client, 
            extractedData: extraction.extractedData 
        },
        this.currentJob?.customPrompt
      );

      // 3. Handle Special States via PageManager + AI result
      // Double check with PageManager's detection (runtime check vs AI check)
      const detection = await pageManager.detectSpecialElements();
      
      if (detection.hasCaptcha || aiResult.captchaDetected) {
        this.pause('captcha');
        this.emitCaptchaDetected('generic');
        return;
      }

      if (detection.hasOtp || aiResult.otpDetected) {
        this.pause('otp');
        this.emitOtpRequired(detection.selector || 'input[name*="otp"]');
        return;
      }

      // 4. emit mapping to UI
      const mapping = {
        fields: aiResult.fields.map((f: any, i: number) => ({
            ...f,
            fieldIndex: i,
            fieldType: f.fieldType || 'text', // AI should return type, else default
            fieldLabel: f.fieldName,
            confidence: 'high',
        })),
        submitButton: aiResult.actions.find((a: any) => a.type === 'submit' || a.type === 'click') || { selector: 'button[type="submit"]', text: 'Submit' },
      };

      this.currentMapping = mapping as any;
      this.emitMapping(mapping);
      this.emitStatus('Ready to fill form. Please review.', 50);

      this.pendingActions = aiResult.actions;

    } catch (error) {
      logger.error('Page processing failed:', error);
      this.emitStatus('Error processing page', 0);
    }
  }

  // Called when user clicks "Approve/Proceed"
  async approveMapping(mapping: any) {
    if (!this.currentJob) return;
    
    this.emitStatus('Filling form...', 70);
    
    try {
        const { browserConnector } = require('../automation/browser-connector');
        const { PageManager } = require('../automation/page-manager');
        
        // Fetch fresh data
        const client = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId); 
        const portal = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);
        
        const portalDomain = new URL(portal?.url || 'http://localhost').hostname;
        const page = await browserConnector.getPageByUrl(portalDomain);
        const pageManager = new PageManager(page);

        // 1. Fill Fields
        await pageManager.fillForm(mapping.fields);

        // 2. Submit
        if (this.pendingActions && this.pendingActions.length > 0) {
             this.emitStatus('Submitting...', 90);
             const action = this.pendingActions.find((a: any) => a.type === 'submit' || a.type === 'click');
             if (action && action.selector) {
                 await page.click(action.selector);
                 
                 this.emitStatus('Waiting for navigation...', 95);
                 
                 try {
                    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                 } catch (e) {
                     logger.warn('Nav timeout, checking if URL changed');
                 }

                 // Loop
                 setTimeout(async () => {
                     if (this.currentJob && this.isRunning && !this.isPaused) {
                        try {
                            const c = await clientRepository.findById(this.currentJob.clientId, this.currentJob.companyId);
                            const e = await extractionRepository.findById(this.currentJob.extractionId, this.currentJob.companyId);
                            const p = await portalRepository.findById(this.currentJob.portalId, this.currentJob.companyId);
                            
                            if (c && e && p) {
                                this.processPage(c, e, p.url);
                            }
                        } catch(err) {
                            logger.error('Failed to restart loop', err);
                        }
                     }
                 }, 3000);
             }
        } else {
             this.emitStatus('No navigation action found', 100);
        }

    } catch (error) {
        logger.error('Execution failed:', error);
    }
  }

  private pendingActions: any[] = [];

  async stop(): Promise<void> {
    if (this.currentJob) {
      const repo = require('../database/repositories/automation-job.repository').automationJobRepository;
      await repo.update(this.currentJob._id, this.currentJob.companyId, { status: 'failed', completedAt: new Date() });
      this.currentJob = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.currentMapping = null;
    
    // Disconnect browser
    const { browserConnector } = require('../automation/browser-connector');
    await browserConnector.disconnect();
    
    this.emitStatus('Automation stopped', 0);
  }

  async pause(reason?: string): Promise<void> {
    if (this.currentJob) {
      const repo = require('../database/repositories/automation-job.repository').automationJobRepository;
      const updated = await repo.update(this.currentJob._id, this.currentJob.companyId, { status: 'paused', pauseReason: reason || 'user_paused' });
      if (updated) this.currentJob = updated;
    }
    this.isPaused = true;
    this.emitStatus('Paused', 0);
  }

  async resume(): Promise<void> {
    if (this.currentJob) {
      const repo = require('../database/repositories/automation-job.repository').automationJobRepository;
      const updated = await repo.update(this.currentJob._id, this.currentJob.companyId, { status: 'running', pauseReason: undefined });
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
    const wm = require('../index').getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_STATUS_UPDATE, { message, progress });
  }

  private emitPageChanged(page: number, total: number) {
    const wm = require('../index').getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_PAGE_CHANGED, { page, total });
  }

  private emitMapping(mapping: any) {
    const wm = require('../index').getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_FORM_PREVIEW, mapping);
  }

  private emitCaptchaDetected(type: string) {
    const wm = require('../index').getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_CAPTCHA_DETECTED, { type });
  }

  private emitOtpRequired(selector: string) {
    const wm = require('../index').getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_OTP_REQUIRED, { fieldSelector: selector });
  }
}

export const automationService = new AutomationService();
