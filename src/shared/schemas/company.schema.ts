import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  country: z.string().min(2, 'Country is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(5, 'Phone number is required'),
  address: z.string().optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
});

export const createCompanySchema = companySchema;

export const updateCompanySchema = companySchema.partial();

export const companySettingsSchema = z.object({
  defaultPortals: z.array(z.string()).optional(),
  extractionSchema: z.record(z.unknown()).optional(),
  customFields: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
    label: z.string(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
  })).optional(),
});

export type CompanySchemaType = z.infer<typeof companySchema>;
export type CreateCompanySchemaType = z.infer<typeof createCompanySchema>;
export type UpdateCompanySchemaType = z.infer<typeof updateCompanySchema>;
