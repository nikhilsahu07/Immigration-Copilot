
import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai';
import { getAIConfig } from '../config/ai.config';
import { logger, geminiPromptLogger, geminiResponseLogger, htmlFieldsStructureLogger } from '../core/logger';

import { BehaviorFormMapping } from '../../shared/types';
import { CanonicalField } from '../../shared/types/automation.types';
import { createCleanCanonicalFieldsForAI } from '../automation/utils/canonical-field-logger';
import { parseGeminiResponse } from './gemini-response-schema';

export type AIAnalysisResult = BehaviorFormMapping;

export class AIService {
  private getModel(apiKey: string, modelName: string): GenerativeModel {
    const config = getAIConfig(apiKey, modelName);
    const genAI = new GoogleGenerativeAI(config.apiKey);
    
    // Use JSON mode if available (Gemini 1.5+ supports responseMimeType)
    const modelConfig: any = {
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
        // Enable JSON mode for structured output
        responseMimeType: 'application/json',
      },
    };
    
    return genAI.getGenerativeModel(modelConfig);
  }

  async analyzePageAndMapFields(
    canonicalFields: CanonicalField[], 
    extractedData: any,
    documentList: { name: string; category: string }[],
    apiKey: string,
    modelName: string,
    customPrompt?: string,
    screenshotBase64?: string,
  ): Promise<AIAnalysisResult> {
    try {
      // Build document list string
      const documentListStr = documentList.length > 0
        ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
        : 'No documents attached';

      const prompt = `
          You are an intelligent automation agent that DESCRIBES form fields and actions.
          Your job is to identify INTENT and BEHAVIOR, not to dictate execution.

          ===============================================================================
          CRITICAL CONTRACT REQUIREMENTS:
          ===============================================================================
          
          1. OUTPUT FORMAT: Return ONLY a single valid JSON object. NO explanations, NO markdown, NO code fences, NO backticks, NO multiple candidates. Start with { and end with }.
          2. COMPLETE JSON: The JSON MUST be complete and valid. ALL strings must be closed with quotes, ALL arrays closed with ], ALL objects closed with }. Incomplete JSON will cause parsing failure.
          3. ACTIONS CONTRACT: The "actions" array MUST contain EXACTLY ONE primary action per page (no more, no less).
          4. MISSING DATA: Use "expectedValue": "__MISSING__" and "status": "missing_data" for unknown values. NEVER invent fake data.
          5. DASHBOARD PAGES: Must have "fields": [] (empty array) and exactly one action.
          6. FORM PAGES: Must map ALL visible fields from the structure, and include exactly one primary action (submit/next button).
          7. TRUNCATION PREVENTION: If you have many fields, ensure you complete the JSON structure. It's better to have fewer complete fields than many incomplete ones.
          
          ===============================================================================

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
          Follow custom instructions strictly and custom instructions would be provided by the user as decision making and information of expectedValue:
          ${customPrompt || 'None'}

          ${screenshotBase64 ? `CRITICAL INSTRUCTION: An image of the webpage is attached.\n1. Use the IMAGE to understand the visual layout, context, and which form corresponds to the user's intent. Use the HTML fields provided below strictly for extracting correct CSS selectors.\n2. If there is a visual conflict between HTML and Image, prioritize the Image for "Context" but the HTML/fields for "Selectors".` : ''}

          FORM FIELDS STRUCTURE (Canonical Schema - Pre-processed HTML):
          ${createCleanCanonicalFieldsForAI(canonicalFields)}
          
          NOTE: This structure uses semantic identifiers:
          - "fieldId" is the PRIMARY identifier you MUST use in your response
          - "accessibleName" is the semantic name (for field matching - use this for fieldName)
          - "tag" is the HTML tag (input, select, textarea, button)
          - "controlType" indicates the field type (text, email, select, checkbox, etc.) - use this to determine behavior
          - "role" is the ARIA role (textbox, combobox, button, etc.) - helps with semantic matching
          - "labels" contains labelText, placeholder, or ariaLabel (for semantic matching)
          - "required" indicates if field is required (for constraints)
          - "options" contains select/radio options (only present if field has options). For very large lists
            (countries, universities, companies, etc.) only a SAMPLE of options may be shown; assume more
            options are available in the UI when deciding expected values.
          - "positionInForm" helps disambiguate when multiple similar fields exist

          FIELD BEHAVIOR TYPES (CRITICAL - choose the most specific):
          - "text_entry" = simple text input
          - "masked_input" = formatted input (phone, SSN, postal code with mask)
          - "search_and_select" = autocomplete/searchable dropdown (can type to filter)
          - "single_choice_dropdown" = static dropdown/select (no search)
          - "single_choice_radio" = radio button group (one option can be selected)
          - "single_choice" = generic single choice when you cannot clearly tell if it's dropdown or radio
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

          ===============================================================================
          OUTPUT CONTRACT (MANDATORY - STRICT JSON):
          ===============================================================================
          
          CRITICAL: You MUST return ONLY a valid, complete JSON object. NO markdown, NO code fences, NO backticks, NO explanations.
          Start your response with { and end with }. Ensure all strings are properly escaped and closed.
          
          You MUST return a valid JSON object with this EXACT structure:
          {
            "pageType": "dashboard" | "form" | "confirmation" | "unknown",
            "pageSummary": "Brief description",
            "isFormPage": boolean,
            "fields": [
              {
                "fieldId": "REQUIRED - Use the fieldId from the canonical field structure above",
                "fieldName": "Human-readable field name (use accessibleName from canonical schema)",
                "behavior": "text_entry|masked_input|search_and_select|single_choice_dropdown|single_choice_radio|single_choice|date_picker|boolean_toggle|consent_checkbox|otp_group|range_slider|file_upload",
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
                "fieldId": "OPTIONAL - Use fieldId if the action button is in the canonical fields structure",
                "confidence": "high|medium|low"
              }
            ],
            "captcha": { "detected": boolean },
            "otp": { "detected": boolean, "behavior": "otp_group", "confidence": "high|medium|low" }
          }

          FIELD PREFERENCE RULE (when multiple fields are semantically similar):
          - Prefer the field with: 1) explicit accessibleName (non-empty), 2) required=true (state.required), 3) earlier positionInForm (context.positionInForm ascending)

          ===============================================================================
          CRITICAL RULES (CONTRACT ENFORCEMENT):
          ===============================================================================
          
          1. DESCRIBE, DON'T COMMAND: Identify what fields/actions MEAN, not how to execute them
          
          2. DASHBOARD OUTPUT CONSTRAINT (MANDATORY):
             - If pageType = "dashboard":
               - fields MUST be an empty array: "fields": []
               - actions MUST contain EXACTLY ONE item: "actions": [ { ... } ]
               - Choose the single most relevant next step (e.g., "start new application", "create new", "continue", "open application")
          
          3. FORM OUTPUT CONSTRAINT (MANDATORY):
             - If pageType = "form":
               - MAP ALL VISIBLE FIELDS from the structure above
               - Include fields even if missing data (use "__MISSING__")
               - actions MUST contain EXACTLY ONE primary action (submit/next button)
          
          4. SINGLE ACTION RULE (MANDATORY FOR ALL PAGES):
             - The "actions" array MUST ALWAYS contain EXACTLY ONE action
             - Choose the SINGLE most relevant primary action for this page
             - Dashboard: the main navigation button (e.g., "Register New Student", "Create Application")
             - Form: the primary submit button (e.g., "Next", "Submit", "Continue", "Save")
             - Do NOT include secondary actions like filters, search, archive, or cancel buttons
             - Focus on the action that progresses the user toward completing the application
          
          5. MISSING DATA HANDLING (MANDATORY):
             - If client data is MISSING: set "expectedValue": "__MISSING__" and "status": "missing_data"
             - NEVER invent fake/placeholder data
             - Be explicit about what you don't know
          
          6. CONFIDENCE IS KEY: low confidence → require review (status="low_confidence")
          
          7. FIELD IDENTIFIER (CRITICAL): You MUST return "fieldId" from the canonical field structure. DO NOT return selectors. Our system will use semantic discovery (getByRole, getByLabel, etc.) to find fields. The fieldId is the primary identifier that links your response to the canonical field structure.
          
          8. BEHAVIOR OVER TYPE: Use "search_and_select" only when it's truly searchable/autocomplete
          
          9. Terms checkboxes: behavior="consent_checkbox", confidence="high"
          
          10. OTP fields: behavior="otp_group", use the fieldId for the OTP group field
          
          11. OUTPUT FORMAT (CRITICAL - STRICT JSON ONLY):
              - Return ONLY a valid JSON object - NO markdown, NO code fences, NO backticks
              - Start your response with { and end with }
              - NO explanatory text before or after the JSON
              - NO markdown code block markers (no triple backticks)
              - NO text outside the JSON object
              - The JSON MUST be complete and valid - ensure all strings are properly closed, all arrays/objects are properly closed
              - CRITICAL: If you have many fields, prioritize completing the JSON structure over including every field
              - ALWAYS close all strings, arrays, and objects - incomplete JSON will cause parsing failure
              - Contract violation = parsing failure
          
          ===============================================================================
          `;


      // Log canonical fields - EXACT fields structure JSON after cleaning and extraction
      try {
        htmlFieldsStructureLogger.info(
          `--- CANONICAL FIELDS (EXACT STRUCTURE AFTER CLEANING AND EXTRACTION) ---\n` +
          `TIMESTAMP: ${new Date().toISOString()}\n` +
          `Total Fields: ${canonicalFields.length}\n\n` +
          `${JSON.stringify(canonicalFields, null, 2)}\n\n` +
          `--- END CANONICAL FIELDS ---\n`
        );
      } catch {
        // Never break on logging failures
      }

      // Log EXACT prompt text sent to Gemini - no truncation, no filtering
      try {
        geminiPromptLogger.info(
          `--- EXACT PROMPT SENT TO GEMINI ---\n` +
          `TIMESTAMP: ${new Date().toISOString()}\n\n` +
          `${prompt}\n\n` +
          `--- END PROMPT ---\n`
        );
      } catch {
        // Fallback to simple logging
        geminiPromptLogger.info(
          `--- EXACT PROMPT SENT TO GEMINI ---\n` +
          `TIMESTAMP: ${new Date().toISOString()}\n\n` +
          `${prompt}\n\n` +
          `--- END PROMPT ---\n`
        );
      }

      // Prepare request parts
      const parts: Part[] = [{ text: prompt }];
      if (screenshotBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: screenshotBase64
          }
        });
      }

      const model = this.getModel(apiKey, modelName);
      const result = await model.generateContent(parts);
      const response = result.response;
      const usage = response.usageMetadata;
      const text = response.text(); // EXACT raw response from Gemini
      
      // Log EXACT response from Gemini - no cleaning, no truncation
      this.logResponse(text, usage, !!screenshotBase64);
      
      // Extract and parse JSON with robust Zod-based validation
      // This replaces the fragile brace-counting and manual repair logic
      const parsedJson = parseGeminiResponse(text) as AIAnalysisResult;

      return parsedJson;

    } catch (error) {
      logger.error('AI Analysis failed:', error);
      throw error;
    }
  }

  private logResponse(
    response: string,
    usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
    imageAttached?: boolean
  ) {
    const timestamp = new Date().toISOString();
    
    let usageStr = '';
    if (usage) {
      usageStr = `\nImage Attached: ${imageAttached ? 'Yes' : 'No'}\nPrompt Tokens: ${usage.promptTokenCount}\nResponse Tokens: ${usage.candidatesTokenCount}\nTotal Tokens: ${usage.totalTokenCount}`;
    }

    // Log EXACT response from Gemini - no truncation, no filtering
    const entry = `--- EXACT RESPONSE FROM GEMINI ---\n` +
      `TIMESTAMP: ${timestamp}${usageStr}\n\n` +
      `${response}\n\n` +
      `--- END RESPONSE ---\n`;
    geminiResponseLogger.info(entry);
  }
}

export const aiService = new AIService();
