import { Page } from 'playwright-core';
import { FieldBehavior } from '../../../shared/types/field-behavior.types';
import { BaseFiller } from './base-filler';
import { TextFiller } from './text-filler';
import { SelectFiller } from './select-filler';
import { RadioFiller } from './radio-filler';
import { CheckboxFiller } from './checkbox-filler';
import { DateFiller } from './date-filler';
import { FileUploadFiller } from './file-upload-filler';
import { ToggleFiller } from './toggle-filler';
import { RangeSliderFiller } from './range-slider-filler';
import { ConsentFiller } from './consent-filler';
import { OtpFiller } from './otp-filler';
import { SearchSelectFiller } from './search-select-filler';
import { MaskedTextFiller } from './masked-text-filler';
import { automationMappingLogger } from '../../core/logger';

/**
 * BehaviorFillerFactory
 * Maps FieldBehavior (what field does) → Filler (how to fill it)
 *
 * This is the key bridge between AI intent and execution strategy.
 */
export class BehaviorFillerFactory {
  /**
   * Get appropriate filler for a given field behavior
   * @param options Optional options passed to filler (e.g. fieldActionTimeout for fail-fast)
   */
  static getFiller(
    behavior: FieldBehavior,
    page: Page,
    fieldName?: string,
    options?: Record<string, unknown>,
  ): BaseFiller {
    const opts = options ?? {};
    let filler: BaseFiller;
    let fillerName: string;
    let mappingReason: string;

    switch (behavior) {
      // Text Entry Behaviors
      case FieldBehavior.TEXT_ENTRY:
      case FieldBehavior.MULTILINE_TEXT:
        filler = new TextFiller(page, opts);
        fillerName = 'TextFiller';
        mappingReason =
          behavior === FieldBehavior.TEXT_ENTRY
            ? 'TEXT_ENTRY → TextFiller (standard text input)'
            : 'MULTILINE_TEXT → TextFiller (textarea)';
        break;

      case FieldBehavior.MASKED_INPUT:
        filler = new MaskedTextFiller(page, opts);
        fillerName = 'MaskedTextFiller';
        mappingReason =
          'MASKED_INPUT → MaskedTextFiller (formatted input like phone/SSN)';
        break;

      // Choice Selection Behaviors
      case FieldBehavior.SINGLE_CHOICE_DROPDOWN:
        filler = new SelectFiller(page, opts);
        fillerName = 'SelectFiller';
        mappingReason =
          'SINGLE_CHOICE_DROPDOWN → SelectFiller (dropdown select)';
        break;

      case FieldBehavior.SINGLE_CHOICE_RADIO:
        filler = new RadioFiller(page, opts);
        fillerName = 'RadioFiller';
        mappingReason =
          'SINGLE_CHOICE_RADIO → RadioFiller (radio button group)';
        break;

      case FieldBehavior.SINGLE_CHOICE:
        // Generic single choice: prefer dropdown semantics by default
        filler = new SelectFiller(page, opts);
        fillerName = 'SelectFiller';
        mappingReason =
          'SINGLE_CHOICE → SelectFiller (generic single choice, defaulting to dropdown)';
        break;

      case FieldBehavior.SEARCH_AND_SELECT:
        filler = new SearchSelectFiller(page, opts); // Keyboard-first strategy
        fillerName = 'SearchSelectFiller';
        mappingReason =
          'SEARCH_AND_SELECT → SearchSelectFiller (searchable dropdown with keyboard-first strategy)';
        break;

      case FieldBehavior.MULTI_CHOICE:
        filler = new CheckboxFiller(page, opts); // Works for checkbox groups
        fillerName = 'CheckboxFiller';
        mappingReason =
          'MULTI_CHOICE → CheckboxFiller (multiple selection checkbox group)';
        break;

      // Boolean Behaviors
      case FieldBehavior.BOOLEAN_CHECKBOX:
        filler = new CheckboxFiller(page, opts);
        fillerName = 'CheckboxFiller';
        mappingReason =
          'BOOLEAN_CHECKBOX → CheckboxFiller (single checkbox boolean)';
        break;

      case FieldBehavior.BOOLEAN_TOGGLE:
        filler = new ToggleFiller(page, opts);
        fillerName = 'ToggleFiller';
        mappingReason = 'BOOLEAN_TOGGLE → ToggleFiller (toggle switch)';
        break;

      // Date/Time Behaviors
      case FieldBehavior.DATE_PICKER:
      case FieldBehavior.DATE_TEXT:
        filler = new DateFiller(page, opts);
        fillerName = 'DateFiller';
        mappingReason =
          behavior === FieldBehavior.DATE_PICKER
            ? 'DATE_PICKER → DateFiller (date picker widget)'
            : 'DATE_TEXT → DateFiller (text input with date format)';
        break;

      case FieldBehavior.TIME_PICKER:
        filler = new TextFiller(page, opts); // Treat as text for now
        fillerName = 'TextFiller';
        mappingReason =
          'TIME_PICKER → TextFiller (treating as text input for now)';
        break;

      // Numeric Behaviors
      case FieldBehavior.NUMERIC_INPUT:
        filler = new TextFiller(page, opts); // Numbers are text inputs
        fillerName = 'TextFiller';
        mappingReason = 'NUMERIC_INPUT → TextFiller (numeric text input)';
        break;

      case FieldBehavior.RANGE_SLIDER:
        filler = new RangeSliderFiller(page, opts);
        fillerName = 'RangeSliderFiller';
        mappingReason = 'RANGE_SLIDER → RangeSliderFiller (slider input)';
        break;

      // File Behaviors
      case FieldBehavior.FILE_UPLOAD:
      case FieldBehavior.MULTI_FILE_UPLOAD:
        filler = new FileUploadFiller(page, opts);
        fillerName = 'FileUploadFiller';
        mappingReason =
          behavior === FieldBehavior.FILE_UPLOAD
            ? 'FILE_UPLOAD → FileUploadFiller (single file upload)'
            : 'MULTI_FILE_UPLOAD → FileUploadFiller (multiple file upload)';
        break;

      // Special Behaviors
      case FieldBehavior.OTP_GROUP:
        filler = new OtpFiller(page, opts);
        fillerName = 'OtpFiller';
        mappingReason = 'OTP_GROUP → OtpFiller (OTP input group)';
        break;

      case FieldBehavior.CONSENT_CHECKBOX:
        filler = new ConsentFiller(page, opts);
        fillerName = 'ConsentFiller';
        mappingReason =
          'CONSENT_CHECKBOX → ConsentFiller (consent/agreement checkbox)';
        break;

      // Unknown/Fallback
      case FieldBehavior.UNKNOWN:
      default:
        // Safe fallback - most fields can be treated as text
        filler = new TextFiller(page, opts);
        fillerName = 'TextFiller';
        mappingReason =
          behavior === FieldBehavior.UNKNOWN
            ? 'UNKNOWN → TextFiller (fallback for unknown behavior)'
            : `Unknown behavior "${behavior}" → TextFiller (default fallback)`;
        break;
    }

    // Log the mapping decision
    automationMappingLogger.info('Field behavior mapped to filler', {
      fieldName: fieldName || 'unknown',
      behavior,
      fillerName,
      mappingReason,
      timestamp: new Date().toISOString(),
    });

    return filler;
  }

