import { Page } from 'playwright-core';

// Field type detection from DOM elements
// Auto-detects the actual field type from the rendered page
export class FieldTypeDetector {
  constructor(private page: Page) {}

  // Detect field type from selector by querying the actual DOM element
  async detect(selector: string, providedType: string): Promise<string> {
    // Quick check from selector patterns
    if (selector.toLowerCase().includes('select[') || selector.toLowerCase().includes('select#')) {
      return 'select';
    }
    
    if (selector.includes('type="radio"') || selector.includes("type='radio'")) {
      return 'radio';
    }
    
    if (selector.includes('type="checkbox"') || selector.includes("type='checkbox'")) {
      return 'checkbox';
    }
    
    // Query DOM for actual element type
    try {
      const elementType = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'select') return 'select';
        if (tagName === 'textarea') return 'textarea';
        if (tagName === 'button') return 'button';
        
        if (tagName === 'input') {
          const type = (el as HTMLInputElement).type.toLowerCase();
          if (type === 'radio') return 'radio';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'date') return 'date';
          if (type === 'file') return 'file';
          if (type === 'email') return 'email';
          if (type === 'tel') return 'tel';
          if (type === 'number') return 'number';
          return 'text';
        }
        
        return null;
      }, selector);
      
      if (elementType) {
        return elementType;
      }
    } catch {
      // Ignore detection errors, fall back to provided type
    }
    
    return providedType || 'text';
  }
}
