# Phase 1: HTML Extraction - Task List

## Quick Reference Checklist

### Phase 1.1: Core Extraction
- [x] Create `src/main/automation/page/field-extractor.ts`
- [x] Implement **browser-side raw extraction** via `page.evaluate()` (NO `this`, NO Node helpers)
- [x] Implement **node-side normalization** pipeline (dedup, labels, options, selectors)
- [x] Implement selector synthesis + **uniqueness validation** (count===1, escalate strategy)
- [x] Implement `getLabelText()` logic (7 strategies), executed node-side via re-query helpers
- [x] Handle select dropdowns with options
- [x] Handle radio groups with all options
- [x] Handle OTP/multi-input widgets (dedup by container, not by element identity)
- [x] Add error handling and logging

### Phase 1.2: Integration
- [x] Update `PageManager.extractFields()` method
- [x] Update `AIService.analyzePageAndMapFields()` signature
- [x] Update prompt to use structured fields (JSON)
- [x] Update prompt rule: if fields are similar, prefer (labelText > required > earlier DOM order)
- [x] Make HTML context optional and truncated
- [x] Update `AutomationService.processPage()` to use new flow
- [x] Review type definitions alignment

### Phase 1.3: Testing
- [ ] Unit tests for `FieldExtractor`
- [ ] Unit tests for `AIService` changes
- [ ] Integration tests (end-to-end)
- [ ] **Visual mismatch tests** (image context conflicts with HTML; verify rule: image for context, HTML/fields for selectors)
- [ ] Test with real forms
- [ ] Measure token usage reduction
- [ ] Measure latency improvement
- [ ] Verify response accuracy

### Phase 1.4: Documentation
- [ ] Update code comments
- [ ] Update README/docs
- [ ] Performance benchmarking
- [ ] Code review

## Success Metrics
- Token usage: **-80%** (100K → 10K tokens)
- Prompt size: **-90%** (100KB → 10KB)
- Gemini latency: **-40%** (2000ms → 1200ms)
- Selector accuracy: **+25%** (70% → 95%+)
