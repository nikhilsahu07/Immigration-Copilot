import { getEnv } from '../../config/environment';
import { logger } from '../../core/logger';
import { DecisionResult } from '../../../shared/types';
import { AIProvider, AIAnalysisResult } from './ai.interface';
import { buildAnalysisPrompt } from './prompt';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class OllamaProvider implements AIProvider {
  private model: string;
  private baseUrl: string;
  private logPath: string;
  private responseCache = new Map<string, DecisionResult>();

  constructor() {
    const env = getEnv();
    this.model = env.OLLAMA_MODEL || 'qwen2.5:0.5b';
    this.baseUrl = env.OLLAMA_URL || 'http://localhost:11434';
    
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
      // Format HTML to be multi-line for better readability in logs/LLM context
      // This helps with "single line" issue mentioned by user
      const formattedHtml = html.replace(/></g, '>\n<');

      const prompt = buildAnalysisPrompt(formattedHtml, extractedData, documentList, customPrompt);

      logger.info('Sending request to Ollama...');

      // Log prompt to specialized log file
      this.logPrompt(prompt);
      
      const response = await this.generateContent(prompt);
      const text = response;
      
      // Clean markdown code blocks if present
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      this.logResponse(cleanJson);

      return JSON.parse(cleanJson) as AIAnalysisResult;

    } catch (error) {
      logger.error('Ollama Analysis failed:', error);
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
      const htmlHash = this.calculateHash(html.substring(0, 1000)); 
      const cacheKey = `${htmlHash}_${filledFieldSelectors.length}_${visitedElements.length}`;

      if (this.responseCache.has(cacheKey)) {
        logger.debug('Returning cached Ollama decision');
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

       // Format HTML for this prompt too
       const formattedHtml = html.substring(0, 80000).replace(/></g, '>\n<');

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
${formattedHtml}

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

      logger.info('Sending exploration decision request to Ollama...');
      
      this.logPrompt(prompt); // Also log exploration prompts

      const text = await this.generateContent(prompt);
      
      this.logResponse(text);

      const parsed = this.safeJsonParse(text);
      
      // Validate the response matches DecisionResult structure
      if (!parsed.type || !['FILL', 'NAVIGATE', 'UPLOAD', 'DONE'].includes(parsed.type)) {
        throw new Error(`Invalid decision type: ${parsed.type}`);
      }

      // Update cache
      if (this.responseCache.size > 100) {
        this.responseCache.clear();
      }
      this.responseCache.set(cacheKey, parsed as DecisionResult);

      return parsed as DecisionResult;

    } catch (error) {
      logger.error('Ollama Exploration decision failed:', error);
      throw error;
    }
  }

  private async generateContent(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          format: 'json',
          keep_alive: "5m"
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      logger.error('Error calling Ollama API:', error);
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
    const logFile = path.join(this.logPath, 'ollama_response.log');
    const timestamp = new Date().toISOString();
    const entry = `\n[${timestamp}]\n${response}\n-----------------------------------\n`;
    fs.appendFileSync(logFile, entry);
  }

  private logPrompt(prompt: string) {
    const logFile = path.join(this.logPath, 'ollama_prompt.log');
    const timestamp = new Date().toISOString();
    const entry = `\n[${timestamp}]\n${prompt}\n-----------------------------------\n`;
    fs.appendFileSync(logFile, entry);
  }
}
