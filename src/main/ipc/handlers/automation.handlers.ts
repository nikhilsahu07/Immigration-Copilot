
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { automationService } from '../../services/automation.service';
import { handleError, success } from '../../core/error-handler';
import { logger } from '../../core/logger';
import { getCurrentSession } from '../../services/auth';

export function registerAutomationHandlers(): void {
  // Start Automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_START, async (_event, data) => {
    try {
      const session = getCurrentSession();
      if (!session) throw new Error('Unauthorized');
      
      const job = await automationService.start(
        session.companyId,
        session.agentId,
        data
      );
      return success(job);
    } catch (error) {
      logger.error('Start automation error:', error);
      return handleError(error);
    }
  });

  // Stop Automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_STOP, async () => {
    try {
      await automationService.stop();
      return success(undefined);
    } catch (error) {
      logger.error('Stop automation error:', error);
      return handleError(error);
    }
  });

  // Pause Automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_PAUSE, async () => {
    try {
      await automationService.pause();
      return success(undefined);
    } catch (error) {
      logger.error('Pause automation error:', error);
      return handleError(error);
    }
  });

  // Resume Automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_RESUME, async () => {
    try {
      await automationService.resume();
      return success(undefined);
    } catch (error) {
      logger.error('Resume automation error:', error);
      return handleError(error);
    }
  });

  // Get State
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_GET_STATE, async () => {
    try {
      const state = await automationService.getState();
      return success(state);
    } catch (error) {
      logger.error('Get automation state error:', error);
      return handleError(error);
    }
  });

  // Note: Other handlers (approveMapping, submitForm, etc.) should be implemented 
  // and called on automationService as well, but for now we focus on the requested start flow.
  
  logger.debug('Automation handlers registered');
}
