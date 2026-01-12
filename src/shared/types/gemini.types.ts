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
  type: 'text' | 'image';
  content: string; // For text: actual text, for image: base64
  mimeType?: string;
  filename?: string;
}

export interface GeminiMappingRequest {
  extractedData: Record<string, unknown>;
  htmlFields: HtmlFieldForGemini[];
  customPrompt?: string;
}

export interface HtmlFieldForGemini {
  index: number;
  tagName: string;
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  labelText?: string;
  options?: { value: string; text: string }[];
  radioOptions?: { value: string; label: string }[];
  uniqueSelector: string;
  required?: boolean;
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

export interface GeminiMappingResponse {
  fields: {
    fieldIndex: number;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    selector: string;
    value: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }[];
  captcha: {
    detected: boolean;
    type?: string;
    isInsideForm?: boolean;
  };
  otp: {
    detected: boolean;
    fieldSelector?: string;
  };
  submitButton: {
    selector: string;
    text: string;
  };
}
