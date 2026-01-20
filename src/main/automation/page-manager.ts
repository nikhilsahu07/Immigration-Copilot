
import { Page } from 'playwright-core';
import { logger } from '../core/logger';
import { cleanHtml } from './page/html-extractor';
import { BaseFiller, AutomatedField } from './fillers/base-filler';
import { TextFiller } from './fillers/text-filler';
import { SelectFiller } from './fillers/select-filler';
import { RadioFiller } from './fillers/radio-filler';
import { CheckboxFiller } from './fillers/checkbox-filler';
import { FileUploadFiller } from './fillers/file-upload-filler';
import { DateFiller } from './fillers/date-filler';
import { ScreenshotCapture } from './page/screenshot-capture';
import { SpecialElementsDetector } from './detection/special-elements-detector';
import { FieldTypeDetector } from './detection/field-type-detector';
import { ClickHandler } from './actions/click-handler';
import { FormSubmitHandler } from './actions/form-submit-handler';
import type { DetectionResult } from './types/internal-types';

// Re-export DetectionResult for backwards compatibility
export type { DetectionResult };

/**
 * Page interaction coordinator
 * Delegates to specialized handlers for different responsibilities
 */
export class PageManager {
  private fillers: Record<string, BaseFiller> = {};
  private screenshotCapture: ScreenshotCapture;
  private specialElementsDetector: SpecialElementsDetector;
  private fieldTypeDetector: FieldTypeDetector;
  private clickHandler: ClickHandler;
  private formSubmitHandler: FormSubmitHandler;

  constructor(private page: Page) {
      this.initializeFillers();
      this.screenshotCapture = new ScreenshotCapture(page);
      this.specialElementsDetector = new SpecialElementsDetector(page);
      this.fieldTypeDetector = new FieldTypeDetector(page);
      this.clickHandler = new ClickHandler(page);
      this.formSubmitHandler = new FormSubmitHandler(page);
  }

  private initializeFillers() {
      this.fillers['text'] = new TextFiller(this.page);
      this.fillers['email'] = new TextFiller(this.page);
      this.fillers['tel'] = new TextFiller(this.page);
      this.fillers['number'] = new TextFiller(this.page);
      this.fillers['textarea'] = new TextFiller(this.page);
      
      this.fillers['select'] = new SelectFiller(this.page);
      this.fillers['dropdown'] = new SelectFiller(this.page);
      
      this.fillers['radio'] = new RadioFiller(this.page);
      this.fillers['checkbox'] = new CheckboxFiller(this.page);
      
      this.fillers['date'] = new DateFiller(this.page);
      this.fillers['file'] = new FileUploadFiller(this.page);
      
      // Additional aliases for button-style radios
      this.fillers['button'] = new RadioFiller(this.page);
  }

  /**
   * Get the underlying Playwright Page object
   * Used by BehaviorFillerFactory to create filler instances
   */
  getPage(): Page {
    return this.page;
  }

  async extractHtml(): Promise<string> {
      try {
           const raw = await this.page.content();
           return cleanHtml(raw);
      } catch (e) {
          logger.error('Failed to extract HTML', e);
          throw e;
      }
  }


  async detectSpecialElements(): Promise<DetectionResult> {
      return await this.specialElementsDetector.detect();
  }


  // Detect field type from selector by querying the actual DOM element
  private async detectFieldType(selector: string, providedType: string): Promise<string> {
    return await this.fieldTypeDetector.detect(selector, providedType);
  }

  async fillForm(fields: AutomatedField[]): Promise<void> {
      for (const field of fields) {
          if (!field.value) continue;

          // Detect correct field type from DOM if needed
          const actualFieldType = await this.detectFieldType(field.selector, field.fieldType);
          
          if (actualFieldType !== field.fieldType) {
            logger.info(`Detected field type ${actualFieldType} for ${field.fieldLabel} (was: ${field.fieldType})`);
          }

          const filler = this.fillers[actualFieldType] || this.fillers['text'];
          const success = await filler.fill({ ...field, fieldType: actualFieldType });
          
          if (!success) {
              logger.warn(`Skipped field ${field.fieldLabel} (${field.selector})`);
          }
          
          // Small delay for realism
          // await this.page.waitForTimeout(200); // Removed for speed per user request
      }
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
