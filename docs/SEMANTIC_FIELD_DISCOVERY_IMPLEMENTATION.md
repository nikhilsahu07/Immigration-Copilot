# Semantic Field Discovery Implementation Summary

## Overview

This document describes the major architectural changes implemented to migrate from selector-based field discovery to semantic field discovery using `fieldId` and canonical schema. This enables robust form filling for SPAs where DOM structure changes frequently.

---

## Architecture Changes

### 1. **In-Memory Canonical Fields Map**

**File**: `src/main/automation/utils/canonical-fields-map.ts` (NEW)

**Purpose**: Maintains a lookup map of `fieldId → CanonicalField` for the current page during automation.

**Key Features**:
- `initialize(fields: CanonicalField[])` - Initialize map with canonical fields
- `getByFieldId(fieldId: string)` - Primary lookup method
- `getByAccessibleName(name: string)` - Secondary lookup for disambiguation
- Cleared when page changes

**Usage**:
```typescript
const map = new CanonicalFieldsMap();
map.initialize(canonicalFields);
const field = map.getByFieldId('field_abc123');
```

---

### 2. **Field Resolver for Semantic Discovery**

**File**: `src/main/automation/utils/field-resolver.ts` (NEW)

**Purpose**: Resolves canonical fields to Playwright locators using semantic discovery strategies.

**Discovery Priority**:
1. `getByRole(role, accessibleName)` - Most reliable for SPAs
2. `getByLabel(labelText)` - Label text matching
3. `getByPlaceholder(placeholder)` - Placeholder matching
4. `getByText(text)` - Text content matching (for buttons/links)
5. `fallback.selector` - Last resort (CSS selector)

**Key Methods**:
- `resolveField(field: CanonicalField)` - Main resolution method
- `findByAccessibleName(name, role?)` - Find by accessible name
- `findByLabelText(text)` - Find by label
- `findByPlaceholder(placeholder)` - Find by placeholder
- `findByRoleAndName(role, name)` - Find by role + name

**Usage**:
```typescript
const resolver = new FieldResolver(page);
const resolved = await resolver.resolveField(canonicalField);
if (resolved) {
  const { locator, strategy } = resolved;
  // Use locator for filling
}
```

---

### 3. **Updated Gemini Prompt**

**File**: `src/main/services/ai.service.ts`

**Changes**:
- **Before**: Asked for `selector` field
- **After**: Asks for `fieldId` field (required)

**Prompt Updates**:
- Fields sent to Gemini are **filtered** (only form fields, not navigation links)
- Response structure now requires `fieldId` instead of `selector`
- Actions can optionally include `fieldId` for semantic discovery

**Example Response Structure**:
```json
{
  "fields": [
    {
      "fieldId": "field_abc123",  // REQUIRED - from canonical schema
      "fieldName": "First Name",
      "behavior": "text_entry",
      "expectedValue": "John",
      "confidence": "high"
    }
  ],
  "actions": [
    {
      "fieldId": "field_xyz789",  // OPTIONAL - if button is in canonical fields
      "expectedText": "Submit",
      "intent": "primary_navigation"
    }
  ]
}
```

---

### 4. **Updated Field Mapper**

**File**: `src/main/automation/mapping/field-mapper.ts`

**Changes**:
- Now accepts `CanonicalFieldsMap` parameter
- Maps Gemini response `fieldId` to canonical fields from map
- Populates `AutomatedField` with semantic metadata (accessibleName, role, labels)

**New Signature**:
```typescript
static mapFields(
  aiFields: any[], 
  canonicalFieldsMap: CanonicalFieldsMap,  // NEW
  documentLookup?: Map<string, string>
): AutomatedField[]
```

**Mapping Logic**:
1. Lookup canonical field by `fieldId` from Gemini response
2. Fallback: Try to find by `accessibleName` if `fieldId` not provided
3. Populate `AutomatedField` with:
   - `fieldId` - Primary identifier
   - `accessibleName` - Semantic name
   - `role` - ARIA role
   - `labels` - Label information
   - `selector` - Fallback only (for backward compatibility)

---

### 5. **Updated BaseFiller**

**File**: `src/main/automation/fillers/base-filler.ts`

**Changes**:
- Added `FieldResolver` instance
- Added `setCanonicalField(field: CanonicalField)` method
- Updated `fill()` method to resolve fields semantically before filling
- Added `getLocator(field)` helper method

