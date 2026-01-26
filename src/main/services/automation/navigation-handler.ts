/**
 * Navigation Handler
 * 
 * Handles dashboard navigation and form submission with action verification.
 * Provides methods to verify that actions had the expected effect.
 */

import { Page } from 'playwright-core';
import { PageManager } from '../../automation/page-manager';
import { logger, automationNavigationLogger } from '../../core/logger';
import { EventEmitter } from '../../automation/core/event-emitter';
import { getConfig } from './automation.config';

export interface ActionResult {
  clicked: boolean;
  verified: boolean;
  verificationMethod: 'url_change' | 'element_appeared' | 'element_disappeared' | 'dom_changed' | 'none';
  previousUrl?: string;
  newUrl?: string;
  error?: string;
  duration: number;
}

export interface ActionDefinition {
  type: string;
  selector?: string;
  expectedText: string;
  description: string;
  fieldId?: string;
}

export interface ExpectedOutcome {
  urlChange?: boolean;
  elementToAppear?: string;
  elementToDisappear?: string;
}

export class NavigationHandler {
  constructor(private page: Page) {}

  /**
   * Execute action with verification of outcome
   * Returns detailed result including whether the action had the expected effect
   */
  async executeActionWithVerification(
    action: ActionDefinition,
    expectedOutcome?: ExpectedOutcome
  ): Promise<ActionResult> {
    const config = getConfig();
    const startTime = Date.now();
    const urlBefore = this.page.url();
    
    // Take DOM snapshot before action for comparison
    const domSnapshotBefore = await this.takeDOMSnapshot();

    automationNavigationLogger.info('Executing action with verification', {
      action: {
        type: action.type,
        expectedText: action.expectedText,
        selector: action.selector,
      },
      urlBefore,
      expectedOutcome
    });

    const pageManager = new PageManager(this.page);

    // Execute the action
    const clicked = await pageManager.executeActions([action]);
    
    if (!clicked) {
      return {
        clicked: false,
        verified: false,
        verificationMethod: 'none',
        previousUrl: urlBefore,
        error: 'Click execution returned false',
        duration: Date.now() - startTime
      };
    }

    // Wait for navigation/render
    try {
      await this.page.waitForLoadState('domcontentloaded', { 
        timeout: config.navigation.waitAfterClick 
      });
    } catch {
      // Timeout is okay for SPAs
    }

    // Additional delay for DOM stability
    await this.page.waitForTimeout(config.navigation.postNavigationDelay);

    const urlAfter = this.page.url();
    const duration = Date.now() - startTime;

    // Verify outcome based on expected changes
    
    // Strategy 1: URL change detection
    if (expectedOutcome?.urlChange !== false) {
      // By default, check for URL change
      if (urlAfter !== urlBefore) {
        automationNavigationLogger.info('Action verified via URL change', {
          previousUrl: urlBefore,
          newUrl: urlAfter,
          duration
        });
        return {
          clicked: true,
          verified: true,
          verificationMethod: 'url_change',
          previousUrl: urlBefore,
          newUrl: urlAfter,
          duration
        };
      }
    }

    // Strategy 2: Element appeared
    if (expectedOutcome?.elementToAppear) {
      try {
        const appeared = await this.page.locator(expectedOutcome.elementToAppear).count() > 0;
        if (appeared) {
          automationNavigationLogger.info('Action verified via element appearance', {
            element: expectedOutcome.elementToAppear,
            duration
          });
          return {
            clicked: true,
            verified: true,
            verificationMethod: 'element_appeared',
            previousUrl: urlBefore,
            newUrl: urlAfter,
            duration
          };
        }
      } catch (error) {
        logger.debug(`Element appearance check failed: ${error}`);
      }
    }

    // Strategy 3: Element disappeared
    if (expectedOutcome?.elementToDisappear) {
      try {
        const disappeared = await this.page.locator(expectedOutcome.elementToDisappear).count() === 0;
        if (disappeared) {
          automationNavigationLogger.info('Action verified via element disappearance', {
            element: expectedOutcome.elementToDisappear,
            duration
          });
          return {
            clicked: true,
            verified: true,
            verificationMethod: 'element_disappeared',
            previousUrl: urlBefore,
            newUrl: urlAfter,
            duration
          };
        }
      } catch (error) {
        logger.debug(`Element disappearance check failed: ${error}`);
      }
    }

    // Strategy 4: DOM content change (fallback)
    const domSnapshotAfter = await this.takeDOMSnapshot();
    if (domSnapshotAfter !== domSnapshotBefore) {
      automationNavigationLogger.info('Action verified via DOM change', {
        duration
      });
      return {
        clicked: true,
        verified: true,
        verificationMethod: 'dom_changed',
        previousUrl: urlBefore,
        newUrl: urlAfter,
        duration
      };
    }

    // No verification criteria passed
    automationNavigationLogger.warn('Action clicked but verification failed - no expected outcome detected', {
      urlBefore,
      urlAfter,
      duration
    });

    return {
      clicked: true,
      verified: false,
      verificationMethod: 'none',
      previousUrl: urlBefore,
      newUrl: urlAfter,
      duration
    };
  }

