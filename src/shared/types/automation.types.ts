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

// Workflow step for a single portal page during automation.
// This is used for checkpoint-based pause/resume.
export type WorkflowStep =
  | 'initializing'
  | 'page_loaded'
  | 'fields_extracted'
  | 'screenshot_captured'
  | 'ai_analysis_done'
  | 'fields_filling'
  | 'fields_filled'
  | 'waiting_approval'
  | 'submitting'
  | 'navigation_complete';

// Checkpoint snapshot to support efficient pause/resume.
// NOTE: We intentionally keep aiResult as `any` to avoid tight coupling
// to the AI mapping response type while still persisting it for resume.
export interface AutomationCheckpoint {
  step: WorkflowStep;
  currentUrl: string;
  htmlFields?: HtmlField[];
  screenshotBase64?: string;
  aiResult?: any;
  fillResults?: Array<{
    fieldName: string;
    success: boolean;
    error?: string;
  }>;
  currentMapping?: FormMapping;
  timestamp: Date;
}

export interface AutomationJob extends BaseEntity, WithCompany, WithAgent {
  modelName?: string; // Gemini model name used for this job
  clientId: string;
  portalId: string;
  extractionId: string;
  status: JobStatus;
  currentUrl?: string;
  currentPage: number;
  totalPages: number;
  pagesProcessed: PageProcessed[];
  fieldsFilledCount: number;
  pauseReason?: PauseReason;
  customPrompt?: string;
  attachScreenshots?: boolean;
  errorLog?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  checkpoint?: AutomationCheckpoint;
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
  attachScreenshots?: boolean;
  modelName?: string; // Gemini model name (default: gemini-3-flash-preview)
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
  mode?: 'auto' | 'manual';
  attachScreenshots?: boolean;
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