  /**
   * Get filler name for logging
   */
  static getFillerName(behavior: FieldBehavior): string {
    const fillerMap: Record<FieldBehavior, string> = {
      [FieldBehavior.TEXT_ENTRY]: 'TextFiller',
      [FieldBehavior.MULTILINE_TEXT]: 'TextFiller',
      [FieldBehavior.MASKED_INPUT]: 'MaskedTextFiller',
      [FieldBehavior.SINGLE_CHOICE]: 'SelectFiller',
      [FieldBehavior.SINGLE_CHOICE_DROPDOWN]: 'SelectFiller',
      [FieldBehavior.SINGLE_CHOICE_RADIO]: 'RadioFiller',
      [FieldBehavior.SEARCH_AND_SELECT]: 'SearchSelectFiller',
      [FieldBehavior.MULTI_CHOICE]: 'CheckboxFiller',
      [FieldBehavior.BOOLEAN_CHECKBOX]: 'CheckboxFiller',
      [FieldBehavior.BOOLEAN_TOGGLE]: 'ToggleFiller',
      [FieldBehavior.DATE_PICKER]: 'DateFiller',
      [FieldBehavior.DATE_TEXT]: 'DateFiller',
      [FieldBehavior.TIME_PICKER]: 'TextFiller',
      [FieldBehavior.NUMERIC_INPUT]: 'TextFiller',
      [FieldBehavior.RANGE_SLIDER]: 'RangeSliderFiller',
      [FieldBehavior.FILE_UPLOAD]: 'FileUploadFiller',
      [FieldBehavior.MULTI_FILE_UPLOAD]: 'FileUploadFiller',
      [FieldBehavior.OTP_GROUP]: 'OtpFiller',
      [FieldBehavior.CONSENT_CHECKBOX]: 'ConsentFiller',
      [FieldBehavior.UNKNOWN]: 'TextFiller (fallback)',
    };

    return fillerMap[behavior] || 'TextFiller (default)';
  }
}
