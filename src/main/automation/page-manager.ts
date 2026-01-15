
import { Page } from 'playwright-core';
import { logger } from '../core/logger';
import { cleanHtml } from '../utils/html-cleaner';
import { BaseFiller, AutomatedField } from './fillers/base-filler';
import { TextFiller } from './fillers/text-filler';
import { SelectFiller } from './fillers/select-filler';
import { RadioFiller } from './fillers/radio-filler';
import { CheckboxFiller } from './fillers/checkbox-filler';
import { FileUploadFiller } from './fillers/file-upload-filler';
import { DateFiller } from './fillers/date-filler';

export interface DetectionResult {
    hasCaptcha: boolean;
    hasOtp: boolean;
    reason?: string;
    selector?: string;
}

export class PageManager {
  private fillers: Record<string, BaseFiller> = {};

  constructor(private page: Page) {
      this.initializeFillers();
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
      // Ported logic from toyVersion
      return await this.page.evaluate(() => {
        const result = { hasCaptcha: false, hasOtp: false, reason: '', selector: '' };

        function isRelevantCaptcha(selector: string): boolean {
            const elements = document.querySelectorAll(selector);
            for (const el of Array.from(elements)) {
                // 1. Must be inside a form
                if (!el.closest('form')) continue;

                // 2. Must be visible
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                if (el.getBoundingClientRect().height === 0) continue;

                // 3. Must not be explicitly "invisible" type (reCAPTCHA v2 invisible)
                if (el.getAttribute('data-size') === 'invisible') continue;
                
                return true;
            }
            return false;
        }

        // CAPTCHA
        if (
            isRelevantCaptcha('iframe[src*="google.com/recaptcha"]') ||
            isRelevantCaptcha('.g-recaptcha, #g-recaptcha') ||
            isRelevantCaptcha('iframe[src*="hcaptcha.com"]') ||
            isRelevantCaptcha('.h-captcha') ||
            isRelevantCaptcha('.cf-turnstile')
        ) {
            result.hasCaptcha = true;
            result.reason = 'Standard Captcha found inside form';
            return result;
        }

        // OTP
        const otpInput = document.querySelector('input[name*="otp"], input[id*="otp"], input[placeholder*="otp"]');
        if (otpInput) {
            result.hasOtp = true;
            result.selector = (otpInput as HTMLElement).id ? `#${(otpInput as HTMLElement).id}` : `[name="${(otpInput as HTMLInputElement).name}"]`;
            result.reason = 'OTP input found';
            return result;
        }
        
        return result;
      });
  }

  // Detect field type from selector by querying the actual DOM element
  private async detectFieldType(selector: string, providedType: string): Promise<string> {
    // If selector contains 'select', it's definitely a select
    if (selector.toLowerCase().includes('select[') || selector.toLowerCase().includes('select#')) {
      return 'select';
    }
    
    // If selector contains 'input[type="radio"]' or similar
    if (selector.includes('type="radio"') || selector.includes("type='radio'")) {
      return 'radio';
    }
    
    if (selector.includes('type="checkbox"') || selector.includes("type='checkbox'")) {
      return 'checkbox';
    }
    
    // Try to detect from DOM
    try {
      const elementType = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'select') return 'select';
        if (tagName === 'textarea') return 'textarea';
        if (tagName === 'button') return 'button';
        
        if (tagName === 'input') {
          const type = (el as HTMLInputElement).type.toLowerCase();
          if (type === 'radio') return 'radio';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'date') return 'date';
          if (type === 'file') return 'file';
          if (type === 'email') return 'email';
          if (type === 'tel') return 'tel';
          if (type === 'number') return 'number';
          return 'text';
        }
        
