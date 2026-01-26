# Semantic-First Field Resolution Fix

## Problem

The `field-resolver.ts` had an architectural inversion where:
- **Selectors were treated as primary resolution path**
- **Semantic locators were treated as fallback**
- This is the **opposite** of Playwright best practices

## Solution

Refactored to follow Playwright best practices:
- **Semantic locators are PRIMARY** (getByRole, getByLabel, getByPlaceholder)
- **Selectors are FALLBACK ONLY** (explicitly marked and only used when all semantic strategies fail)

## Resolution Order (Fixed)

### PRIMARY Strategies (Semantic-First)

1. **getByRole(role, accessibleName)** - Most reliable, SPA-friendly
   - Uses ARIA role and accessible name
   - Works even when DOM structure changes

2. **getByLabel(labelText)** - Semantic label association
   - Works with `<label for="id">` or wrapping labels
   - Handles explicit label associations

3. **getByPlaceholder** - Placeholder text matching
   - Common for inputs without explicit labels
   - Useful for modern form designs

4. **Relative text → input** - Find input near label text
   - Handles cases where label text appears near input but isn't formally associated
   - Strategy 4a: Input in same container as label
   - Strategy 4b: Input following label in form/container

5. **getByText** - Text content matching
   - Primarily for buttons/links with text content

### FALLBACK Strategy (Last Resort)

6. **Selector** - ⚠️ **EXPLICITLY MARKED AS FALLBACK**
   - Only used when ALL semantic strategies fail
   - Fragile and DOM-dependent
   - Logged with `[FALLBACK]` prefix to make it clear

## Changes Made

### 1. `field-resolver.ts`

**Before:**
- Selector was treated as just another strategy
- No clear distinction between primary and fallback

**After:**
- Clear separation: PRIMARY strategies vs FALLBACK
- All strategies explicitly marked with `[PRIMARY]` or `[FALLBACK]` in logs
- Selector strategy explicitly warns when used
- Added "relative text → input" strategy
- Comprehensive comments explaining resolution order

**Key Changes:**
```typescript
// PRIMARY STRATEGY 1: getByRole + accessibleName
// PRIMARY STRATEGY 2: getByLabel
// PRIMARY STRATEGY 3: getByPlaceholder
// PRIMARY STRATEGY 4: Relative text → input
// PRIMARY STRATEGY 5: getByText (for buttons/links)
// FALLBACK STRATEGY: Selector (LAST RESORT - explicitly marked)
```

### 2. `base-filler.ts`

**Before:**
- Selector was used as primary fallback
- No clear distinction between semantic and selector resolution

**After:**
- Semantic discovery is PRIMARY
- Selector is FALLBACK ONLY
- Clear logging: `[PRIMARY]` vs `[FALLBACK]`
- Better error messages explaining why resolution failed

**Key Changes:**
```typescript
// PRIMARY: Semantic field discovery
if (this.canonicalField && !field.resolvedLocator) {
  const resolved = await this.fieldResolver.resolveField(this.canonicalField);
  if (resolved) {
    // Use semantic resolution
  } else {
    // FALLBACK: Only use selector if semantic discovery fails
    if (field.selector) {
      logger.warn(`[FALLBACK] Semantic discovery failed, using selector fallback`);
      // Use selector
    }
  }
}
```

## Benefits

1. **SPA-Friendly**: Semantic locators work even when DOM structure changes
2. **Robust**: Less fragile than selector-based resolution
3. **Playwright Best Practice**: Follows official Playwright recommendations
4. **Clear Intent**: Logging makes it obvious when fallback is used
5. **Maintainable**: Clear separation of concerns

## Logging

All resolution attempts are logged with clear prefixes:

- `[PRIMARY]` - Semantic resolution strategies
- `[FALLBACK]` - Selector fallback (warns when used)

Example logs:
```
[PRIMARY] Resolved field "First Name" via getByRole(textbox, "First Name")
[FALLBACK] Resolved field "Custom Field" via selector - all semantic strategies failed
```

## Testing

After these changes:
- Fields should resolve via semantic strategies first
- Selectors should only be used as last resort
- Logs should clearly show which strategy was used
- System should be more robust for SPAs
