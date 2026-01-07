import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { clientRepository, auditLogRepository } from '../../database/repositories';
import { createClientSchema, updateClientSchema } from '../../../shared/schemas';
import { handleError, success, createError } from '../../core/error-handler';
import { ERROR_CODES } from '../../../shared/constants';
import { getCurrentSession } from '../../services/auth';
import { logger } from '../../core/logger';

function requireAuth() {
  const session = getCurrentSession();
  if (!session) {
    throw createError(ERROR_CODES.AUTH_UNAUTHORIZED);
  }
  return session;
}

export function registerClientHandlers(): void {
  // List clients
  ipcMain.handle(IPC_CHANNELS.CLIENT_LIST, async (_event, params) => {
    try {
      const session = requireAuth();
      const result = await clientRepository.findWithDocumentCount(session.companyId, params || {});
      return success(result);
    } catch (error) {
      logger.error('List clients error:', error);
      return handleError(error);
    }
  });

  // Get client
  ipcMain.handle(IPC_CHANNELS.CLIENT_GET, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const client = await clientRepository.findById(id, session.companyId);
      if (!client) {
        throw createError(ERROR_CODES.CLIENT_NOT_FOUND);
      }
      return success(client);
    } catch (error) {
      logger.error('Get client error:', error);
      return handleError(error);
    }
  });

  // Create client
  ipcMain.handle(IPC_CHANNELS.CLIENT_CREATE, async (_event, data) => {
    try {
      const session = requireAuth();
      const validated = createClientSchema.parse(data);
      const client = await clientRepository.create(session.companyId, session.agentId, validated);
      
      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'CLIENT_CREATED',
        'client',
        client._id,
        { name: client.name }
      );

      return success(client);
    } catch (error) {
      logger.error('Create client error:', error);
      return handleError(error);
    }
  });

  // Update client
  ipcMain.handle(IPC_CHANNELS.CLIENT_UPDATE, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      const validated = updateClientSchema.parse(data);
      const client = await clientRepository.update(id, session.companyId, validated);
      
      if (!client) {
        throw createError(ERROR_CODES.CLIENT_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'CLIENT_UPDATED',
        'client',
        client._id
      );

      return success(client);
    } catch (error) {
      logger.error('Update client error:', error);
      return handleError(error);
    }
  });

  // Delete client
  ipcMain.handle(IPC_CHANNELS.CLIENT_DELETE, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const deleted = await clientRepository.delete(id, session.companyId);
      
      if (!deleted) {
        throw createError(ERROR_CODES.CLIENT_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'CLIENT_DELETED',
        'client',
        id
      );

      return success(undefined);
    } catch (error) {
      logger.error('Delete client error:', error);
      return handleError(error);
    }
  });

  logger.debug('Client handlers registered');
}
