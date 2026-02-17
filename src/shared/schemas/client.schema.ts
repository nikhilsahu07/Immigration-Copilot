import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'pending', 'completed', 'archived']);
export const genderSchema = z.enum(['Male', 'Female', 'Other']);

export const clientAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
});

export const clientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(5, 'Phone number is required'),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  passportNumber: z.string().optional(),
  visaCountry: z.string().optional(),
  gender: genderSchema.optional(),
  address: clientAddressSchema.optional(),
  customFields: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  status: clientStatusSchema.optional().default('active'),
});

export const createClientSchema = clientSchema.omit({ status: true });

export const updateClientSchema = clientSchema.partial();

export type ClientSchemaType = z.infer<typeof clientSchema>;
export type CreateClientSchemaType = z.infer<typeof createClientSchema>;
export type UpdateClientSchemaType = z.infer<typeof updateClientSchema>;
