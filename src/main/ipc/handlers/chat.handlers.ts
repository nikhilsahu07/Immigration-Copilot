import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { chatRepository } from '../../database/repositories';
import { getCurrentSession } from '../../services/auth';
import { handleError, success } from '../../core/error-handler';
import { logger } from '../../core/logger';

export function registerChatHandlers(): void {
  // List chats for a client
  ipcMain.handle(IPC_CHANNELS.CHAT_LIST, async (_event, { clientId }) => {
    try {
      const session = getCurrentSession();
      if (!session) {
        return { success: false, error: 'Unauthorized' };
      }
      
      const chats = await chatRepository.findByClient(clientId, session.companyId);
      return success(chats);
    } catch (error) {
      logger.error('List chats error:', error);
      return handleError(error);
    }
  });

  // Create a chat message
  ipcMain.handle(IPC_CHANNELS.CHAT_CREATE, async (_event, data) => {
    try {
      const session = getCurrentSession();
      if (!session) {
        return { success: false, error: 'Unauthorized' };
      }
      
      const chat = await chatRepository.create(session.companyId, session.agentId, data);
      return success(chat);
    } catch (error) {
      logger.error('Create chat error:', error);
      return handleError(error);
    }
  });

  logger.debug('Chat handlers registered');
}
