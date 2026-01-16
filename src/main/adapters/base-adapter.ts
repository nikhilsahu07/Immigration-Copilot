import { Page } from 'playwright-core';
import { 
  IPortalAdapter, 
  AdapterContext, 
  AdapterResult, 
  AdapterError,
  AdapterPromptConfig 
} from './types';
import { AdapterLogHelper } from './adapter-logger';

/**
 * Abstract base class for all custom portal adapters.
 * Provides common utilities and enforces the adapter interface.
 * 
 * To create a custom adapter:
 * 1. Extend this class
 * 2. Implement `canHandle()` and `execute()`
 * 3. Register the adapter in `portals/index.ts`
 */
export abstract class BaseAdapter implements IPortalAdapter {
  abstract readonly slug: string;
  abstract readonly name: string;
  abstract readonly version: string;

  // Optional: Custom prompt configuration for AI assistance
  protected promptConfig?: AdapterPromptConfig;

  // Logger instance - will be set in execute()
  protected logger!: AdapterLogHelper;

  //   
  // Abstract Methods (must implement)
  //   

  /**
   * Check if this adapter can handle the given URL.
   * Typically checks if the URL matches the expected portal domain.
   */
  abstract canHandle(url: string, html?: string): Promise<boolean>;

  /**
   * Execute the automation for the current page.
   * This is where your Playwright script goes.
   */
  abstract execute(context: AdapterContext): Promise<AdapterResult>;

  //   
  // Safe Element Interactions
  //   

  /**
   * Safely click an element. Returns true if successful.
   */
  protected async safeClick(
    page: Page, 
    selector: string, 
    options?: { timeout?: number; force?: boolean }
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ 
        state: 'visible', 
        timeout: options?.timeout ?? 5000 
      });
      await element.click({ force: options?.force });
      this.logger.info(`Clicked element: ${selector}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to click: ${selector}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Safely fill a text input. Returns true if successful.
   */
  protected async safeFill(
    page: Page, 
    selector: string, 
    value: string,
    options?: { timeout?: number; clear?: boolean }
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ 
        state: 'visible', 
        timeout: options?.timeout ?? 5000 
      });
      
      if (options?.clear !== false) {
        await element.clear();
      }
      
      await element.fill(value);
      this.logger.info(`Filled field: ${selector}`, { value: value.substring(0, 50) });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to fill: ${selector}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Safely select an option from a dropdown. Returns true if successful.
   */
  protected async safeSelect(
    page: Page,
    selector: string,
    value: string,
    options?: { timeout?: number }
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ 
        state: 'visible', 
        timeout: options?.timeout ?? 5000 
      });
      await element.selectOption(value);
      this.logger.info(`Selected option: ${selector}`, { value });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to select: ${selector}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Safely check/uncheck a checkbox. Returns true if successful.
   */
  protected async safeCheck(
    page: Page,
    selector: string,
    checked: boolean,
    options?: { timeout?: number }
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ 
        state: 'visible', 
        timeout: options?.timeout ?? 5000 
      });
      
      if (checked) {
        await element.check();
      } else {
        await element.uncheck();
      }
      
      this.logger.info(`Set checkbox: ${selector}`, { checked });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to set checkbox: ${selector}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Safely click a radio button. Returns true if successful.
   */
  protected async safeRadio(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<boolean> {
    return this.safeClick(page, selector, options);
  }

  /**
   * Wait for navigation to complete.
   */
  protected async waitForNavigation(
    page: Page, 
    options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<void> {
    try {
      await page.waitForLoadState(options?.waitUntil ?? 'networkidle', {
        timeout: options?.timeout ?? 30000
      });
      this.logger.info('Navigation completed');
    } catch (error) {
      this.logger.warn('Navigation wait failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Safely upload a file. Returns true if successful.
   */
  protected async safeFileUpload(
    page: Page, 
    selector: string, 
    filePath: string,
    options?: { timeout?: number }
  ): Promise<boolean> {
    try {
      const fileInput = page.locator(selector);
      await fileInput.waitFor({ 
        state: 'attached', 
        timeout: options?.timeout ?? 5000 
      });
      await fileInput.setInputFiles(filePath);
      this.logger.info(`Uploaded file: ${selector}`, { filePath });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to upload file: ${selector}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Wait for an element to appear.
   */
  protected async waitForElement(
    page: Page,
    selector: string,
    options?: { timeout?: number; state?: 'visible' | 'attached' | 'hidden' }
  ): Promise<boolean> {
    try {
      await page.locator(selector).waitFor({
        state: options?.state ?? 'visible',
        timeout: options?.timeout ?? 10000
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if an element exists on the page.
   */
  protected async elementExists(page: Page, selector: string): Promise<boolean> {
    try {
      const count = await page.locator(selector).count();
      return count > 0;
    } catch {
      return false;
    }
  }

  //   
  // Approval Handling
  //   

  /**
   * Request approval if in manual mode.
   * In auto mode, this is a no-op.
   */
  protected async requestApprovalIfNeeded(
    context: AdapterContext,
    description: string
  ): Promise<void> {
    if (context.executionMode === 'manual') {
      this.logger.info(`Waiting for approval: ${description}`);
      await context.onApprovalRequired();
      this.logger.info('Approval received');
    }
  }

  //   
  // Helper Methods
  //   

  /**
   * Create a success result.
   */
  protected successResult(
    pageType: AdapterResult['pageType'],
    fieldsFilledCount: number,
    actionsPerformed: string[],
    overrides?: Partial<AdapterResult>
  ): AdapterResult {
    return {
      success: true,
      pageType,
      fieldsFilledCount,
      actionsPerformed,
      ...overrides,
    };
  }

  /**
   * Create a failure result.
   */
  protected failureResult(
    error: AdapterError,
    shouldFallback: boolean = true
  ): AdapterResult {
    return {
      success: false,
      pageType: 'unknown',
      fieldsFilledCount: 0,
      actionsPerformed: [],
      error,
      shouldFallbackToAI: shouldFallback,
    };
  }

  /**
   * Create an error object for failures.
   */
  protected createError(
    code: string,
    message: string,
    details?: Partial<AdapterError>
  ): AdapterError {
    return {
      code,
      message,
      ...details,
    };
  }

  /**
   * Initialize logger with job context.
   * Call this at the start of execute().
   */
  protected initializeLogger(jobId?: string, portalId?: string): void {
    this.logger = new AdapterLogHelper(this.slug, jobId, portalId);
  }
}
