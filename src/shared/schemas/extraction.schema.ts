import { z } from 'zod';

export const extractionStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const createExtractionSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  documentIds: z.array(z.string()).min(1, 'At least one document is required'),
  customPrompt: z.string().optional(),
});

export const updateExtractionSchema = z.object({
  extractedData: z.record(z.unknown()).optional(),
  status: extractionStatusSchema.optional(),
  rejectionReason: z.string().optional(),
});

export const approveExtractionSchema = z.object({
  extractedData: z.record(z.unknown()).optional(),
});

export const rejectExtractionSchema = z.object({
  rejectionReason: z.string().min(1, 'Rejection reason is required'),
});

// Extracted data schemas
export const personalInfoSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  placeOfBirth: z.string().optional(),
  maritalStatus: z.string().optional(),
});

export const passportInfoSchema = z.object({
  number: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  issuingCountry: z.string().optional(),
  issuingAuthority: z.string().optional(),
});

export const educationInfoSchema = z.object({
  degree: z.string().optional(),
  field: z.string().optional(),
  institution: z.string().optional(),
  country: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  yearOfCompletion: z.number().optional(),
  grade: z.string().optional(),
});

export const employmentInfoSchema = z.object({
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  country: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  responsibilities: z.string().optional(),
  salary: z.string().optional(),
});

export const extractedDataSchema = z.object({
  personalInfo: personalInfoSchema.optional(),
  passport: passportInfoSchema.optional(),
  education: z.array(educationInfoSchema).optional(),
  employment: z.array(employmentInfoSchema).optional(),
  financial: z.record(z.unknown()).optional(),
  travel: z.array(z.record(z.unknown())).optional(),
  family: z.array(z.record(z.unknown())).optional(),
  contact: z.record(z.unknown()).optional(),
  additionalInfo: z.record(z.unknown()).optional(),
});

export type CreateExtractionSchemaType = z.infer<typeof createExtractionSchema>;
export type UpdateExtractionSchemaType = z.infer<typeof updateExtractionSchema>;
export type ApproveExtractionSchemaType = z.infer<typeof approveExtractionSchema>;
export type RejectExtractionSchemaType = z.infer<typeof rejectExtractionSchema>;
export type ExtractedDataSchemaType = z.infer<typeof extractedDataSchema>;
