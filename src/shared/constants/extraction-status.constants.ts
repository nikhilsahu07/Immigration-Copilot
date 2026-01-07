// Extraction Status Constants

export const EXTRACTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ExtractionStatusType = typeof EXTRACTION_STATUS[keyof typeof EXTRACTION_STATUS];

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatusType, string> = {
  [EXTRACTION_STATUS.PENDING]: 'Pending Review',
  [EXTRACTION_STATUS.APPROVED]: 'Approved',
  [EXTRACTION_STATUS.REJECTED]: 'Rejected',
};
