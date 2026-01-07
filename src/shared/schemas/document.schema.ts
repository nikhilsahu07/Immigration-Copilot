import { z } from 'zod';

export const documentTypeSchema = z.enum([
  'passport',
  'visa',
  'education',
  'employment',
  'financial',
  'identity',
  'other',
]);

export const fileTypeSchema = z.enum(['pdf', 'jpg', 'jpeg', 'png']);

export const documentSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  filename: z.string().min(1, 'Filename is required'),
  originalName: z.string().min(1, 'Original name is required'),
  fileType: fileTypeSchema,
  documentType: documentTypeSchema,
  fileSize: z.number().positive('File size must be positive'),
  description: z.string().optional(),
});

export const uploadDocumentSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  documentType: documentTypeSchema,
  description: z.string().optional(),
});

export type DocumentSchemaType = z.infer<typeof documentSchema>;
export type UploadDocumentSchemaType = z.infer<typeof uploadDocumentSchema>;
