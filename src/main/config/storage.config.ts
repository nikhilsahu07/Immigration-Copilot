import { getEnv } from './environment';

export interface StorageConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  urlExpirationSeconds: number;
}

export function getStorageConfig(): StorageConfig {
  const env = getEnv();

  return {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    bucketName: env.S3_BUCKET_NAME,
    urlExpirationSeconds: 24 * 60 * 60, // 24 hours
  };
}
