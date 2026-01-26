import { CanonicalField } from '../../../shared/types/automation.types';

/**
 * CanonicalFieldsMap - In-memory lookup map for canonical fields
 * 
 * Maintains a map of fieldId -> CanonicalField for the current page.
 * This allows quick lookup when Gemini returns fieldId in its response.
 */
export class CanonicalFieldsMap {
  private map: Map<string, CanonicalField> = new Map();
  private byAccessibleName: Map<string, CanonicalField[]> = new Map();

  /**
   * Initialize the map with canonical fields
   */
  initialize(fields: CanonicalField[]): void {
    this.map.clear();
    this.byAccessibleName.clear();

    for (const field of fields) {
      // Primary lookup: fieldId -> CanonicalField
      this.map.set(field.fieldId, field);

      // Secondary lookup: accessibleName -> CanonicalField[] (for disambiguation)
      const name = field.accessibleName.toLowerCase().trim();
      if (!this.byAccessibleName.has(name)) {
        this.byAccessibleName.set(name, []);
      }
      this.byAccessibleName.get(name)!.push(field);
    }
  }

  /**
   * Get field by fieldId
   */
  getByFieldId(fieldId: string): CanonicalField | undefined {
    return this.map.get(fieldId);
  }

  /**
   * Get fields by accessible name (may return multiple for disambiguation)
   */
  getByAccessibleName(name: string): CanonicalField[] {
    const normalized = name.toLowerCase().trim();
    return this.byAccessibleName.get(normalized) || [];
  }

  /**
   * Get all fields
   */
  getAllFields(): CanonicalField[] {
    return Array.from(this.map.values());
  }

  /**
   * Clear the map
   */
  clear(): void {
    this.map.clear();
    this.byAccessibleName.clear();
  }

  /**
   * Get map size
   */
  size(): number {
    return this.map.size;
  }
}
