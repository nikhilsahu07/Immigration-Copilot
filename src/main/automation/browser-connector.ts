
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { logger } from '../core/logger';
import { getEnv } from '../config/environment';

export class BrowserConnector {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async connect(): Promise<{ browser: Browser; context: BrowserContext }> {
    try {
      const port = getEnv().CDP_PORT || '9222';
      logger.info(`Connecting to browser via CDP on port ${port}...`);

      this.browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      this.context = this.browser.contexts()[0];
      
      if (!this.context) {
        throw new Error('No browser context found');
      }

      logger.info('Connected to browser successfully');
      return { browser: this.browser, context: this.context };
    } catch (error) {
      logger.error('Failed to connect to browser:', error);
      throw error;
    }
  }

  async getPageByUrl(urlSubstring: string): Promise<Page> {
    if (!this.context) {
      throw new Error('Not connected to browser. Call connect() first.');
    }

    const pages = this.context.pages();
    const targetPage = pages.find(p => p.url().includes(urlSubstring));

    if (!targetPage) {
        // Fallback: Use the first page if only one exists (common in Electron BrowserView)
        // Or if we can't find by URL, maybe it's the active tab.
        // In our Electron app, BrowserView is separate context usually? 
        // Actually Electron main window and BrowserView share the same debugging port process
        // but might be different targets. 
        // We will log available pages to help debugging.
        const urls = pages.map(p => p.url());
        logger.warn(`Could not find page with URL containing "${urlSubstring}". Available pages: ${urls.join(', ')}`);
        
        throw new Error(`Page not found for URL: ${urlSubstring}`);
    }

    return targetPage;
  }

  async disconnect() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info('Disconnected from browser');
    }
  }
}

export const browserConnector = new BrowserConnector();
