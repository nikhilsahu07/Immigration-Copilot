import { CanonicalField } from '../../../shared/types/automation.types';

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
 * Create minimal canonical field structure for logging
 * Removes null/empty fields to reduce noise
 */
export function createMinimalCanonicalField(field: CanonicalField): Partial<CanonicalField> {
  const minimal: any = {
    fieldId: field.fieldId,
    tag: field.tag,
    controlType: field.controlType,
    accessibleName: field.accessibleName,
    fallback: field.fallback,
  };

  // Only include role if not null
  if (field.role) {
    minimal.role = field.role;
  }

  // Only include labels that have values
  const labels: any = {};
  if (field.labels.labelText) labels.labelText = field.labels.labelText;
  if (field.labels.ariaLabel) labels.ariaLabel = field.labels.ariaLabel;
  if (field.labels.placeholder) labels.placeholder = field.labels.placeholder;
  if (Object.keys(labels).length > 0) {
    minimal.labels = labels;
  }

  // Only include state if relevant
  if (field.state.required || field.state.disabled || field.state.checked || field.state.value) {
    minimal.state = {
      required: field.state.required,
      disabled: field.state.disabled,
      checked: field.state.checked,
      value: field.state.value || undefined,
    };
  }

  // Only include options if present
  if (field.options.length > 0) {
    minimal.options = field.options;
  }

  // Only include validation if any values exist
  const validation: any = {};
  if (field.validation.min !== null) validation.min = field.validation.min;
  if (field.validation.max !== null) validation.max = field.validation.max;
  if (field.validation.pattern) validation.pattern = field.validation.pattern;
  if (field.validation.minLength !== null) validation.minLength = field.validation.minLength;
  if (field.validation.maxLength !== null) validation.maxLength = field.validation.maxLength;
  if (Object.keys(validation).length > 0) {
    minimal.validation = validation;
  }

  // Only include interaction hints if not default
  if (field.interactionHints.inputMode !== 'type' || 
      field.interactionHints.blurAfterInput !== true ||
      field.interactionHints.opensDropdown ||
      field.interactionHints.isSearchable) {
    minimal.interactionHints = field.interactionHints;
  }

  // Only include context if formIndex > 0 or has section heading
  if (field.context.formIndex > 0 || field.context.sectionHeading) {
    minimal.context = field.context;
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
  const minimalFields = formFields.map(createMinimalCanonicalField);
  
  return JSON.stringify(minimalFields, null, 2);
}
