import { logger } from '../../core/logger';

/**
 * Mode manager for auto/manual mode switching
 */
export class ModeManager {
  private mode: 'auto' | 'manual' = 'manual';

  /**
   * Get current mode
   */
  getMode(): 'auto' | 'manual' {
    return this.mode;
  }

  /**
   * Set automation mode
   */
  setMode(mode: 'auto' | 'manual'): void {
    this.mode = mode;
    logger.info(`Automation mode set to: ${mode}`);
  }

  /**
   * Check if in auto mode
   */
  isAutoMode(): boolean {
    return this.mode === 'auto';
  }

  /**
   * Check if in manual mode
   */
  isManualMode(): boolean {
    return this.mode === 'manual';
  }
}
