import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Credential, CreateCredentialInput, UpdateCredentialInput, DEFAULT_GEMINI_MODEL } from '../../../shared/types';
import { logger } from '../../core/logger';

export class CredentialRepository {
  private get collection(): Collection<Credential> {
    return getDatabase().collection(COLLECTIONS.CREDENTIALS);
  }

  async create(companyId: string, input: CreateCredentialInput): Promise<Credential> {
    const now = new Date();
    
    // If this is set as active, deactivate all other credentials for this company
    if (input.isActive) {
      await this.collection.updateMany(
        { companyId, isActive: true },
        { $set: { isActive: false, updatedAt: now } }
      );
    }

    const credential: Omit<Credential, '_id'> = {
      companyId,
      title: input.title,
      apiKey: input.apiKey,
      modelName: input.modelName ?? DEFAULT_GEMINI_MODEL,
      isActive: input.isActive ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(credential as Credential);
    logger.info(`Credential created: ${result.insertedId} for company: ${companyId}`);
    
    return { ...credential, _id: result.insertedId.toString() } as Credential;
  }

  async findAll(companyId: string): Promise<Credential[]> {
    const credentials = await this.collection
      .find({ companyId })
      .sort({ createdAt: -1 })
      .toArray();
    
    return credentials.map(c => ({ ...c, _id: c._id.toString() } as Credential));
  }

  async findById(id: string, companyId: string): Promise<Credential | null> {
    const credential = await this.collection.findOne({ 
      _id: new ObjectId(id),
      companyId 
    } as any);
    
    if (credential) {
      return { ...credential, _id: credential._id.toString() } as Credential;
    }
    return null;
  }

  async findActive(companyId: string): Promise<Credential | null> {
    const credential = await this.collection.findOne({ 
      companyId,
      isActive: true 
    });
    
    if (credential) {
      return { ...credential, _id: credential._id.toString() } as Credential;
    }
    return null;
  }

  async update(id: string, companyId: string, input: UpdateCredentialInput): Promise<Credential | null> {
    // If setting this as active, deactivate all others
    if (input.isActive) {
      await this.collection.updateMany(
        { companyId, _id: { $ne: new ObjectId(id) } },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), companyId } as Filter<Credential>,
      { 
        $set: { 
          ...input, 
          updatedAt: new Date() 
        } 
      } as UpdateFilter<Credential>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Credential updated: ${id}`);
      return { ...result, _id: result._id.toString() } as Credential;
    }
    return null;
  }

  async delete(id: string, companyId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ 
      _id: new ObjectId(id),
      companyId 
    } as any);
    
    if (result.deletedCount > 0) {
      logger.info(`Credential deleted: ${id}`);
      return true;
    }
    return false;
  }
}

export const credentialRepository = new CredentialRepository();
