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
  
  // New: Iterative exploration fields
  automationMode: 'auto' | 'manual';
  explorationState?: ExplorationState;
  pendingAction?: PendingAction;
  
  // New: Phase tracking for pause/resume
  currentPhase: AutomationPhase;
  pausedAtPhase?: AutomationPhase;
}

/**
 * Automation phases for pause/resume state tracking
 */
export type AutomationPhase = 
  | 'idle'
  | 'connecting'
  | 'extracting_html'
  | 'calling_ai'
  | 'filling_form'
  | 'waiting_approval'
  | 'submitting'
  | 'navigating';

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

// ============================================
// Iterative State Exploration Types
// ============================================

/**
 * Automation mode - Auto runs without prompts, Manual requires approval for each action
 */
export type AutomationMode = 'auto' | 'manual';

/**
 * Current exploration context within the page
 */
export type ExplorationContext = 'page' | 'modal' | 'tab';

/**
 * State maintained during iterative exploration of SPA pages
 */
export interface ExplorationState {
  /** Current context (main page, modal, or specific tab) */
  currentContext: ExplorationContext;
  
  /** Index of currently active tab (if in tab context) */
  activeTabIndex?: number;
  
  /** CSS selector of current modal (if in modal context) */
  modalSelector?: string;
  
  /** CRITICAL: CSS selectors of fields already filled - prevents duplicate filling (Negative Mapping) */
  filledFieldSelectors: string[];
  
  /** CRITICAL: CSS selectors of interactive elements already visited - prevents infinite loops */
  visitedInteractiveElements: string[];
  
  /** Whether exploration is complete for current page */
  isComplete: boolean;
  
  /** Total fields filled in current session */
  totalFieldsFilled: number;
  
  /** Error message if exploration failed */
  errorMessage?: string;
}

/**
 * A single field mapping from AI decision (using stable selectors)
 */
export interface MappedField {
  /** Stable CSS selector (id, name, aria-label based - NOT dynamic classes) */
  selector: string;
  
  /** Value to fill */
  value: string;
  
  /** Field type for choosing correct filler */
  fieldType: FieldType;
  
  /** Field name/label for display */
  fieldName?: string;
}

/**
 * Discriminated union for AI exploration decisions
 * Single prompt returns one of these types for efficiency
 */
export type DecisionResult = 
  | { type: 'FILL'; fields: MappedField[] }
  | { type: 'NAVIGATE'; selector: string; description: string }
  | { type: 'UPLOAD'; selector: string; documentName: string }
  | { type: 'DONE'; reason: string };

/**
 * Action pending approval in Manual mode
 */
export interface PendingAction {
  /** Unique ID for this action */
  id: string;
  
  /** Type of action */
  type: DecisionResult['type'];
  
  /** Human-readable description */
  description: string;
  
  /** CSS selector (if applicable) */
  selector?: string;
  
  /** Value being filled (if applicable) */
  value?: string;
  
  /** Timestamp when action was queued */
  createdAt: Date;
}

/**
 * Interactive element detected on page (tab, accordion, add button)
 */
export interface InteractiveElement {
  /** CSS selector to click */
  selector: string;
  
  /** Visible label/text */
  label: string;
  
  /** Type of element */
  elementType: 'tab' | 'accordion' | 'add-button' | 'modal-trigger';
  
  /** Whether element is currently active/expanded */
  isActive: boolean;
}
