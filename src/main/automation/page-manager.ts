
import { Page } from 'playwright-core';
import { logger } from '../core/logger';
import { cleanHtml } from './page/html-cleaner';
import { FieldExtractor } from './page/field-extractor';
import { ScreenshotCapture } from './page/screenshot-capture';
import { SpecialElementsDetector } from './detection/special-elements-detector';
import { ClickHandler } from './actions/click-handler';
import { FormSubmitHandler } from './actions/form-submit-handler';
import type { DetectionResult } from './types/internal-types';
import { CanonicalField } from '../../shared/types/automation.types';

// Re-export DetectionResult for backwards compatibility
export type { DetectionResult };

/**
 * Page interaction coordinator
 * Delegates to specialized handlers for different responsibilities
 */
export class PageManager {
  private screenshotCapture: ScreenshotCapture;
  private specialElementsDetector: SpecialElementsDetector;
  private clickHandler: ClickHandler;
  private formSubmitHandler: FormSubmitHandler;
  private fieldExtractor: FieldExtractor;

  constructor(private page: Page) {
      this.screenshotCapture = new ScreenshotCapture(page);
      this.specialElementsDetector = new SpecialElementsDetector(page);
      this.clickHandler = new ClickHandler(page);
      this.formSubmitHandler = new FormSubmitHandler(page);
      this.fieldExtractor = new FieldExtractor(page);
  }



  /**
   * Get the underlying Playwright Page object
   * Used by BehaviorFillerFactory to create filler instances
   */
  getPage(): Page {
    return this.page;
  }

  /**
   * Get raw HTML content from page (no cleaning, no extraction)
   * Used for logging exact captured HTML
   */
  async getRawHtml(): Promise<string> {
    try {
      // CRITICAL: Ensure page is fully loaded before extracting HTML
      // Wait for page to be ready to ensure complete DOM structure
      try {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        
        // Small delay to ensure DOM is fully rendered
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        logger.warn('HTML extraction: Page load wait timeout, proceeding anyway', err);
        // Continue anyway - page might be ready even if wait timed out
      }

      return await this.page.content();
    } catch (e) {
      logger.error('Failed to get raw HTML', e);
      throw e;
    }
  }

  async extractHtml(): Promise<string> {
      try {
          const raw = await this.getRawHtml();
          return cleanHtml(raw);
      } catch (e) {
          logger.error('Failed to extract HTML', e);
          throw e;
      }
  }



  /**
   * Extract canonical fields using semantic schema
   * Returns CanonicalField[] with accessibleName as primary identifier
   * This is the recommended method for new implementations
   */
  async extractCanonicalFields(): Promise<CanonicalField[]> {
    try {
      return await this.fieldExtractor.extractCanonicalFields({
        includeHidden: false,
        includeDisabled: false,
      });
    } catch (e) {
      logger.error('Failed to extract canonical fields', e);
      throw e;
    }
  }


  async detectSpecialElements(): Promise<DetectionResult> {
      return await this.specialElementsDetector.detect();
  }




  // Find and click the submit/next button in the form
  async clickSubmitButton(): Promise<boolean> {
    return await this.formSubmitHandler.clickSubmitButton();
  }

  /**
   * Safe click execution using Playwright locators.
   * Resolves, asserts visibility, and clicks the first visible match.
   */
  async executeClick(selector: string, description?: string): Promise<boolean> {
    return await this.clickHandler.executeClick(selector, description);
  }

  /**
   * Click a button by selector AND expected text content.
   * This is safer for React SPAs where multiple buttons may share attributes.
   */
  async clickButtonWithText(selector: string, expectedText: string): Promise<boolean> {
    return await this.clickHandler.clickButtonWithText(selector, expectedText);
  }

  /**
   * Execute a list of actions from Gemini response.
   */
  async executeActions(actions: { type: string; selector?: string; description: string; expectedText?: string }[]): Promise<boolean> {
    return await this.clickHandler.executeActions(actions);
  }

  /**
   * Click element by role and accessible name.
   * Most reliable for React SPAs.
   */
  async clickByRole(role: 'button' | 'link' | 'checkbox', name: string): Promise<boolean> {
    return await this.clickHandler.clickByRole(role, name);
  }

  /**
   * Click element by visible text content.
   * Fallback when role-based matching fails.
   */
  async clickByText(text: string): Promise<boolean> {
    return await this.clickHandler.clickByText(text);
  }
  async captureScreenshot(): Promise<string> {
    return await this.screenshotCapture.capture();
  }
}
