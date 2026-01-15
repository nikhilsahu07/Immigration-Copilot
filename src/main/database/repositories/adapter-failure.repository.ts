import { ObjectId } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { logger } from '../../core/logger';
import type { 
  AIAutomationFailure, 
  CustomAdapterFailure,
  CreateAIFailureInput,
  CreateCustomAdapterFailureInput
} from '../../../shared/types';

/**
 * Repository for tracking automation failures.
 * Logs both AI automation failures and custom adapter failures.
 */
class AdapterFailureRepository {
  private get aiFailuresCollection() {
    return getDatabase().collection<AIAutomationFailure>(COLLECTIONS.AI_AUTOMATION_FAILURES);
  }

  private get customFailuresCollection() {
    return getDatabase().collection<CustomAdapterFailure>(COLLECTIONS.CUSTOM_ADAPTER_FAILURES);
  }

  //   
  // AI Automation Failures
  //   

  /**
   * Log an AI automation failure (navigation, form fill, selector issues, etc.)
   */
  async logAIFailure(
    companyId: string,
    agentId: string,
    input: CreateAIFailureInput
  ): Promise<string> {
    try {
      const failure: Omit<AIAutomationFailure, '_id'> = {
        companyId,
        createdBy: agentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input,
        // Truncate HTML to avoid massive documents
        pageHtml: input.pageHtml ? input.pageHtml.substring(0, 50000) : undefined,
      };

      const result = await this.aiFailuresCollection.insertOne(failure as AIAutomationFailure);
      logger.info(`AI automation failure logged: ${result.insertedId}`, {
        jobId: input.jobId,
        portalId: input.portalId,
        failureType: input.failureType,
      });

      return result.insertedId.toString();
    } catch (error) {
      logger.error('Failed to log AI automation failure:', error);
      throw error;
    }
  }

  /**
   * Get recent AI failures for a portal (for debugging/monitoring)
   */
  async getRecentAIFailures(portalId: string, limit: number = 10): Promise<AIAutomationFailure[]> {
    return this.aiFailuresCollection
      .find({ portalId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get AI failures for a specific job
   */
  async getAIFailuresByJob(jobId: string): Promise<AIAutomationFailure[]> {
    return this.aiFailuresCollection
      .find({ jobId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  // Custom Adapter Failures

  /**
   * Log a custom adapter failure (selector not found, element changed, etc.)
   */
  async logCustomAdapterFailure(
    companyId: string,
    agentId: string,
    input: CreateCustomAdapterFailureInput
  ): Promise<string> {
    try {
      const failure: Omit<CustomAdapterFailure, '_id'> = {
        companyId,
        createdBy: agentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input,
      };

      const result = await this.customFailuresCollection.insertOne(failure as CustomAdapterFailure);
      logger.info(`Custom adapter failure logged: ${result.insertedId}`, {
        jobId: input.jobId,
        portalId: input.portalId,
        adapterSlug: input.adapterSlug,
        failureType: input.failureType,
        fellBackToAI: input.fellBackToAI,
      });

      return result.insertedId.toString();
    } catch (error) {
      logger.error('Failed to log custom adapter failure:', error);
      throw error;
    }
  }

  /**
   * Get recent custom adapter failures for a portal (for debugging/monitoring)
   */
  async getRecentCustomAdapterFailures(portalId: string, limit: number = 10): Promise<CustomAdapterFailure[]> {
    return this.customFailuresCollection
      .find({ portalId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get custom adapter failures for a specific adapter
   */
  async getFailuresByAdapter(adapterSlug: string, limit: number = 50): Promise<CustomAdapterFailure[]> {
    return this.customFailuresCollection
      .find({ adapterSlug })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get custom adapter failures for a specific job
   */
  async getCustomAdapterFailuresByJob(jobId: string): Promise<CustomAdapterFailure[]> {
    return this.customFailuresCollection
      .find({ jobId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  //   
  // Combined Queries
  //   

  /**
   * Get all failures for a portal (both AI and custom adapter)
   */
  async getRecentFailures(portalId: string, limit: number = 10): Promise<{
    aiFailures: AIAutomationFailure[];
    customFailures: CustomAdapterFailure[];
  }> {
    const [aiFailures, customFailures] = await Promise.all([
      this.getRecentAIFailures(portalId, limit),
      this.getRecentCustomAdapterFailures(portalId, limit),
    ]);

    return { aiFailures, customFailures };
  }

  /**
   * Mark a failure as resolved
   */
  async markAIFailureResolved(failureId: string): Promise<boolean> {
    const result = await this.aiFailuresCollection.updateOne(
      { _id: new ObjectId(failureId) } as any,
      { $set: { resolvedAt: new Date(), updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Mark a custom adapter failure as resolved
   */
  async markCustomAdapterFailureResolved(failureId: string): Promise<boolean> {
    const result = await this.customFailuresCollection.updateOne(
      { _id: new ObjectId(failureId) } as any,
      { $set: { resolvedAt: new Date(), updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }
}

export const adapterFailureRepository = new AdapterFailureRepository();
