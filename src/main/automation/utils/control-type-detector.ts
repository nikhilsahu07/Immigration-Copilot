import { ControlType } from '../../../shared/types/automation.types';

/**
 * Detect semantic control type from HTML element attributes
 * 
 * Maps HTML input types and elements to semantic control types
 * that are more meaningful for AI processing and automation.
 */
export function detectControlType(element: {
  tag: string;
  type?: string;
  className?: string | null;
  role?: string | null;
}): ControlType {
  const tag = element.tag.toLowerCase();
  const type = (element.type || '').toLowerCase();
  const className = (element.className || '').toLowerCase();
  const role = (element.role || '').toLowerCase();

  // Handle select elements
  if (tag === 'select') {
    // Check for multiselect (multiple attribute would be in raw data)
    // For now, assume single select - can be enhanced later
    return 'select';
  }

  // Handle textarea
  if (tag === 'textarea') {
    return 'textarea';
  }

  // Handle input elements by type
  if (tag === 'input') {
    switch (type) {
      case 'text':
      case 'search':
        // Check for search-select (custom component)
        if (className.includes('search') || className.includes('select') || role === 'combobox') {
          return 'search-select';
        }
        return 'text';
      
      case 'email':
        return 'email';
      
      case 'password':
        return 'password';
      
      case 'tel':
        return 'tel';
      
      case 'number':
        return 'number';
      
      case 'url':
        return 'url';
      
      case 'checkbox':
        return 'checkbox';
      
      case 'radio':
        return 'radio';
      
      case 'date':
        return 'date';
      
      case 'datetime-local':
        return 'datetime-local';
      
      case 'time':
        return 'time';
      
      case 'month':
        return 'month';
      
      case 'week':
        return 'week';
      
      case 'file':
        return 'file';
      
      case 'range':
        return 'range';
      
      case 'color':
        return 'color';
      
      default:
        // Default to text for unknown types
        return 'text';
    }
  }

  // Handle button elements
  if (tag === 'button') {
    return 'text'; // Buttons are typically not form fields, but handle gracefully
  }

  // Default fallback
  return 'text';
}