**New Flow**:
1. If canonical field is set, use `FieldResolver.resolveField()` to get locator
2. Fallback to selector if semantic resolution fails
3. Store resolved locator in `field.resolvedLocator`
4. All fill strategies now use `getLocator(field)` instead of `field.selector`

**Updated AutomatedField Interface**:
```typescript
export interface AutomatedField {
  // ... existing fields ...
  fieldId?: string;  // NEW
  accessibleName?: string;  // NEW
  role?: string;  // NEW
  labels?: { ... };  // NEW
  resolvedLocator?: any;  // NEW - set by FieldResolver
  resolvedStrategy?: string;  // NEW - which strategy worked
}
```

---

### 6. **Updated Fillers (Text, Select, etc.)**

**Files Updated**:
- `src/main/automation/fillers/text-filler.ts` ✅
- `src/main/automation/fillers/select-filler.ts` ✅
- `src/main/automation/fillers/radio-filler.ts` (needs update)
- `src/main/automation/fillers/checkbox-filler.ts` (needs update)
- Other fillers follow same pattern

**Pattern for All Fillers**:
Replace all `field.selector` usage with `this.getLocator(field)`:

**Before**:
```typescript
await this.page.fill(field.selector, value);
await this.scrollToElement(field.selector);
```

**After**:
```typescript
const locator = this.getLocator(field);
await locator.fill(value);
await this.scrollToLocator(locator);
```

**Methods to Update in Each Filler**:
- `tryNativeFill()` - Use `getLocator()` instead of `field.selector`
- `tryDomFill()` - Use `locator.evaluate()` instead of `page.evaluate(selector)`
- `tryUILibraryFill()` - Use `locator.click()` instead of `page.click(selector)`
- `tryKeyboardFill()` - Use `locator.click()` instead of `page.click(selector)`
- `verifyFill()` - Use `locator.inputValue()` or `locator.evaluate()` instead of `page.inputValue(selector)`

---

### 7. **Updated Actions**

**File**: `src/main/automation/actions/click-handler.ts`

**Changes**:
- Updated `executeActions()` to prioritize semantic discovery
- New priority order:
  1. `getByRole('button', expectedText)` - Most reliable
  2. `getByText(expectedText)` - Text matching
  3. `clickButtonWithText(selector, expectedText)` - Fallback
  4. `executeClick(selector)` - Last resort

**File**: `src/main/services/automation.service.ts`

**Changes**:
- Actions now support `fieldId` for semantic discovery
- `processDashboardPage()` passes `fieldId` to actions

---

### 8. **Updated AutomationService**

**File**: `src/main/services/automation.service.ts`

**Changes**:
- Added `canonicalFieldsMap: CanonicalFieldsMap` as instance variable
- Initialize map after extracting canonical fields
- Pass map to field mapping and filling operations
- Map persists during page processing, cleared on page change

**Key Updates**:
1. **Field Extraction**: Initialize map after `extractCanonicalFields()`
2. **Field Mapping**: Lookup canonical fields by `fieldId` from Gemini response
3. **Field Filling**: Set canonical field on fillers before filling
4. **Actions**: Use semantic discovery for button clicks

**Example Flow**:
```typescript
// 1. Extract canonical fields
const canonicalFields = await pageManager.extractCanonicalFields();

// 2. Initialize map
this.canonicalFieldsMap.initialize(canonicalFields);

// 3. Send filtered fields to Gemini
const filteredFields = filterFormFields(canonicalFields);
// ... send to Gemini ...

// 4. Map Gemini response (with fieldId) to canonical fields
const automatedFields = FieldMapper.mapFields(
  aiResult.fields,
  this.canonicalFieldsMap,  // Lookup map
  documentLookup
);

// 5. Fill fields with semantic discovery
for (const field of automatedFields) {
  const canonicalField = this.canonicalFieldsMap.getByFieldId(field.fieldId!);
  filler.setCanonicalField(canonicalField);
  await filler.fill(field);
}
```

---

## Data Flow

### Before (Selector-Based)
```
DOM → FieldExtractor → HtmlField[] (with uniqueSelector)
  → Gemini (returns selector)
  → Fillers (use selector directly)
  → ❌ Breaks on SPA DOM changes
```

