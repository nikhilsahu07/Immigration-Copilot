import { z } from 'zod';

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
]);

export const pauseReasonSchema = z.enum([
  'captcha',
  'otp',
  'manual_intervention',
  'error',
  'user_paused',
]);

export const createJobSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  portalId: z.string().min(1, 'Portal ID is required'),
  extractionId: z.string().min(1, 'Extraction ID is required'),
  customPrompt: z.string().optional(),
});

export const updateJobSchema = z.object({
  status: jobStatusSchema.optional(),
  currentPage: z.number().optional(),
  totalPages: z.number().optional(),
  pauseReason: pauseReasonSchema.optional(),
  errorLog: z.string().optional(),
});

export const fieldTypeSchema = z.enum([
  'text',
  'email',
  'tel',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'textarea',
  'file',
]);

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const formFieldSchema = z.object({
  fieldIndex: z.number(),
  fieldName: z.string(),
  fieldLabel: z.string(),
  fieldType: fieldTypeSchema,
  selector: z.string(),
  value: z.string(),
  confidence: confidenceSchema,
  reasoning: z.string(),
  originalValue: z.string().optional(),
  isEdited: z.boolean().optional(),
});

export const formMappingSchema = z.object({
  fields: z.array(formFieldSchema),
  captcha: z.object({
    detected: z.boolean(),
    type: z.string().nullable().optional(),
  }),
  otp: z.object({
    detected: z.boolean(),
    fieldSelector: z.string().nullable().optional(),
  }),
  submitButton: z.object({
    selector: z.string(),
    text: z.string(),
  }),
});

export type CreateJobSchemaType = z.infer<typeof createJobSchema>;
export type UpdateJobSchemaType = z.infer<typeof updateJobSchema>;
export type FormFieldSchemaType = z.infer<typeof formFieldSchema>;
export type FormMappingSchemaType = z.infer<typeof formMappingSchema>;
