import { z } from 'zod';

export const agentRoleSchema = z.enum(['admin', 'agent']);

export const agentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: agentRoleSchema.optional().default('agent'),
  isActive: z.boolean().optional().default(true),
});

export const createAgentSchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: agentRoleSchema.optional().default('agent'),
});

export const updateAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  role: agentRoleSchema.optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  company: z.object({
    name: z.string().min(2, 'Company name must be at least 2 characters'),
    country: z.string().min(2, 'Country is required'),
    email: z.string().email('Invalid company email'),
    phone: z.string().min(5, 'Phone number is required'),
  }),
  agent: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export type AgentSchemaType = z.infer<typeof agentSchema>;
export type CreateAgentSchemaType = z.infer<typeof createAgentSchema>;
export type UpdateAgentSchemaType = z.infer<typeof updateAgentSchema>;
export type LoginSchemaType = z.infer<typeof loginSchema>;
export type RegisterSchemaType = z.infer<typeof registerSchema>;
