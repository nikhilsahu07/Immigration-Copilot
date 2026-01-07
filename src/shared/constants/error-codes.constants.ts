// Error Code Constants

export const ERROR_CODES = {
  // Auth Errors (1xxx)
  AUTH_INVALID_CREDENTIALS: 'AUTH_1001',
  AUTH_EMAIL_EXISTS: 'AUTH_1002',
  AUTH_SESSION_EXPIRED: 'AUTH_1003',
  AUTH_UNAUTHORIZED: 'AUTH_1004',
  AUTH_COMPANY_NOT_FOUND: 'AUTH_1005',

  // Client Errors (2xxx)
  CLIENT_NOT_FOUND: 'CLIENT_2001',
  CLIENT_VALIDATION_ERROR: 'CLIENT_2002',
  CLIENT_DELETE_HAS_DOCUMENTS: 'CLIENT_2003',

  // Document Errors (3xxx)
  DOCUMENT_NOT_FOUND: 'DOC_3001',
  DOCUMENT_UPLOAD_FAILED: 'DOC_3002',
  DOCUMENT_INVALID_TYPE: 'DOC_3003',
  DOCUMENT_TOO_LARGE: 'DOC_3004',
  DOCUMENT_S3_ERROR: 'DOC_3005',

  // Extraction Errors (4xxx)
  EXTRACTION_NOT_FOUND: 'EXT_4001',
  EXTRACTION_ALREADY_APPROVED: 'EXT_4002',
  EXTRACTION_AI_ERROR: 'EXT_4003',
  EXTRACTION_NO_DOCUMENTS: 'EXT_4004',
  EXTRACTION_PARSE_ERROR: 'EXT_4005',

  // Portal Errors (5xxx)
  PORTAL_NOT_FOUND: 'PORTAL_5001',
  PORTAL_INVALID_URL: 'PORTAL_5002',

  // Automation Errors (6xxx)
  AUTOMATION_ALREADY_RUNNING: 'AUTO_6001',
  AUTOMATION_NOT_RUNNING: 'AUTO_6002',
  AUTOMATION_NO_EXTRACTION: 'AUTO_6003',
  AUTOMATION_BROWSER_ERROR: 'AUTO_6004',
  AUTOMATION_PAGE_ERROR: 'AUTO_6005',
  AUTOMATION_MAPPING_ERROR: 'AUTO_6006',
  AUTOMATION_FILL_ERROR: 'AUTO_6007',

  // Database Errors (7xxx)
  DB_CONNECTION_ERROR: 'DB_7001',
  DB_QUERY_ERROR: 'DB_7002',

  // General Errors (9xxx)
  INTERNAL_ERROR: 'ERR_9001',
  VALIDATION_ERROR: 'ERR_9002',
  NOT_FOUND: 'ERR_9003',
  FORBIDDEN: 'ERR_9004',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password',
  [ERROR_CODES.AUTH_EMAIL_EXISTS]: 'An account with this email already exists',
  [ERROR_CODES.AUTH_SESSION_EXPIRED]: 'Your session has expired. Please login again',
  [ERROR_CODES.AUTH_UNAUTHORIZED]: 'You are not authorized to perform this action',
  [ERROR_CODES.AUTH_COMPANY_NOT_FOUND]: 'Company not found',

  [ERROR_CODES.CLIENT_NOT_FOUND]: 'Client not found',
  [ERROR_CODES.CLIENT_VALIDATION_ERROR]: 'Invalid client data',
  [ERROR_CODES.CLIENT_DELETE_HAS_DOCUMENTS]: 'Cannot delete client with associated documents',

  [ERROR_CODES.DOCUMENT_NOT_FOUND]: 'Document not found',
  [ERROR_CODES.DOCUMENT_UPLOAD_FAILED]: 'Failed to upload document',
  [ERROR_CODES.DOCUMENT_INVALID_TYPE]: 'Invalid file type. Only PDF, JPG, and PNG are allowed',
  [ERROR_CODES.DOCUMENT_TOO_LARGE]: 'File size exceeds maximum limit of 10MB',
  [ERROR_CODES.DOCUMENT_S3_ERROR]: 'Storage service error',

  [ERROR_CODES.EXTRACTION_NOT_FOUND]: 'Extraction not found',
  [ERROR_CODES.EXTRACTION_ALREADY_APPROVED]: 'Extraction has already been approved',
  [ERROR_CODES.EXTRACTION_AI_ERROR]: 'AI extraction failed. Please try again',
  [ERROR_CODES.EXTRACTION_NO_DOCUMENTS]: 'No documents selected for extraction',
  [ERROR_CODES.EXTRACTION_PARSE_ERROR]: 'Failed to parse extraction result',

  [ERROR_CODES.PORTAL_NOT_FOUND]: 'Portal not found',
  [ERROR_CODES.PORTAL_INVALID_URL]: 'Invalid portal URL',

  [ERROR_CODES.AUTOMATION_ALREADY_RUNNING]: 'An automation job is already running',
  [ERROR_CODES.AUTOMATION_NOT_RUNNING]: 'No automation job is currently running',
  [ERROR_CODES.AUTOMATION_NO_EXTRACTION]: 'Client has no approved extraction',
  [ERROR_CODES.AUTOMATION_BROWSER_ERROR]: 'Browser automation error',
  [ERROR_CODES.AUTOMATION_PAGE_ERROR]: 'Failed to load portal page',
  [ERROR_CODES.AUTOMATION_MAPPING_ERROR]: 'Failed to map form fields',
  [ERROR_CODES.AUTOMATION_FILL_ERROR]: 'Failed to fill form field',

  [ERROR_CODES.DB_CONNECTION_ERROR]: 'Database connection error',
  [ERROR_CODES.DB_QUERY_ERROR]: 'Database query error',

  [ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred',
  [ERROR_CODES.VALIDATION_ERROR]: 'Validation error',
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.FORBIDDEN]: 'Access forbidden',
};
