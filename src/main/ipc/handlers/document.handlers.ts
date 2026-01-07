import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { documentManager } from '../../storage';
import { auditLogRepository } from '../../database/repositories';
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

export function registerDocumentHandlers(): void {
  // List documents by client
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_LIST, async (_event, { clientId }) => {
    try {
      const session = requireAuth();
      const documents = await documentManager.getDocumentsWithUrls(clientId, session.companyId);
      return success(documents);
    } catch (error) {
      logger.error('List documents error:', error);
      return handleError(error);
    }
  });

  // Upload document
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_UPLOAD, async (_event, data) => {
    try {
      const session = requireAuth();
      const document = await documentManager.uploadDocument(
        session.companyId,
        session.agentId,
        data
      );

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'DOCUMENT_UPLOADED',
        'document',
        document._id,
        { filename: document.originalName, clientId: document.clientId }
      );

      return success(document);
    } catch (error) {
      logger.error('Upload document error:', error);
      return handleError(error);
    }
  });

  // Delete document
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_DELETE, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const deleted = await documentManager.deleteDocument(id, session.companyId);
      
      if (!deleted) {
        throw createError(ERROR_CODES.DOCUMENT_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'DOCUMENT_DELETED',
        'document',
        id
      );

      return success(undefined);
    } catch (error) {
      logger.error('Delete document error:', error);
      return handleError(error);
    }
  });

  // Get presigned URL
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_GET_URL, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const document = await documentManager.getDocumentWithUrl(id, session.companyId);
      
      if (!document) {
        throw createError(ERROR_CODES.DOCUMENT_NOT_FOUND);
      }

      return success({
        url: document.presignedUrl,
        expiresAt: document.urlExpiresAt,
      });
    } catch (error) {
      logger.error('Get document URL error:', error);
      return handleError(error);
    }
  });

  logger.debug('Document handlers registered');
}
