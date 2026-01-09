
import { Page, ElementHandle } from 'playwright-core';
import { logger } from '../../core/logger';

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
  constructor(protected page: Page) {}

  abstract fill(field: AutomatedField): Promise<boolean>;

  protected async scrollToElement(selector: string) {
    try {
      const element = await this.page.$(selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
      }
    } catch (error) {
       // Ignore scroll errors
    }
  }

  protected async findElement(selector: string): Promise<ElementHandle | null> {
    try {
      return await this.page.$(selector);
    } catch (e) {
      return null;
    }
  }
}
