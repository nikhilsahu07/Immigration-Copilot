import { BrowserWindow, app } from 'electron';
import path from 'path';
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
      },
      show: false,
    });

    // Load the app
    this.mainWindow.loadURL(this.webpackEntry);

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Log window events
    this.mainWindow.on('focus', () => {
      logger.debug('Main window focused');
    });

    this.mainWindow.on('blur', () => {
      logger.debug('Main window blurred');
    });

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
