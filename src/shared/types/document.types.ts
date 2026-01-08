import { BaseEntity, WithCompany } from './common.types';

export type DocumentType = 
  | 'passport'
  | 'visa'
  | 'education'
  | 'employment'
  | 'financial'
  | 'identity'
  | 'other';

export type FileType = 'pdf' | 'jpg' | 'jpeg' | 'png';

export interface Document extends BaseEntity, WithCompany {
  clientId: string;
  filename: string;
  originalName: string;
  s3Key: string;
  s3Url: string;
  fileType: FileType;
  documentType: DocumentType;
  fileSize: number;
  uploadedBy: string;
  description?: string;
  extractedText?: string;
}

export interface CreateDocumentInput {
  clientId: string;
  filename: string;
  originalName: string;
  fileType: FileType;
  documentType: DocumentType;
  fileSize: number;
  description?: string;
}

export interface DocumentWithPresignedUrl extends Document {
  presignedUrl: string;
  urlExpiresAt: Date;
}

export interface UploadDocumentInput {
  clientId: string;
  documentType: DocumentType;
  description?: string;
  // File object for direct upload
  file?: {
    name: string;
    type: string;
    size: number;
    data: ArrayBuffer;
  };
  // Alternative: base64 encoded data for IPC
  fileData?: string;
  fileName?: string;
  mimeType?: string;
}

export interface DocumentUploadResult {
  document: Document;
  presignedUrl: string;
}
