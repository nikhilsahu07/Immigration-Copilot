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

/**
 * BehaviorFillerFactory
 * Maps FieldBehavior (what field does) → Filler (how to fill it)
 * 
 * This is the key bridge between AI intent and execution strategy.
 */
export class BehaviorFillerFactory {
  /**
   * Get appropriate filler for a given field behavior
   */
  static getFiller(behavior: FieldBehavior, page: Page): BaseFiller {
    switch (behavior) {
      // Text Entry Behaviors
      case FieldBehavior.TEXT_ENTRY:
      case FieldBehavior.MULTILINE_TEXT:
        return new TextFiller(page);
        
      case FieldBehavior.MASKED_INPUT:
        return new MaskedTextFiller(page);
        
      // Choice Selection Behaviors
      case FieldBehavior.SINGLE_CHOICE_DROPDOWN:
        return new SelectFiller(page);

      case FieldBehavior.SINGLE_CHOICE_RADIO:
        return new RadioFiller(page);

      case FieldBehavior.SINGLE_CHOICE:
        // Generic single choice: prefer dropdown semantics by default
        return new SelectFiller(page);
        
      case FieldBehavior.SEARCH_AND_SELECT:
        return new SearchSelectFiller(page);  // Keyboard-first strategy
        
      case FieldBehavior.MULTI_CHOICE:
        return new CheckboxFiller(page);  // Works for checkbox groups
        
      // Boolean Behaviors
      case FieldBehavior.BOOLEAN_CHECKBOX:
        return new CheckboxFiller(page);
        
      case FieldBehavior.BOOLEAN_TOGGLE:
        return new ToggleFiller(page);
        
      // Date/Time Behaviors  
      case FieldBehavior.DATE_PICKER:
      case FieldBehavior.DATE_TEXT:
        return new DateFiller(page);
        
      case FieldBehavior.TIME_PICKER:
        return new TextFiller(page);  // Treat as text for now
        
      // Numeric Behaviors
      case FieldBehavior.NUMERIC_INPUT:
        return new TextFiller(page);  // Numbers are text inputs
        
      case FieldBehavior.RANGE_SLIDER:
        return new RangeSliderFiller(page);
        
      // File Behaviors
      case FieldBehavior.FILE_UPLOAD:
      case FieldBehavior.MULTI_FILE_UPLOAD:
        return new FileUploadFiller(page);
        
      // Special Behaviors
      case FieldBehavior.OTP_GROUP:
        return new OtpFiller(page);
        
      case FieldBehavior.CONSENT_CHECKBOX:
        return new ConsentFiller(page);
        
      // Unknown/Fallback
      case FieldBehavior.UNKNOWN:
      default:
        // Safe fallback - most fields can be treated as text
        return new TextFiller(page);
    }
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
