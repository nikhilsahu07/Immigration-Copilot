# Canonical Field Schema Migration - Detailed Task List

## Overview

This document provides a detailed, actionable task list for migrating from the current `HtmlField` schema to the canonical semantic schema. Each task includes acceptance criteria, dependencies, and estimated effort.

---

## Phase 1: Type System & Core Infrastructure

### Task 1.1: Define CanonicalField Type
**File**: `src/shared/types/automation.types.ts`  

**Description**: Add the complete `CanonicalField` interface and supporting types.

**Acceptance Criteria**:
- [ ] `CanonicalField` interface defined with all required fields
- [ ] `ControlType` type union defined
- [ ] `InputMode` type union defined
- [ ] `AriaRole` type union defined
- [ ] All types exported from module
- [ ] TypeScript compilation passes
- [ ] Types documented with JSDoc comments

**Implementation Notes**:
- Keep `HtmlField` interface for backward compatibility
- Add `@deprecated` tag to `HtmlField` with migration note
- Ensure all optional fields are properly typed (nullable vs undefined)

---

### Task 1.2: Create Accessible Name Computation Utility
**File**: `src/main/automation/utils/accessible-name.ts` (NEW)  
**Effort**: 4 hours  
**Dependencies**: Task 1.1

**Description**: Create utility function to compute accessible name from labels, aria-label, placeholder, etc.

**Function Signature**:
```typescript
export function computeAccessibleName(field: {
  labelText?: string | null;
  ariaLabel?: string | null;
  ariaLabelledBy?: string | null;
  placeholder?: string | null;
  id?: string | null;
  name?: string | null;
}): string
```

**Priority Order**:
1. `ariaLabel` (if present)
2. `labelText` (if present)
3. `ariaLabelledBy` → resolve element text (if present)
4. `placeholder` (if present)
5. `name` attribute (if present)
6. `id` attribute (if present)
7. Empty string (fallback)

**Acceptance Criteria**:
- [ ] Function handles all label strategies
- [ ] Returns non-empty string when possible
- [ ] Handles null/undefined gracefully
- [ ] Unit tests cover all strategies
- [ ] Edge cases tested (empty strings, whitespace-only)

**Test Cases**:
- Field with aria-label only
- Field with label[for] only
- Field with placeholder only
- Field with multiple labels (priority order)
- Field with no labels (fallback to name/id)

---

### Task 1.3: Create Role Detection Utility
**File**: `src/main/automation/utils/role-detector.ts` (NEW)  
**Dependencies**: Task 1.1

**Description**: Create utility to detect ARIA role from element attributes and type.

**Function Signature**:
```typescript
export function detectRole(element: {
  tag: string;
  type?: string;
  role?: string | null;
  className?: string | null;
}): AriaRole | null
```

**Detection Logic**:
1. Explicit `role` attribute (if valid)
2. Infer from `tag` + `type`:
   - `input[type="text"]` → `textbox`
   - `input[type="checkbox"]` → `checkbox`
   - `input[type="radio"]` → `radio`
   - `select` → `combobox` or `listbox`
   - `textarea` → `textbox`
   - `button` → `button`
3. Infer from UI library classes (MUI, Bootstrap, etc.)
4. Return `null` if cannot determine

**Acceptance Criteria**:
- [ ] Handles explicit role attribute
- [ ] Infers role from tag+type combinations
- [ ] Detects UI library roles
- [ ] Returns null for unknown elements
- [ ] Unit tests cover all cases

---

### Task 1.4: Create Control Type Detection Utility
**File**: `src/main/automation/utils/control-type-detector.ts` (NEW)  
**Dependencies**: Task 1.1

**Description**: Map HTML input types and elements to semantic control types.

**Function Signature**:
```typescript
export function detectControlType(element: {
  tag: string;
  type?: string;
  className?: string | null;
  role?: string | null;
}): ControlType
```

**Mapping Logic**:
- `input[type="text"]` → `text`
- `input[type="email"]` → `email`
- `input[type="password"]` → `password`
- `input[type="tel"]` → `tel`
- `input[type="number"]` → `number`
- `input[type="date"]` → `date`
- `input[type="file"]` → `file`
- `input[type="checkbox"]` → `checkbox`
- `input[type="radio"]` → `radio`
- `select` → `select` (or `multiselect` if multiple)
- `textarea` → `textarea`
- Custom components (search-select, etc.) detected via classes/attributes

