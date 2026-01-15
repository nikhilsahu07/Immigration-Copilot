import { DecisionResult } from '../../../shared/types';

export interface AIAnalysisResult {
  fields: {
    selector: string;
    value: string;
    reason: string;
    fieldName: string;
    fieldType?: string;
  }[];
  actions: {
    type: 'click' | 'wait' | 'submit';
    selector?: string;
    description: string;
    expectedText?: string;
  }[];
  captcha: {
    detected: boolean;
    isInsideForm: boolean;
  };
  otp: {
    detected: boolean;
    selector?: string;
  };
  pageType: 'dashboard' | 'form' | 'confirmation' | 'unknown';
  isFormPage: boolean;
  pageSummary: string;
}

export interface AIProvider {
  analyzePageAndMapFields(
    html: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractedData: any,
    documentList: { name: string; category: string }[],
    customPrompt?: string
  ): Promise<AIAnalysisResult>;

  makeExplorationDecision(
    html: string,
    extractedData: Record<string, unknown>,
    filledFieldSelectors: string[],
    visitedElements: string[],
    documentList: { name: string; category: string }[]
  ): Promise<DecisionResult>;
}