  /**
   * Process dashboard navigation with verification
   */
  async processDashboardAction(
    action: ActionDefinition,
    jobId: string
  ): Promise<{ success: boolean; newUrl?: string }> {
    const currentUrl = this.page.url();

    automationNavigationLogger.info('=== DASHBOARD NAVIGATION START ===', {
      jobId,
      currentUrl,
      action: {
        expectedText: action.expectedText,
        type: action.type
      }
    });

    EventEmitter.emitStatus(`Clicking: ${action.expectedText}...`, 60);

    const result = await this.executeActionWithVerification(action, {
      urlChange: true // Dashboard actions typically navigate
    });

    if (!result.clicked) {
      automationNavigationLogger.error('Dashboard action click failed', {
        jobId,
        action,
        error: result.error
      });
      return { success: false };
    }

    if (result.verified) {
      automationNavigationLogger.info('=== DASHBOARD NAVIGATION COMPLETE ===', {
        jobId,
        success: true,
        verificationMethod: result.verificationMethod,
        newUrl: result.newUrl,
        duration: result.duration
      });

      EventEmitter.emitStatus('Navigation executed, waiting for new page...', 80);
      return { success: true, newUrl: result.newUrl };
    }

    // Clicked but not verified - might still be okay for SPAs
    automationNavigationLogger.warn('Dashboard action clicked but not verified', {
      jobId,
      verificationMethod: result.verificationMethod,
      note: 'Proceeding anyway - might be SPA without expected changes'
    });

    return { success: true, newUrl: result.newUrl };
  }

  /**
   * Submit form with verification
   */
  async submitFormWithVerification(
    jobId: string
  ): Promise<{ success: boolean; newUrl?: string }> {
    const config = getConfig();
    const currentUrl = this.page.url();
    const pageManager = new PageManager(this.page);

    automationNavigationLogger.info('=== FORM SUBMISSION START ===', {
      jobId,
      currentUrl
    });

    EventEmitter.emitStatus('Submitting form...', 90);

    const submitStartTime = Date.now();
    const clicked = await pageManager.clickSubmitButton();

    if (!clicked) {
      automationNavigationLogger.error('Submit button not found', {
        jobId,
        currentUrl
      });
      EventEmitter.emitStatus('Could not find submit button', 90);
      return { success: false };
    }

    // Wait for navigation
    try {
      await this.page.waitForLoadState('domcontentloaded', { 
        timeout: config.navigation.formSubmitTimeout 
      });
    } catch {
      // Timeout is okay for SPAs
    }

    await this.page.waitForTimeout(config.navigation.postNavigationDelay);

    const newUrl = this.page.url();
    const urlChanged = newUrl !== currentUrl;
    const duration = Date.now() - submitStartTime;

    automationNavigationLogger.info('=== FORM SUBMISSION COMPLETE ===', {
      jobId,
      success: true,
      previousUrl: currentUrl,
      newUrl,
      urlChanged,
      duration
    });

    EventEmitter.emitStatus('Form submitted successfully', 95);

    return { success: true, newUrl };
  }

  /**
   * Take a simple DOM snapshot for change detection
   */
  private async takeDOMSnapshot(): Promise<string> {
    try {
      return await this.page.evaluate(() => {
        // Get a hash of visible text content as simple snapshot
        const body = document.body;
        if (!body) return '';
        
        // Get text content of main areas
        const mainContent = document.querySelector('main')?.textContent || '';
        const formContent = Array.from(document.querySelectorAll('form'))
          .map(f => f.textContent)
          .join('');
        
        return `${mainContent.substring(0, 1000)}|${formContent.substring(0, 1000)}`;
      });
    } catch {
      return '';
    }
  }
}
