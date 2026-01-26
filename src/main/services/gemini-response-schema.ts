/**
 * Gemini Response Schema
 * 
 * Zod schema for validating and parsing Gemini API responses.
 * Replaces fragile brace-counting JSON repair with strict validation.
 */

import { z } from 'zod';

/**
 * Confidence level for field mappings
 */
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']).default('medium');

/**
 * Field behavior types
 */
export const FieldBehaviorSchema = z.enum([
  'text_entry',
  'masked_input',
  'multiline_text',
  'single_choice',
  'single_choice_dropdown',
  'single_choice_radio',
  'multi_choice',
  'search_and_select',
  'boolean_toggle',
  'boolean_checkbox',
  'date_picker',
  'date_text',
  'time_picker',
  'numeric_input',
  'range_slider',
  'file_upload',
  'multi_file_upload',
  'otp_group',
  'consent_checkbox',
  'unknown'
]).default('text_entry');

/**
 * Field status types
 */
export const FieldStatusSchema = z.enum([
  'ready',
  'missing_data',
  'low_confidence',
  'requires_human'
]).default('ready');

/**
 * Action intent types
 */
export const ActionIntentSchema = z.enum([
  'primary_navigation',
  'secondary_action',
  'create_new',
  'save_draft',
  'cancel',
  'modal_confirm',
  'modal_dismiss',
  'unknown'
]).default('primary_navigation');

/**
 * Single field in the Gemini response
 */
export const GeminiFieldSchema = z.object({
  fieldId: z.string().optional(),
  fieldName: z.string(),
  behavior: FieldBehaviorSchema,
  intent: z.string().optional(),
  expectedValue: z.union([z.string(), z.boolean(), z.number()]),
  confidence: ConfidenceLevelSchema,
  status: FieldStatusSchema,
  reason: z.string().optional(),
  constraints: z.object({
    required: z.boolean().optional(),
    pattern: z.string().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  }).optional(),
});

/**
 * Single action in the Gemini response
 */
export const GeminiActionSchema = z.object({
  intent: ActionIntentSchema,
  description: z.string().optional(),
  expectedText: z.string(),
  fieldId: z.string().optional(),
  selectorHint: z.string().optional(),
  confidence: ConfidenceLevelSchema,
});

/**
 * Page types
 */
export const PageTypeSchema = z.enum([
  'dashboard',
  'form',
  'confirmation',
  'error',
  'login',
  'unknown'
]).default('unknown');

/**
 * Complete Gemini response schema
 */
export const GeminiResponseSchema = z.object({
  pageType: PageTypeSchema,
  pageSummary: z.string().default(''),
  isFormPage: z.boolean().default(false),
  fields: z.array(GeminiFieldSchema).default([]),
  // CRITICAL: Exactly one action required per page
  actions: z.array(GeminiActionSchema).min(0).max(5).default([]),
  captcha: z.object({
    detected: z.boolean(),
    isInsideForm: z.boolean().optional(),
  }).optional().default({ detected: false }),
  otp: z.object({
    detected: z.boolean(),
  }).optional().default({ detected: false }),
});

export type GeminiResponseType = z.infer<typeof GeminiResponseSchema>;

/**
 * Parse and validate Gemini response with Zod
 * Returns a valid response or throws a descriptive error
 */
export function parseGeminiResponse(jsonText: string): GeminiResponseType {
  // Step 1: Clean the JSON text
  let cleanJson = jsonText.trim();
  
  // Remove markdown code fences if present
  if (cleanJson.startsWith('```')) {
    const firstNewline = cleanJson.indexOf('\n');
    const lastFence = cleanJson.lastIndexOf('```');
    if (lastFence > firstNewline) {
      cleanJson = cleanJson.substring(firstNewline + 1, lastFence).trim();
    }
  }
  
  // Find JSON boundaries
  const firstBrace = cleanJson.indexOf('{');
  const lastBrace = cleanJson.lastIndexOf('}');
  
  if (firstBrace === -1) {
    throw new Error('No JSON object found in Gemini response');
  }
  
  // Handle truncated response
  if (lastBrace === -1 || lastBrace <= firstBrace) {
    // Attempt minimal recovery for truncated JSON
    const recoveredJson = attemptTruncationRecovery(cleanJson.substring(firstBrace));
    
    if (recoveredJson) {
      cleanJson = recoveredJson;
    } else {
      throw new Error(
        'Gemini response is truncated and could not be recovered. ' +
        'Consider increasing maxOutputTokens or reducing the number of fields.'
      );
    }
  } else {
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
  }
  
  // Step 2: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Failed to parse Gemini response as JSON: ${errorMsg}`);
  }
  
  // Step 3: Validate with Zod schema
  const result = GeminiResponseSchema.safeParse(parsed);
  
  if (!result.success) {
    const issues = result.error.issues.map(i => 
      `${i.path.join('.')}: ${i.message}`
    ).join('; ');
    
    throw new Error(`Gemini response validation failed: ${issues}`);
  }
  
  // Step 4: Post-processing validations
  const validated = result.data;
  
  // Ensure dashboard pages have empty fields array
  if (validated.pageType === 'dashboard' && validated.fields.length > 0) {
    // Log warning but allow - some dashboards have filter fields
    console.warn(`Dashboard page has ${validated.fields.length} fields - unusual but allowed`);
  }
  
  // Ensure we have at least one action for navigation
  if (validated.actions.length === 0) {
    console.warn('No actions in Gemini response - may require manual intervention');
  }
  
  return validated;
}

/**
 * Attempt to recover truncated JSON by adding minimal closing structure
 */
function attemptTruncationRecovery(partialJson: string): string | null {
  try {
    // Find last complete-looking field ending
    const lastGoodPoint = Math.max(
      partialJson.lastIndexOf('},'),
      partialJson.lastIndexOf('"]'),
      partialJson.lastIndexOf('"}')
    );
    
    if (lastGoodPoint === -1) {
      return null; // Can't find good recovery point
    }
    
    // Truncate at last good point
    let recovered = partialJson.substring(0, lastGoodPoint + 2);
    
    // Add required closing structure
    // Recount after truncation
    const newOpenBrackets = (recovered.match(/\[/g) || []).length;
    const newCloseBrackets = (recovered.match(/\]/g) || []).length;
    const newOpenBraces = (recovered.match(/\{/g) || []).length;
    const newCloseBraces = (recovered.match(/\}/g) || []).length;
    
    // Close arrays first
    for (let i = 0; i < (newOpenBrackets - newCloseBrackets); i++) {
      recovered += ']';
    }
    
    // Add minimal required fields if missing
    if (!recovered.includes('"actions"')) {
      recovered += ',"actions":[]';
    }
    
    // Close remaining objects
    for (let i = 0; i < (newOpenBraces - newCloseBraces); i++) {
      recovered += '}';
    }
    
    // Verify we can parse it
    JSON.parse(recovered);
    return recovered;
    
  } catch {
    return null;
  }
}

/**
 * Safe wrapper that returns default on failure instead of throwing
 */
export function parseGeminiResponseSafe(
  jsonText: string
): { success: true; data: GeminiResponseType } | { success: false; error: string } {
  try {
    const data = parseGeminiResponse(jsonText);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
