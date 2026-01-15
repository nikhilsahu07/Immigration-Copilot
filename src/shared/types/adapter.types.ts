import { BaseEntity, WithCompany, WithAgent } from './common.types';
 
// Adapter Mode Types
/** Adapter execution mode - Custom adapter or AI-powered */
export type AdapterMode = 'custom' | 'ai';

/** Execution mode - Auto (no approval) or Manual (step-by-step) */
export type ExecutionMode = 'auto' | 'manual';

// AI Automation Failure Tracking
/** Types of failures in AI automation */
export type AIFailureType = 
  | 'navigation'     // Failed to navigate to correct page
  | 'form_fill'      // Failed to fill a form field
  | 'selector'       // Selector not found/invalid
  | 'page_load'      // Page didn't load correctly
  | 'unknown';

/** AI automation failure record - stored when Playwright execution fails during AI mode */
export interface AIAutomationFailure extends BaseEntity, WithCompany, WithAgent {
  jobId: string;
  portalId: string;
  clientId: string;
  failureType: AIFailureType;
  pageUrl: string;
  pageHtml?: string;           // Truncated HTML for debugging
  errorMessage: string;
  errorStack?: string;
  failedSelector?: string;     // Which selector failed
  aiResponse?: string;         // What AI returned
  resolvedAt?: Date;
}

// Custom Adapter Failure Tracking 
/** Types of failures in custom adapters */
export type CustomAdapterFailureType = 
  | 'selector_not_found'   // Expected selector missing
  | 'element_changed'      // Element exists but different than expected
  | 'navigation_failed'    // Navigation didn't work as expected
  | 'timeout'              // Operation timed out
  | 'unexpected_state'     // Page in unexpected state
  | 'unknown';

/** Custom adapter failure record - stored when pre-written script fails */
export interface CustomAdapterFailure extends BaseEntity, WithCompany, WithAgent {
  jobId: string;
  portalId: string;
  adapterSlug: string;
  adapterVersion: string;
  clientId: string;
  failureType: CustomAdapterFailureType;
  pageUrl: string;
  failedSelector?: string;
  expectedElement?: string;
  actualElement?: string;
  errorMessage: string;
  errorStack?: string;
  fellBackToAI: boolean;       // Did we fallback to AI after this failure?
  resolvedAt?: Date;
}

// Create Failure Inputs
export interface CreateAIFailureInput {
  jobId: string;
  portalId: string;
  clientId: string;
  failureType: AIFailureType;
  pageUrl: string;
  pageHtml?: string;
  errorMessage: string;
  errorStack?: string;
  failedSelector?: string;
  aiResponse?: string;
}

export interface CreateCustomAdapterFailureInput {
  jobId: string;
  portalId: string;
  adapterSlug: string;
  adapterVersion: string;
  clientId: string;
  failureType: CustomAdapterFailureType;
  pageUrl: string;
  failedSelector?: string;
  expectedElement?: string;
  actualElement?: string;
  errorMessage: string;
  errorStack?: string;
  fellBackToAI: boolean;
}
