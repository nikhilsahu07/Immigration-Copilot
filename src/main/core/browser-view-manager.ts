
import { BrowserView, BrowserWindow } from 'electron';
import { logger } from './logger';

export class BrowserViewManager {
  private browserView: BrowserView | null = null;
  private mainWindow: BrowserWindow;
  private isVisible: boolean = false;
  private leftPanelWidth: number = 400;

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

    logger.info('BrowserView created');
    return this.browserView;
  }

  async loadURL(url: string): Promise<void> {
    if (!this.browserView) {
      this.create();
    }

    try {
      logger.info(`Loading URL in BrowserView: ${url}`);
      await this.browserView!.webContents.loadURL(url);
      logger.info('URL loaded successfully');
    } catch (error) {
      logger.error('Failed to load URL:', error);
      throw error;
    }
  }

  show(): void {
    if (!this.browserView) {
      this.create();
    }

    this.mainWindow.setBrowserView(this.browserView!);
    this.isVisible = true;
    this.updateBounds();
    logger.info('BrowserView shown');
  }

  hide(): void {
    if (this.browserView && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.removeBrowserView(this.browserView);
        this.isVisible = false;
        logger.info('BrowserView hidden');
      } catch (error) {
        // Window might be destroyed, ignore the error
        logger.debug('Could not remove BrowserView (window may be destroyed)');
      }
    }
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

  destroy(): void {
    if (this.browserView) {
      // Only try to hide if window is not destroyed
      if (!this.mainWindow.isDestroyed()) {
        try {
          this.hide();
        } catch (error) {
          // Ignore errors if window is already destroyed
          logger.debug('Could not hide BrowserView during destroy');
        }
      }
      
      // Destroy the web contents
      if (!this.browserView.webContents.isDestroyed()) {
        try {
          this.browserView.webContents.close();
        } catch (error) {
          logger.debug('Could not close BrowserView webContents');
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
