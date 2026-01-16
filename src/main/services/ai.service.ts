
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getEnv } from '../config/environment';
import { logger, geminiPromptLogger } from '../core/logger';
import fs from 'fs';
import path from 'path';

export interface AIAnalysisResult {
  fields: {
    selector: string;
    value: string;
    reason: string;
    fieldName: string;
    fieldType?: string;
  }[];
  actions: {
    type: 'click' | 'wait' | 'submit';
    selector?: string;
    description: string;
    expectedText?: string; // For safer button clicking
  }[];
  captcha: {
    detected: boolean;
    isInsideForm: boolean;
  };
  otp: {
    detected: boolean;
    selector?: string;
  };
  pageType: 'dashboard' | 'form' | 'confirmation' | 'unknown';
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractedData: any,
    documentList: { name: string; category: string }[],
    customPrompt?: string
  ): Promise<AIAnalysisResult> {
    try {
      // Build document list string
      const documentListStr = documentList.length > 0
        ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
        : 'No documents attached';

      const prompt = `
        You are an intelligent automation agent filling out visa/immigration forms.
        
        TASK:
        1. First, classify the page type (dashboard, form, confirmation, or unknown)
        2. If it's a DASHBOARD page: identify navigation buttons/links to click (e.g., "Create New Application")
        3. If it's a FORM page: map form fields to the provided client data
        
        CLIENT EXTRACTED DATA:
        ${JSON.stringify(extractedData, null, 2)}
        
        ATTACHED DOCUMENTS (use these for file upload fields):
        ${documentListStr}
        NOTE: For file upload fields, set the "value" to the document name that best matches the field requirement.
        Match by category: passport/identity for ID uploads, education for degree/certificate uploads, etc.
        
        CUSTOM INSTRUCTIONS:
        ${customPrompt || 'None'}
        
        HTML CONTEXT:
        ${html.substring(0, 100000)}

        OUTPUT INSTRUCTIONS:
        Return a valid JSON object with the following structure:
        {
          "pageType": "dashboard" | "form" | "confirmation" | "unknown",
          "pageSummary": "Brief description of the page",
          "isFormPage": boolean,
          "fields": [
            { 
              "selector": "SIMPLE CSS selector ONLY (e.g. button[data='green'], #id, .class)", 
              "value": "Value to fill based on client data", 
              "fieldName": "Name of the field", 
              "fieldType": "text|select|radio|checkbox|date|file|email|tel",
              "reason": "Why this value was chosen" 
            }
          ],
          "actions": [
            { 
              "type": "click|submit|wait", 
              "selector": "SIMPLE CSS selector ONLY - NO :contains(), NO :has(), NO jQuery selectors", 
              "expectedText": "Exact visible button text (REQUIRED - used for matching)",
              "description": "What this action does" 
            }
          ],
          "captcha": {
            "detected": boolean,
            "isInsideForm": boolean
          },
          "otp": {
            "detected": boolean,
            "selector": "CSS selector for OTP input if found"
          }
        }

        CRITICAL RULES:
        1. For DASHBOARD pages: fields array should be empty, focus on actions array with navigation clicks
        2. For FORM pages: fields array should have ALL VISIBLE form fields - do NOT skip any input, select, or checkbox
        3. SELECTOR FORMAT: Use ONLY valid CSS selectors. NEVER use :contains(), :has(), or jQuery pseudo-selectors - they are INVALID
        4. For click actions: Use a SIMPLE selector (e.g. "button[data='green']", ".buttons_border") and put the button text in "expectedText"
        5. IMPORTANT: Map EVERY form field you see in the HTML, even if you don't have exact data:
           - For emergency contact fields: use someone from the family info or make reasonable entries
           - For unknown required fields: provide a reasonable placeholder value
           - NEVER skip fields just because data is missing - provide something reasonable
        6. Detect CAPTCHA only if it's inside the form and blocking submission
        7. Return raw JSON only, no markdown formatting
        8. For checkboxes that say "agree", "accept", "confirm", etc: set value to "true"
      `;

      // Log prompt to gemini_prompt.log
      geminiPromptLogger.info(
        '--- NEW AUTOMATION REQUEST ---\n' + 
        `TIMESTAMP: ${new Date().toISOString()}\n\n` +
        '--- PAGE TYPE ANALYSIS ---\n' +
        '--- CUSTOM PROMPT ---\n' + 
        (customPrompt || 'None') + '\n\n' + 
        '--- DOCUMENTS ---\n' +
        documentListStr + '\n\n' +
        '--- FINAL PROMPT ---\n' + 
        prompt + '\n\n' +
        '--------------------------------------------------\n'
      );

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

  /**
   * Generate execution plan for schema-based adapters.
   * Takes page schema definition and returns fields to fill and action to execute.
   */
  async generateExecutionPlan(params: {
    schema: { name: string; fields: any[]; actions: any[] };
    extractedData: any;
    userIntent: string;
  }): Promise<{ fill: { fieldId: string; value: string }[]; actionId?: string }> {
    try {
      const { schema, extractedData, userIntent } = params;
      
      const prompt = `
You are an automation agent. Given a page schema and client data, determine which fields to fill and what action to take.

PAGE: ${schema.name}

AVAILABLE FIELDS:
${JSON.stringify(schema.fields, null, 2)}

AVAILABLE ACTIONS:
${JSON.stringify(schema.actions, null, 2)}

CLIENT DATA:
${JSON.stringify(extractedData, null, 2)}

USER INTENT: ${userIntent}

Return a JSON object with:
{
  "fill": [{ "fieldId": "field_id_from_schema", "value": "value_from_client_data" }],
  "actionId": "action_id_to_execute_or_null"
}

Rules:
1. Only include fields that have matching client data
2. Match field descriptions to appropriate client data fields
3. If this is a navigation/dashboard page, focus on actionId
4. If form is complete, set actionId to submit/save action
5. Return raw JSON only, no markdown
`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      this.logResponse(`[ExecutionPlan] ${cleanJson}`);
      
      return JSON.parse(cleanJson);
    } catch (error) {
      logger.error('generateExecutionPlan failed:', error);
      return { fill: [] };
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
