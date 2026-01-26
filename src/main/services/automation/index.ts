/**
 * Automation Module Index
 * 
 * Re-exports all automation sub-modules for clean imports.
 */

// Configuration
export { getConfig, AutomationConfig, setConfig } from './automation.config';

// Page-level handling
export { FormFillingCoordinator, FillResult } from './form-filling-coordinator';
export { NavigationHandler, ActionResult, ActionDefinition, ExpectedOutcome } from './navigation-handler';
export { DashboardHandler, DashboardAction, DashboardResult } from './dashboard-handler';
export { FormSubmissionHandler, SubmissionResult } from './form-submission-handler';
export { PageProcessor, PageIterationResult, PageProcessorDependencies } from './page-processor';
