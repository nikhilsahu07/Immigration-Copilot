import { Collection, Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { logger } from '../../core/logger';

export interface ChatMessage {
  _id: string;
  companyId: string;
  agentId: string;
  clientId: string;
  jobId?: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  pageUrl?: string;
  pageNumber?: number;
  createdAt: Date;
}

export interface CreateChatInput {
  clientId: string;
  jobId?: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  pageUrl?: string;
  pageNumber?: number;
}

class ChatRepository {
  private get collection(): Collection<ChatMessage> {
    return getDatabase().collection(COLLECTIONS.CHATS);
  }

  async create(companyId: string, agentId: string, input: CreateChatInput): Promise<ChatMessage> {
    const now = new Date();
    const message: Omit<ChatMessage, '_id'> = {
      companyId,
      agentId,
      clientId: input.clientId,
      jobId: input.jobId,
      role: input.role,
      content: input.content,
      pageUrl: input.pageUrl,
      pageNumber: input.pageNumber,
      createdAt: now,
    };

    const result = await this.collection.insertOne(message as ChatMessage);
    logger.info(`Chat message created: ${result.insertedId}`);
    
    return { ...message, _id: result.insertedId.toString() } as ChatMessage;
  }

  async findByJob(jobId: string, companyId: string): Promise<ChatMessage[]> {
    const messages = await this.collection
      .find({ jobId, companyId } as Filter<ChatMessage>)
      .sort({ createdAt: 1 })
      .toArray();

    return messages.map(m => ({ ...m, _id: m._id.toString() } as ChatMessage));
  }

  async findByClient(clientId: string, companyId: string): Promise<ChatMessage[]> {
    const messages = await this.collection
      .find({ clientId, companyId } as Filter<ChatMessage>)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return messages.map(m => ({ ...m, _id: m._id.toString() } as ChatMessage));
  }

  async deleteByJob(jobId: string, companyId: string): Promise<number> {
    const result = await this.collection.deleteMany({ jobId, companyId } as Filter<ChatMessage>);
    return result.deletedCount;
  }

  async deleteByClient(clientId: string, companyId: string): Promise<number> {
    const result = await this.collection.deleteMany({ clientId, companyId } as Filter<ChatMessage>);
    return result.deletedCount;
  }
}

export const chatRepository = new ChatRepository();
