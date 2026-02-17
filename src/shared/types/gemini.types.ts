// Gemini API Types

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
}

export interface GeminiExtractionRequest {
  clientInfo: {
    name: string;
    email?: string;
    phone?: string;
  };
  documents: GeminiDocument[];
  customPrompt?: string;
  extractionSchema?: Record<string, unknown>;
}

export interface GeminiDocument {
  type: 'text' | 'image' | 'pdf';
  content: string; // For text: actual text; for image/pdf: base64
  mimeType?: string;
  filename?: string;
}

export interface GeminiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokenCount?: {
    input: number;
    output: number;
    total: number;
  };
  processingTime?: number;
}

export interface GeminiExtractionResponse {
  personalInfo?: Record<string, unknown>;
  passport?: Record<string, unknown>;
  education?: Record<string, unknown>[];
  employment?: Record<string, unknown>[];
  financial?: Record<string, unknown>;
  travel?: Record<string, unknown>[];
  family?: Record<string, unknown>[];
  contact?: Record<string, unknown>;
  additionalInfo?: Record<string, unknown>;
}
