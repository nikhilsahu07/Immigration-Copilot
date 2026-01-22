
import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { AutomationJob, AutomationCheckpoint, CreateJobInput, JobStatus, PauseReason, PageProcessed, PaginationParams, PaginatedResult } from '../../../shared/types';
import { logger } from '../../core/logger';

export class AutomationJobRepository {
  private get collection(): Collection<AutomationJob> {
    return getDatabase().collection(COLLECTIONS.AUTOMATION_JOBS);
  }

  async create(companyId: string, agentId: string, input: CreateJobInput): Promise<AutomationJob> {
    const now = new Date();
    const job: Omit<AutomationJob, '_id'> = {
      companyId,
      createdBy: agentId,
      clientId: input.clientId,
      portalId: input.portalId,
      extractionId: input.extractionId,
      customPrompt: input.customPrompt,
      attachScreenshots: input.attachScreenshots,
      modelName: input.modelName,
      status: 'queued',
      currentPage: 0,
      totalPages: 0,
      pagesProcessed: [],
      fieldsFilledCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(job as AutomationJob);
    logger.info(`Automation job created: ${result.insertedId}`);
    
    return { ...job, _id: result.insertedId.toString() } as AutomationJob;
  }

  async findById(id: string): Promise<AutomationJob | null> {
    const job = await this.collection.findOne({ 
      _id: new ObjectId(id)
    } as any);

    if (job) {
      return { ...job, _id: job._id.toString() } as AutomationJob;
    }
    return null;
  }

  async findByCompany(companyId: string, params: PaginationParams): Promise<PaginatedResult<AutomationJob>> {
    const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    
    const filter: Filter<AutomationJob> = { companyId };
    const total = await this.collection.countDocuments(filter);
    
    const jobs = await this.collection
      .find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      data: jobs.map(j => ({ ...j, _id: j._id.toString() } as AutomationJob)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findRunningByCompany(companyId: string): Promise<AutomationJob | null> {
    const job = await this.collection.findOne({ 
      companyId,
      status: { $in: ['running', 'paused'] }
    } as any);

    if (job) {
      return { ...job, _id: job._id.toString() } as AutomationJob;
    }
    return null;
  }

  async updateStatus(id: string, status: JobStatus, pauseReason?: PauseReason): Promise<AutomationJob | null> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'running' && !await this.findById(id)?.then(j => j?.startedAt)) {
      updateData.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      const job = await this.findById(id);
      if (job?.startedAt) {
        updateData.completedAt = new Date();
        updateData.duration = new Date().getTime() - new Date(job.startedAt).getTime();
      }
    }

    if (pauseReason) {
      updateData.pauseReason = pauseReason;
    } else if (status !== 'paused') {
      updateData.pauseReason = null;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) } as any,
      { $set: updateData } as UpdateFilter<AutomationJob>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Job status updated: ${id} -> ${status}`);
      return { ...result, _id: result._id.toString() } as AutomationJob;
    }
    return null;
  }

  async addPageProcessed(id: string, page: PageProcessed): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { 
        $push: { pagesProcessed: page },
        $inc: { currentPage: 1, fieldsFilledCount: page.fieldsCount },
        $set: { updatedAt: new Date() }
      } as UpdateFilter<AutomationJob>
    );
  }

  async setTotalPages(id: string, totalPages: number): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { totalPages, updatedAt: new Date() } } as UpdateFilter<AutomationJob>
    );
  }

  async updateCurrentUrl(id: string, url: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { currentUrl: url, updatedAt: new Date() } } as UpdateFilter<AutomationJob>
    );
  }

  /**
   * Persist a checkpoint snapshot for pause/resume.
   */
  async saveCheckpoint(id: string, checkpoint: AutomationCheckpoint): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { checkpoint, updatedAt: new Date() } } as UpdateFilter<AutomationJob>
    );
    logger.info(`Automation checkpoint saved for job ${id} at step ${checkpoint.step}`);
  }

  /**
   * Read the latest checkpoint snapshot for a job.
   */
  async getCheckpoint(id: string): Promise<AutomationCheckpoint | null> {
    const job = await this.findById(id);
    return job?.checkpoint ?? null;
  }

  /**
   * Clear any stored checkpoint for a job.
   */
  async clearCheckpoint(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $unset: { checkpoint: '' }, $set: { updatedAt: new Date() } } as unknown as UpdateFilter<AutomationJob>
    );
    logger.info(`Automation checkpoint cleared for job ${id}`);
  }

  async setError(id: string, errorLog: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { 
        $set: { 
          status: 'failed' as JobStatus,
          errorLog,
          completedAt: new Date(),
          updatedAt: new Date()
        } 
      } as UpdateFilter<AutomationJob>
    );
  }

  async countByStatus(companyId: string): Promise<Record<JobStatus, number>> {
    const result = await this.collection.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    const counts: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
    };

    result.forEach(({ _id, count }) => {
      counts[_id as JobStatus] = count;
    });

    return counts;
  }
  async update(id: string, companyId: string, input: Partial<AutomationJob>): Promise<AutomationJob | null> {
    const updateData: Partial<AutomationJob> = { ...input, updatedAt: new Date() };
    // Remove _id if present to avoid Mongo error
    delete (updateData as Partial<AutomationJob> & { _id?: unknown })._id;

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as any,
      { $set: updateData } as UpdateFilter<AutomationJob>,
      { returnDocument: 'after' }
    );

    if (result) {
      return { ...result, _id: result._id.toString() } as AutomationJob;
    }
    return null;
  }
}

export const automationJobRepository = new AutomationJobRepository();
