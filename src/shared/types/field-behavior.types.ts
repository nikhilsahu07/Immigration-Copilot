// Field Behavior Types for Progressive Filling
// Describes WHAT a field does, not WHAT HTML tag it uses

export enum FieldBehavior {
  // Text Entry
  TEXT_ENTRY = 'text_entry',              // Simple text input
  MASKED_INPUT = 'masked_input',          // Formatted (phone, SSN, postal code)
  MULTILINE_TEXT = 'multiline_text',      // Textarea
  
  // Choice Selection
  SINGLE_CHOICE = 'single_choice',        // Generic single choice (fallback)
  SINGLE_CHOICE_DROPDOWN = 'single_choice_dropdown',  // Static dropdown/select
  SINGLE_CHOICE_RADIO = 'single_choice_radio',        // Radio button group
  MULTI_CHOICE = 'multi_choice',          // Multi-select/checkbox group
  SEARCH_AND_SELECT = 'search_and_select', // Autocomplete/searchable dropdown
  
  // Boolean
  BOOLEAN_TOGGLE = 'boolean_toggle',      // Toggle switch
  BOOLEAN_CHECKBOX = 'boolean_checkbox',  // Single checkbox
  
  // Date/Time
  DATE_PICKER = 'date_picker',            // Calendar widget
  DATE_TEXT = 'date_text',                // Text input for dates
  TIME_PICKER = 'time_picker',            // Time selection
  
  // Numeric
  NUMERIC_INPUT = 'numeric_input',        // Number input
  RANGE_SLIDER = 'range_slider',          // Slider control
  
  // File
  FILE_UPLOAD = 'file_upload',            // Single file
  MULTI_FILE_UPLOAD = 'multi_file_upload', // Multiple files
  
  // Special
  OTP_GROUP = 'otp_group',                // OTP code inputs
  CONSENT_CHECKBOX = 'consent_checkbox',   // Terms & conditions
  
  // Unknown
  UNKNOWN = 'unknown'
}

// Confidence level for AI mappings
export enum ConfidenceLevel {
  HIGH = 'high',      // Clear match, proceed automatically
  MEDIUM = 'medium',  // Likely correct, may need verification
  LOW = 'low'         // Uncertain, requires human review
}

// Intent-based action types (not execution commands)
export enum ActionIntent {
  PRIMARY_NAVIGATION = 'primary_navigation',     // Main flow (Continue, Next, Submit)
  SECONDARY_ACTION = 'secondary_action',         // Alternative (Skip, Back)
  CREATE_NEW = 'create_new',                     // Start new item
  SAVE_DRAFT = 'save_draft',                     // Save without submit
  CANCEL = 'cancel',                             // Abort flow
  MODAL_CONFIRM = 'modal_confirm',               // Confirm dialog
  MODAL_DISMISS = 'modal_dismiss',               // Close dialog
  UNKNOWN = 'unknown'
}

// Field status
export enum FieldStatus {
  READY = 'ready',                    // Has value, ready to fill
  MISSING_DATA = 'missing_data',      // Client data not available
  LOW_CONFIDENCE = 'low_confidence',  // Mapping uncertain
  REQUIRES_HUMAN = 'requires_human'   // Needs manual intervention
}

// Enhanced field description from AI
export interface BehaviorField {
  // Core Identity
  fieldId?: string;  // Primary identifier from canonical schema (REQUIRED for semantic discovery)
  selector?: string;  // Fallback selector (optional, for backward compatibility)
  fieldName: string;
  behavior: FieldBehavior;
  intent: string;  // Semantic meaning (e.g., "citizenship_country", "passport_number")
  
  // Value & Confidence
  expectedValue: string | boolean | number;
  confidence: ConfidenceLevel;
  reason: string;  // Why this mapping was chosen
  
  // Status
  status: FieldStatus;
  
  // Optional Metadata
  constraints?: {
    required?: boolean;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

// Intent-based action description
export interface IntentAction {
  intent: ActionIntent;
  description: string;
  expectedText: string;
  fieldId?: string;  // Optional - if action button is in canonical fields
  selectorHint?: string;  // Fallback hint for finding element (deprecated, use fieldId)
  confidence: ConfidenceLevel;
}

// AI Response with behavior-based fields
export interface BehaviorFormMapping {
  pageType: 'dashboard' | 'form' | 'confirmation' | 'error' | 'login';
  pageSummary: string;
  isFormPage: boolean;
  
  fields: BehaviorField[];
  actions: IntentAction[];
  
  captcha?: {
    detected: boolean;
    isInsideForm?: boolean;
  };
  
  otp?: {
    detected: boolean;
    behavior?: FieldBehavior.OTP_GROUP;
    confidence?: ConfidenceLevel;
  };
}
