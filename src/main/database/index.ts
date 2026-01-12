import { MongoClient, Db } from 'mongodb';
import { getDatabaseConfig } from '../config';
import { logger } from '../core/logger';

let client: MongoClient | null = null;
let database: Db | null = null;

export async function initializeDatabase(): Promise<Db> {
  if (database) {
    return database;
  }

  const config = getDatabaseConfig();
  
  try {
    logger.info('Connecting to MongoDB...');
    
    client = new MongoClient(config.uri, config.options);
    await client.connect();
    
    database = client.db(config.dbName);
    
    // Test connection
    await database.command({ ping: 1 });
    
    logger.info(`Connected to MongoDB database: ${config.dbName}`);
    
    // Create indexes
    await createIndexes(database);
    
    return database;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
    logger.info('MongoDB connection closed');
  }
}

async function createIndexes(db: Db): Promise<void> {
  try {
    // Companies indexes
    await db.collection('companies').createIndexes([
      { key: { email: 1 }, unique: true },
    ]);

    // Agents indexes
    await db.collection('agents').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { companyId: 1 } },
    ]);

    // Clients indexes
    await db.collection('clients').createIndexes([
      { key: { companyId: 1 } },
      { key: { email: 1 } },
      { key: { name: 'text', email: 'text' } },
    ]);

    // Documents indexes
    await db.collection('documents').createIndexes([
      { key: { companyId: 1 } },
      { key: { clientId: 1 } },
    ]);

    // Extractions indexes
    await db.collection('extractions').createIndexes([
      { key: { companyId: 1 } },
      { key: { clientId: 1 } },
      { key: { status: 1 } },
    ]);

    // Portals indexes
    await db.collection('portals').createIndexes([
      { key: { companyId: 1 } },
    ]);

    // Automation jobs indexes
    await db.collection('automation_jobs').createIndexes([
      { key: { companyId: 1 } },
      { key: { clientId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
    ]);

    // Audit logs indexes
    await db.collection('audit_logs').createIndexes([
      { key: { companyId: 1 } },
      { key: { agentId: 1 } },
      { key: { action: 1 } },
      { key: { createdAt: -1 } },
    ]);

    // Chats indexes
    await db.collection('chats').createIndexes([
      { key: { companyId: 1 } },
      { key: { clientId: 1 } },
      { key: { jobId: 1 } },
      { key: { createdAt: -1 } },
    ]);

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Failed to create indexes:', error);
    // Don't throw - indexes are not critical for basic functionality
  }
}

// Collection names
export const COLLECTIONS = {
  COMPANIES: 'companies',
  AGENTS: 'agents',
  CLIENTS: 'clients',
  DOCUMENTS: 'documents',
  EXTRACTIONS: 'extractions',
  PORTALS: 'portals',
  AUTOMATION_JOBS: 'automation_jobs',
  AUDIT_LOGS: 'audit_logs',
  CHATS: 'chats',
} as const;
