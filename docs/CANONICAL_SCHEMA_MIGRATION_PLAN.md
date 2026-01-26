# Canonical Field Schema Migration - Implementation Plan

## Executive Summary

**Goal**: Migrate from flat `HtmlField` schema to semantic, structured canonical schema that enables robust SPA field discovery and improves AI understanding.

**Current Schema**: Flat structure with `uniqueSelector` as primary identifier (fragile for SPAs)  
**Target Schema**: Semantic structure with `accessibleName` as primary identifier, `fallback.selector` as last resort

**Impact**: 
- ✅ Solves SPA selector fragility problem
- ✅ Enables semantic field discovery (label/aria/placeholder-based matching)
- ✅ Improves Gemini AI accuracy with structured data
- ✅ Provides interaction hints for fillers
- ✅ Better context for disambiguation

---

## Architecture Overview

### Current Flow
```
DOM → FieldExtractor → HtmlField[] (flat) → Gemini → AutomatedField → Fillers (use selector)
```

### Target Flow
```
DOM → FieldExtractor → CanonicalField[] (semantic) → Gemini → AutomatedField → Fillers (use accessibleName + fallback)
```

### Key Changes

1. **Primary Identifier**: `uniqueSelector` → `accessibleName` (semantic)
2. **Fallback Strategy**: Selector becomes fallback, not primary
3. **Structured Data**: Labels, state, validation, context separated
4. **Interaction Hints**: Explicit guidance for fillers
5. **Context**: Form index, section heading for disambiguation

---

## Schema Comparison

### Current Schema (`HtmlField`)
```typescript
{
  index: number;
  tagName: string;
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  labelText?: string;
  options?: { value: string; text: string }[];
  radioGroup?: string;
  radioOptions?: { value: string; label: string }[];
  uniqueSelector: string;  // ← PRIMARY (fragile)
  min?: string;
  max?: string;
  pattern?: string;
}
```

### Target Schema (`CanonicalField`)
```typescript
{
  fieldId: string;                    // Stable semantic ID
  tag: "input" | "select" | "textarea" | "button" | "div";
  controlType: "text" | "email" | "password" | "checkbox" | "radio" | "select" | "multiselect" | "search-select" | "date" | "file";
  role: "textbox" | "checkbox" | "radio" | "combobox" | "listbox" | "button";
  accessibleName: string;              // ← PRIMARY (semantic, robust)
  
  labels: {
    labelText: string | null;
    ariaLabel: string | null;
    ariaLabelledBy: string | null;
    placeholder: string | null;
  },
  
  group: {
    groupName: string | null;
    groupLabel: string | null;
  },
  
  options: Array<{
    value: string | null;
    label: string;
    selected: boolean;
    disabled: boolean;
  }>,
  
  state: {
    required: boolean;
    disabled: boolean;
    readonly: boolean;
    visible: boolean;
    checked: boolean;
    value: string | null;
  },
  
  validation: {
    min: number | null;
    max: number | null;
    pattern: string | null;
    minLength: number | null;
    maxLength: number | null;
  },
  
  context: {
    formIndex: number;
    sectionHeading: string | null;
    positionInForm: number;
  },
  
  interactionHints: {
    inputMode: "type" | "click" | "select" | "check" | "upload";
    blurAfterInput: boolean;
    requiresTypingDelay: boolean;
    opensDropdown: boolean;
    isSearchable: boolean;
  },
  
  fallback: {
    selector: string | null;           // ← FALLBACK (last resort)
    xpath: string | null;
  }
}
```

---

## Implementation Phases

### Phase 1: Type System & Core Infrastructure

**Goal**: Define new types, create utility functions for computation

#### 1.1 Type Definitions
- Create `CanonicalField` interface in `src/shared/types/automation.types.ts`
- Create helper types (`ControlType`, `InputMode`, `Role`, etc.)
- Maintain backward compatibility with `HtmlField` during migration

#### 1.2 Utility Functions
- `computeAccessibleName()`: Compute from labels/aria/placeholder
- `detectRole()`: Infer ARIA role from element
- `detectControlType()`: Map HTML type to semantic controlType
- `computeInteractionHints()`: Determine how to interact with field
- `extractContext()`: Detect form index, section heading

#### 1.3 Field ID Generation
- Create stable `fieldId` from semantic properties
- Hash-based ID for consistency across DOM changes

### Phase 2: Field Extractor Enhancement

