import { BaseEntity, WithCompany, WithAgent } from './common.types';

export type ExtractionStatus = 'pending' | 'approved' | 'rejected';

export interface Extraction extends BaseEntity, WithCompany, WithAgent {
  clientId: string;
  documentIds: string[];
  extractedData: ExtractedData;
  customPrompt?: string;
  status: ExtractionStatus;
  approvedAt?: Date;
  approvedBy?: string;
  rejectionReason?: string;
  processingTime?: number;
  tokenCount?: number;
}

export interface ExtractedData {
  personalInfo?: PersonalInfo;
  passport?: PassportInfo;
  education?: EducationInfo[];
  employment?: EmploymentInfo[];
  financial?: FinancialInfo;
  travel?: TravelHistory[];
  family?: FamilyInfo[];
  contact?: ContactInfo;
  additionalInfo?: Record<string, unknown>;
}

export interface PersonalInfo {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  placeOfBirth?: string;
  maritalStatus?: string;
}

export interface PassportInfo {
  number?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
}

export interface EducationInfo {
  degree?: string;
  field?: string;
  institution?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  yearOfCompletion?: number;
  grade?: string;
}

export interface EmploymentInfo {
  jobTitle?: string;
  company?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  responsibilities?: string;
  salary?: string;
}

export interface FinancialInfo {
  annualIncome?: string;
  bankName?: string;
  accountBalance?: string;
  currency?: string;
}

export interface TravelHistory {
  country?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  visaType?: string;
}

export interface FamilyInfo {
  relation?: string;
  name?: string;
  dateOfBirth?: string;
  nationality?: string;
  occupation?: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface CreateExtractionInput {
  clientId: string;
  documentIds: string[];
  customPrompt?: string;
}

export interface UpdateExtractionInput {
  extractedData?: ExtractedData;
  status?: ExtractionStatus;
  rejectionReason?: string;
}

export interface ApproveExtractionInput {
  extractedData?: ExtractedData;
}

export interface RejectExtractionInput {
  rejectionReason: string;
}
