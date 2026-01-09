import { BrowserViewManager } from '../core/browser-view-manager';
import { registerAuthHandlers } from './handlers/auth.handlers';
import { registerClientHandlers } from './handlers/client.handlers';
import { registerDocumentHandlers } from './handlers/document.handlers';
import { registerExtractionHandlers } from './handlers/extraction.handlers';
import { registerPortalHandlers } from './handlers/portal.handlers';
import { registerBrowserViewHandlers } from './handlers/browser-view.handlers';
import { registerDashboardHandlers } from './handlers/dashboard.handlers';
import { registerAutomationHandlers } from './handlers/automation.handlers';
import { logger } from '../core/logger';

export function registerAllHandlers(browserViewManager: BrowserViewManager): void {
  logger.info('Registering IPC handlers...');

  registerAuthHandlers();
  registerClientHandlers();
  registerDocumentHandlers();
  registerExtractionHandlers();
  registerPortalHandlers();
  registerBrowserViewHandlers(browserViewManager);
  registerDashboardHandlers();
  registerAutomationHandlers();

  logger.info('All IPC handlers registered');
}

