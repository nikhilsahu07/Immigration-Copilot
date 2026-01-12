
import { Page } from 'playwright-core';
// import { logger } from '../../core/logger'; // Unused

export interface AutomatedField {
    fieldIndex: number;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    selector: string;
    value: any;
    confidence?: string;
    reasoning?: string;
}

export abstract class BaseFiller {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(protected page: Page, protected options: any = {}) {}

  abstract fill(field: AutomatedField): Promise<boolean>;

  protected async scrollToElement(selector: string) {
    try {
      const element = await this.page.$(selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
      }
    } catch {
       // Ignore scroll errors
    }
  }

  protected async findElement(selector: string) {
    try {
      return await this.page.$(selector);
    } catch {
      return null;
    }
  }
}
