import { ControlType, InputMode } from '../../../shared/types/automation.types';

/**
 * Compute interaction hints for a field based on its type and properties
 * 
 * These hints guide fillers on how to interact with the field:
 * - inputMode: How to provide input (type, click, select, etc.)
 * - blurAfterInput: Whether to blur after typing
 * - requiresTypingDelay: Whether typing delay is needed (for search-selects)
 * - opensDropdown: Whether field opens a dropdown
 * - isSearchable: Whether field is searchable (for search-selects)
 */
export function computeInteractionHints(field: {
  controlType: ControlType;
  tag: string;
  className?: string | null;
  role?: string | null;
  options?: Array<{ value: string; label: string }>;
}): {
  inputMode: InputMode;
  blurAfterInput: boolean;
  requiresTypingDelay: boolean;
  opensDropdown: boolean;
  isSearchable: boolean;
} {
  const controlType = field.controlType;
  const className = (field.className || '').toLowerCase();

  // Determine inputMode based on controlType
  let inputMode: InputMode = 'type';
  let blurAfterInput = true;
  let requiresTypingDelay = false;
  let opensDropdown = false;
  let isSearchable = false;

  switch (controlType) {
    case 'text':
    case 'email':
    case 'password':
    case 'tel':
    case 'number':
    case 'url':
    case 'textarea':
      inputMode = 'type';
      blurAfterInput = true;
      break;

    case 'checkbox':
    case 'radio':
      inputMode = 'check';
      blurAfterInput = false;
      break;

    case 'select':
    case 'multiselect':
      inputMode = 'select';
      blurAfterInput = false;
      opensDropdown = true;
      break;

    case 'search-select':
      inputMode = 'type';
      blurAfterInput = true;
      requiresTypingDelay = true;
      opensDropdown = true;
      isSearchable = true;
      break;

    case 'file':
      inputMode = 'upload';
      blurAfterInput = false;
      break;

    case 'date':
    case 'datetime-local':
    case 'time':
    case 'month':
    case 'week':
      inputMode = 'type';
      blurAfterInput = true;
      opensDropdown = true; // Date pickers often open dropdowns
      break;

    case 'button':
      inputMode = 'click';
      blurAfterInput = false;
      break;

    default:
      inputMode = 'type';
      blurAfterInput = true;
  }

  // Additional checks for search-select based on className
  if (className.includes('search') && className.includes('select')) {
    isSearchable = true;
    requiresTypingDelay = true;
    opensDropdown = true;
  }

  return {
    inputMode,
    blurAfterInput,
    requiresTypingDelay,
    opensDropdown,
    isSearchable,
  };
}
