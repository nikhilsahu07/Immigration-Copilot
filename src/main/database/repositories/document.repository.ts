import { Collection, ObjectId, Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Document, CreateDocumentInput } from '../../../shared/types';
import { logger } from '../../core/logger';

export class DocumentRepository {
  private get collection(): Collection<Document> {
    return getDatabase().collection(COLLECTIONS.DOCUMENTS);
  }

  async create(companyId: string, agentId: string, input: CreateDocumentInput & { s3Key: string; s3Url: string; customName?: string }): Promise<Document> {
    const now = new Date();
    const document: Omit<Document, '_id'> = {
      companyId,
      uploadedBy: agentId,
      clientId: input.clientId,
      filename: input.filename,
      originalName: input.customName || input.originalName,
      s3Key: input.s3Key,
      s3Url: input.s3Url,
      fileType: input.fileType,
      documentType: input.documentType,
      fileSize: input.fileSize,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(document as Document);
    logger.info(`Document created: ${result.insertedId}`);
    
    return { ...document, _id: result.insertedId.toString() } as Document;
  }

  async findById(id: string, companyId: string): Promise<Document | null> {
    const doc = await this.collection.findOne({ 
      _id: new ObjectId(id),
      companyId 
    } as Filter<Document>);

    if (doc) {
      return { ...doc, _id: doc._id.toString() } as Document;
    }
    return null;
  }

  async findByClient(clientId: string, companyId: string): Promise<Document[]> {
    const docs = await this.collection
      .find({ clientId, companyId } as Filter<Document>)
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(d => ({ ...d, _id: d._id.toString() } as Document));
  }

  async findByIds(ids: string[], companyId: string): Promise<Document[]> {
    const objectIds = ids.map(id => new ObjectId(id));
    const docs = await this.collection
      .find({ 
        _id: { $in: objectIds },
        companyId 
      } as Filter<Document>)
      .toArray();

    return docs.map(d => ({ ...d, _id: d._id.toString() } as Document));
  }

  async updateExtractedText(id: string, extractedText: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as Filter<Document>,
      { $set: { extractedText, updatedAt: new Date() } }
    );
  }

  async delete(id: string, companyId: string): Promise<Document | null> {
    const doc = await this.collection.findOneAndDelete({ 
      _id: new ObjectId(id), 
      companyId 
    } as Filter<Document>);
    
    if (doc) {
      logger.info(`Document deleted: ${id}`);
      return { ...doc, _id: doc._id.toString() } as Document;
    }
    return null;
  }

  async deleteByClient(clientId: string, companyId: string): Promise<number> {
    const result = await this.collection.deleteMany({ 
      clientId, 
      companyId 
    } as Filter<Document>);
    
    logger.info(`Deleted ${result.deletedCount} documents for client ${clientId}`);
    return result.deletedCount;
  }

  async countByClient(clientId: string): Promise<number> {
    return this.collection.countDocuments({ clientId } as Filter<Document>);
  }

  async countByCompany(companyId: string): Promise<number> {
    return this.collection.countDocuments({ companyId } as Filter<Document>);
  }
}

export const documentRepository = new DocumentRepository();
