// Export all utility functions for canonical field extraction
export { computeAccessibleName } from './accessible-name';
export { detectControlType } from './control-type-detector';
export { detectRole } from './role-detector';
export { computeInteractionHints } from './interaction-hints';
export { generateFieldId } from './field-id-generator';
export { 
  filterFormFields, 
  createMinimalCanonicalField, 
  createCleanCanonicalFieldsLog 
} from './canonical-field-logger';
export { FieldResolver } from './field-resolver';
export { CanonicalFieldsMap } from './canonical-fields-map';
