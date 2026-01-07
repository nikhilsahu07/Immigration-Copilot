import { BaseEntity, WithCompany, WithAgent } from './common.types';

export interface Client extends BaseEntity, WithCompany, WithAgent {
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  nationality?: string;
  passportNumber?: string;
  gender?: 'Male' | 'Female' | 'Other';
  address?: ClientAddress;
  customFields?: Record<string, unknown>;
  notes?: string;
  status: ClientStatus;
}

export type ClientStatus = 'active' | 'pending' | 'completed' | 'archived';

export interface ClientAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface CreateClientInput {
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  gender?: 'Male' | 'Female' | 'Other';
  address?: ClientAddress;
  customFields?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateClientInput {
  name?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  gender?: 'Male' | 'Female' | 'Other';
  address?: ClientAddress;
  customFields?: Record<string, unknown>;
  notes?: string;
  status?: ClientStatus;
}

export interface ClientWithDocumentCount extends Client {
  documentCount: number;
  extractionCount: number;
  hasApprovedExtraction: boolean;
}
