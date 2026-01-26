/**
 * Form Filling Coordinator
 * 
 * Handles sequential field filling (no parallel execution).
 * Uses FieldMapper for transforming AI fields to AutomatedField format.
 */

import { Page } from 'playwright-core';
import { BehaviorField } from '../../../shared/types';
import { CanonicalField } from '../../../shared/types/automation.types';
import { BehaviorFillerFactory } from '../../automation/fillers/behavior-filler-factory';
import { CanonicalFieldsMap } from '../../automation/utils/canonical-fields-map';
import { FieldMapper } from '../../automation/mapping/field-mapper';
import { fieldFillLogger, automationBatchLogger } from '../../core/logger';
import { getConfig } from './automation.config';

export interface FillResult {
  fieldName: string;
  intent?: string;
  behavior?: string;
  selector?: string;
  confidence?: string;
  required?: boolean;
  success: boolean;
  error?: string;
  duration: number;
}

export class FormFillingCoordinator {
  constructor(
    private page: Page,
    private canonicalFieldsMap: CanonicalFieldsMap
  ) {}

  /**
   * Fill fields sequentially (one at a time, in order)
   * This replaces the parallel ConcurrencyPool.runBatched() approach.
   */
  async fillFieldsSequentially(
    behaviorFields: BehaviorField[],
    documentLookup?: Map<string, string>
  ): Promise<FillResult[]> {
    const config = getConfig();
    const results: FillResult[] = [];
    const batchStartTime = Date.now();

    automationBatchLogger.info('Starting sequential field fill', {
      url: this.page.url(),
      totalFields: behaviorFields.length,
      mode: 'sequential'
    });

    // Use FieldMapper to transform AI fields to AutomatedField format
    const automatedFields = FieldMapper.mapFields(
      behaviorFields,
      this.canonicalFieldsMap,
      documentLookup
    );

    for (let i = 0; i < automatedFields.length; i++) {
      const automatedField = automatedFields[i];
      const behaviorField = behaviorFields[i];
      const fieldStartTime = Date.now();

      // Lookup canonical field for semantic discovery
      let canonicalField: CanonicalField | undefined;
      if (automatedField.fieldId) {
        canonicalField = this.canonicalFieldsMap.getByFieldId(automatedField.fieldId);
      } else if (automatedField.fieldName) {
        const matches = this.canonicalFieldsMap.getByAccessibleName(automatedField.fieldName);
        if (matches.length > 0) {
          canonicalField = matches[0];
        }
      }

      const filler = BehaviorFillerFactory.getFiller(
        behaviorField.behavior,
        this.page,
        behaviorField.fieldName
      );
      const fillerName = BehaviorFillerFactory.getFillerName(behaviorField.behavior);

      // Set canonical field for semantic discovery
      if (canonicalField) {
        filler.setCanonicalField(canonicalField);
      }

      fieldFillLogger.info('Starting field fill (sequential)', {
        fieldIndex: i + 1,
        totalFields: automatedFields.length,
        fieldName: behaviorField.fieldName,
        intent: behaviorField.intent,
        behavior: behaviorField.behavior,
        filler: fillerName,
        confidence: behaviorField.confidence,
        required: behaviorField.constraints?.required || false,
      });

      try {
        const success = await filler.fill(automatedField);
        const duration = Date.now() - fieldStartTime;

        fieldFillLogger.info('Field fill completed', {
          fieldName: behaviorField.fieldName,
          success,
          duration,
          required: behaviorField.constraints?.required || false,
        });

        results.push({
          fieldName: behaviorField.fieldName,
          intent: behaviorField.intent,
          behavior: behaviorField.behavior,
          selector: behaviorField.selector,
          confidence: behaviorField.confidence,
          required: behaviorField.constraints?.required || false,
          success,
          duration,
        });

        // Delay between fields for form stability (configurable)
        if (i < automatedFields.length - 1) {
          await this.page.waitForTimeout(config.filling.betweenFieldsDelay);
        }

      } catch (error) {
        const duration = Date.now() - fieldStartTime;

        fieldFillLogger.error('Field fill threw error', {
          fieldName: behaviorField.fieldName,
          error: error instanceof Error ? error.message : String(error),
          duration,
          required: behaviorField.constraints?.required || false,
        });

        results.push({
          fieldName: behaviorField.fieldName,
          intent: behaviorField.intent,
          behavior: behaviorField.behavior,
          selector: behaviorField.selector,
          confidence: behaviorField.confidence,
          required: behaviorField.constraints?.required || false,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
      }
    }

    const batchDuration = Date.now() - batchStartTime;

    automationBatchLogger.info('Sequential batch completed', {
      totalFields: behaviorFields.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration: batchDuration,
      avgTimePerField: Math.round(batchDuration / behaviorFields.length),
    });

    return results;
  }

  /**
   * Filter fields by confidence level
   */
  static filterByConfidence(
    fields: BehaviorField[],
    isAutoMode: boolean
  ): {
    eligible: BehaviorField[];
    highConfidence: BehaviorField[];
    mediumConfidence: BehaviorField[];
    lowConfidence: BehaviorField[];
    missingData: BehaviorField[];
  } {
    const highConfidence = fields.filter(f => f.confidence === 'high');
    const mediumConfidence = fields.filter(f => f.confidence === 'medium');
    const lowConfidence = fields.filter(f => f.confidence === 'low');
    const missingData = fields.filter(f => f.status === 'missing_data' || f.expectedValue === '__MISSING__');

    // Eligible fields for filling:
    // - Always include high confidence with values
    // - Include medium confidence in auto mode only
    // - Exclude low confidence and missing data
    const eligible = [
      ...highConfidence.filter(f => f.expectedValue !== '__MISSING__'),
      ...(isAutoMode ? mediumConfidence.filter(f => f.expectedValue !== '__MISSING__') : [])
    ];

    return {
      eligible,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      missingData
    };
  }

  /**
   * Get required field failures from results
   */
  static getRequiredFieldFailures(results: FillResult[]): FillResult[] {
    return results.filter(r => r.required && !r.success);
  }
}
