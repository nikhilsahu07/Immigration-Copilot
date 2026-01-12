
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { authService, setCurrentSession, clearCurrentSession, getCurrentSession } from '../../services/auth';
import { registerSchema, loginSchema } from '../../../shared/schemas';
import { handleError, success } from '../../core/error-handler';
import { logger } from '../../core/logger';
import { AuthSession } from '../../../shared/types';

export function registerAuthHandlers(): void {
  // Register
  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER, async (_event, data) => {
    try {
      const validated = registerSchema.parse(data);
      const result = await authService.register(validated);
      setCurrentSession(result.session._id, result.session);
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
      setCurrentSession(result.session._id, result.session);
      return success(result);
    } catch (error) {
      logger.error('Login error:', error);
      return handleError(error);
    }
  });

  // Logout
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, sessionId?: string) => {
    try {
      const current = getCurrentSession();
      const sid = sessionId || current?._id;
      
      if (sid) {
        await authService.logout(sid);
      }
      
      clearCurrentSession();
      return success(undefined);
    } catch (error) {
      logger.error('Logout error:', error);
      return handleError(error);
    }
  });

  // Get Session
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_SESSION, async (_event, sessionId?: string) => {
    try {
      let session: AuthSession | null = null;
      
      if (sessionId) {
        session = await authService.getSession(sessionId);
        if (session) {
          setCurrentSession(session._id, session);
        }
      } else {
        session = getCurrentSession();
      }
      
      return success(session);
    } catch (error) {
      logger.error('Get session error:', error);
      return handleError(error);
    }
  });

  logger.debug('Auth handlers registered');
}
