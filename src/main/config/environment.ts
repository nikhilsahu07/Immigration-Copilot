import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { app } from 'electron';

// Load .env file
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../../.env');

dotenv.config({ path: envPath });

// Environment schema
const envSchema = z.object({
  // MongoDB
  MONGODB_URI: z.string().min(1, 'MongoDB URI is required'),
  MONGODB_DB_NAME: z.string().default('emigration-copilot'),

  // AWS S3
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS Access Key ID is required'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS Secret Access Key is required'),
  S3_BUCKET_NAME: z.string().min(1, 'S3 Bucket Name is required'),

  // Gemini
  GEMINI_API_KEY: z.string().min(1, 'Gemini API Key is required'),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

  // App settings
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CDP_PORT: z.string().default('9222'),

  // Session
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  SESSION_EXPIRY_DAYS: z.string().default('7'),
});

export type Environment = z.infer<typeof envSchema>;

let environment: Environment | null = null;

export function loadEnvironment(): Environment {
  if (environment) {
    return environment;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  environment = result.data;
  return environment;
}

export function getEnv(): Environment {
  if (!environment) {
    return loadEnvironment();
  }
  return environment;
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}
