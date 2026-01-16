import { Page } from 'playwright-core';
import { ExtractedData } from '../../shared/types';

// Adapter Configuration

/** Mode of execution for adapters */
export type AdapterMode = 'custom' | 'ai';
export type ExecutionMode = 'auto' | 'manual';

// Adapter Context

/** Document info for file uploads */
export interface DocumentInfo {
  id: string;
  name: string;
  category: string;
  filePath: string;      // Local path or S3 presigned URL
  mimeType: string;
}

/** Context passed to each adapter during execution */
export interface AdapterContext {
  page: Page;                              // Playwright page instance
  extractedData: ExtractedData;            // Client's extracted data
  documents: DocumentInfo[];               // Attached documents
  customPrompt?: string;                   // User's custom prompt
  executionMode: ExecutionMode;            // Auto or manual
  
  // Callbacks
  onApprovalRequired: () => Promise<void>;       // Wait for approval in manual mode
  onStatusUpdate: (message: string) => void;     // Emit status updates
  onFieldFilled: (fieldName: string, value: string) => void;  // Report filled fields
}

// Adapter Results

/** Error structure for adapter failures */
export interface AdapterError {
  code: string;                   // Error code for categorization
  message: string;                // Human-readable error message
  selector?: string;              // Failed selector if applicable
  expectedElement?: string;       // What was expected
  actualElement?: string;         // What was found
  stack?: string;                 // Stack trace
}

/** Result returned by adapter after execution */
export interface AdapterResult {
  success: boolean;
  pageType: 'form' | 'dashboard' | 'confirmation' | 'unknown';
  fieldsFilledCount: number;
  actionsPerformed: string[];     // Description of actions taken
  requiresCaptcha?: boolean;
  requiresOtp?: boolean;
  error?: AdapterError;
  shouldFallbackToAI?: boolean;   // If custom adapter wants to fallback
}
 
// Adapter Interface

/**
 * Interface that all portal adapters must implement.
 * Both custom adapters and the AI adapter implement this interface.
 */
export interface IPortalAdapter {
  /** Unique identifier for this adapter (matches portal's adapterSlug) */
  readonly slug: string;
  
  /** Human-readable name of this adapter */
  readonly name: string;
  
  /** Version string for tracking adapter changes */
  readonly version: string;
  
  /**
   * Check if this adapter can handle the given URL/page.
   * Used to find the right adapter for a portal.
   */
  canHandle(url: string, html?: string): Promise<boolean>;
  
  /**
   * Execute the automation for the current page.
   * Returns result indicating success/failure and next steps.
   */
  execute(context: AdapterContext): Promise<AdapterResult>;
}

// Adapter Configuration for Prompts
/**
 * Configuration for adapter-specific prompts.
 * Each adapter can define its own prompt template for AI assistance.
 */
export interface AdapterPromptConfig {
  /** Base prompt template for this portal */
  portalPrompt: string;
  
  /** Field-specific mappings and hints */
  fieldMappings?: Record<string, string>;
  
  /** Expected output format hints */
  outputHints?: string;
}