**Goal**: Update `FieldExtractor` to produce canonical schema

#### 2.1 Browser-Side Extraction
- Enhance `RawFieldCandidate` to capture more metadata
- Extract section headings (h1-h6 near fields)
- Detect form boundaries
- Capture more ARIA attributes

#### 2.2 Node-Side Normalization
- Transform `RawFieldCandidate` → `CanonicalField`
- Compute `accessibleName` using utility
- Compute `role` and `controlType`
- Compute `interactionHints`
- Extract `context` (form index, section heading)
- Generate `fieldId`
- Build `fallback.selector` (current `uniqueSelector` logic)

#### 2.3 Grouping & Deduplication
- Update radio group handling for new schema
- Update OTP group handling
- Ensure `fieldId` uniqueness

### Phase 3: AI Service Updates

**Goal**: Update Gemini prompt to use canonical schema

#### 3.1 Prompt Updates
- Update prompt to reference `accessibleName` as primary
- Update field structure documentation
- Emphasize semantic matching over selector matching
- Update behavior type detection to use `controlType` and `interactionHints`

#### 3.2 Response Mapping
- Update `FieldMapper` to handle new schema
- Map `accessibleName` to `fieldLabel` in `AutomatedField`
- Use `fallback.selector` when needed

### Phase 4: Filler Updates

**Goal**: Update fillers to use semantic discovery

#### 4.1 Field Resolver Creation
- Create `FieldResolver` utility in `src/main/automation/utils/field-resolver.ts`
- Implement semantic discovery strategies:
  1. `accessibleName` matching
  2. Label text matching
  3. Aria-label matching
  4. Placeholder matching
  5. Role + accessible name
  6. Fallback selector (last resort)

#### 4.2 BaseFiller Updates
- Update `BaseFiller` to use `FieldResolver`
- Modify `AutomatedField` to include semantic metadata
- Update all fillers to use resolver instead of direct selectors

#### 4.3 Interaction Hints Integration
- Use `interactionHints.inputMode` to choose fill strategy
- Use `interactionHints.blurAfterInput` for blur timing
- Use `interactionHints.opensDropdown` for dropdown handling

### Phase 5: Testing & Validation

**Goal**: Comprehensive testing and validation

#### 5.1 Unit Tests
- Test `computeAccessibleName()` with various label strategies
- Test `detectRole()` and `detectControlType()`
- Test `computeInteractionHints()`
- Test `FieldResolver` semantic discovery

#### 5.2 Integration Tests
- Test field extraction on various form types
- Test SPA forms (React, Vue, Angular)
- Test forms without IDs/unique selectors
- Test radio groups, OTP groups, search-selects

#### 5.3 Regression Tests
- Ensure existing forms still work
- Test backward compatibility
- Validate Gemini response mapping

### Phase 6: Migration & Cleanup

**Goal**: Complete migration and remove old code

#### 6.1 Backward Compatibility
- Keep `HtmlField` type for checkpoint data
- Add migration utility to convert old checkpoints
- Update checkpoint loading to handle both schemas

#### 6.2 Documentation
- Update API documentation
- Update developer guides
- Create migration guide

#### 6.3 Cleanup
- Remove unused `HtmlField` references (where safe)
- Update all imports
- Remove deprecated code

---

## Detailed Component Changes

### 1. Type Definitions (`src/shared/types/automation.types.ts`)

**Add**:
```typescript
// Control types
export type ControlType = 
  | 'text' | 'email' | 'password' | 'tel' | 'number' | 'url'
  | 'checkbox' | 'radio' 
  | 'select' | 'multiselect' | 'search-select'
  | 'date' | 'datetime-local' | 'time' | 'month' | 'week'
  | 'file' | 'range' | 'color'
  | 'textarea';

// Input modes for interaction hints
export type InputMode = 'type' | 'click' | 'select' | 'check' | 'upload';

// ARIA roles
export type AriaRole = 
  | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'listbox' 
  | 'button' | 'link' | 'tab' | 'menuitem';

// Canonical field schema
export interface CanonicalField {
  fieldId: string;
  tag: 'input' | 'select' | 'textarea' | 'button' | 'div' | 'span';
  controlType: ControlType;
  role: AriaRole | null;
  accessibleName: string;
  
  labels: {
    labelText: string | null;
    ariaLabel: string | null;
    ariaLabelledBy: string | null;
    placeholder: string | null;
  };
  
  group: {
    groupName: string | null;
    groupLabel: string | null;
  } | null;
  
  options: Array<{
    value: string | null;
    label: string;
    selected: boolean;
    disabled: boolean;
  }>;
  
  state: {
    required: boolean;
    disabled: boolean;
    readonly: boolean;
    visible: boolean;
    checked: boolean;
    value: string | null;
  };
  
  validation: {
    min: number | null;
    max: number | null;
    pattern: string | null;
    minLength: number | null;
    maxLength: number | null;
  };
  
  context: {
    formIndex: number;
    sectionHeading: string | null;
    positionInForm: number;
  };
  
  interactionHints: {
    inputMode: InputMode;
    blurAfterInput: boolean;
    requiresTypingDelay: boolean;
    opensDropdown: boolean;
    isSearchable: boolean;
  };
  
  fallback: {
    selector: string | null;
    xpath: string | null;
  };
}
```

