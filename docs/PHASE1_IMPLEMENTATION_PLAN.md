# Phase 1: HTML Extraction & Cleaning - Detailed Implementation Plan

## Overview

**Goal**: Extract structured HTML fields from the page, convert to clean JSON format, and send to Gemini instead of raw HTML. This will reduce token usage by 80%+ and improve mapping accuracy.

**Current State**: Raw cleaned HTML string (100KB+) sent to Gemini  
**Target State**: Structured `HtmlField[]` JSON array (~5-10KB) sent to Gemini

---

## Architecture Changes

### Before
```
Page → cleanHtml() → Raw HTML String → Gemini API
```

### After
```
Page → extractFields() → HtmlField[] → JSON → Gemini API
     → cleanHtml() → Raw HTML (optional context, truncated)
```

---

## Implementation Tasks

### Task 1: Create Field Extractor Module

**File**: `src/main/automation/page/field-extractor.ts` (NEW)

**Purpose**: Extract all form fields with metadata from the DOM

### Critical Non-Negotiable Constraint: `page.evaluate()` Boundary

`page.evaluate()` runs in the **browser context**. That means **you cannot call** Node/TypeScript class methods (or use `this`, `logger`, imported enums/types, etc.) from inside `evaluate`.

- **Browser-side (evaluate)** must be **pure DOM reads** and return plain JSON-serializable objects.
- **Node-side (TypeScript)** must do: **dedup**, **selector synthesis + uniqueness checks**, **label inference/normalization**, **option/radio aggregation**, and final `HtmlField[]` shaping.

This split is mandatory for the implementation to work reliably.