**Acceptance Criteria**:
- [ ] Maps all standard HTML types
- [ ] Detects custom components (search-select, etc.)
- [ ] Handles edge cases (missing type, unknown types)
- [ ] Unit tests cover all mappings

---

### Task 1.5: Create Interaction Hints Computation Utility
**File**: `src/main/automation/utils/interaction-hints.ts` (NEW)  
**Dependencies**: Task 1.1, Task 1.4

**Description**: Determine how to interact with a field based on its type and properties.

**Function Signature**:
```typescript
export function computeInteractionHints(field: {
  controlType: ControlType;
  tag: string;
  className?: string | null;
  role?: string | null;
  options?: Array<{ value: string; label: string }>;
}): {
  inputMode: InputMode;
  blurAfterInput: boolean;
  requiresTypingDelay: boolean;
  opensDropdown: boolean;
  isSearchable: boolean;
}
```

**Logic**:
- `inputMode`:
  - `text`, `email`, `tel`, `number`, `textarea` → `type`
  - `checkbox`, `radio` → `check`
  - `select` → `select`
  - `search-select` → `type` (with `isSearchable: true`)
  - `file` → `upload`
  - `button` → `click`
- `blurAfterInput`: true for text inputs, false for checkboxes/radios
- `requiresTypingDelay`: true for search-selects, false otherwise
- `opensDropdown`: true for select/search-select, false otherwise
- `isSearchable`: true for search-select, false otherwise

**Acceptance Criteria**:
- [ ] Correct inputMode for all control types
- [ ] Accurate boolean flags
- [ ] Handles custom components
- [ ] Unit tests cover all combinations

---

### Task 1.6: Create Context Extraction Utility
**File**: `src/main/automation/utils/context-extractor.ts` (NEW)  
**Description**: Extract form context (form index, section heading, position).

**Function Signature**:
```typescript
export async function extractContext(
  page: Page,
  elementSelector: string,
  allFields: Array<{ selector: string }>
): Promise<{
  formIndex: number;
  sectionHeading: string | null;
  positionInForm: number;
}>
```

**Logic**:
- `formIndex`: Find closest `<form>` parent, count forms on page
- `sectionHeading`: Find nearest h1-h6 heading before field
- `positionInForm`: Index of field within its form

**Acceptance Criteria**:
- [ ] Correctly identifies form index
- [ ] Finds section headings (h1-h6)
- [ ] Calculates position in form
- [ ] Handles fields outside forms
- [ ] Handles multiple forms on page
- [ ] Unit tests cover all scenarios

---

### Task 1.7: Create Field ID Generation Utility
**File**: `src/main/automation/utils/field-id-generator.ts` (NEW)  
**Dependencies**: Task 1.1, Task 1.2

**Description**: Generate stable field ID from semantic properties.

**Function Signature**:
```typescript
export function generateFieldId(field: {
  accessibleName: string;
  controlType: ControlType;
  formIndex: number;
  positionInForm: number;
}): string
```

