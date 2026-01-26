# Schema Comparison: Current vs Canonical - Pre-Processing Analysis

## Overview

This document compares the **current `HtmlField` schema** (what you have now) with the **proposed `CanonicalField` schema** (what the migration plan suggests), specifically focusing on the **pre-processing of HTML DOM structure before sending to Gemini**.

---

## Current Implementation: `HtmlField` Schema

### JSON Structure (What You Currently Send to Gemini)

```json
{
  "index": 0,
  "tagName": "input",
  "type": "text",
  "name": "firstName",
  "id": "first-name",
  "placeholder": "Enter your first name",
  "value": "",
  "required": true,
  "className": "form-control",
  "ariaLabel": "First Name",
  "labelText": "First Name",
  "options": null,
  "radioGroup": null,
  "radioOptions": null,
  "uniqueSelector": "#first-name",
  "min": null,
  "max": null,
  "pattern": null
}
```

### Field Descriptions (Current Implementation)

| Key | Type | Description | Source |
|-----|------|-------------|--------|
| `index` | `number` | Sequential index of field in extraction order | Node-side counter |
| `tagName` | `string` | HTML tag name (`input`, `select`, `textarea`, `button`) | Browser-side DOM |
| `type` | `string` | Input type (`text`, `email`, `password`, `checkbox`, `radio`, etc.) | Browser-side DOM |
| `name` | `string?` | HTML `name` attribute | Browser-side DOM |
| `id` | `string?` | HTML `id` attribute | Browser-side DOM |
| `placeholder` | `string?` | HTML `placeholder` attribute | Browser-side DOM |
| `value` | `string?` | Current field value | Browser-side DOM |
| `required` | `boolean?` | HTML `required` attribute | Browser-side DOM |
| `className` | `string?` | HTML `class` attribute | Browser-side DOM |
| `ariaLabel` | `string?` | ARIA `aria-label` attribute | Browser-side DOM |
| `labelText` | `string?` | Text from associated `<label>` element | Node-side re-query |
| `options` | `Array?` | For `<select>`: `[{value: string, text: string}]` | Node-side re-query |
| `radioGroup` | `string?` | Radio group name (if radio button) | Browser-side DOM |
| `radioOptions` | `Array?` | For radio groups: `[{value: string, label: string}]` | Node-side re-query |
| `uniqueSelector` | `string` | **PRIMARY IDENTIFIER** - CSS selector (validated unique) | Node-side generated |
| `min` | `string?` | HTML `min` attribute | Browser-side DOM |
| `max` | `string?` | HTML `max` attribute | Browser-side DOM |
| `pattern` | `string?` | HTML `pattern` attribute | Browser-side DOM |

### Current Pre-Processing Flow

1. **Browser-side extraction** (`page.evaluate()`):
   - Extracts raw DOM attributes (id, name, type, placeholder, aria-label, etc.)
   - Captures label text via `getLabelTextBrowser()` function
   - Returns serializable `RawFieldCandidate[]`

2. **Node-side normalization** (`normalizeRawFields()`):
   - Re-queries labels if browser-side capture failed
   - Extracts select/radio options
   - Generates `uniqueSelector` with validation (count === 1)
   - Deduplicates radio groups and OTP groups
   - Filters insignificant fields

3. **Sent to Gemini**:
   - `HtmlField[]` array as JSON
   - Used in prompt template: `{htmlFields}`

---

## Proposed Canonical Schema: `CanonicalField`

### JSON Structure (What Migration Plan Suggests)

```json
{
  "fieldId": "hash_abc123",
  "tag": "input",
  "controlType": "text",
  "role": "textbox",
  "accessibleName": "First Name",
  
  "labels": {
    "labelText": "First Name",
    "ariaLabel": "First Name",
    "ariaLabelledBy": null,
    "placeholder": "Enter your first name"
  },
  
  "group": {
    "groupName": null,
    "groupLabel": null
  },
  
  "options": [
    {
      "value": "option1",
      "label": "Option 1",
      "selected": false,
      "disabled": false
    }
  ],
  
  "state": {
    "required": true,
    "disabled": false,
    "readonly": false,
    "visible": true,
    "checked": false,
    "value": ""
  },
  
  "validation": {
    "min": null,
    "max": null,
    "pattern": null,
    "minLength": null,
    "maxLength": null
  },
  
  "context": {
    "formIndex": 0,
    "sectionHeading": "Personal Information",
    "positionInForm": 2
  },
  
  "interactionHints": {
    "inputMode": "type",
    "blurAfterInput": true,
    "requiresTypingDelay": false,
    "opensDropdown": false,
    "isSearchable": false
  },
  
  "fallback": {
    "selector": "#first-name",
    "xpath": "/html/body/form/input[1]"
  }
}
```