**Requirements**:
- Extract all input, textarea, select, button elements
- Generate unique selectors (priority: #id > [name] > .class)
- Extract labels using multiple strategies
- Extract options for select/radio elements
- Handle radio groups
- Filter duplicates
- Return structured `HtmlField[]` array

**Implementation Details**:

```typescript
import { Page } from 'playwright-core';
import { HtmlField } from '../../../shared/types/automation.types';
import { logger } from '../../core/logger';

export interface FieldExtractionOptions {
  includeHidden?: boolean;
  includeDisabled?: boolean;
  maxFields?: number;
}

export class FieldExtractor {
  constructor(private page: Page) {}

  /**
   * Extract all form fields from the page
   */
  async extractFields(options: FieldExtractionOptions = {}): Promise<HtmlField[]> {
    try {
      // 1) Browser-side: extract RAW candidates (no `this`, no Node funcs)
      const raw = await this.page.evaluate((opts) => {
        const rootCandidates = Array.from(
          document.querySelectorAll('form, [role="form"], [class*="form"], body')
        );
        const root = (rootCandidates.find((el) => el.tagName.toLowerCase() === 'form') ||
          rootCandidates[0] ||
          document.body) as Element;

        const candidates = Array.from(
          root.querySelectorAll('input, textarea, select, button, [role="radio"], [role="checkbox"]')
        ) as HTMLElement[];

        const visible = (el: Element) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const filtered = candidates.filter((el) => {
          if (!opts.includeHidden && !visible(el)) return false;
          if (!opts.includeDisabled && el.hasAttribute('disabled')) return false;
          return true;
        });

        // Return plain objects only (serializable)
        const rawFields = filtered.map((el, i) => {
          const tagName = el.tagName.toLowerCase();
          const input = el as any;
          const type = (input.type || el.getAttribute('type') || 'text').toLowerCase();

          // Capture minimal identity + relationships to help Node-side normalization
          return {
            domIndex: i,
            tagName,
            type,
            id: (el as HTMLElement).id || null,
            name: input.name || null,
            placeholder: input.placeholder || null,
            className: (el as HTMLElement).className || null,
            required: !!input.required,
            value: input.value ?? null,
            min: input.min ?? null,
            max: input.max ?? null,
            pattern: input.pattern ?? null,
            ariaLabel: el.getAttribute('aria-label'),
            ariaLabelledBy: el.getAttribute('aria-labelledby'),
            role: el.getAttribute('role'),
          };
        });

        return opts.maxFields ? rawFields.slice(0, opts.maxFields) : rawFields;
      }, options);

      // 2) Node-side: normalize into HtmlField[] (dedup + selector uniqueness + label inference)
      const fields = await this.normalizeRawFields(raw);
      logger.info(`Extracted ${fields.length} form fields`);
      return fields;
    } catch (error) {
      logger.error('Field extraction failed:', error);
      throw error;
    }
  }

  /**
   * Node-side normalization pipeline:
   * - infer labels (via lightweight re-queries)
   * - aggregate select/radio options
   * - deduplicate by semantic grouping (radio/otp/etc.)
   * - generate selectors and ensure uniqueness
   */
  private async normalizeRawFields(raw: any[]): Promise<HtmlField[]> {
    // NOTE: Implementation will live in code; this plan defines the responsibilities.
    // Pseudocode responsibilities:
    // 1) Build preliminary candidates from raw
    // 2) For candidates requiring extra DOM info:
    //    - re-query by (id/name/domIndex) and compute label/options
    // 3) Deduplicate by semantic key (see Dedup section below)
    // 4) Generate selector candidates and validate uniqueness (see Selector section)
    // 5) Emit final HtmlField[] with stable index order
    return [];
  }

  /**
   * Generate unique CSS selector for element
   * Priority: #id > [name] > [placeholder] > .class > tag[type]
   */
  private generateSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    const inputEl = element as HTMLInputElement;
    if (inputEl.name) {
      return `[name="${inputEl.name}"]`;
    }
    
    if (inputEl.placeholder) {
      return `[placeholder="${inputEl.placeholder}"]`;
    }
    
    if (element.className) {
      const firstClass = element.className.split(' ').find(c => c.trim() !== '');
      if (firstClass) {
        const type = inputEl.type || '';
        return type ? `.${firstClass}[type="${type}"]` : `.${firstClass}`;
      }
    }
    
    const tagName = element.tagName.toLowerCase();
    const type = inputEl.type || '';
    return type ? `${tagName}[type="${type}"]` : tagName;
  }

  /**
   * Get label text for element using multiple strategies
   */
  private getLabelText(element: HTMLElement): string {
    // Strategy 1: label[for="id"]
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent?.trim() || '';
    }

    // Strategy 2: Parent label element
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || '';

    // Strategy 3: Previous sibling label
    const prevSibling = element.previousElementSibling;
    if (prevSibling && prevSibling.tagName === 'LABEL') {
      return prevSibling.textContent?.trim() || '';
    }

    // Strategy 4: Next sibling (if it's a label or short text)
    const nextSibling = element.nextElementSibling;
    if (nextSibling) {
      if (nextSibling.tagName === 'LABEL') {
        return nextSibling.textContent?.trim() || '';
      }
      const text = nextSibling.textContent?.trim() || '';
      if (text.length > 0 && text.length < 50) {
        return text;
      }
    }

    // Strategy 5: Closest element with "label" in class
    const labelContainer = element.closest('[class*="label"]');
    if (labelContainer) {
      const text = labelContainer.textContent?.trim() || '';
      if (text.length > 0 && text.length < 100) {
        return text;
      }
    }

    // Strategy 6: aria-labelledby
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl) return labelEl.textContent?.trim() || '';
    }

    // Strategy 7: aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    return '';
  }

  /**
   * Get unique key for field (for deduplication)
   */
  private getFieldKey(element: HTMLElement): string {
    const inputEl = element as HTMLInputElement;
    return inputEl.id || inputEl.name || inputEl.placeholder || element.className || '';
  }
}
```

### Selector Uniqueness (Mandatory Improvement)

The selector ranking **is not sufficient** unless we **validate uniqueness** on the current page.

**New selector contract**: `uniqueSelector` must match **exactly one** element (or one semantic group for radios/OTP).

**Recommended selector generation approach**:
- **Tier 1**: `#id` (verify unique)
- **Tier 2**: `form[action] [name="..."]` or nearest form scoping + `[name="..."]` (verify unique)
- **Tier 3**: `[aria-label="..."]` or `[aria-labelledby="..."]` (verify unique)
- **Tier 4**: `.class:nth-of-type(n)` scoping within nearest stable container (verify unique)
- **Tier 5 (Last resort)**: DOM path fallback (bounded depth), or container-scoped `:nth-of-type()` sequences

**Validation step** (Node-side): after proposing a selector, run `page.locator(selector).count()` and only accept if count is 1; otherwise escalate to the next tier.

### Deduplication (Mandatory Improvement)

Dedup should be by **semantic group**, not by loose identity.

**Updated dedup keys**:
- **radio**: `type + name` (one `HtmlField` representing the group) + `radioOptions[]`
- **otp_group** (multi inputs): dedup by **container identity** (nearest shared ancestor selector) not by each input
- **checkbox**: by `id` (preferred) else by `(type + name + labelText)` (avoid collapsing checkbox groups incorrectly)
- **everything else**: by validated `uniqueSelector` (post-uniqueness check)

**Testing Checklist**:
- [ ] Extracts text inputs
- [ ] Extracts select dropdowns with options
- [ ] Extracts radio groups with all options
- [ ] Extracts checkboxes
- [ ] Extracts textareas
- [ ] Generates correct selectors (#id, [name], scoped selectors, nth-of-type fallback)
- [ ] Ensures selector uniqueness (count===1), escalates selector strategy on collisions
- [ ] Extracts labels correctly (all 7 strategies)
- [ ] Dedup works for radio groups, OTP groups, and multi-input widgets (does not collapse incorrectly)
- [ ] Handles hidden/disabled fields
- [ ] Handles fields without labels

---

### Task 2: Update PageManager

**File**: `src/main/automation/page-manager.ts` (MODIFY)

**Changes**:
1. Add `FieldExtractor` import
2. Add `extractFields()` method
3. Keep `extractHtml()` for backward compatibility (optional context)

**Implementation**:

```typescript
// Add import
import { FieldExtractor } from './page/field-extractor';

// Add to PageManager class
export class PageManager {
  private fieldExtractor: FieldExtractor;

  constructor(private page: Page) {
    // ... existing code ...
    this.fieldExtractor = new FieldExtractor(page);
  }

  /**
   * Extract structured form fields from page
   */
  async extractFields(): Promise<HtmlField[]> {
    try {
      return await this.fieldExtractor.extractFields({
        includeHidden: false,
        includeDisabled: false,
      });
    } catch (e) {
      logger.error('Failed to extract fields', e);
      throw e;
    }
  }

  // Keep existing extractHtml() for backward compatibility
  async extractHtml(): Promise<string> {
    // ... existing code unchanged ...
  }
}
```

**Testing Checklist**:
- [ ] `extractFields()` returns `HtmlField[]`
- [ ] `extractHtml()` still works (backward compatibility)
- [ ] Error handling works correctly

---

### Task 3: Update AIService to Accept Structured Fields

**File**: `src/main/services/ai.service.ts` (MODIFY)

**Changes**:
1. Update `analyzePageAndMapFields()` signature
2. Accept `HtmlField[]` instead of raw HTML string
3. Include structured fields in prompt (JSON format)
4. Keep HTML as optional truncated context

**Implementation**:

```typescript
// Add import
import { HtmlField } from '../../shared/types/automation.types';

// Update method signature
async analyzePageAndMapFields(
  htmlFields: HtmlField[],  // Changed from html: string
  extractedData: any,
  documentList: { name: string; category: string }[],
  customPrompt?: string,
  screenshotBase64?: string,
  htmlContext?: string  // Optional: truncated HTML for context
): Promise<AIAnalysisResult> {
  try {
    const documentListStr = documentList.length > 0
      ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
      : 'No documents attached';

    // Build prompt with structured fields
    const prompt = `
      You are an intelligent automation agent that DESCRIBES form fields and actions.
      Your job is to identify INTENT and BEHAVIOR, not to dictate execution.

      TASK:
      1. Classify the page type (dashboard, form, confirmation, or unknown)
      2. If DASHBOARD: identify the SINGLE most relevant primary action the user should take next (only 1 action)
      3. If FORM: describe each field's BEHAVIOR and map to client data with CONFIDENCE

      CLIENT EXTRACTED DATA:
      ${JSON.stringify(extractedData, null, 2)}

      ATTACHED DOCUMENTS (use these for file upload fields):
      ${documentListStr}
      NOTE: For file upload fields, set the "expectedValue" to the document name that best matches the field requirement.

      CUSTOM INSTRUCTIONS:
      ${customPrompt || 'None'}

      ${screenshotBase64 ? `CRITICAL INSTRUCTION: An image of the webpage is attached.\n1. Use the IMAGE to understand the visual layout, context, and which form corresponds to the user's intent. Use the HTML fields provided below strictly for extracting correct CSS selectors.\n3. If there is a visual conflict between HTML and Image, prioritize the Image for "Context" but the HTML for "Selectors".` : ''}

      FORM FIELDS STRUCTURE (JSON):
      ${JSON.stringify(htmlFields, null, 2)}

      ${htmlContext ? `\nHTML CONTEXT (for reference only, use field structure above):\n${htmlContext.substring(0, 5000)}\n` : ''}

      FIELD BEHAVIOR TYPES (CRITICAL - choose the most specific):
      - "text_entry" = simple text input
      - "masked_input" = formatted input (phone, SSN, postal code with mask)
      - "search_and_select" = autocomplete/searchable dropdown (can type to filter)
      - "single_choice" = static dropdown or radio group (no search)
      - "date_picker" = calendar widget (look for .datepicker, role="datepicker")
      - "boolean_toggle" = toggle switch (look for .toggle, .switch classes)
      - "consent_checkbox" = terms/conditions checkbox
      - "otp_group" = multiple OTP inputs (e.g., 4-6 boxes for verification code)
      - "range_slider" = numeric slider control
      - "file_upload" = file upload field

      CONFIDENCE LEVELS:
      - "high" = Clear label match + placeholder/context confirms (90%+ sure) → Auto-fill
      - "medium" = Label matches, reasonable inference (60-90%) → May need review
      - "low" = Uncertain or guessed (<60%) → Require human verification

      MISSING DATA HANDLING:
      - If client data is MISSING for a field: set "expectedValue" to "__MISSING__" and "status" to "missing_data"
      - NEVER invent fake/placeholder data
      - Be explicit about what you don't know

      OUTPUT INSTRUCTIONS:
      Return a valid JSON object with this structure:
      {
        "pageType": "dashboard" | "form" | "confirmation" | "unknown",
        "pageSummary": "Brief description",
        "isFormPage": boolean,
        "fields": [
          {
            "selector": "USE uniqueSelector from field structure above",
            "fieldName": "Human-readable field name (use labelText if available)",
            "behavior": "text_entry|masked_input|search_and_select|single_choice|date_picker|boolean_toggle|consent_checkbox|otp_group|range_slider|file_upload",
            "intent": "semantic_name (e.g. citizenship_country, passport_number)",
            "expectedValue": "value from client data OR '__MISSING__'",
            "confidence": "high|medium|low",
            "reason": "Why this mapping (explain confidence)",
            "status": "ready|missing_data|low_confidence",
            "constraints": { "required": boolean } (optional)
          }
        ],
        "actions": [
          {
            "intent": "primary_navigation|secondary_action|modal_confirm|create_new",
            "description": "What this accomplishes",
            "expectedText": "Visible button text (for matching)",
            "selector": "SIMPLE CSS selector (preferred) or leave empty to use text matching",
            "confidence": "high|medium|low"
          }
        ],
        "captcha": { "detected": boolean },
        "otp": { "detected": boolean, "behavior": "otp_group", "confidence": "high|medium|low" }
      }

      CRITICAL RULES:
      1. DESCRIBE, DON'T COMMAND: Identify what fields/actions MEAN, not how to execute them
      2. DASHBOARD OUTPUT CONSTRAINT (MANDATORY):
        - If pageType = "dashboard":
          - fields MUST be an empty array: "fields": []
          - actions MUST contain EXACTLY ONE item: "actions": [ { ... } ]
          - Choose the single most relevant next step (e.g., "start new application", "create new", "continue", "open application")
      3. FORM OUTPUT CONSTRAINT:
        - If pageType = "form":
          - MAP ALL VISIBLE FIELDS from the structure above
          - Include fields even if missing data (use "__MISSING__")
          - actions can include 0+ items as needed
      4. CONFIDENCE IS KEY: low confidence → require review (status="low_confidence")
      5. NO FAKE DATA: Never invent values. "__MISSING__" is better than a guess
      6. SELECTORS: Use the "uniqueSelector" from the field structure - DO NOT modify it
      7. BEHAVIOR OVER TYPE: Use "search_and_select" only when it's truly searchable/autocomplete
      8. Terms checkboxes: behavior="consent_checkbox", confidence="high"
      9. OTP fields: behavior="otp_group", selector should match ALL OTP inputs
      10. Return raw JSON only, no markdown formatting
    `;

    // Log the prompt details
    geminiPromptLogger.info(
      '--- NEW AUTOMATION REQUEST ---\n' + 
      `TIMESTAMP: ${new Date().toISOString()}\n\n` +
      '--- STRUCTURED FIELDS ---\n' + 
      JSON.stringify(htmlFields, null, 2) + '\n\n' +
      '--- CUSTOM PROMPT ---\n' + 
      (customPrompt || 'None') + '\n\n' +
      '--- FINAL PROMPT ---\n' + 
      prompt + '\n\n' +
      '--------------------------------------------------\n'
    );

    // Prepare request parts
    const parts: any[] = [{ text: prompt }];
    if (screenshotBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: screenshotBase64
        }
      });
    }

    const result = await this.model.generateContent(parts);
    const response = result.response;
    const usage = response.usageMetadata;
    const text = response.text();
    
    // Clean markdown code blocks if present
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    this.logResponse(cleanJson, usage, !!screenshotBase64);

    return JSON.parse(cleanJson) as AIAnalysisResult;

  } catch (error) {
    logger.error('AI Analysis failed:', error);
    throw error;
  }
}
```

**Testing Checklist**:
- [ ] Method accepts `HtmlField[]` instead of `string`
- [ ] Structured fields included in prompt as JSON
- [ ] HTML context optional and truncated (5KB max)
- [ ] Prompt size reduced significantly
- [ ] Gemini response still parsed correctly
- [ ] Backward compatibility maintained (if needed)

---

### Task 4: Update AutomationService

**File**: `src/main/services/automation.service.ts` (MODIFY)

**Changes**:
1. Call `pageManager.extractFields()` instead of `extractHtml()`
2. Pass structured fields to `aiService.analyzePageAndMapFields()`
3. Optionally pass truncated HTML as context

**Implementation**:

```typescript
// In processPage() method, around line 149-179

// OLD CODE:
// const cleaned = await pageManager.extractHtml();
// const aiResult = await aiService.analyzePageAndMapFields(
//   cleaned, 
//   extraction.extractedData,
//   ...
// );

// NEW CODE:
EventEmitter.emitStatus('Extracting form structure...', 18);

// Extract structured fields
const htmlFields = await pageManager.extractFields();
EventEmitter.emitStatus('Form structure extracted', 20);

// Optionally extract HTML for context (truncated)
let htmlContext: string | undefined;
if (this.currentJob?.attachScreenshots) {
  // Only include HTML context if screenshots are enabled (for visual reference)
  const cleaned = await pageManager.extractHtml();
  htmlContext = cleaned.substring(0, 5000); // Truncate to 5KB
}

// 3. Capture Screenshot (if enabled)
let screenshotBase64: string | undefined;
if (this.currentJob?.attachScreenshots) {
  EventEmitter.emitStatus('Capturing screenshot...', 25);
  screenshotBase64 = await pageManager.captureScreenshot();
}

// 4. Fetch documents for context
const documents = await documentRepository.findByClient(client._id, this.currentJob?.companyId || '');
const documentList = documents.map(d => ({ 
  name: d.originalName, 
  category: d.documentType,
  s3Key: d.s3Key,
}));

// 5. AI Analysis with structured fields
EventEmitter.emitStatus('Processing with AI...', 30);
const aiResult = await aiService.analyzePageAndMapFields(
  htmlFields,  // Changed: structured fields instead of raw HTML
  extraction.extractedData,
  documentList,
  customPrompt,
  screenshotBase64,
  htmlContext  // Optional: truncated HTML for context
);
EventEmitter.emitStatus(`Got AI response: ${aiResult.pageType} page`, 50);
```

**Testing Checklist**:
- [ ] Calls `extractFields()` instead of `extractHtml()`
- [ ] Passes structured fields to AI service
- [ ] Optional HTML context works correctly
- [ ] Error handling works
- [ ] Status updates are accurate

---

### Task 5: Update Type Definitions (if needed)

**File**: `src/shared/types/gemini.types.ts` (REVIEW)

**Check**: Ensure `HtmlFieldForGemini` matches `HtmlField` from `automation.types.ts`

**Action**: If there are differences, align them or create a mapping function.

**Implementation** (if needed):

```typescript
// In field-extractor.ts or a new mapper file
export function mapHtmlFieldToGemini(field: HtmlField): HtmlFieldForGemini {
  return {
    index: field.index,
    tagName: field.tagName,
    type: field.type,
    name: field.name,
    id: field.id,
    placeholder: field.placeholder,
    labelText: field.labelText,
    options: field.options,
    radioOptions: field.radioOptions,
    uniqueSelector: field.uniqueSelector,
    required: field.required,
  };
}
```

**Testing Checklist**:
- [ ] Types are compatible
- [ ] Mapping function works (if needed)

---

### Task 6: Add Unit Tests

**Files to Create**:
- `src/main/automation/page/__tests__/field-extractor.test.ts`
- `src/main/services/__tests__/ai.service.test.ts` (update existing)

**Test Cases**:

1. **FieldExtractor Tests**:
   - [ ] Extracts text input fields
   - [ ] Extracts select dropdowns with options
   - [ ] Extracts radio groups correctly
   - [ ] Generates correct selectors (#id, [name], .class)
   - [ ] Extracts labels using all strategies
   - [ ] Filters duplicates
   - [ ] Handles edge cases (no labels, no id/name)

2. **AIService Tests**:
   - [ ] Accepts HtmlField[] array
   - [ ] Includes structured fields in prompt
   - [ ] HTML context is optional and truncated
   - [ ] Prompt size is reduced

3. **Integration Tests**:
   - [ ] End-to-end: Page → Extract → AI → Response
   - [ ] Token usage comparison (before/after)
   - [ ] Response accuracy comparison
   - [ ] **Visual mismatch tests**: HTML suggests one form/field set, screenshot shows a different primary form (validate “Image wins for context, HTML wins for selectors”)

---

### Task 7: Update Logging

**Files to Modify**:
- `src/main/services/ai.service.ts` (already updated in Task 3)
- `src/main/automation/page/field-extractor.ts` (add logging)

**Changes**:
- Log number of fields extracted
- Log field extraction time
- Log prompt size (before/after)
- Log token usage (if available)

---

## Implementation Checklist

### Phase 1.1: Core Extraction (Week 1, Days 1-2)
- [ ] **Task 1**: Create `field-extractor.ts` with all methods
- [ ] **Task 1**: Implement `extractFields()` method
- [ ] **Task 1**: Implement `generateSelector()` method
- [ ] **Task 1**: Implement `getLabelText()` method (all 7 strategies)
- [ ] **Task 1**: Handle select/radio/checkbox extraction
- [ ] **Task 1**: Add error handling
- [ ] **Task 1**: Add logging

### Phase 1.2: Integration (Week 1, Days 3-4)
- [ ] **Task 2**: Update `PageManager` with `extractFields()` method
- [ ] **Task 3**: Update `AIService.analyzePageAndMapFields()` signature
- [ ] **Task 3**: Update prompt to use structured fields
- [ ] **Task 4**: Update `AutomationService.processPage()` to use new flow
- [ ] **Task 5**: Review and align type definitions

### Phase 1.3: Testing & Validation (Week 1, Day 5)
- [ ] **Task 6**: Write unit tests for `FieldExtractor`
- [ ] **Task 6**: Write unit tests for `AIService` changes
- [ ] **Task 6**: Write integration tests
- [ ] **Task 7**: Update logging throughout
- [ ] Test with real forms (various types)
- [ ] Measure token usage reduction
- [ ] Measure latency improvement
- [ ] Verify response accuracy

### Phase 1.4: Documentation & Cleanup
- [ ] Update code comments
- [ ] Update README/docs
- [ ] Remove unused code (if any)
- [ ] Code review
- [ ] Performance benchmarking

---

## Success Criteria

### Quantitative Metrics

1. **Token Usage**:
   - Before: ~50,000-100,000 tokens (HTML)
   - Target: ~5,000-10,000 tokens (structured JSON)
   - Reduction: **80-90%**

2. **Prompt Size**:
   - Before: ~100KB+ HTML string
   - Target: ~5-10KB JSON array
   - Reduction: **90%+**

3. **Gemini API Latency**:
   - Before: ~1500-2000ms
   - Target: ~600-1000ms
   - Improvement: **40-50%**

4. **Selector Accuracy**:
   - Before: ~70% (Gemini generates selectors)
   - Target: ~95%+ (using extracted selectors)
   - Improvement: **25%+**

### Qualitative Metrics

1. **Code Quality**:
   - [ ] All tests pass
   - [ ] No TypeScript errors
   - [ ] No linting errors
   - [ ] Code follows project conventions

2. **Functionality**:
   - [ ] All field types extracted correctly
   - [ ] Labels extracted accurately
   - [ ] Selectors are unique and reliable
   - [ ] Gemini responses are accurate

3. **Backward Compatibility**:
   - [ ] Existing code still works
   - [ ] No breaking changes (if possible)
   - [ ] Graceful fallback if extraction fails

---

## Risk Mitigation

### Risk 1: Field Extraction Misses Fields
**Mitigation**: 
- Comprehensive selector strategy
- Test with various form types
- Fallback to raw HTML if extraction fails

### Risk 2: Selector Generation Fails
**Mitigation**:
- Multiple selector strategies (id > name > class)
- Validation of selector uniqueness
- Fallback to tag[type] if all else fails

### Risk 3: Label Extraction Inaccurate
**Mitigation**:
- 7 different label extraction strategies
- Test with various label patterns
- Use aria-label/aria-labelledby as fallback

### Risk 4: Breaking Changes
**Mitigation**:
- Keep `extractHtml()` for backward compatibility
- Make HTML context optional
- Gradual rollout with feature flag

---

## Rollout Plan

### Step 1: Development
- Implement all tasks
- Write tests
- Local testing

### Step 2: Staging
- Deploy to staging environment
- Test with real forms
- Measure metrics
- Fix any issues

### Step 3: Production (Gradual)
- Deploy with feature flag
- Enable for 10% of requests
- Monitor metrics
- Gradually increase to 100%

### Step 4: Cleanup
- Remove old code (if safe)
- Update documentation
- Performance optimization

---

## Files Summary

### New Files
- `src/main/automation/page/field-extractor.ts` - Field extraction logic
- `src/main/automation/page/__tests__/field-extractor.test.ts` - Unit tests

### Modified Files
- `src/main/automation/page-manager.ts` - Add `extractFields()` method
- `src/main/services/ai.service.ts` - Update to accept structured fields
- `src/main/services/automation.service.ts` - Update to use new extraction
- `src/shared/types/gemini.types.ts` - Review/align types (if needed)

### Estimated Lines of Code
- New: ~400-500 lines
- Modified: ~100-150 lines
- Tests: ~200-300 lines
- **Total**: ~700-950 lines

---

## Next Steps After Phase 1

Once Phase 1 is complete and validated:

1. **Phase 2**: Parallel Field Filling
2. **Phase 3**: Optimize Progressive Strategy
3. **Phase 4**: Improve JSON Parsing
4. **Phase 5**: Add Caching Layer

---

## Questions & Notes

- Should we keep `extractHtml()` for backward compatibility? **Yes, as optional context**
- Should HTML context be included by default? **No, only if screenshots enabled**
- What's the max field limit? **No limit by default, but configurable**
- Should we cache extracted fields? **Not in Phase 1, consider in Phase 5**

### Prompt Refinement (Recommended)

Add this rule to reduce ambiguity when multiple fields are semantically similar:
- Prefer the field with:
  1. explicit `labelText` (non-empty)
  2. `required=true`
  3. earlier DOM order (`index` ascending)

---

## References

- `toyVersion/src/main.js` (lines 155-291) - Reference implementation
- `src/shared/types/automation.types.ts` - `HtmlField` type definition
- `src/shared/types/gemini.types.ts` - `HtmlFieldForGemini` type definition
- `docs/AUTOMATION_ANALYSIS.md` - Overall analysis document
