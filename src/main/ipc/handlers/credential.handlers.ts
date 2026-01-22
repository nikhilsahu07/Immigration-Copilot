import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS, ERROR_CODES } from '../../../shared/constants';
import { credentialRepository } from '../../database/repositories/credential.repository';
import { getCurrentSession } from '../../services/auth';
import { createError } from '../../core/error-handler';
import { logger } from '../../core/logger';

function requireAuth() {
  const session = getCurrentSession();
  if (!session) {
    throw createError(ERROR_CODES.AUTH_UNAUTHORIZED);
  }
  return session;
}

// Validation schemas
const createCredentialSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  apiKey: z.string().min(1, 'API key is required'),
  isActive: z.boolean().optional(),
});

const updateCredentialSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export function registerCredentialHandlers(): void {
  // List all credentials
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_LIST, async () => {
    try {
      const session = requireAuth();
      const credentials = await credentialRepository.findAll(session.companyId);
      
      return {
        success: true,
        data: credentials,
      };
    } catch (error) {
      logger.error('Failed to list credentials:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list credentials',
      };
    }
  });

  // Get single credential
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_GET, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const credential = await credentialRepository.findById(id, session.companyId);
      
      if (!credential) {
        throw createError(ERROR_CODES.NOT_FOUND, 'Credential not found');
      }

      return {
        success: true,
        data: credential,
      };
    } catch (error) {
      logger.error('Failed to get credential:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get credential',
      };
    }
  });

  // Get active credential
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_GET_ACTIVE, async () => {
    try {
      const session = requireAuth();
      const credential = await credentialRepository.findActive(session.companyId);
      
      return {
        success: true,
        data: credential,
      };
    } catch (error) {
      logger.error('Failed to get active credential:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get active credential',
      };
    }
  });

  // Create credential
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_CREATE, async (_event, data) => {
    try {
      const session = requireAuth();
      const validated = createCredentialSchema.parse(data);
      
      const credential = await credentialRepository.create(session.companyId, validated);
      
      logger.info(`Credential created: ${credential._id} by agent: ${session.agentId}`);
      
      return {
        success: true,
        data: credential,
      };
    } catch (error) {
      logger.error('Failed to create credential:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create credential',
      };
    }
  });

  // Update credential
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_UPDATE, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      const validated = updateCredentialSchema.parse(data);
      
      const credential = await credentialRepository.update(id, session.companyId, validated);
      
      if (!credential) {
        throw createError(ERROR_CODES.NOT_FOUND, 'Credential not found');
      }

      logger.info(`Credential updated: ${id} by agent: ${session.agentId}`);
      
      return {
        success: true,
        data: credential,
      };
    } catch (error) {
      logger.error('Failed to update credential:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update credential',
      };
    }
  });

  // Delete credential
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_DELETE, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const deleted = await credentialRepository.delete(id, session.companyId);
      
      if (!deleted) {
        throw createError(ERROR_CODES.NOT_FOUND, 'Credential not found');
      }

      logger.info(`Credential deleted: ${id} by agent: ${session.agentId}`);
      
      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      logger.error('Failed to delete credential:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete credential',
      };
    }
  });
}
