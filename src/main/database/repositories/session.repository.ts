
import { Collection } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { AuthSession } from '../../../shared/types';

export class SessionRepository {
  private get collection(): Collection<AuthSession> {
    return getDatabase().collection<AuthSession>(COLLECTIONS.SESSIONS);
  }

  async create(session: AuthSession): Promise<void> {
    await this.collection.insertOne(session);
  }

  async findById(sessionId: string): Promise<AuthSession | null> {
    return this.collection.findOne({ _id: sessionId });
  }

  async delete(sessionId: string): Promise<void> {
    await this.collection.deleteOne({ _id: sessionId });
  }
}

export const sessionRepository = new SessionRepository();
