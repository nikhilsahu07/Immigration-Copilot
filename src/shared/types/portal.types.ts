import { BaseEntity, WithCompany, WithAgent } from './common.types';

export interface Portal extends BaseEntity, WithCompany, WithAgent {
  name: string;
  url: string;
  country: string;
  description?: string;
  isActive: boolean;
  category?: PortalCategory;
  metadata?: PortalMetadata;
}

export type PortalCategory = 
  | 'immigration'
  | 'visa'
  | 'work_permit'
  | 'study_permit'
  | 'travel'
  | 'other';

export interface PortalMetadata {
  loginRequired?: boolean;
  multiPageForm?: boolean;
  estimatedPages?: number;
  notes?: string;
}

export interface CreatePortalInput {
  name: string;
  url: string;
  country: string;
  description?: string;
  category?: PortalCategory;
  metadata?: PortalMetadata;
}

export interface UpdatePortalInput {
  name?: string;
  url?: string;
  country?: string;
  description?: string;
  isActive?: boolean;
  category?: PortalCategory;
  metadata?: PortalMetadata;
}
