import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai';
import { getAIConfig, EXTRACTION_PROMPT_TEMPLATE, MAPPING_PROMPT_TEMPLATE } from '../../config';
import { GeminiExtractionRequest, GeminiMappingRequest, GeminiExtractionResponse, GeminiMappingResponse, GeminiResponse } from '../../../shared/types';
import { logger, geminiPromptLogger } from '../../core/logger';

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
          // Normalize MIME type - Gemini requires image/jpeg not image/jpg
          let mimeType = doc.mimeType || 'image/jpeg';
          if (mimeType === 'image/jpg') {
            mimeType = 'image/jpeg';
          }
          
          parts.push({
            inlineData: {
              mimeType,
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

      // Log the prompt details as requested
      geminiPromptLogger.info(
        '--- NEW GEMINI REQUEST ---\n' + 
        `TIMESTAMP: ${new Date().toISOString()}\n\n` +
        '--- CLEANED HTML STRUCTURE ---\n' + 
        JSON.stringify(request.htmlFields, null, 2) + '\n\n' + 
        '--- CUSTOM PROMPT ---\n' + 
        (request.customPrompt || 'None') + '\n\n' + 
        '--- FINAL FIXED PROMPT ---\n' + 
        prompt + '\n\n' +
        '--------------------------------------------------\n'
      );

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

  /**
   * Phase 2: Contract-first JSON parsing - NO automatic repair
   * 
   * The model MUST return valid JSON. If it doesn't, we fail explicitly
   * rather than trying to "fix" broken responses.
   */
  private parseJsonResponse<T>(text: string): T {
    // Clean up markdown code blocks (only acceptable cleanup)
    let cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Check for optional result markers (fallback if schema mode not used)
    const markerStart = cleaned.indexOf('<RESULT_JSON>');
    const markerEnd = cleaned.indexOf('</RESULT_JSON>');
    
    if (markerStart !== -1 && markerEnd !== -1 && markerEnd > markerStart) {
      // Extract content between markers
      cleaned = cleaned.substring(markerStart + '<RESULT_JSON>'.length, markerEnd).trim();
      logger.debug('Extracted JSON from result markers');
    } else {
      // No markers, try to extract JSON object (first { to last })
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      const parsed = JSON.parse(cleaned);
      logger.debug('Successfully parsed Gemini JSON response');
      return parsed;
    } catch (parseError) {
      // NO REPAIR - fail explicitly with clear error
      logger.error('Gemini JSON parse failed (contract violation)', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawResponsePreview: text.substring(0, 500),
        cleanedPreview: cleaned.substring(0, 500),
      });
      
      throw new Error(
        `Gemini returned invalid JSON (contract violation). ` +
        `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}. ` +
        `This indicates the model did not follow the required output format.`
      );
    }
  }
}

export const geminiService = new GeminiService();
