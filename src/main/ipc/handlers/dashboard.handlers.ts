import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { clientRepository, portalRepository, extractionRepository, auditLogRepository } from '../../database/repositories';
import { automationJobRepository } from '../../database/repositories';
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

export interface DashboardStats {
  totalClients: number;
  pendingExtractions: number;
  completedJobs: number;
  activePortals: number;
}

export interface ActivityItem {
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

export function registerDashboardHandlers(): void {
  // Get dashboard stats
  ipcMain.handle(IPC_CHANNELS.DASHBOARD_STATS, async () => {
    try {
      const session = requireAuth();
      
      // Fetch all counts in parallel
      const [
        totalClients,
        extractionCounts,
        jobCounts,
        activePortals,
      ] = await Promise.all([
        clientRepository.countByCompany(session.companyId),
        extractionRepository.countByStatus(session.companyId),
        automationJobRepository.countByStatus(session.companyId),
        portalRepository.countByCompany(session.companyId),
      ]);

      const stats: DashboardStats = {
        totalClients,
        pendingExtractions: extractionCounts.pending || 0,
        completedJobs: jobCounts.completed || 0,
        activePortals,
      };

      return success(stats);
    } catch (error) {
      logger.error('Dashboard stats error:', error);
      return handleError(error);
    }
  });

  // Get recent activity
  ipcMain.handle(IPC_CHANNELS.DASHBOARD_ACTIVITY, async (_event, { limit = 10 } = {}) => {
    try {
      const session = requireAuth();
      
      const { logs } = await auditLogRepository.findByCompany(session.companyId, {
        page: 1,
        pageSize: limit,
      });

      // Map audit logs to activity items with more readable format
      const activities: ActivityItem[] = logs.map(log => ({
        action: formatAction(log.action),
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        details: log.details,
        createdAt: log.createdAt,
      }));

      return success(activities);
    } catch (error) {
      logger.error('Dashboard activity error:', error);
      return handleError(error);
    }
  });

  logger.debug('Dashboard handlers registered');
}

function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'CLIENT_CREATED': 'New client added',
    'CLIENT_UPDATED': 'Client updated',
    'CLIENT_DELETED': 'Client deleted',
    'DOCUMENT_UPLOADED': 'Document uploaded',
    'DOCUMENT_DELETED': 'Document deleted',
    'EXTRACTION_CREATED': 'Data extraction started',
    'EXTRACTION_APPROVED': 'Extraction approved',
    'EXTRACTION_REJECTED': 'Extraction rejected',
    'JOB_STARTED': 'Automation started',
    'JOB_COMPLETED': 'Automation completed',
    'JOB_FAILED': 'Automation failed',
    'PORTAL_CREATED': 'Portal added',
    'PORTAL_UPDATED': 'Portal updated',
    'PORTAL_DELETED': 'Portal deleted',
    'LOGIN': 'Agent logged in',
    'LOGOUT': 'Agent logged out',
  };
  return actionMap[action] || action;
}
