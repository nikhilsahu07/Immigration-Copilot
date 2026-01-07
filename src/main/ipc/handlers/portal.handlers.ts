import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { portalRepository, auditLogRepository } from '../../database/repositories';
import { createPortalSchema, updatePortalSchema } from '../../../shared/schemas';
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

export function registerPortalHandlers(): void {
  // List portals
  ipcMain.handle(IPC_CHANNELS.PORTAL_LIST, async () => {
    try {
      const session = requireAuth();
      const portals = await portalRepository.findByCompany(session.companyId);
      return success(portals);
    } catch (error) {
      logger.error('List portals error:', error);
      return handleError(error);
    }
  });

  // Get portal
  ipcMain.handle(IPC_CHANNELS.PORTAL_GET, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const portal = await portalRepository.findById(id, session.companyId);
      if (!portal) {
        throw createError(ERROR_CODES.PORTAL_NOT_FOUND);
      }
      return success(portal);
    } catch (error) {
      logger.error('Get portal error:', error);
      return handleError(error);
    }
  });

  // Create portal
  ipcMain.handle(IPC_CHANNELS.PORTAL_CREATE, async (_event, data) => {
    try {
      const session = requireAuth();
      const validated = createPortalSchema.parse(data);
      const portal = await portalRepository.create(session.companyId, session.agentId, validated);
      
      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'PORTAL_CREATED',
        'portal',
        portal._id,
        { name: portal.name, url: portal.url }
      );

      return success(portal);
    } catch (error) {
      logger.error('Create portal error:', error);
      return handleError(error);
    }
  });

  // Update portal
  ipcMain.handle(IPC_CHANNELS.PORTAL_UPDATE, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      const validated = updatePortalSchema.parse(data);
      const portal = await portalRepository.update(id, session.companyId, validated);
      
      if (!portal) {
        throw createError(ERROR_CODES.PORTAL_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'PORTAL_UPDATED',
        'portal',
        portal._id
      );

      return success(portal);
    } catch (error) {
      logger.error('Update portal error:', error);
      return handleError(error);
    }
  });

  // Delete portal
  ipcMain.handle(IPC_CHANNELS.PORTAL_DELETE, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const deleted = await portalRepository.delete(id, session.companyId);
      
      if (!deleted) {
        throw createError(ERROR_CODES.PORTAL_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'PORTAL_DELETED',
        'portal',
        id
      );

      return success(undefined);
    } catch (error) {
      logger.error('Delete portal error:', error);
      return handleError(error);
    }
  });

  logger.debug('Portal handlers registered');
}
