
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getEnv } from '../config/environment';
import { logger, geminiPromptLogger } from '../core/logger';
import fs from 'fs';
import path from 'path';

import { BehaviorFormMapping } from '../../shared/types';
import { type } from 'os';
import { selectors } from 'playwright-core';
import { text } from 'stream/consumers';

export interface AIAnalysisResult extends BehaviorFormMapping {
  // Extends BehaviorFormMapping with backward compatibility fields
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
    customPrompt?: string,
    screenshotBase64?: string
  ): Promise<AIAnalysisResult> {
    try {
      // Build document list string
      const documentListStr = documentList.length > 0
        ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
        : 'No documents attached';

      const prompt = `
          You are an intelligent automation agent that DESCRIBES form fields and actions.
          Your job is to identify INTENT and BEHAVIOR, not to dictate execution.

          TASK:
          1. Classify the page type (dashboard, form, confirmation, or unknown)
          2. If DASHBOARD: identify the SINGLE most relevant primary action the user should take next (only 1 action)
          3. If FORM: describe each field's BEHAVIOR and map to client data with CONFIDENCE

          CLIENT EXTRACTED DATA:
          ${JSON.stringify(extractedData, null, 2)}

          ATTACHED DOCUMENTS (use these for file upload fields):
          ${documentListStr}
          NOTE: For file upload fields, set the "expectedValue" to the document name that best matches the field requirement.
          Match by category: passport/identity for ID uploads, education for degree/certificate uploads, etc.

          CUSTOM INSTRUCTIONS:
          ${customPrompt || 'None'}

          ${screenshotBase64 ? `CRITICAL INSTRUCTION: An image of the webpage is attached.\n1. Use the IMAGE to understand the visual layout, context, and which form corresponds to the user's intent. Use the HTML provided below strictly for extracting correct CSS selectors.\n3. If there is a visual conflict between HTML and Image, prioritize the Image for "Context" but the HTML for "Selectors".` : ''}

          HTML CONTEXT:
          ${html.substring(0, 100000)}

          FIELD BEHAVIOR TYPES (CRITICAL - choose the most specific):
          - "text_entry" = simple text input
          - "masked_input" = formatted input (phone, SSN, postal code with mask)
          - "search_and_select" = autocomplete/searchable dropdown (can type to filter)
          - "single_choice" = static dropdown or radio group (no search)
          - "date_picker" = calendar widget (look for .datepicker, role="datepicker")
          - "boolean_toggle" = toggle switch (look for .toggle, .switch classes)
          - "consent_checkbox" = terms/conditions checkbox
          - "otp_group" = multiple OTP inputs (e.g., 4-6 boxes for verification code)
          - "range_slider" = numeric slider control
          - "file_upload" = file upload field

          CONFIDENCE LEVELS:
          - "high" = Clear label match + placeholder/context confirms (90%+ sure) → Auto-fill
          - "medium" = Label matches, reasonable inference (60-90%) → May need review
          - "low" = Uncertain or guessed (<60%) → Require human verification

          MISSING DATA HANDLING:
          - If client data is MISSING for a field: set "expectedValue" to "__MISSING__" and "status" to "missing_data"
          - NEVER invent fake/placeholder data
          - Be explicit about what you don't know

          OUTPUT INSTRUCTIONS:
          Return a valid JSON object with this structure:
          {
            "pageType": "dashboard" | "form" | "confirmation" | "unknown",
            "pageSummary": "Brief description",
            "isFormPage": boolean,
            "fields": [
              {
                "selector": "SIMPLE CSS selector (#id, .class, input[name='x'])",
                "fieldName": "Human-readable field name",
                "behavior": "text_entry|masked_input|search_and_select|single_choice|date_picker|boolean_toggle|consent_checkbox|otp_group|range_slider|file_upload",
                "intent": "semantic_name (e.g. citizenship_country, passport_number)",
                "expectedValue": "value from client data OR '__MISSING__'",
                "confidence": "high|medium|low",
                "reason": "Why this mapping (explain confidence)",
                "status": "ready|missing_data|low_confidence",
                "constraints": { "required": boolean } (optional)
              }
            ],
            "actions": [
              {
                "intent": "primary_navigation|secondary_action|modal_confirm|create_new",
                "description": "What this accomplishes",
                "expectedText": "Visible button text (for matching)",
                "selector": "SIMPLE CSS selector (preferred) or leave empty to use text matching",
                "confidence": "high|medium|low"
              }
            ],
            "captcha": { "detected": boolean },
            "otp": { "detected": boolean, "behavior": "otp_group", "confidence": "high|medium|low" }
          }

          CRITICAL RULES:
          1. DESCRIBE, DON'T COMMAND: Identify what fields/actions MEAN, not how to execute them
          2. SINGLE ACTION RULE (MANDATORY FOR ALL PAGES):
            - The \"actions\" array MUST ALWAYS contain EXACTLY ONE action
            - Choose the SINGLE most relevant primary action for this page
            - Dashboard: the main navigation button (e.g., \"Register New Student\", \"Create Application\")
            - Form: the primary submit button (e.g., \"Next\", \"Submit\", \"Continue\", \"Save\")
            - Do NOT include secondary actions like filters, search, archive, or cancel buttons
            - Focus on the action that progresses the user toward completing the application
          3. DASHBOARD OUTPUT CONSTRAINT:
            - If pageType = \"dashboard\":
              - fields MUST be an empty array: \"fields\": []
              - actions MUST contain EXACTLY ONE item with intent=\"primary_navigation\" or intent=\"create_new\"
          4. FORM OUTPUT CONSTRAINT:
            - If pageType = \"form\":
              - MAP ALL VISIBLE FORM FIELDS (not dashboard filters or search fields)
              - Include fields even if missing data (use \"__MISSING__\")
              - actions MUST contain EXACTLY ONE item (the primary submit/next button)
          5. CONFIDENCE IS KEY: low confidence → require review (status=\"low_confidence\")
          6. NO FAKE DATA: Never invent values. \"__MISSING__\" is better than a guess
          7. SELECTORS: Simple CSS only (#id, .class, input[name=\"x\"]) - NO :contains() or :has()
          8. BEHAVIOR OVER TYPE: Use "search_and_select" only when it's truly searchable/autocomplete
          9. Terms checkboxes: behavior="consent_checkbox", confidence="high"
          10. OTP fields: behavior="otp_group", selector should match ALL OTP inputs
          11. Return raw JSON only, no markdown formatting
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

      // Prepare request parts
      const parts: any[] = [{ text: prompt }];
      if (screenshotBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: screenshotBase64
          }
        });
      }

      const result = await this.model.generateContent(parts);
      const response = result.response;
      const usage = response.usageMetadata;
      const text = response.text();
      
      // Clean markdown code blocks if present
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      this.logResponse(cleanJson, usage, !!screenshotBase64);

      return JSON.parse(cleanJson) as AIAnalysisResult;

    } catch (error) {
      logger.error('AI Analysis failed:', error);
      throw error;
    }
  }

  private logResponse(response: string, usage?: any, imageAttached?: boolean) {
    const logFile = path.join(this.logPath, 'gemini_response.log');
    const timestamp = new Date().toISOString();
    
    let usageStr = '';
    if (usage) {
      usageStr = `\nImage Attached: ${imageAttached ? 'Yes' : 'No'}\nPrompt Tokens: ${usage.promptTokenCount}\nResponse Tokens: ${usage.candidatesTokenCount}\nTotal Tokens: ${usage.totalTokenCount}`;
    }

    const entry = `\n[${timestamp}]${usageStr}\n${response}\n-----------------------------------\n`;
    fs.appendFileSync(logFile, entry);
  }
}

export const aiService = new AIService();
