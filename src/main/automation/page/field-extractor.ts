
import { Page } from 'playwright-core';
import { HtmlField, CanonicalField, ControlType } from '../../../shared/types/automation.types';
import { logger, automationPageLogger } from '../../core/logger';
import {
  computeAccessibleName,
  detectControlType,
  detectRole,
  computeInteractionHints,
  generateFieldId,
} from '../utils';

export interface FieldExtractionOptions {
  includeHidden?: boolean;
  includeDisabled?: boolean;
  maxFields?: number;
}

interface RawFieldCandidate {
  domIndex: number;
  tagName: string;
  type: string;
  id: string | null;
  name: string | null;
  placeholder: string | null;
  className: string | null;
  required: boolean;
  value: string | null;
  min: string | null;
  max: string | null;
  pattern: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  role: string | null;
  // Label relationships captured browser-side
  labelFor?: string | null;
  closestLabelText?: string | null;
  // Enhanced fields for canonical extraction
  readonly?: boolean;
  checked?: boolean;
  disabled?: boolean;
  visible?: boolean;
  minLength?: string | null;
  maxLength?: string | null;
  sectionHeading?: string | null;
  formIndex?: number;
  positionInForm?: number;
}

export class FieldExtractor {
  constructor(private page: Page) {}

  /**
   * Extract all form fields from the page
   * Browser-side: raw DOM extraction (serializable only)
   * Node-side: normalization, dedup, selector synthesis, label inference
   */
  async extractFields(options: FieldExtractionOptions = {}): Promise<HtmlField[]> {
    try {
      automationPageLogger.info(`Starting field extraction (includeHidden: ${options.includeHidden}, includeDisabled: ${options.includeDisabled})`);

      // 1) Browser-side: extract RAW candidates (no `this`, no Node funcs)
      const raw = await this.page.evaluate((opts) => {
        // Safety check - ensure document.body exists (page is loaded)
        // This prevents errors during navigation when DOM isn't ready
        if (!document.body) {
          console.warn('[FieldExtractor] document.body is null - page not ready for extraction');
          return [];
        }
        
        // Always use the full document body as root so we see
        // BOTH page-level CTAs (dashboard actions) and modal/form fields.
        const root = document.body as Element;

        // Get all candidate interactive elements: form fields + primary CTA buttons/links
        const candidates = Array.from(
          root.querySelectorAll(
            'input, textarea, select, button, a.btn, a.button, a[role="button"], a[class*="btn"], [role="radio"], [role="checkbox"]'
          )
        ) as HTMLElement[];

        // Visibility check (browser-side only)
        const visible = (el: Element) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        // Filter by visibility and disabled state
        const filtered = candidates.filter((el) => {
          if (!opts.includeHidden && !visible(el)) return false;
          if (!opts.includeDisabled && el.hasAttribute('disabled')) return false;
          return true;
        });

        // Helper function to get label text (browser-side)
        const getLabelTextBrowser = (element: HTMLElement): string | null => {
          // Strategy 1: label[for="id"]
          if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label) {
              const text = label.textContent?.trim();
              if (text) return text;
            }
          }

          // Strategy 2: Parent label element
          const parentLabel = element.closest('label');
          if (parentLabel) {
            const text = parentLabel.textContent?.trim();
            if (text) return text;
          }

          // Strategy 3: Previous sibling label
          let sibling = element.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === 'LABEL') {
              const text = sibling.textContent?.trim();
              if (text) return text;
            }
            sibling = sibling.previousElementSibling;
          }

          // Strategy 4: Next sibling label
          const nextSibling = element.nextElementSibling;
          if (nextSibling && nextSibling.tagName === 'LABEL') {
            const text = nextSibling.textContent?.trim();
            if (text && text.length < 50) return text;
          }

          // Strategy 5: Closest ancestor "form-group" label (handles label + div + select)
          let ancestor: Element | null = element.parentElement;
          let depth = 0;
          const MAX_DEPTH = 5;
          while (ancestor && depth < MAX_DEPTH) {
            // Common container classes for grouped fields
            const ancestorClass = (ancestor as HTMLElement).className || '';
            const isFormGroup =
              typeof ancestorClass === 'string' &&
              /form-group|form-group|form-field|field|form-row/i.test(ancestorClass);

            if (isFormGroup) {
              const labelInGroup = ancestor.querySelector('label');
              if (labelInGroup) {
                const text = labelInGroup.textContent?.trim();
                if (text && text.length < 200) return text;
              }
            }
            ancestor = ancestor.parentElement;
            depth++;
          }

          // Strategy 6: Closest element with "label" in class
          let current: Element | null = element.parentElement;
          while (current) {
            const className = (current as HTMLElement).className || '';
            if (typeof className === 'string' && className.toLowerCase().includes('label')) {
              const text = current.textContent?.trim();
              if (text && text.length < 100) return text;
            }
            current = current.parentElement;
          }

          // Strategy 7: aria-labelledby
          const ariaLabelledBy = element.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const labelEl = document.getElementById(ariaLabelledBy);
            if (labelEl) {
              const text = labelEl.textContent?.trim();
              if (text) return text;
            }
          }

          // Strategy 8: fall back to element's own text (for CTA buttons/links)
          const selfText = element.textContent?.trim();
          if (selfText && selfText.length < 120) return selfText;

