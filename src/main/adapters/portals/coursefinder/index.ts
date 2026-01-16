import { BaseAdapter } from '../../base-adapter';
import { AdapterContext, AdapterResult } from '../../types';
import { CourseFinderSchema } from './portalSchema';
import { aiService } from '../../../services/ai.service';

export class CourseFinderAdapter extends BaseAdapter {
  readonly slug = 'coursefinder-portal';
  readonly name = 'Course Finder AI';
  readonly version = '2.0.0';

  async canHandle(url: string): Promise<boolean> {
    return url.includes('coursefinder.ai') || url.includes('coursefinder.studies-overseas.com');
  }

  async execute(context: AdapterContext): Promise<AdapterResult> {
    const { page, customPrompt, extractedData } = context;
    this.initializeLogger();
    this.logger.info(`Starting Course Finder Automation. Intent: ${customPrompt}`);

    let isComplete = false;
    let stepCount = 0;
    const MAX_STEPS = 20;

    try {
      while (!isComplete && stepCount < MAX_STEPS) {
        stepCount++;
        
        // Identify current page state
        let currentStateKey = null;
        let currentSchema = null;

        for (const [key, def] of Object.entries(CourseFinderSchema.pages)) {
          if (def.identifyBy.urlContains && !page.url().includes(def.identifyBy.urlContains)) {
            continue;
          }
          if (await page.locator(def.identifyBy.selector).isVisible()) {
            currentStateKey = key;
            currentSchema = def;
            break;
          }
        }

        if (!currentStateKey || !currentSchema) {
          this.logger.warn('Unknown page state. Falling back to AI.');
          return { success: false, shouldFallbackToAI: true, error: 'Unknown State' };
        }

        this.logger.info(`Current State: [${currentSchema.name}]`);

        // Get AI execution plan
        const plan = await aiService.generateExecutionPlan({
          schema: currentSchema,
          extractedData: extractedData,
          userIntent: customPrompt || 'Register and complete profile'
        });

        this.logger.info(`AI Plan: Fill ${plan.fill?.length || 0} fields, Action: ${plan.actionId || 'None'}`);

        // Fill form fields
        if (plan.fill && plan.fill.length > 0) {
          for (const item of plan.fill) {
            const fieldDef = currentSchema.fields.find(f => f.id === item.fieldId);
            
            if (!fieldDef) {
              this.logger.warn(`Unknown field: ${item.fieldId}`);
              continue;
            }

            if (fieldDef.type === 'file') {
               if (item.value) {
                 await this.safeFileUpload(page, fieldDef.selector, item.value);
               }
            } else if (fieldDef.type === 'select') {
               await page.selectOption(fieldDef.selector, { label: item.value })
                 .catch(() => page.selectOption(fieldDef.selector, { value: item.value }));
            } else {
               await this.safeFill(page, fieldDef.selector, item.value);
            }
          }
        }

        // Execute action
        if (plan.actionId) {
          const actionDef = currentSchema.actions.find(a => a.id === plan.actionId);
          if (actionDef) {
            this.logger.info(`Executing: ${actionDef.description}`);
            await Promise.all([
              this.safeClick(page, actionDef.selector),
              page.waitForLoadState('networkidle').catch(() => {})
            ]);
          }
        } else {
          this.logger.info('No further actions planned.');
          isComplete = true; 
        }

        await page.waitForTimeout(1000);
      }

      return { success: true, fieldsFilled: stepCount };

    } catch (error: any) {
      this.logger.error('Automation Failed', error);
      return { 
        success: false, 
        shouldFallbackToAI: true,
        error: error.message 
      };
    }
  }
}