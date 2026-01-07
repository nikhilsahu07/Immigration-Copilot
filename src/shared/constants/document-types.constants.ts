// Document Type Constants

export const DOCUMENT_TYPE = {
  PASSPORT: 'passport',
  VISA: 'visa',
  EDUCATION: 'education',
  EMPLOYMENT: 'employment',
  FINANCIAL: 'financial',
  IDENTITY: 'identity',
  OTHER: 'other',
} as const;

export type DocumentTypeValue = typeof DOCUMENT_TYPE[keyof typeof DOCUMENT_TYPE];

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeValue, string> = {
  [DOCUMENT_TYPE.PASSPORT]: 'Passport',
  [DOCUMENT_TYPE.VISA]: 'Visa',
  [DOCUMENT_TYPE.EDUCATION]: 'Education Certificate',
  [DOCUMENT_TYPE.EMPLOYMENT]: 'Employment Letter',
  [DOCUMENT_TYPE.FINANCIAL]: 'Financial Document',
  [DOCUMENT_TYPE.IDENTITY]: 'Identity Document',
  [DOCUMENT_TYPE.OTHER]: 'Other',
};

export const FILE_TYPE = {
  PDF: 'pdf',
  JPG: 'jpg',
  JPEG: 'jpeg',
  PNG: 'png',
} as const;

export type FileTypeValue = typeof FILE_TYPE[keyof typeof FILE_TYPE];

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
