import { BaseEntity } from './common.types';

export interface Company extends BaseEntity {
  name: string;
  country: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
  settings?: CompanySettings;
}

export interface CompanySettings {
  defaultPortals?: string[];
  extractionSchema?: Record<string, unknown>;
  customFields?: CustomFieldDefinition[];
}

export interface CustomFieldDefinition {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  label: string;
  required?: boolean;
  options?: string[];
}

export interface CreateCompanyInput {
  name: string;
  country: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
}

export interface UpdateCompanyInput {
  name?: string;
  country?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  settings?: CompanySettings;
}
