
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
    if (!portal) throw createError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Portal not found');
    if (!extraction) throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);

    // 2. Create Job in DB
    const job = await automationJobRepository.create(companyId, agentId, {
      ...input,
      status: 'running',
    });

    this.currentJob = job;
    this.isRunning = true;
    this.isPaused = false;

    // 3. Notify Frontend
    this.emitStatus('Initializing automation...', 0);

    // 4. (Mock) Start the "Engine" - Here we would typically spawn a python process 
    // or initialize the browser automation logic.
    // For now, we will simulate the start and acknowledge we have the data.
    
    logger.info('Automation Context Loaded:', {
      clientName: client.name,
      portalUrl: portal.url,
      extractionDataKeys: Object.keys(extraction.extractedData || {}),
      documentCount: client.documentCount // Verification of the fix earlier
    });

    // We can simulate an initial analysis delay
    setTimeout(() => {
        if (this.isRunning) {
            this.emitStatus('Analyzing page...', 10);
            this.emitPageChanged(1, 4); // Fake total pages
        }
    }, 1500);

    return job;
  }

  async stop(): Promise<void> {
    if (this.currentJob) {
      await automationJobRepository.update(
        this.currentJob._id, 
        this.currentJob.companyId, 
        { status: 'failed', completedAt: new Date() } // or canceled
      );
      this.currentJob = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.currentMapping = null;
    this.emitStatus('Automation stopped', 0);
  }

  async pause(): Promise<void> {
    if (this.currentJob) {
      const updated = await automationJobRepository.update(
        this.currentJob._id, 
        this.currentJob.companyId, 
        { status: 'paused', pauseReason: 'user_paused' }
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
    }
    this.isPaused = false;
    this.emitStatus('Resuming...', 0);
  }

  async getState(): Promise<AutomationState> {
    return {
      isRunning: this.isRunning,
      currentJob: this.currentJob || undefined,
      currentMapping: this.currentMapping || undefined,
      progress: 0, // TODO: Track actual progress
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
}

export const automationService = new AutomationService();