### Field Descriptions (Proposed Canonical Schema)

| Key | Type | Description | Source | **Can Ignore?** |
|-----|------|-------------|--------|-----------------|
| `fieldId` | `string` | Stable semantic ID (hash-based) | Node-side computed | ❌ **NO** - Used for stable identification |
| `tag` | `string` | HTML tag name | Browser-side DOM | ❌ **NO** - Essential for element type |
| `controlType` | `string` | Semantic control type (`text`, `email`, `select`, etc.) | Node-side computed | ❌ **NO** - Critical for AI understanding |
| `role` | `string?` | ARIA role (`textbox`, `checkbox`, `combobox`, etc.) | Node-side computed | ⚠️ **MAYBE** - Helpful but can infer from controlType |
| `accessibleName` | `string` | **PRIMARY IDENTIFIER** - Computed from labels/aria/placeholder | Node-side computed | ❌ **NO** - **CRITICAL** - Primary semantic identifier |
| `labels.labelText` | `string?` | Text from `<label>` element | Node-side re-query | ❌ **NO** - Part of accessibleName computation |
| `labels.ariaLabel` | `string?` | ARIA `aria-label` | Browser-side DOM | ❌ **NO** - Part of accessibleName computation |
| `labels.ariaLabelledBy` | `string?` | ARIA `aria-labelledby` | Browser-side DOM | ⚠️ **MAYBE** - Used for accessibleName, but redundant if accessibleName exists |
| `labels.placeholder` | `string?` | HTML `placeholder` | Browser-side DOM | ❌ **NO** - Part of accessibleName computation |
| `group.groupName` | `string?` | Radio/checkbox group name | Browser-side DOM | ⚠️ **MAYBE** - Only relevant for radio/checkbox groups |
| `group.groupLabel` | `string?` | Radio/checkbox group label | Node-side computed | ⚠️ **MAYBE** - Only relevant for radio/checkbox groups |
| `options[]` | `Array` | Select/radio options with metadata | Node-side re-query | ❌ **NO** - Essential for select/radio fields |
| `options[].value` | `string?` | Option value | Browser-side DOM | ❌ **NO** - Required for selection |
| `options[].label` | `string` | Option display text | Browser-side DOM | ❌ **NO** - Required for AI matching |
| `options[].selected` | `boolean` | Whether option is currently selected | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical |
| `options[].disabled` | `boolean` | Whether option is disabled | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical |
| `state.required` | `boolean` | HTML `required` attribute | Browser-side DOM | ❌ **NO** - Important for validation |
| `state.disabled` | `boolean` | HTML `disabled` attribute | Browser-side DOM | ⚠️ **MAYBE** - Helpful but can be inferred |
| `state.readonly` | `boolean` | HTML `readonly` attribute | Browser-side DOM | ⚠️ **MAYBE** - Rarely used, can be ignored |
| `state.visible` | `boolean` | Computed visibility | Browser-side computed | ⚠️ **MAYBE** - Helpful but can be inferred |
| `state.checked` | `boolean` | For checkboxes/radios | Browser-side DOM | ❌ **NO** - Important for checkbox/radio |
| `state.value` | `string?` | Current field value | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical for mapping |
| `validation.min` | `number?` | HTML `min` attribute (numeric) | Browser-side DOM | ⚠️ **MAYBE** - Only relevant for number/date inputs |
| `validation.max` | `number?` | HTML `max` attribute (numeric) | Browser-side DOM | ⚠️ **MAYBE** - Only relevant for number/date inputs |
| `validation.pattern` | `string?` | HTML `pattern` attribute | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical |
| `validation.minLength` | `number?` | HTML `minlength` attribute | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical |
| `validation.maxLength` | `number?` | HTML `maxlength` attribute | Browser-side DOM | ⚠️ **MAYBE** - Helpful but not critical |
| `context.formIndex` | `number` | Index of form on page | Node-side computed | ⚠️ **MAYBE** - Only relevant if multiple forms |
| `context.sectionHeading` | `string?` | Nearest h1-h6 heading | Node-side computed | ⚠️ **MAYBE** - Helpful for disambiguation but not critical |
| `context.positionInForm` | `number` | Position within form | Node-side computed | ⚠️ **MAYBE** - Helpful but not critical |
| `interactionHints.inputMode` | `string` | How to interact (`type`, `click`, `select`, etc.) | Node-side computed | ❌ **NO** - **CRITICAL** - Tells fillers how to interact |
| `interactionHints.blurAfterInput` | `boolean` | Whether to blur after typing | Node-side computed | ⚠️ **MAYBE** - Helpful but can be inferred |
| `interactionHints.requiresTypingDelay` | `boolean` | Whether typing delay needed | Node-side computed | ⚠️ **MAYBE** - Helpful but can be inferred |
| `interactionHints.opensDropdown` | `boolean` | Whether field opens dropdown | Node-side computed | ⚠️ **MAYBE** - Helpful but can be inferred |
| `interactionHints.isSearchable` | `boolean` | Whether field is searchable | Node-side computed | ⚠️ **MAYBE** - Helpful but can be inferred |
| `fallback.selector` | `string?` | **FALLBACK** CSS selector (last resort) | Node-side generated | ❌ **NO** - **CRITICAL** - Used when semantic matching fails |
| `fallback.xpath` | `string?` | XPath selector | Node-side generated | ✅ **YES** - **NOISE** - XPath is rarely used, can be ignored |

