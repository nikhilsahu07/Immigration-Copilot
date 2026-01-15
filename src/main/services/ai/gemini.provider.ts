import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getEnv } from '../../config/environment';
import { logger, geminiPromptLogger } from '../../core/logger';
import { DecisionResult } from '../../../shared/types';
import { AIProvider, AIAnalysisResult } from './ai.interface';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class GeminiProvider implements AIProvider {
  private model: GenerativeModel;
  private logPath: string;
  private responseCache = new Map<string, DecisionResult>();

  constructor() {
    const env = getEnv();
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

    this.model = genAI.getGenerativeModel({ 
      model: env.GEMINI_MODEL,
      generationConfig: {
        temperature: 0.1, // More deterministic
        topK: 10,
        topP: 0.8
      }
    });
    
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
      logger.error('Gemini Analysis failed:', error);
      throw error;
    }
  }

  async makeExplorationDecision(
    html: string,
    extractedData: Record<string, unknown>,
    filledFieldSelectors: string[],
    visitedElements: string[],
    documentList: { name: string; category: string }[]
  ): Promise<DecisionResult> {
    try {
      // Create cache key based on HTML content and state
      const htmlHash = this.calculateHash(html.substring(0, 1000)); // Hash first 1000 chars for speed
      const cacheKey = `${htmlHash}_${filledFieldSelectors.length}_${visitedElements.length}`;

      if (this.responseCache.has(cacheKey)) {
        logger.debug('Returning cached Gemini decision');
        return this.responseCache.get(cacheKey)!;
      }

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
You are an intelligent automation agent navigating a complex Single Page Application (SPA).
Your goal is to find and fill ALL form fields across ALL tabs, modals, and sections.

PRIORITY ORDER (follow strictly):
1. [MODAL] If an overlay/modal is open with unfilled fields → return "FILL"
2. [FIELDS] If there are visible, unfilled, required-looking input/select fields on current screen → return "FILL"
3. [UPLOAD] If there is a file upload field (<input type="file">) matching a doc → return "UPLOAD"
4. [EXPAND] If there are "Add New", "Create", or "+" buttons likely to open forms → return "NAVIGATE"
5. [NAVIGATE] If there are UNVISITED tabs, menu items, or steps (e.g. "Education", "Employment", "Next Step") → return "NAVIGATE"
   * Look for: role="tab", class="nav-link", "step-indicator", or buttons like "Next" / "Save & Continue"
6. [DONE] ONLY if all visible fields are filled, all tabs visited, and ready to submit → return "DONE"

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
      
      this.logResponse(text);

      const parsed = this.safeJsonParse(text);
      
      // Validate the response matches DecisionResult structure
      if (!parsed.type || !['FILL', 'NAVIGATE', 'UPLOAD', 'DONE'].includes(parsed.type)) {
        throw new Error(`Invalid decision type: ${parsed.type}`);
      }

      // Update cache (LRU style - simplistic)
      if (this.responseCache.size > 100) {
        this.responseCache.clear();
      }
      this.responseCache.set(cacheKey, parsed as DecisionResult);

      return parsed as DecisionResult;

    } catch (error) {
      logger.error('Gemini Exploration decision failed:', error);
      throw error;
    }
  }

  private safeJsonParse(text: string, maxRetries = 3): any {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(clean);
      } catch (e) {
        if (i === maxRetries - 1) {
          logger.warn(`JSON parse failed after ${maxRetries} attempts: ${text}`);
          throw e; // Rethrow on last attempt
        }
        logger.warn(`JSON parse attempt ${i + 1} failed, retrying...`);
        break; 
      }
    }
    throw new Error('JSON parse failed');
  }

  private calculateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private logResponse(response: string) {
    const logFile = path.join(this.logPath, 'gemini_response.log');
    const timestamp = new Date().toISOString();
    const entry = `\n[${timestamp}]\n${response}\n-----------------------------------\n`;
    fs.appendFileSync(logFile, entry);
  }
}
