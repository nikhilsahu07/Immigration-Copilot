import { CanonicalField } from '../../../shared/types/automation.types';

/**
 * FIELD IDENTIFIER EXPLANATION:
 * 
 * Understanding the difference between tag, controlType, role, and accessibleName:
 * 
 * 1. **tag** (HTML tag):
 *    - The actual HTML element: 'input', 'select', 'textarea', 'button', 'a'
 *    - Example: <input type="email"> → tag: "input"
 *    - Purpose: Technical HTML structure
 * 
 * 2. **controlType** (Semantic field type):
 *    - The semantic type of the control: 'text', 'email', 'select', 'checkbox', 'radio', etc.
 *    - Derived from tag + type attribute + classes
 *    - Example: <input type="email"> → controlType: "email"
 *    - Example: <select> → controlType: "select"
 *    - Purpose: Determines BEHAVIOR (how to interact: type, click, select, etc.)
 * 
 * 3. **role** (ARIA role):
 *    - The accessibility role: 'textbox', 'combobox', 'button', 'checkbox', etc.
 *    - Can be explicit (role="textbox") or inferred from tag/type
 *    - Example: <input type="email"> → role: "textbox"
 *    - Example: <select> → role: "combobox" or "listbox"
 *    - Purpose: Used for semantic matching via getByRole(role, { name })
 * 
 * 4. **accessibleName** (Semantic identifier):
 *    - The human-readable name computed from labels, aria-label, placeholder, etc.
 *    - Example: "First Name", "Email Address", "Submit"
 *    - This is the PRIMARY identifier for field matching
 *    - Purpose: Used for semantic matching via getByRole/getByLabel/getByPlaceholder
 * 
 * USAGE IN FIELD RESOLUTION:
 * - accessibleName + role → page.getByRole(role, { name: accessibleName })
 * - accessibleName (from labels.labelText) → page.getByLabel(labelText)
 * - accessibleName (from labels.placeholder) → page.getByPlaceholder(placeholder)
 * - controlType → Determines which filler to use (TextFiller, SelectFiller, etc.)
 */

/**
 * Filter canonical fields to only form-relevant fields
 * Removes navigation links, standalone buttons, etc.
 */
export function filterFormFields(fields: CanonicalField[]): CanonicalField[] {
  return fields.filter(field => {
    // Keep actual form inputs
    if (['input', 'select', 'textarea'].includes(field.tag)) {
      return true;
    }

    // Keep buttons that are inside forms or are submit buttons
    if (field.tag === 'button') {
      // Check if it's a submit button or inside a form
      return field.controlType === 'text' && 
             (field.fallback.selector?.includes('submit') || 
              field.context.formIndex > 0);
    }

    // Filter out links and other non-form elements
    return false;
  });
}

/**
 * Keywords that typically indicate large, domain-style enumerations
 * where the full option list is not needed in the AI prompt.
 */
const LARGE_DOMAIN_KEYWORDS = [
  'country',
  'nationality',
  'citizenship',
  'state',
  'province',
  'city',
  'district',
  'university',
  'college',
  'school',
  'company',
  'employer',
];

/**
 * Detect whether a field's options represent a large, domain-style list
 * (e.g., countries, universities, companies) where we should truncate options
 * in the AI prompt to save tokens.
 */
function shouldTruncateOptions(field: CanonicalField, minLength: number = 15): boolean {
  if (!field.options || field.options.length <= minLength) {
    return false;
  }

  const textParts: string[] = [];
  if (field.accessibleName) textParts.push(field.accessibleName);
  if (field.labels.labelText) textParts.push(field.labels.labelText);
  if (field.labels.placeholder) textParts.push(field.labels.placeholder);
  if (field.context.sectionHeading) textParts.push(field.context.sectionHeading);

  const haystack = textParts.join(' ').toLowerCase();
  if (!haystack) {
    return false;
  }

  return LARGE_DOMAIN_KEYWORDS.some(keyword => haystack.includes(keyword));
}

interface MinimalFieldOptions {
  /**
   * When true, large domain option lists (countries, universities, etc.)
   * are truncated to a small sample for the AI prompt to reduce token usage.
   * CanonicalField.options remains untouched elsewhere.
   */
  truncateLargeOptions?: boolean;
}

