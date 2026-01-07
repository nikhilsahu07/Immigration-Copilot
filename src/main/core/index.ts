// Export all core modules
export { WindowManager } from './window-manager';
export { BrowserViewManager } from './browser-view-manager';
export { logger, automationLogger, sanitizeForLog } from './logger';
export { AppError, createError, handleError, success, failure, isSuccess, isFailure } from './error-handler';
