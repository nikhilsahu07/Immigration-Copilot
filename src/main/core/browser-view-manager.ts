
import { BrowserView, BrowserWindow } from 'electron';
import { logger } from './logger';

export class BrowserViewManager {
  private browserView: BrowserView | null = null;
  private mainWindow: BrowserWindow;
  private isVisible: boolean = false;
  private leftPanelWidth: number = 400;
  private hideLocked: boolean = false; // Prevents hiding during automation

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;

    // Handle window resize
    this.mainWindow.on('resize', () => {
      this.updateBounds();
    });
  }

  create(): BrowserView {
    if (this.browserView) {
      return this.browserView;
    }

    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const webContents = this.browserView.webContents;

    // Ensure links that would normally open in a new window/tab
    // (target="_blank", window.open, etc.) instead load in THIS BrowserView.
    // This keeps Playwright attached to a single page and avoids “new Electron tab” issues.
    webContents.setWindowOpenHandler(({ url }) => {
      logger.info(`Intercepting new window request, loading in same BrowserView: ${url}`);
      // Fire and forget – navigation errors are logged but do not crash the app
      webContents.loadURL(url).catch(err => {
        logger.error('Failed to load intercepted URL in BrowserView:', err);
      });
      return { action: 'deny' }; // Prevent Electron from creating a new window
    });

    logger.info('BrowserView created');
    return this.browserView;
  }

  async loadURL(url: string): Promise<void> {
    if (!this.browserView) {
      this.create();
    }

    try {
      if (!this.browserView) {
        throw new Error('BrowserView is not available');
      }
      logger.info(`Loading URL in BrowserView: ${url}`);
      await this.browserView.webContents.loadURL(url);
      logger.info('URL loaded successfully');
    } catch (error) {
      logger.error('Failed to load URL:', error);
      throw error;
    }
  }

  /**
   * Wait for the BrowserView page to finish loading
   * Returns a promise that resolves when the page has finished loading
   */
  async waitForPageLoad(timeout: number = 10000): Promise<void> {
    if (!this.browserView?.webContents) {
      throw new Error('BrowserView is not available');
    }

    return new Promise((resolve, reject) => {
      const webContents = this.browserView?.webContents;
      if (!webContents) {
        reject(new Error('BrowserView webContents is not available'));
        return;
      }

      let timeoutId: NodeJS.Timeout | undefined = undefined;

      const onDidFinishLoad = () => {
        if (timeoutId) clearTimeout(timeoutId);
        webContents.removeListener('did-fail-load', onDidFailLoad);
        logger.info('BrowserView page finished loading');
        // Small delay to ensure DOM is fully rendered
        setTimeout(resolve, 500);
      };

      const onDidFailLoad = (_event: Electron.Event, errorCode: number, errorDescription: string) => {
        if (timeoutId) clearTimeout(timeoutId);
        webContents.removeListener('did-finish-load', onDidFinishLoad);
        logger.error(`BrowserView page failed to load: ${errorCode} - ${errorDescription}`);
        reject(new Error(`Page failed to load: ${errorDescription}`));
      };

      // Check if already loaded
      if (!webContents.isLoading()) {
        logger.info('BrowserView page already loaded');
        setTimeout(resolve, 500);
        return;
      }

      timeoutId = setTimeout(() => {
        webContents.removeListener('did-finish-load', onDidFinishLoad);
        webContents.removeListener('did-fail-load', onDidFailLoad);
        logger.warn('BrowserView page load timeout, proceeding anyway');
        resolve(); // Resolve instead of reject to allow continuation
      }, timeout);

      webContents.once('did-finish-load', onDidFinishLoad);
      webContents.once('did-fail-load', onDidFailLoad);
    });
  }

  show(): void {
    if (!this.browserView) {
      this.create();
    }

    if (!this.browserView) {
      logger.error('Failed to create BrowserView');
      return;
    }

    this.mainWindow.setBrowserView(this.browserView);
    this.isVisible = true;
    this.updateBounds();
    logger.info('BrowserView shown');
  }

  hide(): void {
    // CRITICAL: Prevent hiding during automation
    if (this.hideLocked) {
      logger.debug('BrowserView hide blocked - automation is running');
      return;
    }

    if (this.browserView && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.removeBrowserView(this.browserView);
        this.isVisible = false;
        logger.info('BrowserView hidden');
      } catch (error) {
        // Window might be destroyed, ignore the error
        logger.debug(`Could not remove BrowserView (window may be destroyed) ${error}`);
      }
    }
  }

  /**
   * Lock BrowserView to prevent hiding (used during automation)
   */
  lockHide(): void {
    this.hideLocked = true;
    logger.debug('BrowserView hide locked');
  }

  /**
   * Unlock BrowserView to allow hiding
   */
  unlockHide(): void {
    this.hideLocked = false;
    logger.debug('BrowserView hide unlocked');
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  setLeftPanelWidth(width: number): void {
    this.leftPanelWidth = width;
    if (this.isVisible) {
      this.updateBounds();
    }
  }

  private updateBounds(): void {
    if (!this.browserView || !this.isVisible) {
      return;
    }

    const contentBounds = this.mainWindow.getContentBounds();

    // Calculate browser view bounds (right side of the window)
    // IMPORTANT: use contentBounds.width since x is relative to content area
    const width = Math.max(0, contentBounds.width - this.leftPanelWidth);
    
    this.browserView.setBounds({
      x: this.leftPanelWidth,
      y: 0,
      width: width,
      height: contentBounds.height,
    });
  }

  getBrowserView(): BrowserView | null {
    return this.browserView;
  }

  isShowing(): boolean {
    return this.isVisible;
  }

  getWebContents(): Electron.WebContents | undefined {
    return this.browserView?.webContents;
  }

  /**
   * Get the current URL of the browser view
   * Returns null if browser view is not available or not loaded
   */
  getCurrentURL(): string | null {
    if (!this.browserView?.webContents) {
      return null;
    }
    
    try {
      const url = this.browserView.webContents.getURL();
      // Return null for empty URLs or about:blank
      if (!url || url === 'about:blank') {
        return null;
      }
      return url;
    } catch (error) {
      logger.debug('Could not get current URL from BrowserView', error);
      return null;
    }
  }

  destroy(): void {
    if (this.browserView) {
      // Only try to hide if window is not destroyed
      if (!this.mainWindow.isDestroyed()) {
        try {
          this.hide();
        } catch (error) {
          // Ignore errors if window is already destroyed
          logger.debug(`Could not hide BrowserView during destroy ${error}`);
        }
      }
      
      // Destroy the web contents
      if (!this.browserView.webContents.isDestroyed()) {
        try {
          this.browserView.webContents.close();
        } catch (error) {
          logger.debug(`Could not close BrowserView webContents ${error}`);
        }
      }
      
      this.browserView = null;
      logger.info('BrowserView destroyed');
    }
  }

  async executeJavaScript<T>(script: string): Promise<T> {
    if (!this.browserView?.webContents) {
      throw new Error('BrowserView is not available');
    }
    return this.browserView.webContents.executeJavaScript(script);
  }
}
