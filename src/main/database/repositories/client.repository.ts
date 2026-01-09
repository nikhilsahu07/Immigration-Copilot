import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Client, CreateClientInput, UpdateClientInput, ClientWithDocumentCount, PaginationParams, PaginatedResult } from '../../../shared/types';
import { logger } from '../../core/logger';

export class ClientRepository {
  private get collection(): Collection<Client> {
    return getDatabase().collection(COLLECTIONS.CLIENTS);
  }

  async create(companyId: string, agentId: string, input: CreateClientInput): Promise<Client> {
    const now = new Date();
    const client: Omit<Client, '_id'> = {
      companyId,
      createdBy: agentId,
      ...input,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(client as Client);
    logger.info(`Client created: ${result.insertedId}`);
    
    return { ...client, _id: result.insertedId.toString() } as Client;
  }

  async findById(id: string, companyId: string): Promise<Client | null> {
    const client = await this.collection.findOne({ 
      _id: new ObjectId(id),
      companyId 
    } as Filter<Client>);

    if (client) {
      return { ...client, _id: client._id.toString() } as Client;
    }
    return null;
  }

  async findByCompany(
    companyId: string, 
    params: PaginationParams & { search?: string; status?: string }
  ): Promise<PaginatedResult<Client>> {
    const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc', search, status } = params;
    
    const filter: Filter<Client> = { companyId };
    
    if (search) {
      filter.$text = { $search: search };
    }
    
    if (status) {
      filter.status = status;
    }

    const total = await this.collection.countDocuments(filter);
    const totalPages = Math.ceil(total / pageSize);
    
    const clients = await this.collection
      .find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      data: clients.map(c => ({ ...c, _id: c._id.toString() } as Client)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findWithDocumentCount(
    companyId: string,
    params: PaginationParams & { search?: string; status?: string }
  ): Promise<PaginatedResult<ClientWithDocumentCount>> {
    const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc', search, status } = params;
    
    const matchStage: Record<string, unknown> = { companyId };
    
    if (search) {
      matchStage.$text = { $search: search };
    }

    if (status) {
      matchStage.status = status;
    }

    const pipeline = [
      { $match: matchStage },
      { $addFields: { clientIdStr: { $toString: '$_id' } } },
      {
        $lookup: {
          from: COLLECTIONS.DOCUMENTS,
          localField: 'clientIdStr',
          foreignField: 'clientId',
          as: 'documents'
        }
      },
      {
        $lookup: {
          from: COLLECTIONS.EXTRACTIONS,
          localField: 'clientIdStr',
          foreignField: 'clientId',
          as: 'extractions'
        }
      },
      {
        $addFields: {
          documentCount: { $size: '$documents' },
          extractionCount: { $size: '$extractions' },
          hasApprovedExtraction: {
            $gt: [
              { $size: { $filter: { input: '$extractions', cond: { $eq: ['$$this.status', 'approved'] } } } },
              0
            ]
          }
        }
      },
      { $project: { documents: 0, extractions: 0 } },
      { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize }
    ];

    const [clients, countResult] = await Promise.all([
      this.collection.aggregate(pipeline).toArray(),
      this.collection.countDocuments(matchStage)
    ]);

    return {
      data: clients.map(c => ({ ...c, _id: c._id.toString() } as ClientWithDocumentCount)),
      total: countResult,
      page,
      pageSize,
      totalPages: Math.ceil(countResult / pageSize),
    };
  }

  async update(id: string, companyId: string, input: UpdateClientInput): Promise<Client | null> {
    const updateData: Record<string, unknown> = { ...input, updatedAt: new Date() };
    
    if (input.dateOfBirth) {
      updateData.dateOfBirth = new Date(input.dateOfBirth);
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as Filter<Client>,
      { $set: updateData } as UpdateFilter<Client>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Client updated: ${id}`);
      return { ...result, _id: result._id.toString() } as Client;
    }
    return null;
  }

  async delete(id: string, companyId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ 
      _id: new ObjectId(id), 
      companyId 
    } as Filter<Client>);
    
    if (result.deletedCount > 0) {
      logger.info(`Client deleted: ${id}`);
      return true;
    }
    return false;
  }

  async countByCompany(companyId: string): Promise<number> {
    return this.collection.countDocuments({ companyId } as Filter<Client>);
  }

  async countByStatus(companyId: string): Promise<Record<string, number>> {
    const result = await this.collection.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    return result.reduce((acc, { _id, count }) => {
      acc[_id as string] = count;
      return acc;
    }, {} as Record<string, number>);
  }
}

export const clientRepository = new ClientRepository();
