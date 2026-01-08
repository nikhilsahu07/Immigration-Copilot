import { Collection, ObjectId, Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { logger } from '../../core/logger';

export interface AuditLog {
  _id: string;
  companyId: string;
  agentId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export type AuditAction = 
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_DELETED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'EXTRACTION_CREATED'
  | 'EXTRACTION_UPDATED'
  | 'EXTRACTION_APPROVED'
  | 'EXTRACTION_REJECTED'
  | 'EXTRACTION_DELETED'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'PORTAL_CREATED'
  | 'PORTAL_UPDATED'
  | 'PORTAL_DELETED'
  | 'AGENT_CREATED'
  | 'AGENT_UPDATED'
  | 'AGENT_DELETED'
  | 'LOGIN'
  | 'LOGOUT';

export class AuditLogRepository {
  private get collection(): Collection<AuditLog> {
    return getDatabase().collection(COLLECTIONS.AUDIT_LOGS);
  }

  async log(
    companyId: string,
    agentId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const auditLog: Omit<AuditLog, '_id'> = {
      companyId,
      agentId,
      action,
      resourceType,
      resourceId,
      details,
      createdAt: new Date(),
    };

    await this.collection.insertOne(auditLog as AuditLog);
    logger.debug(`Audit log: ${action} on ${resourceType}:${resourceId}`);
  }

  async findByCompany(
    companyId: string, 
    options: {
      page?: number;
      pageSize?: number;
      action?: AuditAction;
      agentId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const { page = 1, pageSize = 50, action, agentId, startDate, endDate } = options;
    
    const filter: Filter<AuditLog> = { companyId };
    
    if (action) filter.action = action;
    if (agentId) filter.agentId = agentId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      this.collection.countDocuments(filter)
    ]);

    return {
      logs: logs.map(l => ({ ...l, _id: l._id.toString() })),
      total,
    };
  }
}

export const auditLogRepository = new AuditLogRepository();
