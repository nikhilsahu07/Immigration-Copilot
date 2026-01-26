import { createHash } from 'crypto';
import { ControlType } from '../../../shared/types/automation.types';

/**
 * Generate stable field ID from semantic properties
 * 
 * Uses hash-based ID for consistency across DOM changes.
 * The ID is based on semantic properties (accessibleName, controlType, formIndex, positionInForm)
 * rather than DOM structure, making it stable for SPAs.
 */
export function generateFieldId(field: {
  accessibleName: string;
  controlType: ControlType;
  formIndex: number;
  positionInForm: number;
}): string {
  // Create a stable string from semantic properties
  const idString = `${field.accessibleName}|${field.controlType}|${field.formIndex}|${field.positionInForm}`;
  
  // Generate hash (first 8 characters for readability)
  const hash = createHash('md5').update(idString).digest('hex').substring(0, 8);
  
  return `field_${hash}`;
}
