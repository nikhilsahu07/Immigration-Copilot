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
        data,
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

  // Set Mode
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_SET_MODE, async (_event, { mode }) => {
    try {
      if (mode !== 'auto' && mode !== 'manual') throw new Error('Invalid mode');
      automationService.setMode(mode);
      return success(undefined);
    } catch (error) {
      logger.error('Set mode error:', error);
      return handleError(error);
    }
  });

  // Resume After Captcha
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_RESUME_AFTER_CAPTCHA, async () => {
    try {
      await automationService.resumeAfterCaptcha();
      return success(undefined);
    } catch (error) {
      logger.error('Resume after captcha error:', error);
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

  // Approve Mapping / Proceed
  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_APPROVE_MAPPING,
    async (_event, mapping) => {
      try {
        await automationService.approveMapping(mapping);
        return success(undefined);
      } catch (error) {
        logger.error('Approve mapping error:', error);
        return handleError(error);
      }
    },
  );

  // Execute specific action by index
  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_EXECUTE_ACTION,
    async (_event, { actionIndex }) => {
      try {
        await automationService.executeAction(actionIndex);
        return success(undefined);
      } catch (error) {
        logger.error('Execute action error:', error);
        return handleError(error);
      }
    },
  );

  // Retry filling with stored data
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_RETRY_FILLING, async () => {
    try {
      await automationService.retryFilling();
      return success(undefined);
    } catch (error) {
      logger.error('Retry filling error:', error);
      return handleError(error);
    }
  });

  // Check if retry is available
  ipcMain.handle(IPC_CHANNELS.AUTOMATION_CAN_RETRY, async () => {
    try {
      const canRetry = automationService.canRetryFilling();
      return success(canRetry);
    } catch (error) {
      logger.error('Can retry check error:', error);
      return handleError(error);
    }
  });

  logger.debug('Automation handlers registered');
}
