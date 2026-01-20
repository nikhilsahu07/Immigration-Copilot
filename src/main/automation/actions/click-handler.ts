import { Page } from 'playwright-core';
import { logger } from '../../core/logger';

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
      await target.click({ force: false });
      
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
      await target.click();
      
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
      await target.click();
      
      return true;
    } catch (error) {
      logger.debug(`clickByText failed for "${text}":`, error);
      return false;
    }
  }

  /**
   * Execute a list of actions with multiple fallback strategies.
   * Tries: selector+text, role, text, plain selector
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
        // Wait actions removed for speed
      }
    }
    return true;
  }
}
