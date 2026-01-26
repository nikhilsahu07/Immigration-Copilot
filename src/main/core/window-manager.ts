import { BrowserWindow, app, session } from 'electron';

import { logger } from './logger';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private webpackEntry: string;
  private preloadEntry: string;

  constructor(webpackEntry: string, preloadEntry: string) {
    this.webpackEntry = webpackEntry;
    this.preloadEntry = preloadEntry;
  }

  createMainWindow(): BrowserWindow {
    if (this.mainWindow) {
      return this.mainWindow;
    }

    const isDev = !app.isPackaged;

    // ✅ Set CSP for both dev and production
    // In production, we need to allow webpack bundles to load
    const ses = session.defaultSession;
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          // Permissive CSP to allow webpack bundles, scripts, and fonts
          'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: file:; font-src * data: file:;"]
        }
      });
    });

    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      backgroundColor: '#ffffff',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 15 },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.preloadEntry,
        sandbox: false,
        webSecurity: false, // Keep this
      },
      show: false,
    });

    // Add error handlers to debug white screen issues
    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logger.error(`Failed to load: ${validatedURL}`, { errorCode, errorDescription });
    });

    this.mainWindow.webContents.on('render-process-gone', (event, details) => {
      logger.error('Render process gone:', details);
    });

    this.mainWindow.webContents.on('unresponsive', () => {
      logger.error('Window became unresponsive');
    });

    this.mainWindow.webContents.on('crashed', (event, killed) => {
      logger.error('Renderer process crashed', { killed });
    });

    // Log console messages from renderer
    this.mainWindow.webContents.on('console-message', (event, level, message, _line, _sourceId) => {
      const levelMap = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };
      logger.info(`[Renderer ${levelMap[level as keyof typeof levelMap] || 'LOG'}] ${message}`);
    });

    // Load the app
    logger.info(`Loading renderer from: ${this.webpackEntry}`);
    this.mainWindow.loadURL(this.webpackEntry).catch((error) => {
      logger.error('Failed to load URL:', error);
    });

    // ✅ Open DevTools in development only
    if (isDev) {
      this.mainWindow.webContents.openDevTools();
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      logger.info('Main window shown');
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      logger.info('Main window closed');
    });

    // Log window events
    this.mainWindow.on('focus', () => {
      logger.debug('Main window focused');
    });

    this.mainWindow.on('blur', () => {
      logger.debug('Main window blurred');
    });

    logger.info('Main window created successfully');
    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  isMainWindowOpen(): boolean {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed();
  }

  focusMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }
  }

  sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  getWindowBounds(): Electron.Rectangle | null {
    if (this.mainWindow) {
      return this.mainWindow.getBounds();
    }
    return null;
  }
}