---

## Key Differences Summary

### Primary Identifier
- **Current**: `uniqueSelector` (CSS selector) - **FRAGILE** for SPAs
- **Proposed**: `accessibleName` (semantic) - **ROBUST** for SPAs

### Structure
- **Current**: Flat structure with optional fields
- **Proposed**: Nested structure (labels, state, validation, context, interactionHints, fallback)

### Pre-Processing
- **Current**: 
  - Browser extracts raw attributes
  - Node-side generates selector and validates uniqueness
  - Selector is PRIMARY identifier
  
- **Proposed**:
  - Browser extracts raw attributes + section headings + form boundaries
  - Node-side computes `accessibleName` from labels/aria/placeholder
  - Node-side computes `role`, `controlType`, `interactionHints`
  - Node-side generates `fieldId` (stable hash)
  - Selector becomes FALLBACK (last resort)

---

## Fields That Can Be Ignored (Noise)

### ✅ **Safe to Ignore** (Low Value for Gemini AI)

1. **`fallback.xpath`** - XPath is rarely used, CSS selectors are preferred
2. **`state.readonly`** - Rarely used attribute, can be inferred if needed
3. **`state.visible`** - Can be inferred from extraction process (hidden fields filtered)
4. **`state.value`** - Current value is less important than field structure for mapping
5. **`options[].selected`** - Current selection state less important than available options
6. **`options[].disabled`** - Disabled options can be filtered client-side if needed
7. **`validation.minLength` / `validation.maxLength`** - Less critical than pattern/type
8. **`context.formIndex`** - Only relevant if multiple forms (rare)
9. **`context.positionInForm`** - Less critical than semantic identifiers
10. **`interactionHints.blurAfterInput`** - Can be inferred from controlType
11. **`interactionHints.requiresTypingDelay`** - Can be inferred from controlType
12. **`interactionHints.opensDropdown`** - Can be inferred from controlType
13. **`interactionHints.isSearchable`** - Can be inferred from controlType
14. **`role`** - Can be inferred from `controlType` and `tag`

### ⚠️ **Conditionally Useful** (Keep if Easy to Compute)

1. **`labels.ariaLabelledBy`** - Redundant if `accessibleName` is computed correctly
2. **`group.groupName` / `group.groupLabel`** - Only relevant for radio/checkbox groups
3. **`state.disabled`** - Helpful but can be inferred
4. **`validation.min` / `validation.max`** - Only relevant for number/date inputs
5. **`validation.pattern`** - Helpful but not critical
6. **`context.sectionHeading`** - Helpful for disambiguation but not critical

### ❌ **Must Keep** (Critical for Gemini AI)

