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
  htmlFields?: HtmlField[]; // @deprecated - kept for backward compatibility
  canonicalFields?: CanonicalField[]; // New canonical schema
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

// Canonical Field Schema Types

/**
 * Semantic control types for form fields
 */
export type ControlType = 
  | 'text' | 'email' | 'password' | 'tel' | 'number' | 'url'
  | 'checkbox' | 'radio' 
  | 'select' | 'multiselect' | 'search-select'
  | 'date' | 'datetime-local' | 'time' | 'month' | 'week'
  | 'file' | 'range' | 'color'
  | 'textarea';

/**
 * Input modes for interaction hints
 */
export type InputMode = 'type' | 'click' | 'select' | 'check' | 'upload';

/**
 * ARIA roles for form elements
 */
export type AriaRole = 
  | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'listbox' 
  | 'button' | 'link' | 'tab' | 'menuitem';

/**
 * Canonical field schema - semantic, structured representation of form fields
 * 
 * This schema uses `accessibleName` as the primary identifier (robust for SPAs)
 * and `fallback.selector` as a last resort. This solves selector fragility issues
 * in single-page applications where DOM structure changes frequently.
 * 
 * @see CANONICAL_SCHEMA_MIGRATION_PLAN.md for migration details
 */
export interface CanonicalField {
  /** Stable semantic ID (hash-based, consistent across DOM changes) */
  fieldId: string;
  
  /** HTML tag name */
    tag: 'input' | 'select' | 'textarea' | 'button' | 'div' | 'span' | 'a';
  
  /** Semantic control type (e.g., 'text', 'email', 'select', 'checkbox') */
  controlType: ControlType;
  
  /** ARIA role (inferred from element attributes and type) */
  role: AriaRole | null;
  
  /** PRIMARY IDENTIFIER - Computed from labels/aria/placeholder (semantic, robust) */
  accessibleName: string;
  
  /** Label information from various sources */
  labels: {
    labelText: string | null;
    ariaLabel: string | null;
    ariaLabelledBy: string | null;
    placeholder: string | null;
  };
  
  /** Group information (for radio/checkbox groups) */
  group: {
    groupName: string | null;
    groupLabel: string | null;
  } | null;
  
  /** Options for select/radio elements */
  options: Array<{
    value: string | null;
    label: string;
    selected: boolean;
    disabled: boolean;
  }>;
  
  /** Current state of the field */
  state: {
    required: boolean;
    disabled: boolean;
    readonly: boolean;
    visible: boolean;
    checked: boolean;
    value: string | null;
  };
  
  /** Validation constraints */
  validation: {
    min: number | null;
    max: number | null;
    pattern: string | null;
    minLength: number | null;
    maxLength: number | null;
  };
  
  /** Contextual information for disambiguation */
  context: {
    formIndex: number;
    sectionHeading: string | null;
    positionInForm: number;
  };
  
  /** Hints for how to interact with this field */
  interactionHints: {
    inputMode: InputMode;
    blurAfterInput: boolean;
    requiresTypingDelay: boolean;
    opensDropdown: boolean;
    isSearchable: boolean;
  };
  
  /** Fallback selectors (last resort when semantic matching fails) */
  fallback: {
    /** CSS selector (validated unique) */
    selector: string | null;
    // Note: xpath removed per user request - not used in practice
  };
}
