
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getEnv } from '../config/environment';
import { logger, geminiPromptLogger } from '../core/logger';
import { DecisionResult } from '../../shared/types';
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

      // Log prompt to gemini_prompt.logs
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
   * Unified exploration decision method for iterative SPA automation.
   * Returns a single DecisionResult indicating what action to take next.
   * 
   * CRITICAL: Implements Negative Mapping via filledFieldSelectors to prevent duplicate filling.
   */
  async makeExplorationDecision(
    html: string,
    extractedData: Record<string, unknown>,
    filledFieldSelectors: string[],
    visitedElements: string[],
    documentList: { name: string; category: string }[]
  ): Promise<DecisionResult> {
    try {
      // Build document list string
      const documentListStr = documentList.length > 0
        ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
        : 'No documents attached';

      // Build ignore lists for Negative Mapping
      const ignoreFieldsStr = filledFieldSelectors.length > 0
        ? filledFieldSelectors.join(', ')
        : 'None';
      
      const ignoreElementsStr = visitedElements.length > 0
        ? visitedElements.join(', ')
        : 'None';

      const prompt = `
You are an automation agent. Look at this HTML and decide the SINGLE best action.

PRIORITY ORDER (follow strictly):
1. If there are visible EMPTY input/select/textarea fields that need filling → return type "FILL"
2. If there are unexplored tabs/accordion buttons that might reveal more fields → return type "NAVIGATE"
3. If there's a file upload field (<input type="file">) needing a document → return type "UPLOAD"
4. If all visible fields are filled AND no more sections to explore → return type "DONE"

=== CRITICAL: IGNORE THESE (ALREADY FILLED) ===
${ignoreFieldsStr}

=== CRITICAL: IGNORE THESE (ALREADY VISITED) ===
${ignoreElementsStr}

=== CLIENT DATA (use to fill fields) ===
${JSON.stringify(extractedData, null, 2)}

=== AVAILABLE DOCUMENTS (for file uploads) ===
${documentListStr}

=== VISIBLE HTML ===
${html.substring(0, 80000)}

=== INSTRUCTIONS ===
Return ONLY valid JSON in ONE of these formats:

For FILL action (filling form fields):
{
  "type": "FILL",
  "fields": [
    {
      "selector": "input#firstName OR input[name='firstName'] OR input[aria-label='First Name']",
      "value": "The value to fill",
      "fieldType": "text|select|radio|checkbox|date|email|tel|number",
      "fieldName": "Field label for display"
    }
  ]
}

For NAVIGATE action (clicking tab/button to reveal more fields):
{
  "type": "NAVIGATE",
  "selector": "button#nextTab OR [role='tab'][aria-label='Address']",
  "description": "Click to reveal address fields"
}

For UPLOAD action (file upload):
{
  "type": "UPLOAD",
  "selector": "input[type='file']#passport",
  "documentName": "passport.pdf"
}

For DONE action (all complete):
{
  "type": "DONE",
  "reason": "All visible fields filled, no more tabs to explore"
}

SELECTOR RULES:
- Use stable selectors: #id, [name="..."], [aria-label="..."], [data-testid="..."]
- NEVER use dynamic classes like .css-1x2y3z or .sc-abc123
- NEVER use :contains(), :has(), or jQuery pseudo-selectors

Return raw JSON only, no markdown.`;

      // Log prompt
      geminiPromptLogger.info(
        '--- EXPLORATION DECISION REQUEST ---\n' + 
        `TIMESTAMP: ${new Date().toISOString()}\n\n` +
        `FILLED SELECTORS: ${filledFieldSelectors.length}\n` +
        `VISITED ELEMENTS: ${visitedElements.length}\n\n` +
        '--- PROMPT ---\n' + 
        prompt + '\n\n' +
        '--------------------------------------------------\n'
      );

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      // Clean markdown code blocks if present
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      this.logResponse(cleanJson);

      const parsed = JSON.parse(cleanJson);
      
      // Validate the response matches DecisionResult structure
      if (!parsed.type || !['FILL', 'NAVIGATE', 'UPLOAD', 'DONE'].includes(parsed.type)) {
        throw new Error(`Invalid decision type: ${parsed.type}`);
      }

      return parsed as DecisionResult;

    } catch (error) {
      logger.error('Exploration decision failed:', error);
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
