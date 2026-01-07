import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Portal, CreatePortalInput, UpdatePortalInput } from '../../../shared/types';
import { logger } from '../../core/logger';

export class PortalRepository {
  private get collection(): Collection<Portal> {
    return getDatabase().collection(COLLECTIONS.PORTALS);
  }

  async create(companyId: string, agentId: string, input: CreatePortalInput): Promise<Portal> {
    const now = new Date();
    const portal: Omit<Portal, '_id'> = {
      companyId,
      createdBy: agentId,
      name: input.name,
      url: input.url,
      country: input.country,
      description: input.description,
      category: input.category,
      metadata: input.metadata,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(portal as Portal);
    logger.info(`Portal created: ${result.insertedId}`);
    
    return { ...portal, _id: result.insertedId.toString() } as Portal;
  }

  async findById(id: string, companyId: string): Promise<Portal | null> {
    const portal = await this.collection.findOne({ 
      _id: new ObjectId(id),
      companyId 
    } as Filter<Portal>);

    if (portal) {
      return { ...portal, _id: portal._id.toString() } as Portal;
    }
    return null;
  }

  async findByCompany(companyId: string, activeOnly: boolean = true): Promise<Portal[]> {
    const filter: Filter<Portal> = { companyId };
    if (activeOnly) {
      filter.isActive = true;
    }

    const portals = await this.collection
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    return portals.map(p => ({ ...p, _id: p._id.toString() } as Portal));
  }

  async update(id: string, companyId: string, input: UpdatePortalInput): Promise<Portal | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as Filter<Portal>,
      { $set: { ...input, updatedAt: new Date() } } as UpdateFilter<Portal>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Portal updated: ${id}`);
      return { ...result, _id: result._id.toString() } as Portal;
    }
    return null;
  }

  async delete(id: string, companyId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ 
      _id: new ObjectId(id), 
      companyId 
    } as Filter<Portal>);
    
    if (result.deletedCount > 0) {
      logger.info(`Portal deleted: ${id}`);
      return true;
    }
    return false;
  }

  async countByCompany(companyId: string): Promise<number> {
    return this.collection.countDocuments({ companyId, isActive: true } as Filter<Portal>);
  }
}

export const portalRepository = new PortalRepository();
