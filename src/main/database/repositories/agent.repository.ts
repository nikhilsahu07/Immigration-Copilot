import { Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../index';
import { Agent, AgentPublic, CreateAgentInput, UpdateAgentInput } from '../../../shared/types';
import { logger } from '../../core/logger';

export class AgentRepository {
  private get collection(): Collection<Agent> {
    return getDatabase().collection(COLLECTIONS.AGENTS);
  }

  private toPublic(agent: Agent): AgentPublic {
    const { passwordHash, ...publicAgent } = agent;
    return publicAgent as AgentPublic;
  }

  async create(input: CreateAgentInput & { passwordHash: string }): Promise<Agent> {
    const now = new Date();
    const agent: Omit<Agent, '_id'> = {
      companyId: input.companyId,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role || 'agent',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(agent as Agent);
    logger.info(`Agent created: ${result.insertedId}`);
    
    return { ...agent, _id: result.insertedId.toString() } as Agent;
  }

  async findById(id: string): Promise<Agent | null> {
    const agent = await this.collection.findOne({ _id: new ObjectId(id) } as any);
    if (agent) {
      return { ...agent, _id: agent._id.toString() } as Agent;
    }
    return null;
  }

  async findByIdPublic(id: string): Promise<AgentPublic | null> {
    const agent = await this.findById(id);
    return agent ? this.toPublic(agent) : null;
  }

  async findByEmail(email: string): Promise<Agent | null> {
    const agent = await this.collection.findOne({ email: email.toLowerCase() });
    if (agent) {
      return { ...agent, _id: agent._id.toString() } as Agent;
    }
    return null;
  }

  async findByCompany(companyId: string): Promise<AgentPublic[]> {
    const agents = await this.collection
      .find({ companyId } as Filter<Agent>)
      .sort({ createdAt: -1 })
      .toArray();

    return agents.map(agent => this.toPublic({ ...agent, _id: agent._id.toString() } as Agent));
  }

  async update(id: string, input: UpdateAgentInput & { passwordHash?: string }): Promise<Agent | null> {
    const updateData: Record<string, unknown> = { ...input, updatedAt: new Date() };
    
    // Remove password if not being updated
    if (!input.password) {
      delete updateData.password;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) } as Filter<Agent>,
      { $set: updateData } as UpdateFilter<Agent>,
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info(`Agent updated: ${id}`);
      return { ...result, _id: result._id.toString() } as Agent;
    }
    return null;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as Filter<Agent>,
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } } as UpdateFilter<Agent>
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) } as any);
    if (result.deletedCount > 0) {
      logger.info(`Agent deleted: ${id}`);
      return true;
    }
    return false;
  }

  async countByCompany(companyId: string): Promise<number> {
    return this.collection.countDocuments({ companyId } as Filter<Agent>);
  }
}

export const agentRepository = new AgentRepository();
