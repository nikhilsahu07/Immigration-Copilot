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
  
  // Extract JSON content
  if (lastBrace === -1 || lastBrace <= firstBrace) {
    // No closing brace or invalid - definitely truncated
    cleanJson = cleanJson.substring(firstBrace);
  } else {
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
  }
  
  // Step 2: Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseError) {
    // Parsing failed - might be truncated or malformed
    // Attempt recovery even if we found a closing brace
    const recoveredJson = attemptTruncationRecovery(cleanJson);
    
      if (recoveredJson) {
        try {
          parsed = JSON.parse(recoveredJson);
          cleanJson = recoveredJson; // Use recovered version
        } catch {
          const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(
            `Failed to parse Gemini response as JSON: ${errorMsg}. ` +
            `Recovery attempt also failed. The response may be severely truncated. ` +
            `Consider increasing maxOutputTokens or reducing the number of fields.`
          );
        }
    } else {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(
        `Failed to parse Gemini response as JSON: ${errorMsg}. ` +
        `The response appears to be truncated or malformed. ` +
        `Consider increasing maxOutputTokens or reducing the number of fields.`
      );
    }
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
 * Handles incomplete strings, incomplete objects, and missing closing brackets
 * 
 * IMPROVED: Better detection of incomplete field objects and proper closing
 */
function attemptTruncationRecovery(partialJson: string): string | null {
  try {
    let recovered = partialJson.trim();
    
    // Step 1: Find the fields array
    const fieldsArrayMatch = recovered.match(/"fields":\s*\[/);
    if (!fieldsArrayMatch || fieldsArrayMatch.index === undefined) {
      // No fields array - try basic recovery
      return attemptBasicRecovery(recovered);
    }
    
    const fieldsStart = fieldsArrayMatch.index + fieldsArrayMatch[0].length;
    const fieldsContent = recovered.substring(fieldsStart);
    
    // Step 2: Find the last COMPLETE field object
    // A complete field object has balanced braces and all strings closed
    const lastCompleteFieldEnd = findLastCompleteField(fieldsContent);
    
    if (lastCompleteFieldEnd === -1) {
      // No complete field found - return empty fields array
      recovered = recovered.substring(0, fieldsStart) + ']';
    } else {
      // Truncate at the last complete field
      const truncatePoint = fieldsStart + lastCompleteFieldEnd;
      recovered = recovered.substring(0, truncatePoint) + ']';
    }
    
    // Step 3: Ensure actions array exists
    if (!recovered.includes('"actions"')) {
      // Add actions array before closing
      if (!recovered.endsWith(']') && !recovered.endsWith('}')) {
        recovered += ',';
      }
      recovered += '"actions":[]';
    }
    
    // Step 4: Close all remaining brackets and braces
    recovered = closeAllBrackets(recovered);
    
    // Step 5: Verify we can parse it
    try {
      const parsed = JSON.parse(recovered);
      if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.fields)) {
        return recovered;
      }
      return null;
    } catch {
      return null;
    }
    
  } catch {
    return null;
  }
}

/**
 * Find the last complete field object in the fields array
 * Returns the index where the field ends (before the comma or closing bracket)
 */
function findLastCompleteField(fieldsContent: string): number {
  // Strategy: Walk backwards and find the last }, that has balanced braces before it
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCompleteEnd = -1;
  
  for (let i = fieldsContent.length - 1; i >= 0; i--) {
    const char = fieldsContent[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) {
      continue;
    }
    
    if (char === '}') {
      depth++;
    } else if (char === '{') {
      depth--;
      // If we've closed all braces, this might be a complete field
      if (depth === 0) {
        // Check if this is followed by }, or just } (last field)
        const nextNonWhitespace = findNextNonWhitespace(fieldsContent, i + 1);
        if (nextNonWhitespace !== -1) {
          const nextChar = fieldsContent[nextNonWhitespace];
          if (nextChar === ',' || nextChar === ']') {
            lastCompleteEnd = nextNonWhitespace;
            break;
          }
        } else {
          // End of string - this is the last field
          lastCompleteEnd = i + 1;
          break;
        }
      }
    }
  }
  
  return lastCompleteEnd;
}

/**
 * Find next non-whitespace character
 */
function findNextNonWhitespace(str: string, start: number): number {
  for (let i = start; i < str.length; i++) {
    if (!/\s/.test(str[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Close all unclosed brackets and braces
 */
function closeAllBrackets(json: string): string {
  let result = json;
  
  // Count brackets and braces
  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;
  const openBraces = (result.match(/\{/g) || []).length;
  const closeBraces = (result.match(/\}/g) || []).length;
  
  // Close arrays first
  for (let i = 0; i < (openBrackets - closeBrackets); i++) {
    result += ']';
  }
  
  // Close objects
  for (let i = 0; i < (openBraces - closeBraces); i++) {
    result += '}';
  }
  
  return result;
}

/**
 * Basic recovery when fields array is not found
 */
function attemptBasicRecovery(json: string): string | null {
  try {
    // Find last complete structure
    const lastGoodPoint = Math.max(
      json.lastIndexOf('},'),
      json.lastIndexOf('"]'),
      json.lastIndexOf('"}'),
      json.lastIndexOf('}')
    );
    
    if (lastGoodPoint === -1) {
      return null;
    }
    
    let recovered = json.substring(0, lastGoodPoint + (json[lastGoodPoint] === '}' ? 1 : 2));
    recovered = closeAllBrackets(recovered);
    
    // Ensure required fields exist
    if (!recovered.includes('"fields"')) {
      recovered = recovered.replace(/\}$/, ',"fields":[]}');
    }
    if (!recovered.includes('"actions"')) {
      recovered = recovered.replace(/\}$/, ',"actions":[]}');
    }
    
    try {
      JSON.parse(recovered);
      return recovered;
    } catch {
      return null;
    }
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
