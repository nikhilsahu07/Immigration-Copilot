import { Page } from 'playwright-core';
import { logger, automationNavigationLogger } from '../../core/logger';

/**
 * Click handler with multiple fallback strategies
 * Handles various types of clickable elements (selectors, roles, text)
 */
export class ClickHandler {
  constructor(private page: Page) {}

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
      
      const currentUrl = this.page.url();
      const clickStartTime = Date.now();
      await target.click({ force: false });
      const clickDuration = Date.now() - clickStartTime;
      
      automationNavigationLogger.info('Element clicked via executeClick', {
        selector,
        description,
        currentUrl,
        clickDuration
      });
      
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
      
      const currentUrl = this.page.url();
      const clickStartTime = Date.now();
      await target.click();
      const clickDuration = Date.now() - clickStartTime;
      
      automationNavigationLogger.info('Button clicked via clickButtonWithText', {
        selector,
        expectedText,
        currentUrl,
        clickDuration
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to click button with text "${expectedText}":`, error);
      return false;
    }
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
      
      const currentUrl = this.page.url();
      const clickStartTime = Date.now();
      await target.click();
      const clickDuration = Date.now() - clickStartTime;
      
      automationNavigationLogger.info('Element clicked via clickByRole', {
        role,
        name,
        currentUrl,
        clickDuration
      });
      
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
      
      const target = locator.first();
      await target.waitFor({ state: 'visible', timeout: 5000 });
      await target.scrollIntoViewIfNeeded();
      
      logger.info(`Clicking element by text: "${text}"`);
      
      const currentUrl = this.page.url();
      const clickStartTime = Date.now();
      await target.click();
      const clickDuration = Date.now() - clickStartTime;
      
      automationNavigationLogger.info('Element clicked via clickByText', {
        text,
        currentUrl,
        clickDuration
      });
      
      return true;
    } catch (error) {
      logger.debug(`clickByText failed for "${text}":`, error);
      return false;
    }
  }

  /**
   * Execute a list of actions with multiple fallback strategies.
   * Now uses semantic discovery (getByRole, getByText) instead of selectors
   * Tries: role+text, text, selector (fallback)
   */
  async executeActions(actions: { type: string; selector?: string; description: string; expectedText?: string; fieldId?: string }[]): Promise<boolean> {
    for (const action of actions) {
      if (action.type === 'click') {
        let clicked = false;
        
        // Strategy 1: If expectedText exists, try getByRole('button') with name (most reliable for SPAs)
        if (!clicked && action.expectedText) {
          clicked = await this.clickByRole('button', action.expectedText);
        }
        
        // Strategy 2: Try getByText (semantic text matching)
        if (!clicked && action.expectedText) {
          clicked = await this.clickByText(action.expectedText);
        }
        
        // Strategy 3: Use selector + expectedText if both provided (fallback)
        if (!clicked && action.selector && action.expectedText && !action.selector.includes(':contains') && !action.selector.includes(':has(')) {
          clicked = await this.clickButtonWithText(action.selector, action.expectedText);
        }
        
        // Strategy 4: If no expectedText but selector exists, try plain selector (last resort)
        if (!clicked && action.selector && !action.selector.includes(':contains') && !action.selector.includes(':has(')) {
          clicked = await this.executeClick(action.selector, action.description);
        }
        
        if (!clicked) {
          logger.warn(`Action failed (all strategies): ${action.description}`);
          return false;
        }
        
        // Wait for navigation/render after click
        try {
          const currentUrl = this.page.url();
          automationNavigationLogger.info('Waiting for navigation after action execution', {
            currentUrl,
            waitStrategy: 'domcontentloaded',
            timeout: 5000
          });
          
          const waitStartTime = Date.now();
          await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
          const waitDuration = Date.now() - waitStartTime;
          const newUrl = this.page.url();
          const urlChanged = newUrl !== currentUrl;
          
          automationNavigationLogger.info('Navigation wait completed', {
            previousUrl: currentUrl,
            newUrl,
            urlChanged,
            waitDuration
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          automationNavigationLogger.debug('Navigation wait timeout (expected for SPAs)', {
            currentUrl: this.page.url(),
            error: errorMessage
          });
          // Timeout is okay, page might not navigate
        }
      } else if (action.type === 'wait') {
        // Wait actions removed for speed
      }
    }
    return true;
  }
}