          return null;
        };

        // Return plain objects only (serializable)
        const rawFields: RawFieldCandidate[] = filtered.map((el, i) => {
          const tagName = el.tagName.toLowerCase();
          const input = el as any;
          const type = (input.type || el.getAttribute('type') || 'text').toLowerCase();
          const htmlEl = el as HTMLElement;

          // Capture label relationships browser-side
          const closestLabelText = getLabelTextBrowser(htmlEl);

          return {
            domIndex: i,
            tagName,
            type,
            id: htmlEl.id || null,
            name: input.name || null,
            placeholder: input.placeholder || null,
            className: htmlEl.className || null,
            required: !!input.required,
            value: input.value ?? null,
            min: input.min ?? null,
            max: input.max ?? null,
            pattern: input.pattern ?? null,
            ariaLabel: el.getAttribute('aria-label'),
            ariaLabelledBy: el.getAttribute('aria-labelledby'),
            role: el.getAttribute('role'),
            closestLabelText: closestLabelText || null,
          };
        });

        return opts.maxFields ? rawFields.slice(0, opts.maxFields) : rawFields;
      }, options);

      automationPageLogger.info(`Extracted ${raw.length} raw field candidates from browser`);

      // 2) Node-side: normalize into HtmlField[] (dedup + selector uniqueness + label inference)
      const fields = await this.normalizeRawFields(raw);
      
      logger.info(`Extracted ${fields.length} form fields (from ${raw.length} candidates)`);
      automationPageLogger.info(`Final normalized fields: ${fields.length}`);
      
      return fields;
    } catch (error) {
      logger.error('Field extraction failed:', error);
      automationPageLogger.error(`Field extraction error: ${error}`);
      throw error;
    }
  }

  /**
   * Extract canonical fields using semantic schema
   * Returns CanonicalField[] with accessibleName as primary identifier
   */
  async extractCanonicalFields(options: FieldExtractionOptions = {}): Promise<CanonicalField[]> {
    try {
      automationPageLogger.info(`Starting canonical field extraction (includeHidden: ${options.includeHidden}, includeDisabled: ${options.includeDisabled})`);

      // 1) Browser-side: extract enhanced RAW candidates with additional metadata
      const raw = await this.extractEnhancedRawCandidates(options);

      automationPageLogger.info(`Extracted ${raw.length} enhanced raw field candidates from browser`);

      // 2) Node-side: transform to CanonicalField[]
      const fields = await this.buildCanonicalFields(raw);
      
      logger.info(`Extracted ${fields.length} canonical fields (from ${raw.length} candidates)`);
      automationPageLogger.info(`Final canonical fields: ${fields.length}`);
      
      return fields;
    } catch (error) {
      logger.error('Canonical field extraction failed:', error);
      automationPageLogger.error(`Canonical field extraction error: ${error}`);
      throw error;
    }
  }

  /**
   * Extract enhanced raw candidates with additional metadata for canonical schema
   */
  private async extractEnhancedRawCandidates(options: FieldExtractionOptions): Promise<RawFieldCandidate[]> {
    return await this.page.evaluate((opts) => {
      if (!document.body) {
        console.warn('[FieldExtractor] document.body is null - page not ready for extraction');
        return [];
      }
      
      const root = document.body as Element;

      // Get all candidate interactive elements
      // Include: form inputs, buttons, and ONLY button-like links (CTAs), NOT every <a>.
      // This avoids treating dropdown menu items like individual countries (e.g. "Afghanistan")
      // as separate canonical fields; those should appear only as options on a single field.
      const candidates = Array.from(
        root.querySelectorAll(
          'input, textarea, select, button, a.btn, a.button, a[role="button"], a[class*="btn"], [role="radio"], [role="checkbox"], [role="button"]'
        )
      ) as HTMLElement[];

      // Visibility check
      const visible = (el: Element) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      // Filter by visibility and disabled state
      const filtered = candidates.filter((el) => {
        const tagName = el.tagName.toLowerCase();

        // Skip Bootstrap Select option <a> elements inside the dropdown menu.
        // These are visual option rows; the real form control is the underlying <select>.
        if (tagName === 'a' && el.closest('.bootstrap-select')) {
          return false;
        }

        // Treat hidden <select> inside .bootstrap-select as visible,
        // so we can extract canonical options from the original <select>.
        const isBootstrapSelect =
          tagName === 'select' && !!el.closest('.bootstrap-select');

        if (!opts.includeHidden && !visible(el) && !isBootstrapSelect) return false;
        if (!opts.includeDisabled && el.hasAttribute('disabled')) return false;
        return true;
      });

      // Helper to find nearest section heading (h1-h6)
      const findSectionHeading = (element: HTMLElement): string | null => {
        let current: Element | null = element;
        let depth = 0;
        const maxDepth = 10; // Prevent infinite loops
        
        while (current && depth < maxDepth) {
          // Check previous siblings for headings
          let sibling = current.previousElementSibling;
          while (sibling && depth < maxDepth) {
            const tagName = sibling.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
              const text = sibling.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) {
                return text;
              }
            }
            sibling = sibling.previousElementSibling;
            depth++;
          }
          
          // Check parent for headings
          current = current.parentElement;
          if (current) {
            const tagName = current.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
              const text = current.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) {
                return text;
              }
            }
          }
          depth++;
        }
        
        return null;
      };

      // Helper to find form index
      const findFormIndex = (element: HTMLElement): number => {
        const form = element.closest('form');
        if (!form) return 0;
        
        const forms = Array.from(document.querySelectorAll('form'));
        return forms.indexOf(form);
      };

      // Helper to find position in form
      const findPositionInForm = (element: HTMLElement, allElements: HTMLElement[]): number => {
        const form = element.closest('form');
        if (!form) return allElements.indexOf(element);
        
        const formFields = allElements.filter(el => form.contains(el));
        return formFields.indexOf(element);
      };

      // Helper to get label text (browser-side)
      const getLabelTextBrowser = (element: HTMLElement): string | null => {
        // Strategy 1: label[for="id"]
        if (element.id) {
          const label = document.querySelector(`label[for="${element.id}"]`);
          if (label) {
            const text = label.textContent?.trim();
            if (text) return text;
          }
        }

        // Strategy 2: Parent label element
        const parentLabel = element.closest('label');
        if (parentLabel) {
          const text = parentLabel.textContent?.trim();
          if (text) return text;
        }

        // Strategy 3: Previous sibling label
        let sibling = element.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === 'LABEL') {
            const text = sibling.textContent?.trim();
            if (text) return text;
          }
          sibling = sibling.previousElementSibling;
        }

        // Strategy 4: Next sibling label
        const nextSibling = element.nextElementSibling;
        if (nextSibling && nextSibling.tagName === 'LABEL') {
          const text = nextSibling.textContent?.trim();
          if (text && text.length < 50) return text;
        }

        // Strategy 5: Closest ancestor "form-group" label (handles label + div + select)
        let ancestor: Element | null = element.parentElement;
        let depth = 0;
        const MAX_DEPTH = 5;
        while (ancestor && depth < MAX_DEPTH) {
          const ancestorClass = (ancestor as HTMLElement).className || '';
          const isFormGroup =
            typeof ancestorClass === 'string' &&
            /form-group|form-field|field|form-row/i.test(ancestorClass);

          if (isFormGroup) {
            const labelInGroup = ancestor.querySelector('label');
            if (labelInGroup) {
              const text = labelInGroup.textContent?.trim();
              if (text && text.length < 200) return text;
            }
          }
          ancestor = ancestor.parentElement;
          depth++;
        }

        // Strategy 6: aria-labelledby
        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          if (labelEl) {
            const text = labelEl.textContent?.trim();
            if (text) return text;
          }
        }

        // Strategy 7: fall back to element's own text (for CTA buttons/links)
        const selfText = element.textContent?.trim();
        if (selfText && selfText.length < 120) return selfText;

        return null;
      };

      const rawFields: RawFieldCandidate[] = filtered.map((el, i) => {
        const tagName = el.tagName.toLowerCase();
        const input = el as any;
        const type = (input.type || el.getAttribute('type') || 'text').toLowerCase();
        const htmlEl = el as HTMLElement;

        const closestLabelText = getLabelTextBrowser(htmlEl);
        const sectionHeading = findSectionHeading(htmlEl);
        const formIndex = findFormIndex(htmlEl);
        const positionInForm = findPositionInForm(htmlEl, filtered);

        return {
          domIndex: i,
          tagName,
          type,
          id: htmlEl.id || null,
          name: input.name || null,
          placeholder: input.placeholder || null,
          className: htmlEl.className || null,
          required: !!input.required,
          value: input.value ?? null,
          min: input.min ?? null,
          max: input.max ?? null,
          pattern: input.pattern ?? null,
          ariaLabel: el.getAttribute('aria-label'),
          ariaLabelledBy: el.getAttribute('aria-labelledby'),
          role: el.getAttribute('role'),
          closestLabelText: closestLabelText || null,
          // Enhanced fields
          readonly: !!input.readOnly,
          checked: !!input.checked,
          disabled: !!input.disabled,
          visible: visible(el),
          minLength: input.minLength ? String(input.minLength) : null,
          maxLength: input.maxLength ? String(input.maxLength) : null,
          sectionHeading: sectionHeading || null,
          formIndex,
          positionInForm,
        };
      });

      return opts.maxFields ? rawFields.slice(0, opts.maxFields) : rawFields;
    }, options);
  }

  /**
   * Node-side normalization pipeline:
   * - infer labels (via lightweight re-queries)
   * - aggregate select/radio options
   * - deduplicate by semantic grouping (radio/otp/etc.)
   * - generate selectors and ensure uniqueness
   */
  private async normalizeRawFields(raw: RawFieldCandidate[]): Promise<HtmlField[]> {
    const fields: HtmlField[] = [];
    const seenKeys = new Set<string>();
    const radioGroups = new Map<string, RawFieldCandidate[]>();
    const otpGroups = new Map<string, RawFieldCandidate[]>();

    // First pass: group radios and detect OTP groups
    for (const candidate of raw) {
      if (candidate.type === 'radio' && candidate.name) {
        if (!radioGroups.has(candidate.name)) {
          radioGroups.set(candidate.name, []);
        }
        const radioGroup = radioGroups.get(candidate.name);
        if (radioGroup) {
          radioGroup.push(candidate);
        }
      } else if (this.isOtpCandidate(candidate)) {
        const containerKey = await this.getOtpContainerKey(candidate);
        if (!otpGroups.has(containerKey)) {
          otpGroups.set(containerKey, []);
        }
        const otpGroup = otpGroups.get(containerKey);
        if (otpGroup) {
          otpGroup.push(candidate);
        }
      }
    }

    // Second pass: build fields with deduplication
    for (let i = 0; i < raw.length; i++) {
      const candidate = raw[i];

      // Skip if already processed as part of a radio group
      if (candidate.type === 'radio' && candidate.name) {
        const group = radioGroups.get(candidate.name);
        if (!group || group[0] !== candidate) continue; // Only process first radio in group

        // Process radio group as single field
        const field = await this.buildRadioGroupField(candidate, group, i);
        const key = this.getFieldKey(field);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          fields.push(field);
        }
        continue;
      }

      // Skip if already processed as part of OTP group
      if (this.isOtpCandidate(candidate)) {
        const containerKey = await this.getOtpContainerKey(candidate);
        const group = otpGroups.get(containerKey);
        if (!group || group[0] !== candidate) continue; // Only process first OTP input

        // Process OTP group as single field
        const field = await this.buildOtpGroupField(candidate, group, i);
        const key = this.getFieldKey(field);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          fields.push(field);
        }
        continue;
      }

      // Regular field processing
      const field = await this.buildField(candidate, i);

      // Apply significance filter: drop fields that are not useful
      if (!this.shouldIncludeField(field)) {
        continue;
      }

      const key = this.getFieldKey(field);
      // Deduplicate by semantic key
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        fields.push(field);
      }
    }

    return fields;
  }

  /**
   * Build a single field from raw candidate
   */
  private async buildField(candidate: RawFieldCandidate, index: number): Promise<HtmlField> {
    // Get label text (node-side via re-query)
    const labelText = await this.getLabelText(candidate);

    // Get options for select elements
    const options = candidate.tagName === 'select' 
      ? await this.getSelectOptions(candidate)
      : undefined;

    // Generate unique selector with validation
    const uniqueSelector = await this.generateUniqueSelector(candidate);

    return {
      index,
      tagName: candidate.tagName,
      type: candidate.type,
      name: candidate.name || undefined,
      id: candidate.id || undefined,
      placeholder: candidate.placeholder || undefined,
      value: candidate.value || undefined,
      required: candidate.required,
      className: candidate.className || undefined,
      ariaLabel: candidate.ariaLabel || undefined,
      labelText: labelText || undefined,
      options,
      uniqueSelector,
      min: candidate.min || undefined,
      max: candidate.max || undefined,
      pattern: candidate.pattern || undefined,
    };
  }

  /**
   * Decide whether a normalized field should be kept in the final HtmlField[]
   * 
   * Rules (from user requirements):
   * - Drop fields of type "color" (not meaningful for automation)
   * - Drop fields where ALL of the following are true:
   *     - placeholder is empty/undefined
   *     - labelText is empty/undefined
   *     - ariaLabel is empty/undefined
   *     - required is false
   */
  private shouldIncludeField(field: HtmlField): boolean {
    // Ignore color pickers entirely
    if (field.type === 'color') {
      return false;
    }

    const hasPlaceholder = !!field.placeholder && field.placeholder.trim().length > 0;
    const hasLabelText = !!field.labelText && field.labelText.trim().length > 0;
    const hasAriaLabel = !!field.ariaLabel && field.ariaLabel.trim().length > 0;

    // If field is not required AND has no placeholder, no label, and no aria-label,
    // treat it as insignificant and drop it from the structure.
    if (!field.required && !hasPlaceholder && !hasLabelText && !hasAriaLabel) {
      return false;
    }

    return true;
  }

  /**
   * Build radio group field (single field representing the group)
   */
  private async buildRadioGroupField(
    candidate: RawFieldCandidate,
    group: RawFieldCandidate[],
    index: number
  ): Promise<HtmlField> {
    const labelText = await this.getLabelText(candidate);
    const uniqueSelector = await this.generateUniqueSelector(candidate);

    // Get all radio options
    const radioOptions = await Promise.all(
      group.map(async (r) => {
        const label = await this.getLabelText(r);
        return {
          value: r.value || '',
          label: label || r.value || '',
        };
      })
    );

    return {
      index,
      tagName: candidate.tagName,
      type: candidate.type,
      name: candidate.name || undefined,
      id: candidate.id || undefined,
      placeholder: candidate.placeholder || undefined,
      required: candidate.required,
      className: candidate.className || undefined,
      ariaLabel: candidate.ariaLabel || undefined,
      labelText: labelText || undefined,
      radioGroup: candidate.name || undefined,
      radioOptions,
      uniqueSelector,
    };
  }

  /**
   * Build OTP group field (single field representing multiple inputs)
   */
  private async buildOtpGroupField(
    candidate: RawFieldCandidate,
    group: RawFieldCandidate[],
    index: number
  ): Promise<HtmlField> {
    const labelText = await this.getLabelText(candidate);
    
    // Generate selector that matches all OTP inputs in the group
    const uniqueSelector = await this.generateOtpGroupSelector(candidate, group);

    return {
      index,
      tagName: candidate.tagName,
      type: 'otp',
      name: candidate.name || undefined,
      id: candidate.id || undefined,
      placeholder: candidate.placeholder || undefined,
      required: candidate.required,
      className: candidate.className || undefined,
      ariaLabel: candidate.ariaLabel || undefined,
      labelText: labelText || undefined,
      uniqueSelector,
    };
  }

  /**
   * Get label text using multiple strategies
   * Uses browser-side captured data first, then falls back to re-query if needed
   */
  private async getLabelText(candidate: RawFieldCandidate): Promise<string> {
    try {
      // Use browser-side captured label text first (most efficient)
      if (candidate.closestLabelText) {
        return candidate.closestLabelText;
      }

      // Fallback: re-query if browser-side capture failed
      // Strategy 1: label[for="id"]
      if (candidate.id) {
        const label = this.page.locator(`label[for="${candidate.id}"]`);
        const count = await label.count();
        if (count > 0) {
          const text = await label.first().textContent();
          if (text?.trim()) return text.trim();
        }
      }

      // Strategy 2: aria-labelledby
      if (candidate.ariaLabelledBy) {
        const labelEl = this.page.locator(this.buildIdSelector(candidate.ariaLabelledBy));
        const count = await labelEl.count();
        if (count > 0) {
          const text = await labelEl.first().textContent();
          if (text?.trim()) return text.trim();
        }
      }

      // Strategy 3: aria-label
      if (candidate.ariaLabel) {
        return candidate.ariaLabel.trim();
      }
    } catch (error) {
      automationPageLogger.warn(`Label extraction failed for field ${candidate.id || candidate.name}: ${error}`);
    }

    return '';
  }

  /**
   * Get select options (node-side via re-query)
   */
  private async getSelectOptions(candidate: RawFieldCandidate): Promise<{ value: string; text: string }[]> {
    try {
      if (!candidate.id && !candidate.name) return [];

      // Use safe ID selector
      const selector = candidate.id 
        ? this.buildIdSelector(candidate.id)
        : `[name="${candidate.name}"]`;

      const select = this.page.locator(selector).first();
      if (await select.count() === 0) return [];

      const options = await select.evaluate((el: HTMLSelectElement) => {
        return Array.from(el.options).map((opt) => ({
          value: opt.value,
          text: opt.textContent?.trim() || opt.value,
        }));
      });

      return options;
    } catch (error) {
      automationPageLogger.warn(`Options extraction failed for select ${candidate.id || candidate.name}: ${error}`);
      return [];
    }
  }

  /**
   * Build safe CSS selector for an ID
   * Uses attribute selector [id="..."] for IDs with special characters
   * Uses standard #id selector for safe IDs
   */
  private buildIdSelector(id: string): string {
    // Check if ID contains characters that need escaping
    // CSS identifiers can contain: letters, digits, hyphens, underscores
    // Special characters like /, space, etc. need to be in attribute selector
    if (/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~ ]/.test(id)) {
      // Use attribute selector for IDs with special characters
      // Escape quotes in the ID value
      return `[id="${id.replace(/"/g, '\\"')}"]`;
    }
    // Use standard ID selector for safe IDs
    return `#${id}`;
  }

  /**
   * Build selector candidates in priority order
   */
  private buildSelectorCandidates(candidate: RawFieldCandidate): string[] {
    const candidates: string[] = [];

    // Tier 1: #id (use attribute selector if ID contains special characters)
    if (candidate.id) {
      candidates.push(this.buildIdSelector(candidate.id));
    }

    // Tier 2: form scoped [name="..."]
    if (candidate.name) {
      candidates.push(`form [name="${candidate.name}"]`);
      candidates.push(`[name="${candidate.name}"]`);
    }

    // Tier 3: [aria-label="..."]
    if (candidate.ariaLabel) {
      candidates.push(`[aria-label="${candidate.ariaLabel}"]`);
    }

    // Tier 4: .class[type] with nth-of-type fallback
    if (candidate.className) {
      const classes = candidate.className.split(' ').filter(c => c.trim() !== '');
      if (classes.length > 0) {
        const firstClass = classes[0];
        const type = candidate.type !== 'text' ? `[type="${candidate.type}"]` : '';
        candidates.push(`.${firstClass}${type}`);
      }
    }

    // Tier 5: tag[type] with placeholder
    const tagName = candidate.tagName;
    const type = candidate.type !== 'text' ? `[type="${candidate.type}"]` : '';
    const baseSelector = `${tagName}${type}`;
    
    if (candidate.placeholder) {
      candidates.push(`${baseSelector}[placeholder="${candidate.placeholder}"]`);
    }
    
    candidates.push(baseSelector);

    return candidates;
  }

  /**
   * Build DOM path selector as ultimate fallback
   */
  private async buildDomPathSelector(candidate: RawFieldCandidate): Promise<string> {
    // Use domIndex as last resort
    const tagName = candidate.tagName;
    const type = candidate.type !== 'text' ? `[type="${candidate.type}"]` : '';
    const baseSelector = `${tagName}${type}`;
    
    // Try to find a unique nth-of-type by querying the page
    const index = await this.page.evaluate((opts: { tagName: string; type: string; domIndex: number; id?: string; name?: string }) => {
      const selector = `${opts.tagName}${opts.type !== 'text' ? `[type="${opts.type}"]` : ''}`;
      const elements = Array.from(document.querySelectorAll(selector));
      
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        // Match by id, name, or domIndex position
        if (opts.id && el.id === opts.id) {
          return i + 1;
        }
        const inputEl = el as HTMLInputElement;
        if (opts.name && inputEl.name === opts.name) {
          return i + 1;
        }
        if (i === opts.domIndex) {
          return i + 1;
        }
      }
      return opts.domIndex + 1;
    }, {
      tagName: candidate.tagName,
      type: candidate.type,
      domIndex: candidate.domIndex,
      id: candidate.id || undefined,
      name: candidate.name || undefined,
    });

    return `${baseSelector}:nth-of-type(${index})`;
  }

  /**
   * Generate unique selector with validation (count===1, escalate strategy)
   * CRITICAL: This MUST validate uniqueness before returning any selector
   */
  private async generateUniqueSelector(candidate: RawFieldCandidate): Promise<string> {
    const candidates = this.buildSelectorCandidates(candidate);

    // Try each candidate in priority order, validate uniqueness
    for (const selector of candidates) {
      const count = await this.page.locator(selector).count();
      if (count === 1) {
        automationPageLogger.debug(`Found unique selector: ${selector} for field ${candidate.id || candidate.name || 'unknown'}`);
        return selector;
      }
      
      // If count > 1, try to make it unique with nth-of-type
      if (count > 1 && (candidate.id || candidate.name)) {
        const uniqueIndex = await this.page.evaluate((opts: { selector: string; id?: string; name?: string }) => {
          const elements = Array.from(document.querySelectorAll(opts.selector));
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            if ((opts.id && el.id === opts.id) || (opts.name && (el as HTMLInputElement).name === opts.name)) {
              return i + 1;
            }
          }
          return null;
        }, { selector, id: candidate.id || undefined, name: candidate.name || undefined });

        if (uniqueIndex) {
          const nthSelector = `${selector}:nth-of-type(${uniqueIndex})`;
          const nthCount = await this.page.locator(nthSelector).count();
          if (nthCount === 1) {
            automationPageLogger.debug(`Found unique nth-of-type selector: ${nthSelector}`);
            return nthSelector;
          }
        }
      }
    }

    // Ultimate fallback: DOM path selector
    const fallbackSelector = await this.buildDomPathSelector(candidate);
    const fallbackCount = await this.page.locator(fallbackSelector).count();
    
    if (fallbackCount === 1) {
      automationPageLogger.debug(`Using fallback DOM path selector: ${fallbackSelector}`);
      return fallbackSelector;
    }

    // If even fallback is not unique, log warning and return it anyway
    // (This should be rare and indicates a problematic page structure)
    automationPageLogger.warn(
      `WARNING: Could not generate truly unique selector for field ${candidate.id || candidate.name || 'unknown'}. ` +
      `Fallback selector matches ${fallbackCount} elements: ${fallbackSelector}`
    );
    
    return fallbackSelector;
  }

  /**
   * Generate selector for OTP group (matches all inputs in the group)
   */
  private async generateOtpGroupSelector(
    candidate: RawFieldCandidate,
    group: RawFieldCandidate[]
  ): Promise<string> {
    // Try to find a common container or pattern
    if (candidate.name) {
      // If all OTP inputs share a name pattern, use that
      const namePattern = candidate.name.replace(/\d+$/, '');
      if (group.every(r => r.name?.startsWith(namePattern))) {
        return `input[name^="${namePattern}"]`;
      }
    }

    // Fallback: use first input's selector (will need special handling in fillers)
    return await this.generateUniqueSelector(candidate);
  }

  /**
   * Check if candidate is part of an OTP group
   */
  private isOtpCandidate(candidate: RawFieldCandidate): boolean {
    // OTP indicators: maxlength=1, type=text/tel, name contains otp/code/verify
    const name = (candidate.name || '').toLowerCase();
    const placeholder = (candidate.placeholder || '').toLowerCase();
    
    return (
      candidate.max === '1' ||
      name.includes('otp') ||
      name.includes('code') ||
      name.includes('verify') ||
      placeholder.includes('otp') ||
      placeholder.includes('code') ||
      placeholder.includes('digit')
    );
  }

  /**
   * Get container key for OTP group (for deduplication)
   */
  private async getOtpContainerKey(candidate: RawFieldCandidate): Promise<string> {
    try {
      if (candidate.id) {
        const element = await this.page.locator(this.buildIdSelector(candidate.id)).first();
        if (await element.count() > 0) {
          // Find nearest container with class/id
          const container = await element.locator('xpath=ancestor::*[@class or @id][1]').first();
          if (await container.count() > 0) {
            const id = await container.getAttribute('id');
            const className = await container.getAttribute('class');
            return `otp_${id || className || 'default'}`;
          }
        }
      }
    } catch {
      // Fallback - ignore errors
    }
    return `otp_${candidate.name || candidate.id || 'default'}`;
  }

  /**
   * Get unique key for field (for deduplication)
   */
  private getFieldKey(field: HtmlField): string {
    // For radio groups, use name
    if (field.radioGroup) {
      return `radio_${field.radioGroup}`;
    }
    
    // For OTP, use container key (already handled in normalization)
    if (field.type === 'otp') {
      return `otp_${field.name || field.id || 'default'}`;
    }

    // For everything else, use uniqueSelector
    return field.uniqueSelector;
  }

  /**
   * Build canonical fields from enhanced raw candidates
   */
  private async buildCanonicalFields(raw: RawFieldCandidate[]): Promise<CanonicalField[]> {
    const fields: CanonicalField[] = [];
    const seenFieldIds = new Set<string>();
    const radioGroups = new Map<string, RawFieldCandidate[]>();
    const otpGroups = new Map<string, RawFieldCandidate[]>();

    // First pass: group radios and detect OTP groups
    for (const candidate of raw) {
      if (candidate.type === 'radio' && candidate.name) {
        if (!radioGroups.has(candidate.name)) {
          radioGroups.set(candidate.name, []);
        }
        radioGroups.get(candidate.name)!.push(candidate);
      } else if (this.isOtpCandidate(candidate)) {
        const containerKey = await this.getOtpContainerKey(candidate);
        if (!otpGroups.has(containerKey)) {
          otpGroups.set(containerKey, []);
        }
        otpGroups.get(containerKey)!.push(candidate);
      }
    }

    // Second pass: build canonical fields
    for (let i = 0; i < raw.length; i++) {
      const candidate = raw[i];

      // Skip if already processed as part of a radio group
      if (candidate.type === 'radio' && candidate.name) {
        const group = radioGroups.get(candidate.name);
        if (!group || group[0] !== candidate) continue;

        const field = await this.buildCanonicalRadioGroupField(candidate, group, i);
        if (!seenFieldIds.has(field.fieldId)) {
          seenFieldIds.add(field.fieldId);
          fields.push(field);
        }
        continue;
      }

      // Skip if already processed as part of OTP group
      if (this.isOtpCandidate(candidate)) {
        const containerKey = await this.getOtpContainerKey(candidate);
        const group = otpGroups.get(containerKey);
        if (!group || group[0] !== candidate) continue;

        const field = await this.buildCanonicalOtpGroupField(candidate, group, i);
        if (!seenFieldIds.has(field.fieldId)) {
          seenFieldIds.add(field.fieldId);
          fields.push(field);
        }
        continue;
      }

      // Regular field processing
      const field = await this.buildCanonicalField(candidate, i);

      // Apply significance filter
      if (!this.shouldIncludeCanonicalField(field)) {
        continue;
      }

      if (!seenFieldIds.has(field.fieldId)) {
        seenFieldIds.add(field.fieldId);
        fields.push(field);
      }
    }

    return fields;
  }

  /**
   * Build a single canonical field from raw candidate
   */
  private async buildCanonicalField(candidate: RawFieldCandidate, index: number): Promise<CanonicalField> {
    // Get label text
    const labelText = await this.getLabelText(candidate);

    // Compute accessible name
    const accessibleName = computeAccessibleName({
      labelText,
      ariaLabel: candidate.ariaLabel,
      ariaLabelledBy: candidate.ariaLabelledBy,
      placeholder: candidate.placeholder,
      id: candidate.id,
      name: candidate.name,
    });

    // Detect control type and role
    const controlType = detectControlType({
      tag: candidate.tagName,
      type: candidate.type,
      className: candidate.className,
      role: candidate.role,
    });

    const role = detectRole({
      tag: candidate.tagName,
      type: candidate.type,
      role: candidate.role,
      className: candidate.className,
    });

    // Get options for select elements
    const options = candidate.tagName === 'select'
      ? await this.getSelectOptions(candidate)
      : [];

    // Compute interaction hints (convert options format)
    const interactionHints = computeInteractionHints({
      controlType,
      tag: candidate.tagName,
      className: candidate.className,
      role: candidate.role,
      options: options.map(opt => ({ value: opt.value, label: opt.text })),
    });

    // Generate field ID
    const fieldId = generateFieldId({
      accessibleName,
      controlType,
      formIndex: candidate.formIndex ?? 0,
      positionInForm: candidate.positionInForm ?? index,
    });

    // Generate fallback selector
    const fallbackSelector = await this.generateUniqueSelector(candidate);

    // Build validation object
    const validation = {
      min: candidate.min ? parseFloat(candidate.min) : null,
      max: candidate.max ? parseFloat(candidate.max) : null,
      pattern: candidate.pattern || null,
      minLength: candidate.minLength ? parseInt(candidate.minLength, 10) : null,
      maxLength: candidate.maxLength ? parseInt(candidate.maxLength, 10) : null,
    };

    // Build state object
    const state = {
      required: candidate.required || false,
      disabled: candidate.disabled || false,
      readonly: candidate.readonly || false,
      visible: candidate.visible ?? true,
      checked: candidate.checked || false,
      value: candidate.value || null,
    };

    // Build labels object
    const labels = {
      labelText: labelText || null,
      ariaLabel: candidate.ariaLabel || null,
      ariaLabelledBy: candidate.ariaLabelledBy || null,
      placeholder: candidate.placeholder || null,
    };

    // Build group object (null for regular fields)
    const group = null;

    return {
      fieldId,
      tag: candidate.tagName as CanonicalField['tag'],
      controlType,
      role,
      accessibleName,
      labels,
      group,
      options: options.map(opt => ({
        value: opt.value || null,
        label: opt.text,
        selected: false, // Would need to check DOM for current selection
        disabled: false, // Would need to check DOM for disabled state
      })),
      state,
      validation,
      context: {
        formIndex: candidate.formIndex ?? 0,
        sectionHeading: candidate.sectionHeading || null,
        positionInForm: candidate.positionInForm ?? index,
      },
      interactionHints,
      fallback: {
        selector: fallbackSelector || null,
      },
    };
  }

  /**
   * Build canonical field for radio group
   */
  private async buildCanonicalRadioGroupField(
    candidate: RawFieldCandidate,
    group: RawFieldCandidate[],
    index: number
  ): Promise<CanonicalField> {
    const labelText = await this.getLabelText(candidate);
    const accessibleName = computeAccessibleName({
      labelText,
      ariaLabel: candidate.ariaLabel,
      ariaLabelledBy: candidate.ariaLabelledBy,
      placeholder: candidate.placeholder,
      id: candidate.id,
      name: candidate.name,
    });

    const controlType = detectControlType({
      tag: candidate.tagName,
      type: candidate.type,
      className: candidate.className,
      role: candidate.role,
    });

    const role = detectRole({
      tag: candidate.tagName,
      type: candidate.type,
      role: candidate.role,
      className: candidate.className,
    });

    // Get all radio options
    const radioOptions = await Promise.all(
      group.map(async (r) => {
        const label = await this.getLabelText(r);
        return {
          value: r.value || '',
          label: label || r.value || '',
        };
      })
    );

    const interactionHints = computeInteractionHints({
      controlType,
      tag: candidate.tagName,
      className: candidate.className,
      role: candidate.role,
      options: radioOptions,
    });

    const fieldId = generateFieldId({
      accessibleName,
      controlType,
      formIndex: candidate.formIndex ?? 0,
      positionInForm: candidate.positionInForm ?? index,
    });

    const fallbackSelector = await this.generateUniqueSelector(candidate);

    return {
      fieldId,
      tag: candidate.tagName as CanonicalField['tag'],
      controlType,
      role,
      accessibleName,
      labels: {
        labelText: labelText || null,
        ariaLabel: candidate.ariaLabel || null,
        ariaLabelledBy: candidate.ariaLabelledBy || null,
        placeholder: candidate.placeholder || null,
      },
      group: {
        groupName: candidate.name || null,
        groupLabel: labelText || null,
      },
      options: radioOptions.map(opt => ({
        value: opt.value || null,
        label: opt.label,
        selected: false,
        disabled: false,
      })),
      state: {
        required: candidate.required || false,
        disabled: candidate.disabled || false,
        readonly: candidate.readonly || false,
        visible: candidate.visible ?? true,
        checked: candidate.checked || false,
        value: candidate.value || null,
      },
      validation: {
        min: null,
        max: null,
        pattern: null,
        minLength: null,
        maxLength: null,
      },
      context: {
        formIndex: candidate.formIndex ?? 0,
        sectionHeading: candidate.sectionHeading || null,
        positionInForm: candidate.positionInForm ?? index,
      },
      interactionHints,
      fallback: {
        selector: fallbackSelector || null,
      },
    };
  }

  /**
   * Build canonical field for OTP group
   */
  private async buildCanonicalOtpGroupField(
    candidate: RawFieldCandidate,
    group: RawFieldCandidate[],
    index: number
  ): Promise<CanonicalField> {
    const labelText = await this.getLabelText(candidate);
    const accessibleName = computeAccessibleName({
      labelText,
      ariaLabel: candidate.ariaLabel,
      ariaLabelledBy: candidate.ariaLabelledBy,
      placeholder: candidate.placeholder,
      id: candidate.id,
      name: candidate.name,
    });

    const controlType: ControlType = 'text'; // OTP is treated as text input
    const role = detectRole({
      tag: candidate.tagName,
      type: candidate.type,
      role: candidate.role,
      className: candidate.className,
    });

    const interactionHints = computeInteractionHints({
      controlType,
      tag: candidate.tagName,
      className: candidate.className,
      role: candidate.role,
    });

    const fieldId = generateFieldId({
      accessibleName,
      controlType,
      formIndex: candidate.formIndex ?? 0,
      positionInForm: candidate.positionInForm ?? index,
    });

    const fallbackSelector = await this.generateOtpGroupSelector(candidate, group);

    return {
      fieldId,
      tag: candidate.tagName as CanonicalField['tag'],
      controlType,
      role,
      accessibleName,
      labels: {
        labelText: labelText || null,
        ariaLabel: candidate.ariaLabel || null,
        ariaLabelledBy: candidate.ariaLabelledBy || null,
        placeholder: candidate.placeholder || null,
      },
      group: null,
      options: [],
      state: {
        required: candidate.required || false,
        disabled: candidate.disabled || false,
        readonly: candidate.readonly || false,
        visible: candidate.visible ?? true,
        checked: false,
        value: candidate.value || null,
      },
      validation: {
        min: null,
        max: null,
        pattern: null,
        minLength: candidate.minLength ? parseInt(candidate.minLength, 10) : null,
        maxLength: candidate.maxLength ? parseInt(candidate.maxLength, 10) : null,
      },
      context: {
        formIndex: candidate.formIndex ?? 0,
        sectionHeading: candidate.sectionHeading || null,
        positionInForm: candidate.positionInForm ?? index,
      },
      interactionHints,
      fallback: {
        selector: fallbackSelector || null,
      },
    };
  }

  /**
   * Check if canonical field should be included
   */
  private shouldIncludeCanonicalField(field: CanonicalField): boolean {
    // Ignore color pickers
    if (field.controlType === 'color') {
      return false;
    }

    const hasPlaceholder = !!field.labels.placeholder && field.labels.placeholder.trim().length > 0;
    const hasLabelText = !!field.labels.labelText && field.labels.labelText.trim().length > 0;
    const hasAriaLabel = !!field.labels.ariaLabel && field.labels.ariaLabel.trim().length > 0;
    const hasAccessibleName = !!field.accessibleName && field.accessibleName.trim().length > 0;

    // For links and buttons: include if they have accessible name (text content)
    // This ensures navigation links like "Manage Students", "Manage Applications" are included
    if ((field.tag === 'a' || field.tag === 'button') && hasAccessibleName) {
      return true;
    }

    // If field is not required AND has no placeholder, no label, and no aria-label,
    // treat it as insignificant
    if (!field.state.required && !hasPlaceholder && !hasLabelText && !hasAriaLabel) {
      return false;
    }

    return true;
  }
}
