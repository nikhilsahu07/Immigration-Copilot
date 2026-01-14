import { logger } from '../../core/logger';
import { PendingAction } from '../../../shared/types';

/**
 * ApprovalQueue manages action approvals for Manual automation mode.
 * 
 * In Manual mode, each Playwright action requires user approval before execution.
 * This class handles the async approval flow.
 */
export class ApprovalQueue {
  private pendingAction: PendingAction | null = null;
  private resolveApproval: ((approved: boolean) => void) | null = null;

  /**
   * Request approval for an action.
   * Returns a promise that resolves when user approves/rejects.
   */
  async requestApproval(action: PendingAction): Promise<boolean> {
    this.pendingAction = action;
    
    logger.info(`Requesting approval for: ${action.type} - ${action.description}`);
    
    return new Promise((resolve) => {
      this.resolveApproval = resolve;
    });
  }

  /**
   * Approve the pending action
   */
  approve(): void {
    if (this.resolveApproval) {
      logger.info('Action approved');
      this.resolveApproval(true);
      this.clear();
    }
  }

  /**
   * Reject/skip the pending action
   */
  reject(): void {
    if (this.resolveApproval) {
      logger.info('Action rejected');
      this.resolveApproval(false);
      this.clear();
    }
  }

  /**
   * Get the current pending action
   */
  getPending(): PendingAction | null {
    return this.pendingAction;
  }

  /**
   * Check if there's a pending action
   */
  hasPending(): boolean {
    return this.pendingAction !== null;
  }

  /**
   * Clear the pending action
   */
  private clear(): void {
    this.pendingAction = null;
    this.resolveApproval = null;
  }
}
