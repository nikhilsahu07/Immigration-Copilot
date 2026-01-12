import { BaseEntity, WithCompany, WithAgent } from './common.types';

export type JobStatus = 
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type PauseReason = 
  | 'captcha'
  | 'otp'
  | 'manual_intervention'
  | 'manual_input'
  | 'error'
  | 'user_paused';

export interface AutomationJob extends BaseEntity, WithCompany, WithAgent {
  clientId: string;
  portalId: string;
  extractionId: string;
  status: JobStatus;
  currentPage: number;
  totalPages: number;
  pagesProcessed: PageProcessed[];
  fieldsFilledCount: number;
  pauseReason?: PauseReason;
  customPrompt?: string;
  errorLog?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface PageProcessed {
  pageNumber: number;
  url: string;
  fieldsCount: number;
  filledAt: Date;
  status: 'completed' | 'partial' | 'skipped';
}

export interface FormField {
  fieldIndex: number;
  fieldName: string;
  fieldLabel: string;
  fieldType: FieldType;
  selector: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  originalValue?: string;
  isEdited?: boolean;
}

export type FieldType = 
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'textarea'
  | 'file';

export interface FormAction {
  type: 'click' | 'submit' | 'wait';
  selector: string;
  expectedText: string;
  description: string;
}

export interface FormMapping {
  fields: FormField[];
  actions: FormAction[];
  captcha: {
    detected: boolean;
    type?: 'reCAPTCHA' | 'hCAPTCHA' | 'Cloudflare' | 'custom' | null;
  };
  otp: {
    detected: boolean;
    fieldSelector?: string | null;
  };
  submitButton: {
    selector: string;
    text: string;
  };
}

export interface HtmlFormStructure {
  fields: HtmlField[];
}

export interface HtmlField {
  index: number;
  tagName: string;
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  labelText?: string;
  options?: { value: string; text: string }[];
  radioGroup?: string;
  radioOptions?: { value: string; label: string }[];
  uniqueSelector: string;
  min?: string;
  max?: string;
  pattern?: string;
}

export interface CreateJobInput {
  clientId: string;
  portalId: string;
  extractionId: string;
  customPrompt?: string;
}

export interface UpdateJobInput {
  status?: JobStatus;
  currentPage?: number;
  totalPages?: number;
  pauseReason?: PauseReason;
  errorLog?: string;
}

export interface AutomationState {
  isRunning: boolean;
  currentJob?: AutomationJob;
  currentMapping?: FormMapping;
  progress: number;
  statusMessage: string;
  needsApproval: boolean;
  captchaDetected: boolean;
  otpDetected: boolean;
}

export interface CaptchaDetection {
  hasCaptcha: boolean;
  hasOtp: boolean;
  captchaType?: string;
  otpDetails?: {
    selector: string;
    placeholder?: string;
    maxLength?: number;
  };
  shouldPause: boolean;
  message: string;
}
