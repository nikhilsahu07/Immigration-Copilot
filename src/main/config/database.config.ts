import { getEnv } from './environment';

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  options: {
    maxPoolSize: number;
    minPoolSize: number;
    connectTimeoutMS: number;
    socketTimeoutMS: number;
    retryWrites: boolean;
    w: string;
  };
}

export function getDatabaseConfig(): DatabaseConfig {
  const env = getEnv();

  return {
    uri: env.MONGODB_URI,
    dbName: env.MONGODB_DB_NAME,
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
    },
  };
}
