import { app, BrowserWindow } from 'electron';
import { WindowManager } from './core/window-manager';
import { BrowserViewManager } from './core/browser-view-manager';
import { initializeDatabase, closeDatabase } from './database';
import { registerAllHandlers } from './ipc';
import { logger } from './core/logger';
import { loadEnvironment } from './config/environment';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
}

// Enable remote debugging for CDP connection
app.commandLine.appendSwitch('remote-debugging-port', '9222');

// Declare global references
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let windowManager: WindowManager | null = null;
let browserViewManager: BrowserViewManager | null = null;

async function initialize(): Promise<void> {
  try {
    // Load environment variables
    loadEnvironment();
    logger.info('Environment loaded successfully');

    // Initialize database
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Create window manager
    windowManager = new WindowManager(
      MAIN_WINDOW_WEBPACK_ENTRY,
      MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
    );

    // Create main window
    const mainWindow = windowManager.createMainWindow();

    // Create browser view manager
    browserViewManager = new BrowserViewManager(mainWindow);

    // Register IPC handlers
    registerAllHandlers(browserViewManager);
    logger.info('IPC handlers registered');

    // Open dev tools in development
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    app.quit();
  }
}

app.whenReady().then(initialize);

app.on('window-all-closed', async () => {
  logger.info('All windows closed');
  
  // Clean up browser view
  if (browserViewManager) {
    browserViewManager.destroy();
  }

  // Close database connection
  await closeDatabase();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
    windowManager.createMainWindow();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

// Export managers for use in IPC handlers
export function getWindowManager(): WindowManager | null {
  return windowManager;
}

export function getBrowserViewManager(): BrowserViewManager | null {
  return browserViewManager;
}
