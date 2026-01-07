import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai';
import { getAIConfig, EXTRACTION_PROMPT_TEMPLATE, MAPPING_PROMPT_TEMPLATE } from '../../config';
import { GeminiExtractionRequest, GeminiMappingRequest, GeminiExtractionResponse, GeminiMappingResponse, GeminiResponse } from '../../../shared/types';
import { logger } from '../../core/logger';

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (!model) {
    const config = getAIConfig();
    genAI = new GoogleGenerativeAI(config.apiKey);
    model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
      },
    });
  }
  return model;
}

export class GeminiService {
  async extractData(request: GeminiExtractionRequest): Promise<GeminiResponse<GeminiExtractionResponse>> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildExtractionPrompt(request);
      const parts: Part[] = [{ text: prompt }];

      // Add images if present
      for (const doc of request.documents) {
        if (doc.type === 'image' && doc.content) {
          parts.push({
            inlineData: {
              mimeType: doc.mimeType || 'image/jpeg',
              data: doc.content,
            },
          });
        }
      }

      logger.info('Sending extraction request to Gemini...');
      const result = await getModel().generateContent(parts);
      const response = await result.response;
      const text = response.text();

      logger.debug('Gemini extraction response received');

      const extractedData = this.parseJsonResponse<GeminiExtractionResponse>(text);
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: extractedData,
        processingTime,
        tokenCount: {
          input: 0, // Token counting would require additional API calls
          output: 0,
          total: 0,
        },
      };
    } catch (error) {
      logger.error('Gemini extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Extraction failed',
        processingTime: Date.now() - startTime,
      };
    }
  }

  async mapFormFields(request: GeminiMappingRequest): Promise<GeminiResponse<GeminiMappingResponse>> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildMappingPrompt(request);

      logger.info('Sending mapping request to Gemini...');
      const result = await getModel().generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      logger.debug('Gemini mapping response received');

      const mapping = this.parseJsonResponse<GeminiMappingResponse>(text);
      const processingTime = Date.now() - startTime;

      // Validate and add defaults
      if (!mapping.fields || !Array.isArray(mapping.fields)) {
        throw new Error('Invalid response: missing fields array');
      }

      if (!mapping.submitButton) {
        mapping.submitButton = {
          selector: "button[type='submit'], input[type='submit']",
          text: 'Submit',
        };
      }

      if (!mapping.captcha) {
        mapping.captcha = { detected: false };
      }

      if (!mapping.otp) {
        mapping.otp = { detected: false };
      }

      return {
        success: true,
        data: mapping,
        processingTime,
      };
    } catch (error) {
      logger.error('Gemini mapping error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mapping failed',
        processingTime: Date.now() - startTime,
      };
    }
  }

  private buildExtractionPrompt(request: GeminiExtractionRequest): string {
    let prompt = EXTRACTION_PROMPT_TEMPLATE;

    prompt = prompt.replace('{clientInfo}', JSON.stringify(request.clientInfo, null, 2));
    
    const documentTexts = request.documents
      .filter(d => d.type === 'text')
      .map((d, i) => `--- Document ${i + 1} (${d.filename || 'Unknown'}) ---\n${d.content}`)
      .join('\n\n');
    
    prompt = prompt.replace('{documents}', documentTexts || '(No text documents provided)');
    prompt = prompt.replace('{customPrompt}', request.customPrompt || '(No custom instructions)');

    return prompt;
  }

  private buildMappingPrompt(request: GeminiMappingRequest): string {
    let prompt = MAPPING_PROMPT_TEMPLATE;

    prompt = prompt.replace('{extractedData}', JSON.stringify(request.extractedData, null, 2));
    prompt = prompt.replace('{htmlFields}', JSON.stringify(request.htmlFields, null, 2));
    prompt = prompt.replace('{customPrompt}', request.customPrompt || '(No custom instructions)');

    return prompt;
  }

  private parseJsonResponse<T>(text: string): T {
    // Clean up markdown code blocks
    let cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Find the JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch (parseError) {
      // Try to fix incomplete JSON
      logger.warn('Attempting to fix incomplete JSON...');
      
      const openBraces = (cleaned.match(/{/g) || []).length;
      const closeBraces = (cleaned.match(/}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/\]/g) || []).length;

      if (openBrackets > closeBrackets) {
        cleaned += ']'.repeat(openBrackets - closeBrackets);
      }
      if (openBraces > closeBraces) {
        cleaned += '}'.repeat(openBraces - closeBraces);
      }

      return JSON.parse(cleaned);
    }
  }
}

export const geminiService = new GeminiService();