**Strategy**:
- Use hash of: `accessibleName + controlType + formIndex + positionInForm`
- Ensure uniqueness within form
- Stable across DOM changes (doesn't use selectors)

**Acceptance Criteria**:
- [ ] Generates stable IDs
- [ ] Ensures uniqueness
- [ ] Handles collisions
- [ ] Unit tests verify stability

---

## Phase 2: Field Extractor Enhancement (2 days)

### Task 2.1: Enhance RawFieldCandidate Interface
**File**: `src/main/automation/page/field-extractor.ts`  
**Dependencies**: Phase 1 complete

**Description**: Add fields to `RawFieldCandidate` for canonical schema.

**New Fields**:
- `readonly: boolean`
- `checked: boolean` (for checkboxes/radios)
- `sectionHeading: string | null`
- `formIndex: number`
- `positionInForm: number`
- `minLength: string | null`
- `maxLength: string | null`

**Acceptance Criteria**:
- [ ] All new fields captured in browser-side extraction
- [ ] Section headings detected
- [ ] Form boundaries detected
- [ ] Readonly/checked states captured

---

### Task 2.2: Enhance Browser-Side Extraction
**File**: `src/main/automation/page/field-extractor.ts`  
**Dependencies**: Task 2.1

**Description**: Update `page.evaluate()` to capture additional metadata.

**Changes**:
- Detect section headings (h1-h6) near fields
- Detect form boundaries
- Capture readonly state
- Capture checked state
- Capture minLength/maxLength

**Acceptance Criteria**:
- [ ] All metadata captured in browser context
- [ ] Section headings found correctly
- [ ] Form boundaries detected
- [ ] No performance regression

---

### Task 2.3: Create Canonical Field Builder
**File**: `src/main/automation/page/field-extractor.ts`  
**Dependencies**: Phase 1 complete, Task 2.2

**Description**: Create `buildCanonicalField()` method to transform `RawFieldCandidate` → `CanonicalField`.

**Implementation**:
```typescript
private async buildCanonicalField(
  candidate: RawFieldCandidate,
  index: number,
  allCandidates: RawFieldCandidate[]
): Promise<CanonicalField>
```

**Steps**:
1. Compute `accessibleName` using utility
2. Detect `role` using utility
3. Detect `controlType` using utility
4. Compute `interactionHints` using utility
5. Extract `context` using utility
6. Generate `fieldId` using utility
7. Build `labels` object
8. Build `state` object
9. Build `validation` object
10. Build `group` object (for radios)
11. Build `options` array
12. Build `fallback` object (current selector logic)

**Acceptance Criteria**:
- [ ] All fields properly transformed
- [ ] All utilities integrated
- [ ] Handles all field types
- [ ] Handles radio groups
- [ ] Handles OTP groups
- [ ] Unit tests cover all transformations

---

### Task 2.4: Add extractCanonicalFields Method
**File**: `src/main/automation/page/field-extractor.ts`  
**Dependencies**: Task 2.3

**Description**: Add new public method `extractCanonicalFields()` that returns `CanonicalField[]`.

**Implementation**:
- Similar to `extractFields()` but returns `CanonicalField[]`
- Uses `buildCanonicalField()` for each candidate
- Maintains deduplication logic
- Handles radio/OTP groups

**Acceptance Criteria**:
- [ ] Method returns `CanonicalField[]`
- [ ] All fields properly transformed
- [ ] Deduplication works
- [ ] Radio/OTP groups handled
- [ ] Performance acceptable

---

### Task 2.5: Update PageManager to Support Both Schemas
**File**: `src/main/automation/page-manager.ts`  
**Dependencies**: Task 2.4

**Description**: Add feature flag support and method to extract canonical fields.

**Changes**:
- Add `extractCanonicalFields()` method
- Add feature flag check (`USE_CANONICAL_SCHEMA`)
- Keep `extractFields()` for backward compatibility

**Acceptance Criteria**:
- [ ] Both methods available
- [ ] Feature flag works
- [ ] Backward compatibility maintained

---

## Phase 3: AI Service Updates (2 days)

### Task 3.1: Update Gemini Prompt for Canonical Schema
**File**: `src/main/services/ai.service.ts`  
**Dependencies**: Phase 2 complete

**Description**: Update prompt to reference canonical schema and emphasize semantic matching.

**Changes**:
- Update "FORM FIELDS STRUCTURE" section to show `CanonicalField` format
- Emphasize `accessibleName` as primary identifier
- Update behavior detection to use `controlType` and `interactionHints`
- Update field preference rules to use semantic properties
- Add examples of canonical schema

**Acceptance Criteria**:
- [ ] Prompt references canonical schema
- [ ] `accessibleName` emphasized as primary
- [ ] Behavior detection uses new fields
- [ ] Examples included
- [ ] Prompt tested with Gemini

---

### Task 3.2: Update Field Mapper for Canonical Schema
**File**: `src/main/automation/mapping/field-mapper.ts`   
**Dependencies**: Task 3.1

**Description**: Update `FieldMapper` to handle canonical fields in AI response.

**Changes**:
- Map `accessibleName` to `fieldLabel` in `AutomatedField`
- Use `fallback.selector` for `selector` field
- Preserve semantic metadata in `AutomatedField`
- Handle both old and new schemas (backward compatibility)

**Acceptance Criteria**:
- [ ] Maps canonical fields correctly
- [ ] Preserves semantic metadata
- [ ] Backward compatible with old schema
- [ ] Unit tests updated

---

### Task 3.3: Update AIService Method Signature
**File**: `src/main/services/ai.service.ts`  
**Effort**: 2 hours  
**Dependencies**: Task 3.1, Task 3.2

**Description**: Update `analyzePageAndMapFields()` to accept `CanonicalField[]`.

**Changes**:
- Update parameter type to `CanonicalField[] | HtmlField[]`
- Add type checking/conversion if needed
- Update internal logic to handle canonical schema

**Acceptance Criteria**:
- [ ] Method accepts canonical fields
- [ ] Backward compatible with old schema
- [ ] Type checking works
- [ ] No breaking changes

---

## Phase 4: Filler Updates (3 days)

### Task 4.1: Create Field Resolver Utility
**File**: `src/main/automation/utils/field-resolver.ts` (NEW)  
**Effort**: 8 hours  
**Dependencies**: Phase 2 complete

**Description**: Create utility to resolve fields using semantic discovery.

**Class Structure**:
```typescript
export class FieldResolver {
  constructor(private page: Page) {}
  
  async resolveField(field: AutomatedField): Promise<string | null>
  async findByAccessibleName(name: string): Promise<string | null>
  async findByLabelText(text: string): Promise<string | null>
  async findByAriaLabel(label: string): Promise<string | null>
  async findByPlaceholder(placeholder: string): Promise<string | null>
  async findByRoleAndName(role: string, name: string): Promise<string | null>
}
```

**Resolution Strategy** (priority order):
1. Direct selector (if provided and works)
2. Accessible name matching
3. Label text matching
4. Aria-label matching
5. Placeholder matching
6. Role + accessible name
7. Fallback selector (last resort)

**Acceptance Criteria**:
- [ ] All strategies implemented
- [ ] Priority order correct
- [ ] Handles SPA forms
- [ ] Returns working selector or null
- [ ] Unit tests cover all strategies
- [ ] Integration tests with real forms

---

### Task 4.2: Update AutomatedField Interface
**File**: `src/main/automation/fillers/base-filler.ts`  
**Effort**: 2 hours  
**Dependencies**: Task 4.1

**Description**: Add semantic metadata to `AutomatedField` interface.

**New Fields**:
- `accessibleName?: string`
- `controlType?: string`
- `role?: string`
- `interactionHints?: {...}`

**Acceptance Criteria**:
- [ ] Interface updated
- [ ] All fields optional (backward compatible)
- [ ] Types correct

---

### Task 4.3: Update BaseFiller to Use Field Resolver
**File**: `src/main/automation/fillers/base-filler.ts`  
**Effort**: 4 hours  
**Dependencies**: Task 4.1, Task 4.2

**Description**: Integrate `FieldResolver` into `BaseFiller`.

**Changes**:
- Add `FieldResolver` instance
- Update `fill()` method to resolve field before filling
- Use resolved selector for all operations
- Log resolution strategy used

**Acceptance Criteria**:
- [ ] Resolver integrated
- [ ] Fields resolved before filling
- [ ] Logging added
- [ ] Error handling for resolution failures

---

### Task 4.4: Update All Fillers to Use Interaction Hints
**Files**: All filler files in `src/main/automation/fillers/`  
**Effort**: 6 hours  
**Dependencies**: Task 4.3

**Description**: Update fillers to use `interactionHints` for strategy selection.

**Changes per Filler**:
- Use `interactionHints.inputMode` to choose strategy
- Use `interactionHints.blurAfterInput` for blur timing
- Use `interactionHints.opensDropdown` for dropdown handling
- Use `interactionHints.isSearchable` for search-select handling

**Fillers to Update**:
- [ ] `text-filler.ts`
- [ ] `select-filler.ts`
- [ ] `radio-filler.ts`
- [ ] `checkbox-filler.ts`
- [ ] `date-filler.ts`
- [ ] `search-select-filler.ts`
- [ ] `file-upload-filler.ts`
- [ ] `otp-filler.ts`
- [ ] `toggle-filler.ts`
- [ ] `range-slider-filler.ts`
- [ ] `consent-filler.ts`
- [ ] `masked-text-filler.ts`

**Acceptance Criteria**:
- [ ] All fillers updated
- [ ] Interaction hints used correctly
- [ ] No regression in functionality
- [ ] Tests pass

---

## Phase 5: Testing & Validation (3 days)

### Task 5.1: Unit Tests for Utilities
**Files**: Test files for all new utilities  
**Effort**: 8 hours  
**Dependencies**: Phase 1 complete

**Test Coverage**:
- [ ] `computeAccessibleName()` - all label strategies
- [ ] `detectRole()` - all role types
- [ ] `detectControlType()` - all control types
- [ ] `computeInteractionHints()` - all combinations
- [ ] `extractContext()` - all scenarios
- [ ] `generateFieldId()` - uniqueness and stability

**Acceptance Criteria**:
- [ ] 90%+ code coverage
- [ ] All edge cases covered
- [ ] Tests pass consistently

---

### Task 5.2: Integration Tests for Field Extractor
**File**: `src/main/automation/page/__tests__/field-extractor.test.ts` (NEW)  
**Effort**: 6 hours  
**Dependencies**: Phase 2 complete

**Test Scenarios**:
- [ ] Standard HTML form
- [ ] React SPA form (no IDs)
- [ ] Vue SPA form
- [ ] Angular form
- [ ] Form with multiple sections
- [ ] Form with radio groups
- [ ] Form with OTP inputs
- [ ] Form with search-select
- [ ] Form with custom components

**Acceptance Criteria**:
- [ ] All scenarios tested
- [ ] Canonical fields extracted correctly
- [ ] Accessible names computed correctly
- [ ] Context extracted correctly

---

### Task 5.3: Integration Tests for Field Resolver
**File**: `src/main/automation/utils/__tests__/field-resolver.test.ts` (NEW)  
**Effort**: 6 hours  
**Dependencies**: Task 4.1

**Test Scenarios**:
- [ ] Resolve by accessible name
- [ ] Resolve by label text
- [ ] Resolve by aria-label
- [ ] Resolve by placeholder
- [ ] Resolve by role + name
- [ ] Fallback to selector
- [ ] SPA form resolution
- [ ] Multiple fields with same name (disambiguation)

**Acceptance Criteria**:
- [ ] All strategies tested
- [ ] SPA forms work
- [ ] Disambiguation works
- [ ] Performance acceptable

---

### Task 5.4: End-to-End Tests
**File**: `src/main/automation/__tests__/canonical-schema-e2e.test.ts` (NEW)  
**Effort**: 8 hours  
**Dependencies**: Phase 4 complete

**Test Scenarios**:
- [ ] Complete form fill with canonical schema
- [ ] SPA form fill (no IDs)
- [ ] Form with multiple sections
- [ ] Form with radio groups
- [ ] Form with search-select
- [ ] Backward compatibility (old schema still works)

**Acceptance Criteria**:
- [ ] All scenarios pass
- [ ] No regressions
- [ ] Performance acceptable

---

### Task 5.5: Regression Tests
**Effort**: 4 hours  
**Dependencies**: Phase 4 complete

**Test Scenarios**:
- [ ] All existing forms still work
- [ ] Checkpoint loading works (old format)
- [ ] Checkpoint saving works (new format)
- [ ] Gemini responses map correctly
- [ ] All fillers work as before

**Acceptance Criteria**:
- [ ] No breaking changes
- [ ] All existing tests pass
- [ ] Checkpoint migration works

---

## Phase 6: Migration & Cleanup (2 days)

### Task 6.1: Add Feature Flag Infrastructure
**File**: `src/main/config/environment.ts`  
**Effort**: 2 hours  
**Dependencies**: None

**Description**: Add `USE_CANONICAL_SCHEMA` feature flag.

**Implementation**:
- Add environment variable
- Add config getter
- Default to `false` (old schema)
- Allow override via `.env`

**Acceptance Criteria**:
- [ ] Feature flag works
- [ ] Can be toggled via env
- [ ] Defaults to old schema

---

### Task 6.2: Update AutomationService to Use Feature Flag
**File**: `src/main/services/automation.service.ts`  
**Effort**: 3 hours  
**Dependencies**: Task 6.1, Phase 2 complete

**Description**: Update service to use canonical schema when flag is enabled.

**Changes**:
- Check feature flag
- Call `extractCanonicalFields()` if enabled
- Call `extractFields()` if disabled
- Handle both schemas in AI service

**Acceptance Criteria**:
- [ ] Feature flag respected
- [ ] Both schemas work
- [ ] No breaking changes

---

### Task 6.3: Create Checkpoint Migration Utility
**File**: `src/main/automation/utils/checkpoint-migrator.ts` (NEW)  
**Effort**: 4 hours  
**Dependencies**: Phase 2 complete

**Description**: Convert old `HtmlField[]` checkpoints to `CanonicalField[]`.

**Function**:
```typescript
export async function migrateCheckpoint(
  page: Page,
  oldFields: HtmlField[]
): Promise<CanonicalField[]>
```

**Logic**:
- For each `HtmlField`, query DOM to get current state
- Build `CanonicalField` using extractor utilities
- Preserve as much data as possible

**Acceptance Criteria**:
- [ ] Old checkpoints can be migrated
- [ ] Data preserved correctly
- [ ] Handles missing data gracefully

---

### Task 6.4: Update Documentation
**Effort**: 4 hours  
**Dependencies**: All phases complete

**Files to Update**:
- [ ] `docs/PROJECT_OVERVIEW.md` - Add canonical schema section
- [ ] `docs/AUTOMATION_ANALYSIS.md` - Update field extraction section
- [ ] API documentation - Update type references
- [ ] Developer guide - Add migration guide

**Acceptance Criteria**:
- [ ] All docs updated
- [ ] Examples included
- [ ] Migration guide complete

---

### Task 6.5: Remove Deprecated Code (Optional)
**Effort**: 4 hours  
**Dependencies**: Full migration complete, all tests pass

**Description**: Remove old `HtmlField` references where safe.

**Files to Clean**:
- [ ] Remove `extractFields()` method (if fully migrated)
- [ ] Remove `HtmlField` type (if no longer needed)
- [ ] Update all imports
- [ ] Remove migration utilities (if no longer needed)

**Acceptance Criteria**:
- [ ] No deprecated code
- [ ] All imports updated
- [ ] Codebase clean
- [ ] All tests pass

---

## Testing Checklist

### Unit Tests
- [ ] All utility functions tested
- [ ] Edge cases covered
- [ ] 90%+ code coverage

### Integration Tests
- [ ] Field extraction works
- [ ] Field resolution works
- [ ] AI service works with canonical schema
- [ ] Fillers work with resolved fields

### E2E Tests
- [ ] Complete workflows work
- [ ] SPA forms work
- [ ] Backward compatibility maintained

### Performance Tests
- [ ] No performance regression
- [ ] Extraction time acceptable
- [ ] Resolution time acceptable

---

## Rollout Plan

###  1: Development
- Complete Phases 1-2
- Internal testing

###  2: Integration
- Complete Phases 3-4
- Integration testing
- Feature flag: OFF

###  3: Validation & Rollout
- Complete Phases 5-6
- Extensive testing
- Feature flag: ON (gradual rollout)
- Monitor for issues
- Full rollout if stable

---

## Risk Mitigation

### Risks
1. **Breaking Changes**: Mitigated by feature flag and backward compatibility
2. **Performance Regression**: Mitigated by performance testing
3. **Gemini Response Changes**: Mitigated by prompt testing
4. **Checkpoint Migration Issues**: Mitigated by migration utility testing

### Rollback Plan
- Feature flag can be toggled off instantly
- Old code remains until full migration
- Checkpoints can be migrated back if needed

---

## Success Metrics

- [ ] All existing forms work
- [ ] SPA forms work without IDs
- [ ] Semantic field discovery works
- [ ] Gemini accuracy improves (confidence scores)
- [ ] No performance regression
- [ ] Zero breaking changes
- [ ] All tests pass

---

## Notes

- Keep old `HtmlField` type during migration for backward compatibility
- Feature flag allows gradual rollout
- Comprehensive testing at each phase
- Monitor Gemini responses for accuracy improvements
- Document all changes thoroughly
