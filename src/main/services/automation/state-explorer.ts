import { Page } from 'playwright-core';
import { logger } from '../../core/logger';
import { aiService } from '../ai.service';
import { PageManager } from '../../automation/page-manager';
import { 
  ExplorationState, 
  DecisionResult, 
  MappedField,
  PendingAction,
  AutomationMode 
} from '../../../shared/types';
import { 
  cleanHtml, 
  normalizeToStableSelectors, 
  extractVisibleFormElements 
} from '../../utils/html-cleaner';
import { ApprovalQueue } from './approval-queue';
import { IPC_CHANNELS } from '../../../shared/constants';
import { getWindowManager } from '../../index';

export interface StateExplorerConfig {
  /** Maximum iterations before giving up (prevents infinite loops) */
  maxIterations: number;
  /** Delay between iterations in ms */
  iterationDelay: number;
  /** Timeout for waiting for DOM changes in ms */
  domChangeTimeout: number;
}

const DEFAULT_CONFIG: StateExplorerConfig = {
  maxIterations: 50,
  iterationDelay: 500,
  domChangeTimeout: 3000,
};

/**
 * StateExplorer manages the iterative exploration loop for SPA automation.
 * 
 * Core loop: Observe → Decide → Act → Update State → Repeat
 * 
 * Key features:
 * - Negative Mapping: Tracks filledFieldSelectors to prevent duplicate filling
 * - Stable Selectors: Uses id, name, aria-label instead of dynamic classes
 * - Manual Mode: Integrates with ApprovalQueue for step-by-step approval
 */
export class StateExplorer {
  private state: ExplorationState;
  private pageManager: PageManager;
  private approvalQueue: ApprovalQueue;
  private config: StateExplorerConfig;
  private automationMode: AutomationMode = 'auto';
  private isRunning: boolean = false;
  private extractedData: Record<string, unknown> = {};
  private documentList: { name: string; category: string }[] = [];

