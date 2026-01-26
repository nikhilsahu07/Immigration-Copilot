
import type { AutomatedField } from '../fillers/base-filler';
import { DocumentResolver } from './document-resolver';
import { CanonicalFieldsMap } from '../utils/canonical-fields-map';
import { CanonicalField } from '../../../shared/types/automation.types';

/**
 * Maps AI response fields to AutomatedField objects
 * Now uses fieldId to lookup canonical fields from the map
 * Handles field transformation and document resolution
 */
export class FieldMapper {
  /**
   * Map AI response fields to AutomatedField array using fieldId lookup
   */
  static mapFields(
    aiFields: any[], 
    canonicalFieldsMap: CanonicalFieldsMap,
    documentLookup?: Map<string, string>
  ): AutomatedField[] {
    if (!Array.isArray(aiFields)) {
      return [];
    }

    return aiFields.map((f: any, i: number) => {
      let value = (f.expectedValue as string) || '';
      
      // For file fields, resolve document name to S3 key
      if (f.behavior === 'file_upload' && value && documentLookup) {
        const s3Key = DocumentResolver.resolve(value, documentLookup);
        if (s3Key) {
          value = s3Key;
        }
      }
      
      // Lookup canonical field by fieldId
      let canonicalField: CanonicalField | undefined;
      if (f.fieldId) {
        canonicalField = canonicalFieldsMap.getByFieldId(f.fieldId);
      } else if (f.fieldName) {
        // Fallback: try to find by accessibleName
        const matches = canonicalFieldsMap.getByAccessibleName(f.fieldName);
        if (matches.length > 0) {
          canonicalField = matches[0]; // Use first match
        }
      }

      const automatedField: AutomatedField = {
        fieldIndex: i,
        fieldName: (f.fieldName as string) || canonicalField?.accessibleName || '',
        fieldLabel: (f.fieldName as string) || canonicalField?.accessibleName || '',
        fieldType: (f.fieldType as string) || canonicalField?.controlType || 'text',
        selector: canonicalField?.fallback.selector || undefined, // Fallback only
        value,
        confidence: f.confidence || 'high',
        reasoning: (f.reason as string) || '',
        // Semantic fields
        fieldId: f.fieldId || canonicalField?.fieldId,
        accessibleName: canonicalField?.accessibleName,
        role: canonicalField?.role || undefined,
        labels: canonicalField?.labels ? {
          labelText: canonicalField.labels.labelText || undefined,
          ariaLabel: canonicalField.labels.ariaLabel || undefined,
          placeholder: canonicalField.labels.placeholder || undefined,
        } : undefined,
      };

      return automatedField;
    });
  }

  /**
   * Find empty fields that need manual input
   */
  static findEmptyFields(fields: AutomatedField[]): AutomatedField[] {
    return fields.filter(f => !f.value || f.value.trim() === '' || f.value === 'N/A');
  }
}
