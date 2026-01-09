
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getEnv } from '../config/environment';
import { logger } from '../core/logger';
import fs from 'fs';
import path from 'path';

export interface AIAnalysisResult {
  fields: {
    selector: string;
    value: string;
    reason: string;
    fieldName: string;
  }[];
  actions: {
    type: 'click' | 'wait' | 'submit';
    selector?: string;
    description: string;
  }[];
  captchaDetected: boolean;
  otpDetected: boolean;
  isFormPage: boolean;
  pageSummary: string;
}

export class AIService {
  private model: GenerativeModel;
  private logPath: string;

  constructor() {
    const env = getEnv();
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
    
    // Set up log path
    this.logPath = path.join(process.cwd(), 'resources', 'logs');
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  async analyzePageAndMapFields(
    html: string, 
    clientData: any, 
    customPrompt?: string
  ): Promise<AIAnalysisResult> {
    try {
      const prompt = `
        You are an intelligent automation agent filling out visa forms.
        
        TASK:
        Analyze the provided HTML and map the available form fields to the provided Client Data.
        
        CLIENT DATA:
        ${JSON.stringify(clientData, null, 2)}
        
        CUSTOM INSTRUCTIONS:
        ${customPrompt || 'None'}
        
        HTML CONTEXT:
        ${html.substring(0, 100000)} // Truncate to avoid token limits if extremely large

        OUTPUT INSTRUCTIONS:
        Return a valid JSON object with the following structure:
        {
          "fields": [
            { "selector": "CSS selector for the input", "value": "Value to fill based on client data", "fieldName": "Name of the field", "reason": "Why this value was chosen" }
          ],
          "actions": [
            { "type": "click/submit/wait", "selector": "CSS selector if applicable", "description": "What this action does" }
          ],
          "captchaDetected": boolean,
          "otpDetected": boolean,
          "isFormPage": boolean,
          "pageSummary": "Brief description of the page"
        }

        RULES:
        1. Only map fields that are present in the HTML.
        2. If a field requires data not present in Client Data, leave value empty or use "N/A" if appropriate, and note in reason.
        3. Detect if CAPTCHA or OTP is required to proceed.
        4. Identify the "Next" or "Submit" button as an action.
        5. IGNORE hidden fields unless necessary.
        6. Return raw JSON only, no markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      // Clean markdown code blocks if present
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      this.logResponse(cleanJson);

      return JSON.parse(cleanJson) as AIAnalysisResult;

    } catch (error) {
      logger.error('AI Analysis failed:', error);
      throw error;
    }
  }

  private logResponse(response: string) {
    const logFile = path.join(this.logPath, 'gemini_response.log');
    const timestamp = new Date().toISOString();
    const entry = `\n[${timestamp}]\n${response}\n-----------------------------------\n`;
    fs.appendFileSync(logFile, entry);
  }
}

export const aiService = new AIService();
