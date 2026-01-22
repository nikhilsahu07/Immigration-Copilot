// Credential Types for Gemini API Keys

export interface Credential {
  _id: string;
  companyId: string;
  title: string;
  apiKey: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  title: string;
  apiKey: string;
  isActive?: boolean;
}

export interface UpdateCredentialInput {
  title?: string;
  apiKey?: string;
  isActive?: boolean;
}