**Keep** `HtmlField` for backward compatibility during migration.

### 2. Field Extractor (`src/main/automation/page/field-extractor.ts`)

**Changes**:
- Add `extractCanonicalFields()` method
- Enhance `RawFieldCandidate` to capture:
  - Section headings (h1-h6)
  - Form boundaries
  - More ARIA attributes
  - Readonly state
  - Checked state (for checkboxes/radios)
- Add computation methods:
  - `computeAccessibleName()`
  - `detectRole()`
  - `detectControlType()`
  - `computeInteractionHints()`
  - `extractContext()`
  - `generateFieldId()`

### 3. Field Resolver (`src/main/automation/utils/field-resolver.ts`) - NEW

**Purpose**: Resolve fields using semantic discovery before falling back to selectors

**Methods**:
- `resolveField(field: AutomatedField): Promise<string | null>` - Returns working selector
- `findByAccessibleName(name: string): Promise<string | null>`
- `findByLabelText(text: string): Promise<string | null>`
- `findByAriaLabel(label: string): Promise<string | null>`
- `findByPlaceholder(placeholder: string): Promise<string | null>`
- `findByRoleAndName(role: string, name: string): Promise<string | null>`

### 4. AI Service (`src/main/services/ai.service.ts`)

**Changes**:
- Update prompt to reference `CanonicalField` structure
- Emphasize `accessibleName` as primary identifier
- Update behavior detection to use `controlType` and `interactionHints`
- Update field preference rules to use semantic properties

### 5. Base Filler (`src/main/automation/fillers/base-filler.ts`)

**Changes**:
- Add `FieldResolver` instance
- Update `fill()` method to resolve field before filling
- Update `AutomatedField` interface to include semantic metadata
- Use `interactionHints` to choose fill strategy

### 6. Field Mapper (`src/main/automation/mapping/field-mapper.ts`)

**Changes**:
- Map `accessibleName` to `fieldLabel`
- Use `fallback.selector` for `selector` field
- Preserve semantic metadata in `AutomatedField`

---

## Migration Strategy

### Backward Compatibility

1. **Dual Schema Support**: Support both `HtmlField` and `CanonicalField` during migration
2. **Checkpoint Migration**: Convert old checkpoints to new schema on load
3. **Gradual Rollout**: Feature flag to enable/disable canonical schema

### Rollout Plan

1. **Phase 1**: Implement types and utilities (no breaking changes)
2. **Phase 2**: Implement extractor, test in parallel with old system
3. **Phase 3**: Switch to canonical schema, validate, cleanup

### Risk Mitigation

- **Feature Flag**: `USE_CANONICAL_SCHEMA` environment variable
- **Fallback**: If canonical extraction fails, fall back to old schema
- **Logging**: Comprehensive logging for debugging
- **Testing**: Extensive testing before full rollout

---

## Success Criteria

1. ✅ All existing forms still work
2. ✅ SPA forms work without IDs/unique selectors
3. ✅ Semantic field discovery works (accessibleName matching)
4. ✅ Gemini accuracy improves (measured by confidence scores)
5. ✅ Fillers use interaction hints correctly
6. ✅ No performance regression

---

## Dependencies

- No new external dependencies required
- Uses existing Playwright APIs
- Uses existing TypeScript features

---

## Next Steps

1. Review and approve this plan
2. Create detailed task list (see `CANONICAL_SCHEMA_TASK_LIST.md`)
3. Set up feature flag infrastructure
4. Begin Phase 1 implementation
