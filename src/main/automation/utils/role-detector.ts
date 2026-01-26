import { AriaRole } from '../../../shared/types/automation.types';

/**
 * Detect ARIA role from element attributes and type
 * 
 * Detection priority:
 * 1. Explicit role attribute (if valid)
 * 2. Infer from tag + type combinations
 * 3. Infer from UI library classes (MUI, Bootstrap, etc.)
 * 4. Return null if cannot determine
 */
export function detectRole(element: {
  tag: string;
  type?: string;
  role?: string | null;
  className?: string | null;
}): AriaRole | null {
  const tag = element.tag.toLowerCase();
  const type = (element.type || '').toLowerCase();
  const role = element.role?.toLowerCase();
  const className = (element.className || '').toLowerCase();

  // Priority 1: Explicit role attribute (if valid)
  if (role) {
    const validRoles: AriaRole[] = [
      'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
      'button', 'link', 'tab', 'menuitem'
    ];
    
    if (validRoles.includes(role as AriaRole)) {
      return role as AriaRole;
    }
  }

  // Priority 2: Infer from tag + type combinations
  if (tag === 'input') {
    switch (type) {
      case 'text':
      case 'email':
      case 'password':
      case 'tel':
      case 'number':
      case 'url':
      case 'search':
        return 'textbox';
      
      case 'checkbox':
        return 'checkbox';
      
      case 'radio':
        return 'radio';
      
      default:
        break;
    }
  }

  if (tag === 'textarea') {
    return 'textbox';
  }

  if (tag === 'select') {
    // Single select is typically combobox, multiselect is listbox
    // For now, default to combobox (can be enhanced with multiple attribute check)
    return 'combobox';
  }

  if (tag === 'button') {
    return 'button';
  }

  // Priority 3: Infer from UI library classes
  // Material-UI
  if (className.includes('mui') || className.includes('material')) {
    if (className.includes('checkbox')) return 'checkbox';
    if (className.includes('radio')) return 'radio';
    if (className.includes('select') || className.includes('combobox')) return 'combobox';
    if (className.includes('textfield') || className.includes('input')) return 'textbox';
  }

  // Bootstrap
  if (className.includes('form-check-input')) {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
  }
  if (className.includes('form-select')) return 'combobox';
  if (className.includes('form-control')) return 'textbox';

  // Ant Design
  if (className.includes('ant-input')) return 'textbox';
  if (className.includes('ant-checkbox')) return 'checkbox';
  if (className.includes('ant-radio')) return 'radio';
  if (className.includes('ant-select')) return 'combobox';

  // Priority 4: Cannot determine
  return null;
}