/**
 * Create minimal canonical field structure optimized for Gemini AI
 * Removes null/empty fields and irrelevant data to reduce token count and hallucination
 * 
 * WHAT GEMINI NEEDS:
 * - fieldId: Primary identifier (REQUIRED)
 * - accessibleName: Semantic name for field matching (REQUIRED)
 * - tag: HTML tag (for context)
 * - controlType: Field type to determine behavior (REQUIRED)
 * - role: ARIA role for semantic matching (if available)
 * - labels: Only non-null label sources (labelText, placeholder, ariaLabel)
 * - state.required: For constraints (only if true)
 * - options: Only if select/radio has options (may be truncated for large domains)
 * - context.positionInForm: For field preference rule (only if formIndex > 0)
 * 
 * WHAT WE REMOVE:
 * - group: null (not needed)
 * - state.disabled, state.readonly, state.visible, state.checked, state.value (unless critical)
 * - validation: All nulls (not needed for mapping)
 * - interactionHints: Default values (not needed)
 * - context.formIndex: 0, context.sectionHeading: null (not needed)
 * - fallback.selector: Mentioned as "reference only" in prompt
 */
export function createMinimalCanonicalField(
  field: CanonicalField,
  options?: MinimalFieldOptions,
): any {
  const minimal: any = {
    fieldId: field.fieldId,
    tag: field.tag,
    controlType: field.controlType,
    accessibleName: field.accessibleName,
  };

  // Only include role if not null (needed for getByRole semantic matching)
  if (field.role) {
    minimal.role = field.role;
  }

  // Only include labels that have values (needed for getByLabel/getByPlaceholder)
  const labels: any = {};
  if (field.labels.labelText) labels.labelText = field.labels.labelText;
  if (field.labels.ariaLabel) labels.ariaLabel = field.labels.ariaLabel;
  if (field.labels.placeholder) labels.placeholder = field.labels.placeholder;
  if (Object.keys(labels).length > 0) {
    minimal.labels = labels;
  }

  // Only include state.required (for constraints) - other state fields not needed
  if (field.state.required) {
    minimal.required = field.state.required; // Simplified: just "required" boolean
  }

  // Only include options if present (needed for select/radio behavior detection)
  if (field.options.length > 0) {
    // Simplify options - only include value and label (selected/disabled not needed)
    let simpleOptions = field.options.map(opt => ({
      value: opt.value,
      label: opt.label,
    }));

    if (options?.truncateLargeOptions && shouldTruncateOptions(field)) {
      const total = simpleOptions.length;
      const sampleSize = 3;
      simpleOptions = simpleOptions.slice(0, sampleSize);

      minimal.options = simpleOptions;
      minimal.optionsSummary = {
        truncated: true,
        totalOptions: total,
        sampleSize,
      };
    } else {
      minimal.options = simpleOptions;
    }
  }

  // Only include context.positionInForm if formIndex > 0 (for field preference rule)
  if (field.context.formIndex > 0) {
    minimal.positionInForm = field.context.positionInForm;
  }
  // Include sectionHeading if present (helps with context)
  if (field.context.sectionHeading) {
    if (!minimal.positionInForm) {
      minimal.positionInForm = field.context.positionInForm;
    }
    minimal.sectionHeading = field.context.sectionHeading;
  }

  // CRITICAL: For radio buttons, preserve the group.questionLabel so Gemini knows what the question is
  // This is essential because radio buttons need context (e.g., "Is the applicant a citizen of more than one country?")
  // not just the individual option label (e.g., "No")
  if (field.controlType === 'radio' && field.group?.groupLabel) {
    minimal.questionLabel = field.group.groupLabel;
  }

  return minimal;
}

/**
 * Create clean, minimal log output for canonical fields
 */
export function createCleanCanonicalFieldsLog(fields: CanonicalField[]): string {
  // Filter to only form fields
  const formFields = filterFormFields(fields);
  
  // Create minimal structure
  const minimalFields = formFields.map(field => createMinimalCanonicalField(field));
  
  return JSON.stringify(minimalFields, null, 2);
}

/**
 * Create optimized minimal canonical fields for AI prompt
 * Removes all null/empty/irrelevant fields to reduce token count and hallucination
 * This is specifically optimized for Gemini AI analysis.
 * For large domain option lists, only a small sample of options is included
 * along with an optionsSummary to indicate truncation.
 */
export function createCleanCanonicalFieldsForAI(fields: CanonicalField[]): string {
  // Filter to only form fields
  const formFields = filterFormFields(fields);
  
  // Create minimal structure optimized for AI
  const minimalFields = formFields.map(field =>
    createMinimalCanonicalField(field, { truncateLargeOptions: true }),
  );
  
  // Use compact JSON (no pretty printing) to save tokens
  return JSON.stringify(minimalFields);
}