1. **`fieldId`** - Stable identifier
2. **`tag`** - Element type
3. **`controlType`** - Semantic control type (critical for AI understanding)
4. **`accessibleName`** - **PRIMARY IDENTIFIER** (most important)
5. **`labels.labelText`** - Part of accessibleName computation
6. **`labels.ariaLabel`** - Part of accessibleName computation
7. **`labels.placeholder`** - Part of accessibleName computation
8. **`options[]`** - Essential for select/radio fields
9. **`state.required`** - Important for validation
10. **`state.checked`** - Important for checkbox/radio
11. **`interactionHints.inputMode`** - **CRITICAL** - Tells fillers how to interact
12. **`fallback.selector`** - **CRITICAL** - Last resort for field resolution

---

## Recommended Minimal Canonical Schema (For Gemini)

If you want to reduce token usage while keeping essential information:

```json
{
  "fieldId": "hash_abc123",
  "tag": "input",
  "controlType": "text",
  "accessibleName": "First Name",
  "labels": {
    "labelText": "First Name",
    "ariaLabel": "First Name",
    "placeholder": "Enter your first name"
  },
  "options": [
    {
      "value": "option1",
      "label": "Option 1"
    }
  ],
  "state": {
    "required": true,
    "checked": false
  },
  "interactionHints": {
    "inputMode": "type"
  },
  "fallback": {
    "selector": "#first-name"
  }
}
```

**Removed (Noise)**:
- `role` (infer from controlType)
- `labels.ariaLabelledBy` (redundant)
- `group` (only for radio/checkbox, can add conditionally)
- `state.disabled`, `state.readonly`, `state.visible`, `state.value` (can infer)
- `validation` (less critical for mapping)
- `context` (less critical for mapping)
- `interactionHints` flags (can infer from inputMode)
- `fallback.xpath` (not used)

---

## Pre-Processing Comparison

### Current Pre-Processing (Before Sending to Gemini)

1. **Browser-side** (`page.evaluate()`):
   - Extract: `id`, `name`, `type`, `placeholder`, `ariaLabel`, `ariaLabelledBy`, `role`, `required`, `value`, `min`, `max`, `pattern`, `className`
   - Capture label text via `getLabelTextBrowser()`
   - Return: `RawFieldCandidate[]`

2. **Node-side** (`normalizeRawFields()`):
   - Re-query labels if needed
   - Extract select/radio options
   - Generate `uniqueSelector` (validated unique)
   - Deduplicate groups
   - Filter insignificant fields
   - Return: `HtmlField[]`

3. **Sent to Gemini**: `HtmlField[]` JSON

### Proposed Pre-Processing (Canonical Schema)

1. **Browser-side** (`page.evaluate()`):
   - Extract: All current attributes PLUS
   - `readonly`, `checked`, `disabled`, `visible`
   - `minLength`, `maxLength`
   - Section headings (h1-h6 near fields)
   - Form boundaries (form index)
   - Return: Enhanced `RawFieldCandidate[]`

2. **Node-side** (`buildCanonicalField()`):
   - Compute `accessibleName` from labels/aria/placeholder
   - Detect `role` from element attributes
   - Detect `controlType` from tag/type
   - Compute `interactionHints` from controlType
   - Extract `context` (form index, section heading, position)
   - Generate `fieldId` (stable hash)
   - Build nested structure (labels, state, validation, context, interactionHints, fallback)
   - Return: `CanonicalField[]`

3. **Sent to Gemini**: `CanonicalField[]` JSON (or minimal version)

---

## Conclusion

**Current Implementation**:
- ✅ Simple, flat structure
- ❌ Fragile selectors (SPA problem)
- ❌ Less semantic information for AI

**Proposed Canonical Schema**:
- ✅ Semantic primary identifier (`accessibleName`)
- ✅ Structured data (better AI understanding)
- ✅ Interaction hints (better filler guidance)
- ⚠️ More complex structure
- ⚠️ More computation required

**Recommendation**:
- Keep essential fields: `fieldId`, `tag`, `controlType`, `accessibleName`, `labels`, `options`, `state.required`, `state.checked`, `interactionHints.inputMode`, `fallback.selector`
- Ignore noise: `fallback.xpath`, `state.readonly`, `state.visible`, `state.value`, `validation.*`, `context.*`, redundant `interactionHints.*` flags
- This reduces token usage while maintaining critical information for Gemini AI
