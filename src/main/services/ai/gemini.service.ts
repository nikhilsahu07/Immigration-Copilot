import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai';
import { getAIConfig, EXTRACTION_PROMPT_TEMPLATE } from '../../config';
import { GeminiExtractionRequest, GeminiExtractionResponse, GeminiResponse } from '../../../shared/types';
import { logger } from '../../core/logger';

function getModel(apiKey: string, modelName: string): GenerativeModel {
  const config = getAIConfig(apiKey, modelName);
  const genAI = new GoogleGenerativeAI(config.apiKey);
  return genAI.getGenerativeModel({
    model: config.model,
    generationConfig: {
      temperature: config.temperature,
      topP: config.topP,
      maxOutputTokens: config.maxOutputTokens,
    },
  });
}

export class GeminiService {
  async extractData(
    request: GeminiExtractionRequest,
    apiKey: string,
    modelName: string
  ): Promise<GeminiResponse<GeminiExtractionResponse>> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildExtractionPrompt(request);
      const parts: Part[] = [{ text: prompt }];

      // Add all document blobs (images and PDFs) as inline parts
      for (const doc of request.documents) {
        if (!doc.content || (doc.type !== 'image' && doc.type !== 'pdf')) continue;
        let mimeType = doc.mimeType || (doc.type === 'pdf' ? 'application/pdf' : 'image/jpeg');
        if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
        parts.push({
          inlineData: {
            mimeType,
            data: doc.content,
          },
        });
      }

      logger.info('Sending extraction request to Gemini...');
      const model = getModel(apiKey, modelName);
      const result = await model.generateContent(parts);
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

  private buildExtractionPrompt(request: GeminiExtractionRequest): string {
    let prompt = EXTRACTION_PROMPT_TEMPLATE;

    prompt = prompt.replace('{clientInfo}', JSON.stringify(request.clientInfo, null, 2));
    // Documents are sent as attached files (inlineData); no pasted text
    const docCount = request.documents.filter(d => d.type === 'image' || d.type === 'pdf').length;
    const documentsPlaceholder = docCount > 0
      ? `The user has attached ${docCount} document(s) (images and/or PDFs) above. Extract structured information from all of them.`
      : '(No documents attached)';
    prompt = prompt.replace('{documents}', documentsPlaceholder);
    prompt = prompt.replace('{customPrompt}', request.customPrompt || '(No custom instructions)');

    return prompt;
  }

  /**
   * Contract-first JSON parsing - NO automatic repair
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
