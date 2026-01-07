import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Extraction, CreateExtractionInput, ExtractedData, ExtractionStatus } from '../../../shared/types';
import { logger } from '../../core/logger';

export class ExtractionRepository {
  private get collection(): Collection<Extraction> {
    return getDatabase().collection(COLLECTIONS.EXTRACTIONS);
  }

  async create(
    companyId: string, 
    agentId: string, 
    input: CreateExtractionInput,
    extractedData: ExtractedData,
    processingTime?: number,
    tokenCount?: number
  ): Promise<Extraction> {
    const now = new Date();
    const extraction: Omit<Extraction, '_id'> = {
      companyId,
      createdBy: agentId,
      clientId: input.clientId,
      documentIds: input.documentIds,
      extractedData,
      customPrompt: input.customPrompt,
      status: 'pending',
      processingTime,
      tokenCount,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(extraction as Extraction);
    logger.info(`Extraction created: ${result.insertedId}`);
    
    return { ...extraction, _id: result.insertedId.toString() } as Extraction;
  }

  async findById(id: string, companyId: string): Promise<Extraction | null> {
    const extraction = await this.collection.findOne({ 
      _id: new ObjectId(id),
      companyId 
    } as Filter<Extraction>);

    if (extraction) {
      return { ...extraction, _id: extraction._id.toString() } as Extraction;
    }
    return null;
  }

  async findByClient(clientId: string, companyId: string): Promise<Extraction[]> {
    const extractions = await this.collection
      .find({ clientId, companyId } as Filter<Extraction>)
      .sort({ createdAt: -1 })
      .toArray();

    return extractions.map(e => ({ ...e, _id: e._id.toString() } as Extraction));
  }

  async findApprovedByClient(clientId: string, companyId: string): Promise<Extraction | null> {
    const extraction = await this.collection.findOne({ 
      clientId, 
      companyId,
      status: 'approved'
    } as Filter<Extraction>);

    if (extraction) {
      return { ...extraction, _id: extraction._id.toString() } as Extraction;
    }
    return null;
  }

  async findLatestByClient(clientId: string, companyId: string): Promise<Extraction | null> {
    const extraction = await this.collection
      .find({ clientId, companyId } as Filter<Extraction>)
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (extraction.length > 0) {
      return { ...extraction[0], _id: extraction[0]._id.toString() } as Extraction;
    }
    return null;
  }

  async approve(id: string, companyId: string, agentId: string, extractedData?: ExtractedData): Promise<Extraction | null> {
    const updateData: Record<string, unknown> = {
      status: 'approved' as ExtractionStatus,
      approvedAt: new Date(),
      approvedBy: agentId,
      updatedAt: new Date(),
    };

    if (extractedData) {
      updateData.extractedData = extractedData;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as Filter<Extraction>,
      { $set: updateData } as UpdateFilter<Extraction>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Extraction approved: ${id}`);
      return { ...result, _id: result._id.toString() } as Extraction;
    }
    return null;
  }

  async reject(id: string, companyId: string, rejectionReason: string): Promise<Extraction | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as Filter<Extraction>,
      { 
        $set: { 
          status: 'rejected' as ExtractionStatus,
          rejectionReason,
          updatedAt: new Date()
        } 
      } as UpdateFilter<Extraction>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Extraction rejected: ${id}`);
      return { ...result, _id: result._id.toString() } as Extraction;
    }
    return null;
  }

  async delete(id: string, companyId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ 
      _id: new ObjectId(id), 
      companyId 
    } as Filter<Extraction>);
    
    if (result.deletedCount > 0) {
      logger.info(`Extraction deleted: ${id}`);
      return true;
    }
    return false;
  }

  async countByStatus(companyId: string): Promise<Record<ExtractionStatus, number>> {
    const result = await this.collection.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    const counts: Record<ExtractionStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    result.forEach(({ _id, count }) => {
      counts[_id as ExtractionStatus] = count;
    });

    return counts;
  }
}

export const extractionRepository = new ExtractionRepository();
