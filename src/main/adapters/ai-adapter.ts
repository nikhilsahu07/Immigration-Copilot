import { 
  IPortalAdapter, 
  AdapterContext, 
  AdapterResult 
} from './types';
import { AdapterLogHelper, adapterLogger } from './adapter-logger';
import { aiService } from '../services/ai.service';
import { PageManager } from '../automation/page-manager';
import type { AutomatedField } from '../automation/fillers/base-filler';
import { adapterFailureRepository } from '../database/repositories';

/**
 * AI-powered fallback adapter.
 * Uses Gemini to analyze pages and determine what to fill.
 * This is used when no custom adapter is available or when custom adapters fail.
 */
export class AIAdapter implements IPortalAdapter {
  readonly slug = 'ai-fallback';
  readonly name = 'AI-Powered Automation';
  readonly version = '1.0.0';

  private logger: AdapterLogHelper;
  private companyId?: string;
  private agentId?: string;
  private jobId?: string;
  private portalId?: string;
  private clientId?: string;

  constructor() {
    this.logger = new AdapterLogHelper(this.slug);
  }

  /**
   * Set context for failure logging.
   */
  setContext(opts: {
    companyId?: string;
    agentId?: string;
    jobId?: string;
    portalId?: string;
    clientId?: string;
  }): void {
    this.companyId = opts.companyId;
    this.agentId = opts.agentId;
    this.jobId = opts.jobId;
    this.portalId = opts.portalId;
    this.clientId = opts.clientId;
    this.logger = new AdapterLogHelper(this.slug, opts.jobId, opts.portalId);
  }

  /**
   * AI adapter can always handle any page (it's the fallback).
   */
  async canHandle(_url: string, _html?: string): Promise<boolean> {
    return true;
  }

  /**
   * Execute AI-powered automation.
   * Extracts HTML, sends to Gemini, fills forms based on response.
   */
  async execute(context: AdapterContext): Promise<AdapterResult> {
    const { page, extractedData, documents, customPrompt, executionMode, onApprovalRequired } = context;
    const actionsPerformed: string[] = [];
    let fieldsFilledCount = 0;

    try {
      this.logger.info('Starting AI-powered automation');

      // Create PageManager for form filling
      const pageManager = new PageManager(page);

      // Extract and clean HTML
      const html = await pageManager.extractHtml();
      this.logger.info('HTML extracted', { length: html.length });

      // Build document list for AI
      const documentList = documents.map(d => ({
        name: d.name,
        category: d.category,
      }));

      // Call AI service to analyze page
      this.logger.info('Calling AI service for page analysis');
      const aiResult = await aiService.analyzePageAndMapFields(
        html,
        extractedData,
        documentList,
        customPrompt
      );

      this.logger.info('AI analysis complete', {
        pageType: aiResult.pageType,
        fieldsCount: aiResult.fields?.length ?? 0,
        actionsCount: aiResult.actions?.length ?? 0,
        captchaDetected: aiResult.captcha?.detected,
        otpDetected: aiResult.otp?.detected,
      });

      // Handle based on page type
      if (aiResult.pageType === 'dashboard') {
        // Dashboard page - execute navigation actions
        if (aiResult.actions && aiResult.actions.length > 0) {
          // In manual mode, wait for approval before navigation
          if (executionMode === 'manual') {
            this.logger.info('Waiting for approval before navigation');
            await onApprovalRequired();
          }

          const success = await pageManager.executeActions(aiResult.actions);
          if (success) {
            actionsPerformed.push(`Executed ${aiResult.actions.length} navigation actions`);
          } else {
            return this.handleFailure('navigation', 'Failed to execute navigation actions', {
              pageUrl: page.url(),
              pageHtml: html,
              aiResponse: JSON.stringify(aiResult),
            });
          }
        }

        return {
          success: true,
          pageType: 'dashboard',
          fieldsFilledCount: 0,
          actionsPerformed,
        };
      }

      // Form page - fill fields
      if (aiResult.fields && aiResult.fields.length > 0) {
        // Convert to AutomatedField format
        const automatedFields: AutomatedField[] = aiResult.fields.map((f, i) => ({
          fieldIndex: i,
          selector: f.selector,
          value: f.value,
          fieldType: f.fieldType || 'text',
          fieldName: f.fieldName,
          fieldLabel: f.fieldName,
        }));

        // In manual mode, wait for approval before filling
        if (executionMode === 'manual') {
          this.logger.info('Waiting for approval before form filling');
          await onApprovalRequired();
        }

        try {
          await pageManager.fillForm(automatedFields);
          fieldsFilledCount = automatedFields.length;
          actionsPerformed.push(`Filled ${fieldsFilledCount} fields`);
        } catch (error) {
          this.logger.error('Form filling failed', error);
          return this.handleFailure('form_fill', 'Failed to fill form fields', {
            pageUrl: page.url(),
            pageHtml: html,
            aiResponse: JSON.stringify(aiResult),
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Check for CAPTCHA/OTP
      if (aiResult.captcha?.detected || aiResult.otp?.detected) {
        return {
          success: true,
          pageType: 'form',
          fieldsFilledCount,
          actionsPerformed,
          requiresCaptcha: aiResult.captcha?.detected,
          requiresOtp: aiResult.otp?.detected,
        };
      }

      return {
        success: true,
        pageType: aiResult.pageType || 'form',
        fieldsFilledCount,
        actionsPerformed,
      };

    } catch (error) {
      this.logger.error('AI automation failed', error);
      return this.handleFailure('unknown', error instanceof Error ? error.message : 'Unknown error', {
        pageUrl: page.url(),
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Handle and log an automation failure.
   */
  private async handleFailure(
    type: 'navigation' | 'form_fill' | 'selector' | 'unknown',
    message: string,
    meta: {
      pageUrl: string;
      pageHtml?: string;
      failedSelector?: string;
      aiResponse?: string;
      errorMessage?: string;
      errorStack?: string;
    }
  ): Promise<AdapterResult> {
    // Log to file
    this.logger.logAIFailure(message, meta);

    // Log to database if context is available
    if (this.companyId && this.agentId && this.jobId && this.portalId && this.clientId) {
      try {
        await adapterFailureRepository.logAIFailure(
          this.companyId,
          this.agentId,
          {
            jobId: this.jobId,
            portalId: this.portalId,
            clientId: this.clientId,
            failureType: type,
            pageUrl: meta.pageUrl,
            pageHtml: meta.pageHtml,
            failedSelector: meta.failedSelector,
            aiResponse: meta.aiResponse,
            errorMessage: meta.errorMessage ?? message,
            errorStack: meta.errorStack,
          }
        );
      } catch (dbError) {
        adapterLogger.error('Failed to log AI failure to database', { error: String(dbError) });
      }
    }

    return {
      success: false,
      pageType: 'unknown',
      fieldsFilledCount: 0,
      actionsPerformed: [],
      error: {
        code: type,
        message,
        selector: meta.failedSelector,
        stack: meta.errorStack,
      },
      // AI adapter failures don't trigger another fallback (it IS the fallback)
      shouldFallbackToAI: false,
    };
  }
}

// Export singleton instance
export const aiAdapter = new AIAdapter();
