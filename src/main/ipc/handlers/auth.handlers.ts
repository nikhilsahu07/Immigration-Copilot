import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { authService, setCurrentSession, clearCurrentSession, getCurrentSession } from '../../services/auth';
import { registerSchema, loginSchema } from '../../../shared/schemas';
import { handleError, success } from '../../core/error-handler';
import { logger } from '../../core/logger';

export function registerAuthHandlers(): void {
  // Register
  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER, async (_event, data) => {
    try {
      const validated = registerSchema.parse(data);
      const result = await authService.register(validated);
      setCurrentSession('current', result.session);
      return success(result);
    } catch (error) {
      logger.error('Register error:', error);
      return handleError(error);
    }
  });

  // Login
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, data) => {
    try {
      const validated = loginSchema.parse(data);
      const result = await authService.login(validated);
      setCurrentSession('current', result.session);
      return success(result);
    } catch (error) {
      logger.error('Login error:', error);
      return handleError(error);
    }
  });

  // Logout
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    try {
      clearCurrentSession();
      return success(undefined);
    } catch (error) {
      logger.error('Logout error:', error);
      return handleError(error);
    }
  });

  // Get Session
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_SESSION, async () => {
    try {
      const session = getCurrentSession();
      return success(session);
    } catch (error) {
      logger.error('Get session error:', error);
      return handleError(error);
    }
  });

  logger.debug('Auth handlers registered');
}
