// Form Field Type Constants

export const FIELD_TYPE = {
  TEXT: 'text',
  EMAIL: 'email',
  TEL: 'tel',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  TEXTAREA: 'textarea',
  FILE: 'file',
} as const;

export type FieldTypeValue = typeof FIELD_TYPE[keyof typeof FIELD_TYPE];

export const CONFIDENCE_LEVEL = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ConfidenceLevelValue = typeof CONFIDENCE_LEVEL[keyof typeof CONFIDENCE_LEVEL];
