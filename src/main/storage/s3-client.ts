import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorageConfig } from '../config';
import { logger } from '../core/logger';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    const config = getStorageConfig();
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3Client;
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const config = getStorageConfig();
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
  logger.info(`File uploaded to S3: ${key}`);

  return `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${key}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  const config = getStorageConfig();
  const client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  await client.send(command);
  logger.info(`File deleted from S3: ${key}`);
}

export async function getPresignedUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
  const config = getStorageConfig();
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: config.urlExpirationSeconds,
  });

  const expiresAt = new Date(Date.now() + config.urlExpirationSeconds * 1000);

  return { url, expiresAt };
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const config = getStorageConfig();
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  const response = await client.send(command);
  const chunks: Uint8Array[] = [];
  
  if (response.Body) {
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

export function generateS3Key(companyId: string, clientId: string, filename: string): string {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  return `${companyId}/${clientId}/${timestamp}_${sanitizedFilename}`;
}
