import { GeminiConfig } from '../../shared/types';

export function getAIConfig(apiKey: string, model: string): GeminiConfig {
  return {
    apiKey,
    model,
    temperature: 0.2,
    topP: 0.8,
    maxOutputTokens: 32768,
  };
}

// Extraction prompt template
export const EXTRACTION_PROMPT_TEMPLATE = `You are an expert data extraction assistant for immigration applications.

TASK: Extract structured information from the following client documents.

CLIENT BASIC INFO:
{clientInfo}

DOCUMENTS:
{documents}

CUSTOM INSTRUCTIONS:
{customPrompt}

OUTPUT SCHEMA:
{
  "personalInfo": {
    "fullName": string,
    "firstName": string,
    "lastName": string,
    "middleName": string | null,
    "dateOfBirth": "YYYY-MM-DD",
    "gender": "Male" | "Female" | "Other",
    "nationality": string,
    "placeOfBirth": string,
    "maritalStatus": string
  },
  "passport": {
    "number": string,
    "issueDate": "YYYY-MM-DD",
    "expiryDate": "YYYY-MM-DD",
    "issuingCountry": string,
    "issuingAuthority": string
  },
  "education": [
    {
      "degree": string,
      "field": string,
      "institution": string,
      "country": string,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "yearOfCompletion": number,
      "grade": string
    }
  ],
  "employment": [
    {
      "jobTitle": string,
      "company": string,
      "country": string,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD" | "Present",
      "responsibilities": string,
      "salary": string
    }
  ],
  "financial": {
    "annualIncome": string,
    "bankName": string,
    "accountBalance": string,
    "currency": string
  },
  "contact": {
    "email": string,
    "phone": string,
    "address": string,
    "city": string,
    "state": string,
    "country": string,
    "postalCode": string
  }
}

INSTRUCTIONS:
1. Extract ALL information accurately from documents
2. Use exact dates in YYYY-MM-DD format
3. If information is unclear or not found, use null
4. Return ONLY valid JSON, no explanations
5. Be thorough - immigration applications need complete data`;

// Mapping prompt template
export const MAPPING_PROMPT_TEMPLATE = `You are an expert form automation assistant.

TASK: Map client data to HTML form fields.

CLIENT DATA (Approved Extraction):
{extractedData}

HTML FORM STRUCTURE:
{htmlFields}

CUSTOM INSTRUCTIONS:
{customPrompt}

OUTPUT SCHEMA:
{
  "fields": [
    {
      "fieldIndex": number,
      "fieldName": "name or id attribute",
      "fieldLabel": "human-readable label",
      "fieldType": "text|select|radio|checkbox|date|email|tel|textarea|file",
      "selector": "most reliable CSS selector (prefer #id, then [name=x], then .class)",
      "value": "the value to fill or select",
      "confidence": "high|medium|low",
      "reasoning": "brief explanation"
    }
  ],
  "captcha": {
    "detected": boolean,
    "type": "reCAPTCHA|hCAPTCHA|Cloudflare|custom" | null,
    "isInsideForm": boolean
  },
  "otp": {
    "detected": boolean,
    "fieldSelector": string | null
  },
  "submitButton": {
    "selector": "button[type='submit']",
    "text": "Submit"
  }
}

CRITICAL RULES:
1. Match field labels to client data intelligently (handle variations like "DOB" = "Date of Birth")
2. For SELECT fields: return exact "value" attribute from options array
3. For RADIO fields: match by label text, return the value to select
4. For DATE fields: use format the form expects (check placeholder/pattern)
5. Use most reliable CSS selector (prefer #id > [name] > .class)
6. If unsure, mark confidence as "medium" or "low"
7. Detect CAPTCHA/OTP fields and mark them (only if inside the form)
8. Return COMPLETE valid JSON with all closing brackets`;
