import { uploadToS3, deleteFromS3, getPresignedUrl, downloadFromS3, generateS3Key } from './s3-client';
import { documentRepository } from '../database/repositories';
import { Document, DocumentWithPresignedUrl, UploadDocumentInput, FileType } from '../../shared/types';
import { logger } from '../core/logger';
import { createError } from '../core/error-handler';
import { ERROR_CODES, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '../../shared/constants';

export class DocumentManager {
  async uploadDocument(
    companyId: string,
    agentId: string,
    input: UploadDocumentInput
  ): Promise<DocumentWithPresignedUrl> {
    const { file, clientId, documentType, description } = input;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      throw createError(ERROR_CODES.DOCUMENT_INVALID_TYPE);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw createError(ERROR_CODES.DOCUMENT_TOO_LARGE);
    }

    // Generate S3 key
    const s3Key = generateS3Key(companyId, clientId, file.name);
    const fileType = this.getFileType(file.type);

    try {
      // Upload to S3
      const buffer = Buffer.from(file.data);
      const s3Url = await uploadToS3(s3Key, buffer, file.type);

      // Save to database
      const document = await documentRepository.create(companyId, agentId, {
        clientId,
        filename: s3Key.split('/').pop() || file.name,
        originalName: file.name,
        s3Key,
        s3Url,
        fileType,
        documentType,
        fileSize: file.size,
        description,
      });

      // Get presigned URL
      const { url, expiresAt } = await getPresignedUrl(s3Key);

      logger.info(`Document uploaded: ${document._id}`);

      return {
        ...document,
        presignedUrl: url,
        urlExpiresAt: expiresAt,
      };
    } catch (error) {
      logger.error('Failed to upload document:', error);
      throw createError(ERROR_CODES.DOCUMENT_UPLOAD_FAILED);
    }
  }

  async getDocumentWithUrl(id: string, companyId: string): Promise<DocumentWithPresignedUrl | null> {
    const document = await documentRepository.findById(id, companyId);
    if (!document) {
      return null;
    }

    const { url, expiresAt } = await getPresignedUrl(document.s3Key);

    return {
      ...document,
      presignedUrl: url,
      urlExpiresAt: expiresAt,
    };
  }

  async getDocumentsWithUrls(clientId: string, companyId: string): Promise<DocumentWithPresignedUrl[]> {
    const documents = await documentRepository.findByClient(clientId, companyId);
    
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const { url, expiresAt } = await getPresignedUrl(doc.s3Key);
        return {
          ...doc,
          presignedUrl: url,
          urlExpiresAt: expiresAt,
        };
      })
    );

    return docsWithUrls;
  }

  async deleteDocument(id: string, companyId: string): Promise<boolean> {
    const document = await documentRepository.delete(id, companyId);
    if (!document) {
      return false;
    }

    try {
      await deleteFromS3(document.s3Key);
      logger.info(`Document deleted from S3: ${document.s3Key}`);
    } catch (error) {
      logger.error(`Failed to delete from S3 (continuing): ${error}`);
      // Continue even if S3 delete fails - document is already removed from DB
    }

    return true;
  }

  async downloadDocument(id: string, companyId: string): Promise<{ buffer: Buffer; document: Document } | null> {
    const document = await documentRepository.findById(id, companyId);
    if (!document) {
      return null;
    }

    const buffer = await downloadFromS3(document.s3Key);
    return { buffer, document };
  }

  private getFileType(mimeType: string): FileType {
    switch (mimeType) {
      case 'application/pdf':
        return 'pdf';
      case 'image/jpeg':
        return 'jpg';
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      default:
        return 'pdf';
    }
  }
}

export const documentManager = new DocumentManager();
