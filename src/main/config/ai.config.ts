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

TASK: Extract structured information from the client documents attached as file(s) in this request.

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
