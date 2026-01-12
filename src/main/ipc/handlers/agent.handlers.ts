
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { agentRepository, auditLogRepository } from '../../database/repositories';
import { createAgentSchema, updateAgentSchema } from '../../../shared/schemas';
import { handleError, success, createError } from '../../core/error-handler';
import { ERROR_CODES } from '../../../shared/constants';
import { getCurrentSession, authService } from '../../services/auth';
import { logger } from '../../core/logger';

function requireAdmin() {
  const session = getCurrentSession();
  if (!session) {
    throw createError(ERROR_CODES.AUTH_UNAUTHORIZED);
  }
  if (session.role !== 'admin') {
    throw createError(ERROR_CODES.AUTH_FORBIDDEN, 'Only admins can perform this action');
  }
  return session;
}

export function registerAgentHandlers(): void {
  // List agents
  ipcMain.handle(IPC_CHANNELS.AGENT_LIST, async (_event, params) => {
    try {
      // Allow any role to list agents in their company (e.g. for assigning tasks), 
      // but if strictly only admin should see this list, we can use requireAdmin().
      // The requirement says "crud operation... so that the admin agent... can add or update or read or delete".
      // I'll stick to requireAdmin for CRUD, but maybe Relax read? 
      // Safe bet: requireAdmin for everything as per "only admin role can do this".
      const session = requireAdmin();
      const result = await agentRepository.findByCompany(session.companyId);
      
      // Manual pagination if repository doesn't support it yet (repo returns all)
      // For now just return the list wrapped in paginated structure or just list
      // contracts say PaginatedResult, but existing repo returns array.
      // Let's wrap it simple for now or strictly follow contract.
      // Contract: list: { request: PaginationParams; response: PaginatedResult<AgentPublic>; };
      // Repo: findByCompany returning AgentPublic[]
      
      const page = params?.page || 1;
      const limit = params?.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      
      const paginatedItems = result.slice(startIndex, endIndex);
      
      return success({
        items: paginatedItems,
        total: result.length,
        page,
        limit,
        totalPages: Math.ceil(result.length / limit)
      });
    } catch (error) {
      logger.error('List agents error:', error);
      return handleError(error);
    }
  });

  // Get agent
  ipcMain.handle(IPC_CHANNELS.AGENT_GET, async (_event, { id }) => {
    try {
      const session = requireAdmin();
      const agent = await agentRepository.findByIdPublic(id);
      
      if (!agent) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Agent not found');
      }

      if (agent.companyId !== session.companyId) {
        throw createError(ERROR_CODES.AUTH_FORBIDDEN);
      }

      return success(agent);
    } catch (error) {
      logger.error('Get agent error:', error);
      return handleError(error);
    }
  });

  // Create agent
  ipcMain.handle(IPC_CHANNELS.AGENT_CREATE, async (_event, data) => {
    try {
      const session = requireAdmin();
      
      // Override companyId to ensure security
      const input = { ...data, companyId: session.companyId };
      
      // Validate
      const validated = createAgentSchema.parse(input);
      
      // Hash password
      const passwordHash = await authService.hashPassword(validated.password);

      const agent = await agentRepository.create({
        ...validated,
        passwordHash
      });
      
      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'AGENT_CREATED',
        'agent',
        agent._id,
        { name: agent.name, email: agent.email }
      );

      // Return public version (without hash)
      const { passwordHash: _, ...publicAgent } = agent;
      return success(publicAgent);
    } catch (error) {
      logger.error('Create agent error:', error);
      return handleError(error);
    }
  });

  // Update agent
  ipcMain.handle(IPC_CHANNELS.AGENT_UPDATE, async (_event, { id, data }) => {
    try {
      const session = requireAdmin();
      
      // Verify ownership
      const existing = await agentRepository.findById(id);
      if (!existing || existing.companyId !== session.companyId) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Agent not found');
      }

      const validated = updateAgentSchema.parse(data);
      
      const updateData: any = { ...validated };
      if (validated.password) {
        updateData.passwordHash = await authService.hashPassword(validated.password);
        delete updateData.password;
      }

      const updated = await agentRepository.update(id, updateData);
      
      if (!updated) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'AGENT_UPDATED',
        'agent',
        updated._id
      );

      const { passwordHash: _, ...publicAgent } = updated;
      return success(publicAgent);
    } catch (error) {
      logger.error('Update agent error:', error);
      return handleError(error);
    }
  });

  // Delete agent
  ipcMain.handle(IPC_CHANNELS.AGENT_DELETE, async (_event, { id }) => {
    try {
      const session = requireAdmin();

      // Prevent self-deletion
      if (id === session.agentId) {
        throw createError(ERROR_CODES.OPERATION_FAILED, 'Cannot delete your own account');
      }

      // Verify ownership
      const existing = await agentRepository.findById(id);
      if (!existing || existing.companyId !== session.companyId) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Agent not found');
      }
      
      const deleted = await agentRepository.delete(id);
      
      if (!deleted) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'AGENT_DELETED',
        'agent',
        id
      );

      return success(undefined);
    } catch (error) {
      logger.error('Delete agent error:', error);
      return handleError(error);
    }
  });

  logger.debug('Agent handlers registered');
}
