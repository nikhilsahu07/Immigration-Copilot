/**
 * Internal types used within the automation module
 */

export interface DetectionResult {
  hasCaptcha: boolean;
  hasOtp: boolean;
  reason?: string;
  selector?: string;
}

export interface ClickStrategy {
  name: string;
  execute: () => Promise<boolean>;
}

export interface ActionExecutionResult {
  success: boolean;
  actionType: string;
  description: string;
  error?: string;
}
