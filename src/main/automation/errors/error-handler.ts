import { logger } from '../../core/logger';

/**
 * Automation-specific error handling
 */
export class AutomationErrorHandler {
  /**
   * Handle an automation error
   */
  // 
  static handle(error: any, context: string): void {
    logger.error(`Automation error in ${context}:`, error);
    // Additional error handling logic can be added here
  }

  /**
   * Determine if an error is recoverable
   */
  // 
  static isRecoverable(error: any): boolean {
    const errorString = String(error.message || error);
    
    // Network errors might be recoverable with retry
    if (errorString.includes('network') || errorString.includes('timeout')) {
      return true;
    }
    
    // Rate limits are temporarily recoverable
    if (errorString.includes('429') || errorString.includes('rate limit')) {
      return true;
    }
    
    return false;
  }
}
