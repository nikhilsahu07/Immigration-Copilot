import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { BrowserViewManager } from '../../core/browser-view-manager';
import { handleError, success } from '../../core/error-handler';
import { logger } from '../../core/logger';

export function registerBrowserViewHandlers(browserViewManager: BrowserViewManager): void {
  // Load URL in BrowserView
  ipcMain.handle(IPC_CHANNELS.BROWSER_VIEW_LOAD, async (_event, { url }) => {
    try {
      await browserViewManager.loadURL(url);
      browserViewManager.show();
      return success(undefined);
    } catch (error) {
      logger.error('Load BrowserView error:', error);
      return handleError(error);
    }
  });

  // Show BrowserView
  ipcMain.handle(IPC_CHANNELS.BROWSER_VIEW_SHOW, async () => {
    try {
      browserViewManager.show();
      return success(undefined);
    } catch (error) {
      logger.error('Show BrowserView error:', error);
      return handleError(error);
    }
  });

  // Hide BrowserView
  ipcMain.handle(IPC_CHANNELS.BROWSER_VIEW_HIDE, async () => {
    try {
      browserViewManager.hide();
      return success(undefined);
    } catch (error) {
      logger.error('Hide BrowserView error:', error);
      return handleError(error);
    }
  });

  // Resize BrowserView
  ipcMain.handle(IPC_CHANNELS.BROWSER_VIEW_RESIZE, async (_event, { width }) => {
    try {
      browserViewManager.setLeftPanelWidth(width);
      return success(undefined);
    } catch (error) {
      logger.error('Resize BrowserView error:', error);
      return handleError(error);
    }
  });

  logger.debug('BrowserView handlers registered');
}