  constructor(
    private page: Page,
    config: Partial<StateExplorerConfig> = {}
  ) {
    this.pageManager = new PageManager(page);
    this.approvalQueue = new ApprovalQueue();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create initial exploration state
   */
  private createInitialState(): ExplorationState {
    return {
      currentContext: 'page',
      filledFieldSelectors: [],
      visitedInteractiveElements: [],
      isComplete: false,
      totalFieldsFilled: 0,
    };
  }

  /**
   * Set automation mode (auto or manual)
   */
  setMode(mode: AutomationMode): void {
    this.automationMode = mode;
    logger.info(`StateExplorer mode set to: ${mode}`);
  }

  /**
   * Set client data and documents for field mapping
   */
  setContext(
    extractedData: Record<string, unknown>,
    documentList: { name: string; category: string }[]
  ): void {
    this.extractedData = extractedData;
    this.documentList = documentList;
  }

  /**
   * Main exploration loop
   * Runs until complete or max iterations reached
   */
  async runExplorationLoop(): Promise<ExplorationState> {
    this.isRunning = true;
    this.state = this.createInitialState();
    let iteration = 0;

    logger.info('Starting exploration loop');
    this.emitExplorationState();

    while (this.isRunning && !this.state.isComplete && iteration < this.config.maxIterations) {
      iteration++;
      logger.info(`Exploration iteration ${iteration}/${this.config.maxIterations}`);

      try {
        // 1. OBSERVE: Get current visible HTML
        const html = await this.observe();
        
        // 2. DECIDE: Ask AI what to do next
        const decision = await this.decide(html);
        logger.info(`Decision: ${decision.type}`);

        // 3. Manual mode: Request approval
        if (this.automationMode === 'manual') {
          const pendingAction = this.createPendingAction(decision);
          this.emitActionPending(pendingAction);
          
          const approved = await this.approvalQueue.requestApproval(pendingAction);
          if (!approved) {
            logger.info('Action rejected, skipping');
            continue;
          }
        }

        // 4. ACT: Execute the decision
        const success = await this.act(decision);
        
        if (!success) {
          logger.warn(`Action failed for decision type: ${decision.type}`);
        }

        // 5. WAIT: Allow DOM to update after action
        if (decision.type !== 'DONE') {
          await this.waitForDOMChange();
        }

        // 6. Update and emit state
        this.emitExplorationState();

        // Small delay between iterations
        await new Promise(r => setTimeout(r, this.config.iterationDelay));

      } catch (error) {
        logger.error('Exploration iteration error:', error);
        this.state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Continue to next iteration unless critical
      }
    }

    if (iteration >= this.config.maxIterations) {
      logger.warn('Max iterations reached');
      this.state.errorMessage = 'Max iterations reached without completing';
    }

    this.isRunning = false;
    logger.info(`Exploration complete. Fields filled: ${this.state.totalFieldsFilled}`);
    
    return this.state;
  }

  /**
   * Stop the exploration loop
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Exploration stopped');
  }

  /**
   * OBSERVE: Extract and clean current visible HTML
   */
  private async observe(): Promise<string> {
    const rawHtml = await this.page.content();
    
    // Apply cleaning pipeline
    let html = cleanHtml(rawHtml);
    html = normalizeToStableSelectors(html);
    html = extractVisibleFormElements(html);
    
    // If in modal context, scope to modal
    if (this.state.currentContext === 'modal' && this.state.modalSelector) {
      // TODO: Implement scoped extraction for modals
    }
    
    return html;
  }

  /**
   * DECIDE: Call AI to determine next action
   */
  private async decide(html: string): Promise<DecisionResult> {
    return await aiService.makeExplorationDecision(
      html,
      this.extractedData,
      this.state.filledFieldSelectors,
      this.state.visitedInteractiveElements,
      this.documentList
    );
  }

  /**
   * ACT: Execute the decision
   */
  private async act(decision: DecisionResult): Promise<boolean> {
    switch (decision.type) {
      case 'FILL':
        return await this.executeFill(decision.fields);
        
      case 'NAVIGATE':
        return await this.executeNavigate(decision.selector, decision.description);
        
      case 'UPLOAD':
        return await this.executeUpload(decision.selector, decision.documentName);
        
      case 'DONE':
        this.state.isComplete = true;
        logger.info(`Exploration complete: ${decision.reason}`);
        return true;
        
      default:
        logger.warn(`Unknown decision type`);
        return false;
    }
  }

  /**
   * Execute FILL action
   */
  private async executeFill(fields: MappedField[]): Promise<boolean> {
    let successCount = 0;

    for (const field of fields) {
      // Skip if already filled (Negative Mapping check)
      if (this.state.filledFieldSelectors.includes(field.selector)) {
        logger.debug(`Skipping already filled: ${field.selector}`);
        continue;
      }

      try {
        // Use PageManager to fill the field
        await this.pageManager.fillForm([{
          fieldIndex: 0,
          fieldName: field.fieldName || '',
          fieldLabel: field.fieldName || '',
          fieldType: field.fieldType,
          selector: field.selector,
          value: field.value,
          confidence: 'high',
          reasoning: 'AI exploration',
        }]);

        // Update Negative Mapping
        this.updateFilledSelectors([field.selector]);
        successCount++;
        
      } catch (error) {
        logger.error(`Failed to fill ${field.selector}:`, error);
      }
    }

    return successCount > 0;
  }

  /**
   * Execute NAVIGATE action (click tab/button)
   */
  private async executeNavigate(selector: string, description: string): Promise<boolean> {
    // Check if already visited
    if (this.state.visitedInteractiveElements.includes(selector)) {
      logger.debug(`Skipping already visited: ${selector}`);
      return false;
    }

    const success = await this.pageManager.executeClick(selector, description);
    
    if (success) {
      // Mark as visited to prevent infinite loops
      this.state.visitedInteractiveElements.push(selector);
    }

    return success;
  }

  /**
   * Execute UPLOAD action (file input)
   */
  private async executeUpload(selector: string, documentName: string): Promise<boolean> {
    // Skip if already filled
    if (this.state.filledFieldSelectors.includes(selector)) {
      logger.debug(`Skipping already uploaded: ${selector}`);
      return false;
    }

    try {
      // Use the file upload filler from PageManager
      await this.pageManager.fillForm([{
        fieldIndex: 0,
        fieldName: 'File Upload',
        fieldLabel: documentName,
        fieldType: 'file',
        selector: selector,
        value: documentName, // The file filler will resolve this to S3 key
        confidence: 'high',
        reasoning: 'AI exploration upload',
      }]);

      this.updateFilledSelectors([selector]);
      return true;
      
    } catch (error) {
      logger.error(`Failed to upload ${documentName}:`, error);
      return false;
    }
  }

  /**
   * Update filled selectors (Negative Mapping)
   */
  private updateFilledSelectors(selectors: string[]): void {
    for (const selector of selectors) {
      if (!this.state.filledFieldSelectors.includes(selector)) {
        this.state.filledFieldSelectors.push(selector);
        this.state.totalFieldsFilled++;
      }
    }
    logger.debug(`Filled selectors count: ${this.state.filledFieldSelectors.length}`);
  }

  /**
   * Wait for DOM changes after an action
   */
  private async waitForDOMChange(): Promise<void> {
    try {
      // Wait for network idle or timeout
      await this.page.waitForLoadState('domcontentloaded', { 
        timeout: this.config.domChangeTimeout 
      });
    } catch {
      // Timeout is OK - page might not have navigated
    }
    
    // Additional small delay for React/Vue re-renders
    await new Promise(r => setTimeout(r, 300));
  }

  /**
   * Create PendingAction from DecisionResult for approval UI
   */
  private createPendingAction(decision: DecisionResult): PendingAction {
    const id = `action_${Date.now()}`;
    
    switch (decision.type) {
      case 'FILL':
        return {
          id,
          type: 'FILL',
          description: `Fill ${decision.fields.length} field(s)`,
          createdAt: new Date(),
        };
      case 'NAVIGATE':
        return {
          id,
          type: 'NAVIGATE',
          description: decision.description,
          selector: decision.selector,
          createdAt: new Date(),
        };
      case 'UPLOAD':
        return {
          id,
          type: 'UPLOAD',
          description: `Upload ${decision.documentName}`,
          selector: decision.selector,
          createdAt: new Date(),
        };
      case 'DONE':
        return {
          id,
          type: 'DONE',
          description: decision.reason,
          createdAt: new Date(),
        };
    }
  }

  /**
   * Emit exploration state to renderer
   */
  private emitExplorationState(): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_EXPLORATION_STATE, this.state);
  }

  /**
   * Emit pending action for approval
   */
  private emitActionPending(action: PendingAction): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_ACTION_PENDING, action);
  }

  /**
   * Approve pending action (called from IPC)
   */
  approveAction(): void {
    this.approvalQueue.approve();
  }

  /**
   * Reject pending action (called from IPC)
   */
  rejectAction(): void {
    this.approvalQueue.reject();
  }

  /**
   * Get current state
   */
  getState(): ExplorationState {
    return { ...this.state };
  }
}
