// Credential Types for Gemini API Keys

export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

export interface Credential {
  _id: string;
  companyId: string;
  title: string;
  apiKey: string;
  /** Gemini model used for extraction and form automation when this key is active */
  modelName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  title: string;
  apiKey: string;
  modelName?: string;
  isActive?: boolean;
}

export interface UpdateCredentialInput {
  title?: string;
  apiKey?: string;
  modelName?: string;
  isActive?: boolean;
}
