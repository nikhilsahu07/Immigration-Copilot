import type { AutomatedField } from '../fillers/base-filler';
import { DocumentResolver } from './document-resolver';

/**
 * Maps AI response fields to AutomatedField objects
 * Handles field transformation and document resolution
 */
export class FieldMapper {
  /**
   * Map AI response fields to AutomatedField array
   */
  static mapFields(
    aiFields: any[], 
    documentLookup?: Map<string, string>
  ): AutomatedField[] {
    if (!Array.isArray(aiFields)) {
      return [];
    }

    return aiFields.map((f: any, i: number) => {
      let value = (f.value as string) || '';
      
      // For file fields, resolve document name to S3 key
      if (f.fieldType === 'file' && value && documentLookup) {
        const s3Key = DocumentResolver.resolve(value, documentLookup);
        if (s3Key) {
          value = s3Key;
        }
      }
      
      return {
        fieldIndex: i,
        fieldName: (f.fieldName as string) || '',
        fieldLabel: (f.fieldName as string) || '',
        fieldType: (f.fieldType as string) || 'text',
        selector: (f.selector as string) || '',
        value,
        confidence: 'high',
        reasoning: (f.reason as string) || '',
      };
    });
  }

  /**
   * Find empty fields that need manual input
   */
  static findEmptyFields(fields: AutomatedField[]): AutomatedField[] {
    return fields.filter(f => !f.value || f.value.trim() === '' || f.value === 'N/A');
  }
}
