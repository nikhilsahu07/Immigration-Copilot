import { z } from 'zod';

export const portalCategorySchema = z.enum([
  'immigration',
  'visa',
  'work_permit',
  'study_permit',
  'travel',
  'other',
]);

export const portalMetadataSchema = z.object({
  loginRequired: z.boolean().optional(),
  multiPageForm: z.boolean().optional(),
  estimatedPages: z.number().optional(),
  notes: z.string().optional(),
});

export const portalSchema = z.object({
  name: z.string().min(2, 'Portal name must be at least 2 characters'),
  url: z.string().url('Invalid URL'),
  country: z.string().min(2, 'Country is required'),
  description: z.string().optional(),
  category: portalCategorySchema.optional(),
  metadata: portalMetadataSchema.optional(),
});

export const createPortalSchema = portalSchema;

export const updatePortalSchema = portalSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type PortalSchemaType = z.infer<typeof portalSchema>;
export type CreatePortalSchemaType = z.infer<typeof createPortalSchema>;
export type UpdatePortalSchemaType = z.infer<typeof updatePortalSchema>;