### After (Semantic-Based)
```
DOM → FieldExtractor → CanonicalField[] (with fieldId, accessibleName)
  → CanonicalFieldsMap (in-memory lookup)
  → Gemini (returns fieldId) ← Filtered fields (less noise)
  → FieldMapper (lookup by fieldId)
  → Fillers (use FieldResolver for semantic discovery)
  → ✅ Works on SPAs (semantic matching)
```

---

## Key Benefits

1. **SPA Compatibility**: Semantic discovery works even when DOM structure changes
2. **Reduced Token Usage**: Only form fields sent to Gemini (not navigation links)
3. **Better Accuracy**: Gemini returns `fieldId` instead of generating selectors
4. **Robust Field Discovery**: Multiple fallback strategies (role → label → placeholder → selector)
5. **In-Memory Lookup**: Fast field resolution using `fieldId`

---

## Remaining Work

### Fillers to Update (Same Pattern)
- [ ] `radio-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `checkbox-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `date-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `file-upload-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `otp-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `search-select-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `masked-text-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `consent-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `toggle-filler.ts` - Replace `field.selector` with `getLocator(field)`
- [ ] `range-slider-filler.ts` - Replace `field.selector` with `getLocator(field)`

**Pattern for Each**:
1. Replace `field.selector` → `this.getLocator(field)`
2. Replace `this.page.fill(selector)` → `locator.fill()`
3. Replace `this.page.click(selector)` → `locator.click()`
4. Replace `this.page.evaluate((sel) => ...)` → `locator.evaluate((el) => ...)`
5. Replace `this.scrollToElement(selector)` → `this.scrollToLocator(locator)`

---

## Testing Checklist

- [ ] Test form filling on standard HTML forms
- [ ] Test form filling on React SPAs (no IDs)
- [ ] Test form filling on Vue SPAs
- [ ] Test form filling on Angular SPAs
- [ ] Test dashboard navigation (semantic button discovery)
- [ ] Test field resolution with multiple fields with same name
- [ ] Test fallback to selector when semantic discovery fails
- [ ] Verify canonical fields map is cleared on page change
- [ ] Verify filtered fields are sent to Gemini (not navigation links)

---

## Migration Notes

1. **Backward Compatibility**: `selector` field is still supported as fallback
2. **Gradual Migration**: Fillers can work with or without canonical fields
3. **Error Handling**: Falls back to selector if semantic discovery fails
4. **Logging**: All resolution strategies are logged for debugging

---

## Files Created

1. `src/main/automation/utils/field-resolver.ts` - Semantic field discovery
2. `src/main/automation/utils/canonical-fields-map.ts` - In-memory lookup map
3. `src/main/automation/utils/canonical-field-logger.ts` - Logging utilities (already existed)

## Files Modified

1. `src/shared/types/automation.types.ts` - Added `CanonicalField` type (removed `fallback.xpath`)
2. `src/main/automation/fillers/base-filler.ts` - Added semantic discovery
3. `src/main/automation/fillers/text-filler.ts` - Updated to use semantic locators
4. `src/main/automation/fillers/select-filler.ts` - Updated to use semantic locators
5. `src/main/automation/mapping/field-mapper.ts` - Updated to use fieldId lookup
6. `src/main/services/ai.service.ts` - Updated prompt to ask for fieldId
7. `src/main/services/automation.service.ts` - Added canonical fields map management
8. `src/main/automation/actions/click-handler.ts` - Prioritized semantic discovery
9. `src/main/automation/fillers/behavior-filler-factory.ts` - Removed selector parameter

---

## Summary

The system now uses **semantic field discovery** instead of selector-based discovery:

1. **Extraction**: Canonical fields extracted with `fieldId` and `accessibleName`
2. **Storage**: In-memory map maintains `fieldId → CanonicalField` lookup
3. **Gemini**: Receives filtered canonical fields, returns `fieldId` in response
4. **Mapping**: `fieldId` from Gemini response → lookup canonical field from map
5. **Filling**: FieldResolver uses semantic discovery (getByRole, getByLabel, etc.)
6. **Actions**: Semantic discovery for button clicks (getByRole, getByText)

This architecture is **robust for SPAs** because it relies on semantic identifiers (accessibleName, labels) rather than DOM structure (selectors).