        return null;
      }, selector);
      
      if (elementType) {
        return elementType;
      }
    } catch {
      // Ignore detection errors
    }
    
    return providedType || 'text';
  }

  async fillForm(fields: AutomatedField[]): Promise<{ filledCount: number; failedFields: AutomatedField[] }> {
      const failedFields: AutomatedField[] = [];
      let filledCount = 0;
      
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
              failedFields.push({ ...field, fieldType: actualFieldType });
              logger.warn(`First attempt failed for ${field.fieldLabel} (${field.selector})`);
          } else {
              filledCount++;
          }
          
          // Small delay for realism
          await this.page.waitForTimeout(200);
      }
      
      // RETRY: Attempt failed fields again with alternative strategies
      const stillFailed: AutomatedField[] = [];
      for (const field of failedFields) {
          logger.info(`Retrying field: ${field.fieldLabel}`);
          
          // Try alternative strategies
          let retrySuccess = false;
          
          // Strategy 1: Try with a shorter timeout and force visibility
          try {
              await this.page.waitForTimeout(500); // Give DOM time to stabilize
              const filler = this.fillers[field.fieldType] || this.fillers['text'];
              retrySuccess = await filler.fill(field);
          } catch (e) {
              logger.debug(`Retry strategy 1 failed for ${field.fieldLabel}:`, e);
          }
          
          // Strategy 2: Try to find element by label text and fill
          if (!retrySuccess && field.fieldLabel) {
              try {
                  const labelLocator = this.page.getByLabel(field.fieldLabel, { exact: false });
                  if (await labelLocator.count() > 0) {
                      await labelLocator.first().fill(String(field.value));
                      retrySuccess = true;
                      logger.info(`Retry by label succeeded for ${field.fieldLabel}`);
                  }
              } catch (e) {
                  logger.debug(`Retry by label failed for ${field.fieldLabel}:`, e);
              }
          }
          
          if (retrySuccess) {
              filledCount++;
              logger.info(`Retry succeeded for ${field.fieldLabel}`);
          } else {
              stillFailed.push(field);
              logger.warn(`All retries failed for ${field.fieldLabel} (${field.selector})`);
          }
      }
      
      logger.info(`Form fill complete: ${filledCount}/${fields.length} succeeded, ${stillFailed.length} failed`);
      return { filledCount, failedFields: stillFailed };
  }

  // Find and click the submit/next button in the form
  async clickSubmitButton(): Promise<boolean> {
    try {
      // Try multiple strategies to find submit button
      const submitSelectors = [
        'form button[type="submit"]',
        'form input[type="submit"]',
        'form button:not([type="button"])',
        'button[type="submit"]',
        'input[type="submit"]',
        '.submit-btn',
        '.btn-submit',
        '[class*="submit"]',
      ];
      
      // Try text-based matching with Playwright's getByRole/getByText
      const textMatches = ['Submit', 'Next', 'Continue', 'Proceed', 'Go', 'Get Quote', 'View Plans'];
      
      // First try standard selectors
      for (const selector of submitSelectors) {
        try {
          const btn = await this.page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.scrollIntoViewIfNeeded();
            await btn.click();
            logger.info(`Clicked submit button: ${selector}`);
            return true;
          }
        } catch {
          continue;
        }
      }
      
      // Try text-based matching
      for (const text of textMatches) {
        try {
          const btn = this.page.getByRole('button', { name: text });
          if (await btn.count() > 0 && await btn.first().isVisible()) {
            await btn.first().click();
            logger.info(`Clicked button by text: ${text}`);
            return true;
          }
        } catch {
          continue;
        }
      }
      
      // Last resort: find any button in form
      try {
        const formButton = await this.page.$('form button');
        if (formButton && await formButton.isVisible()) {
          await formButton.click();
          logger.info('Clicked first form button');
          return true;
        }
      } catch {
        // Ignore
      }
      
      logger.warn('No submit button found');
      return false;
    } catch (error) {
      logger.error('Failed to click submit button:', error);
      return false;
    }
  }

  /**
   * Safe click execution using Playwright locators.
   * Resolves, asserts visibility, and clicks the first visible match.
   */
  async executeClick(selector: string, description?: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector);
      const count = await locator.count();

      if (count === 0) {
        logger.warn(`No element found for selector: ${selector}`);
        return false;
      }

      if (count > 1) {
        logger.warn(`Multiple elements (${count}) found for selector: ${selector}. Using first visible one.`);
      }

      // Get first visible element
      const target = locator.first();

      // Wait for visibility
      try {
        await target.waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        logger.warn(`Element not visible: ${selector}`);
        return false;
      }

      await target.scrollIntoViewIfNeeded();
      
      logger.info(`Clicking element: ${description || selector}`);
      await target.click({ force: false });
      
      // Small delay after click for React re-renders
      await this.page.waitForTimeout(500);
      
      return true;
    } catch (error) {
      logger.error(`Failed to click ${selector}:`, error);
      return false;
    }
  }

  /**
   * Click a button by selector AND expected text content.
   * This is safer for React SPAs where multiple buttons may share attributes.
   */
  async clickButtonWithText(selector: string, expectedText: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector).filter({
        hasText: expectedText,
      });

      const count = await locator.count();
      if (count === 0) {
        logger.warn(`No button found with selector "${selector}" and text "${expectedText}"`);
        return false;
      }

      const target = locator.first();
      await target.waitFor({ state: 'visible', timeout: 5000 });
      await target.scrollIntoViewIfNeeded();
      
      logger.info(`Clicking button: "${expectedText}" (${selector})`);
      await target.click();
      
      await this.page.waitForTimeout(500);
      return true;
    } catch (error) {
      logger.error(`Failed to click button with text "${expectedText}":`, error);
      return false;
    }
  }

  /**
   * Execute a list of actions from Gemini response.
   * Used for dashboard/navigation pages.
   * Includes multiple fallback strategies for fault tolerance.
   */
  async executeActions(actions: { type: string; selector?: string; description: string; expectedText?: string }[]): Promise<boolean> {
    for (const action of actions) {
      if (action.type === 'click') {
        let clicked = false;
        
        // Strategy 1: Use selector + expectedText if both provided
        if (action.selector && action.expectedText && !action.selector.includes(':contains') && !action.selector.includes(':has(')) {
          clicked = await this.clickButtonWithText(action.selector, action.expectedText);
        }
        
        // Strategy 2: If expectedText exists, try getByRole('button') with name
        if (!clicked && action.expectedText) {
          clicked = await this.clickByRole('button', action.expectedText);
        }
        
        // Strategy 3: Try getByText as last resort
        if (!clicked && action.expectedText) {
          clicked = await this.clickByText(action.expectedText);
        }
        
        // Strategy 4: If no expectedText but selector exists, try plain selector
        if (!clicked && action.selector && !action.selector.includes(':contains') && !action.selector.includes(':has(')) {
          clicked = await this.executeClick(action.selector, action.description);
        }
        
        if (!clicked) {
          logger.warn(`Action failed (all strategies): ${action.description}`);
          return false;
        }
        
        // Wait for navigation/render after click
        try {
          await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        } catch {
          // Timeout is okay, page might not navigate
        }
      } else if (action.type === 'wait') {
        await this.page.waitForTimeout(2000);
      }
      // 'submit' type handled separately via clickSubmitButton
    }
    return true;
  }

  /**
   * Click element by role and accessible name.
   * Most reliable for React SPAs.
   */
  async clickByRole(role: 'button' | 'link' | 'checkbox', name: string): Promise<boolean> {
    try {
      const locator = this.page.getByRole(role, { name, exact: false });
      const count = await locator.count();
      
      if (count === 0) {
        logger.debug(`No ${role} found with name "${name}"`);
        return false;
      }
      
      const target = locator.first();
      await target.waitFor({ state: 'visible', timeout: 5000 });
      await target.scrollIntoViewIfNeeded();
      
      logger.info(`Clicking ${role} by name: "${name}"`);
      await target.click();
      
      await this.page.waitForTimeout(500);
      return true;
    } catch (error) {
      logger.debug(`clickByRole failed for ${role}:"${name}":`, error);
      return false;
    }
  }

  /**
   * Click element by visible text content.
   * Fallback when role-based matching fails.
   */
  async clickByText(text: string): Promise<boolean> {
    try {
      const locator = this.page.getByText(text, { exact: false });
      const count = await locator.count();
      
      if (count === 0) {
        logger.debug(`No element found with text "${text}"`);
        return false;
      }
      
      // Find a clickable element (button, link, or element with onClick)
      const target = locator.first();
      await target.waitFor({ state: 'visible', timeout: 5000 });
      await target.scrollIntoViewIfNeeded();
      
      logger.info(`Clicking element by text: "${text}"`);
      await target.click();
      
      await this.page.waitForTimeout(500);
      return true;
    } catch (error) {
      logger.debug(`clickByText failed for "${text}":`, error);
      return false;
    }
  }

  // ============================================
  // SPA Exploration Utilities
  // ============================================

  /**
   * Wait for DOM changes after a click action.
   * Uses both load state and a small delay for React/Vue re-renders.
   */
  async waitForDOMChange(timeout: number = 2000): Promise<boolean> {
    try {
      // Wait for network to be idle or the DOM to be content loaded
      await Promise.race([
        this.page.waitForLoadState('domcontentloaded', { timeout }),
        this.page.waitForLoadState('networkidle', { timeout }),
      ]);
      
      // Additional delay for framework re-renders (React, Vue, etc.)
      await this.page.waitForTimeout(300);
      
      return true;
    } catch {
      // Timeout is acceptable - page may not have navigated
      await this.page.waitForTimeout(300);
      return false;
    }
  }

  /**
   * Extract HTML content scoped to a modal element.
   * Useful for focusing AI vision on modal content only.
   */
  async extractModalContent(modalSelector?: string): Promise<string | null> {
    try {
      // Common modal selectors to try if none provided
      const selectors = modalSelector 
        ? [modalSelector]
        : [
          '[role="dialog"]',
          '[aria-modal="true"]',
          '.modal[style*="display: block"]',
          '.modal.show',
          '.MuiDialog-root',
          '.ReactModal__Content',
          '[data-testid="modal"]',
        ];

      for (const selector of selectors) {
        const modal = await this.page.$(selector);
        if (modal && await modal.isVisible()) {
          const modalHtml = await modal.innerHTML();
          logger.info(`Extracted modal content from: ${selector}`);
          return cleanHtml(modalHtml);
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to extract modal content:', error);
      return null;
    }
  }

  /**
   * Detect interactive elements on the page that might reveal more form fields.
   * Returns tabs, accordions, and "Add" buttons.
   */
  async detectInteractiveElements(): Promise<{
    tabs: { selector: string; label: string; isActive: boolean }[];
    accordions: { selector: string; label: string; isExpanded: boolean }[];
    addButtons: { selector: string; label: string }[];
  }> {
    return await this.page.evaluate(() => {
      const result: {
        tabs: { selector: string; label: string; isActive: boolean }[];
        accordions: { selector: string; label: string; isExpanded: boolean }[];
        addButtons: { selector: string; label: string }[];
      } = {
        tabs: [],
        accordions: [],
        addButtons: [],
      };

      // Helper to create stable selector
      function getStableSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
        if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        // Fallback to role + text
        const role = el.getAttribute('role');
        const text = el.textContent?.trim().slice(0, 30);
        if (role && text) return `[role="${role}"]`;
        return '';
      }

      // Detect tabs
      const tabElements = document.querySelectorAll('[role="tab"], .nav-tabs .nav-link, .tab-button');
      tabElements.forEach(tab => {
        const selector = getStableSelector(tab);
        if (selector) {
          result.tabs.push({
            selector,
            label: tab.textContent?.trim() || '',
            isActive: tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('active'),
          });
        }
      });

      // Detect accordions
      const accordionHeaders = document.querySelectorAll(
        '[data-toggle="collapse"], .accordion-button, [aria-expanded]'
      );
      accordionHeaders.forEach(header => {
        const selector = getStableSelector(header);
        if (selector) {
          result.accordions.push({
            selector,
            label: header.textContent?.trim() || '',
            isExpanded: header.getAttribute('aria-expanded') === 'true',
          });
        }
      });

      // Detect "Add" buttons (common pattern in forms)
      const addButtonPatterns = [
        'button:not([type="submit"])',
        '[class*="add"]',
        '[class*="Add"]',
      ];
      const allButtons = document.querySelectorAll('button');
      allButtons.forEach(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('add') || text.includes('new') || text.includes('+')) {
          const selector = getStableSelector(btn);
          if (selector) {
            result.addButtons.push({
              selector,
              label: btn.textContent?.trim() || '',
            });
          }
        }
      });

      return result;
    });
  }

  /**
   * Execute click with exponential backoff retry.
   * Useful for SPA elements that may not be immediately clickable.
   */
  async executeClickWithRetry(
    selector: string, 
    description: string,
    maxRetries: number = 3
  ): Promise<boolean> {
    let delay = 500;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const success = await this.executeClick(selector, description);
      
      if (success) {
        return true;
      }
      
      if (attempt < maxRetries) {
        logger.debug(`Click attempt ${attempt} failed, retrying in ${delay}ms...`);
        await this.page.waitForTimeout(delay);
        delay *= 2; // Exponential backoff
      }
    }
    
    logger.warn(`All ${maxRetries} click attempts failed for: ${selector}`);
    return false;
  }

  /**
   * Get content of a specific tab panel by clicking the tab first.
   */
  async getTabPanelContent(tabSelector: string): Promise<string | null> {
    try {
      // Click the tab
      const clicked = await this.executeClick(tabSelector, 'Switch to tab');
      if (!clicked) {
        return null;
      }

      // Wait for content to load
      await this.waitForDOMChange(2000);

      // Extract the panel content
      // Try to find associated panel via aria-controls
      const panelId = await this.page.evaluate((sel) => {
        const tab = document.querySelector(sel);
        return tab?.getAttribute('aria-controls');
      }, tabSelector);

      if (panelId) {
        const panel = await this.page.$(`#${panelId}`);
        if (panel) {
          const html = await panel.innerHTML();
          return cleanHtml(html);
        }
      }

      // Fallback: return full page content
      return await this.extractHtml();
    } catch (error) {
      logger.error('Failed to get tab panel content:', error);
      return null;
    }
  }
}
