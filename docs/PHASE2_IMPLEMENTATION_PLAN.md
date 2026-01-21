## Phase 2: Automation Engine – Implementation Plan

### 1. Goals & Scope

- **Primary goals**
  - **Parallelize form field filling** with a hard **concurrency cap of 10** simultaneous fills.
  - **Fill all non-low / non-missing fields in parallel** (high and medium confidence, and any field with a concrete value), while still treating low-confidence and missing-value fields as manual-review stops.
  - **Keep actions sequential**: execute at most **one primary action at a time** after fields are filled.
  - **Harden Gemini usage** by treating it as a **structured classifier with a contract**, not a JSON text generator.
  - **Improve observability** with clear, separate log streams so we can see exactly what happened and where.

- **Out of scope for Phase 2**
  - Adding or maintaining automated unit/integration tests (can be a later phase).
  - Large UI changes in the Electron renderer.
  - Major rewrites of the extraction pipeline; we build on the Phase 1 semantic snapshot.

---

### 2. Parallel Field Filling with Concurrency Cap

**Objective**: Refactor `AutomationService.processFormPage()` to:

- Fill **all eligible fields in parallel**, up to **10 concurrent fills** at any time.
- Keep low-confidence / missing fields out of the parallel batch.
- Preserve existing UI contracts and manual review flows.

#### 2.1. Eligibility rules

- **Included in parallel batch**:
  - Fields with `confidence === "high"` and a non-empty `expectedValue` (not `__MISSING__`).
  - Fields with `confidence === "medium"` and a non-empty `expectedValue`, **only when in auto mode** (in manual mode they can still require review first, if you prefer).
  - Any other field that:
    - Has `status === "ready"` (or equivalent), and
    - Has a concrete `expectedValue` (not missing).

- **Excluded from parallel batch**:
  - Fields with `confidence === "low"`.
  - Fields with `status === "missing_data"` or `expectedValue === "__MISSING__"`.
  - Any field the model flags for human review (e.g. special/captcha/otp/intentionally uncertain fields).

These exclusions ensure we do **not** try to “auto-fill” fields where Gemini is unsure or where data is absent.

#### 2.2. Concurrency model

- Inside `processFormPage`:
  - Build a flat list of **eligible fields** (`parallelFields`).
  - For each field, construct the `automatedField` object **exactly as Phase 1**, including:
    - `fieldName`, `fieldLabel`, `selector`, `behavior`, `value`, `confidence`, `reasoning`.
  - Use a simple **concurrency-limited runner** (pool) with cap **10**:
    - Maintain a queue of work items: `{ field, automatedField, filler }`.
    - Run up to 10 worker promises at once.
    - When any worker completes, start the next queued item until all are processed.
  - Implementation options:
    - Custom pool (simple loop + array of active promises).
    - Or a tiny in-file helper (no new dependency) to encapsulate “run with concurrency N”.

- **Important**:
  - Use `Promise.allSettled` on the **current batch** of active tasks so that:
    - One rejection does not abort the pool.
    - We can collect **per-field results** (success/failure) for later required-field handling.

#### 2.3. Error isolation & required-field semantics

- For each parallel fill:
  - Wrap `filler.fill(automatedField)` in **its own try/catch**.
  - Each worker should record:
    - `fieldName`, `intent`, `behavior`, `selector`, `confidence`, `required`, and `success: boolean`.
    - Any thrown error message or stack (sanitized for logs).

- After the entire parallel batch completes:
  - Iterate over **all results** and:
    - For **required** fields where `success === false`:
      - Log a specific “required field failed” entry.
      - Emit a `fill_error` via `EventEmitter.emitError`, including field name and selector.
    - For non-required failures:
      - Log the failure clearly (so we can debug) but **do not** abort the page workflow.

- **Do not throw** from the batch processor for individual field failures. Only throw/abort on:
  - Catastrophic conditions (e.g., Playwright page is gone, CDP connection lost).

#### 2.4. Mode and UI behavior

- **Manual mode**:
  - High-confidence fields with values can be auto-filled as before.
  - Medium-confidence or ambiguous fields should still respect existing manual review logic:
    - You may choose to **exclude medium-confidence** from parallel auto-filling in manual mode and only include them in auto mode.

- **Auto mode**:
  - High and medium confidence fields with values are eligible for parallel fill.
  - Low or missing-data fields still trigger manual input requirements and pauses.

- After the batch:
  - Continue the existing logic for:
    - Special element detection (captcha/otp).
    - Building `mapping` and calling `EventEmitter.emitMapping(mapping)`.
    - Auto-approval in auto mode.
  - **Actions remain one-by-one**:
    - Continue to take a single primary action (e.g. submit/next button) after fields are filled.

---

### 3. Early-Exit Strategy Orchestration in Fillers

**Objective**: Make each filler stop as soon as any strategy **succeeds and passes verification**, instead of always walking through all strategies.

- In `BaseFiller` (and/or each concrete filler in `src/main/automation/fillers`):
  - Normalize strategy flow to something like:
    - `NATIVE` → `DOM` → `UI_LIBRARY` → `KEYBOARD`.
  - For each strategy:
    - Run the strategy.
    - If it fails, **log and continue** to the next strategy.
    - If it reports success, run a **single verification step**.
      - When verification passes:
        - **Return true immediately** (EARLY EXIT).
      - When verification fails:
        - Log verification failure (selector, expected vs. actual) and continue to the next strategy.

- Keep this behavior **per-field** and independent of the parallelization:
  - The parallel batch runner just calls `fill()` per field; `fill()` itself optimizes strategy choice and early exit.

---

### 4. Verification Strategy (Simple but Efficient)

**Objective**: Reduce unnecessary verification overhead without breaking safety.

- **Key rules**:
  - Only verify **after** a strategy reports success.
  - Avoid verifying after failed or thrown attempts.
  - Keep verification **per-field** for now (no cross-field batch verification in Phase 2).

- **Possible simplifications**:
  - For high-confidence, simple text-entry native fills:
    - Keep verification cheap (single `inputValue` + light normalization).
  - For more complex behaviors (search-select, OTP, sliders, file uploads):
    - Continue to verify strictly.

- Design `verifyFill(field)` as a clear helper in `BaseFiller` so we can switch to batch verification later if needed, but **do not** add extra complexity now.

---

### 5. Gemini: Contract-First & No JSON “Fixing”

**Objective**: Make Gemini behave like a **strict classifier** that must return a well-formed JSON object according to a contract, and stop trying to auto-fix broken JSON.

#### 5.1. Prompt contract (AIService and GeminiService)

- Keep the Phase 1 prompt’s **contract-first** nature, but clarify:
  - The model must **always** return a single JSON object that follows the expected schema.
  - No explanations, no markdown, no multiple candidates.
  - Missing data must use explicit rules:
    - `expectedValue: "__MISSING__"` and `status: "missing_data"` where appropriate.
  - `actions`:
    - Must contain **exactly one** primary action per page.
    - Dashboard pages: `fields` empty, `actions.length === 1`.
    - Form pages: `fields` list is complete for visible fields, `actions.length === 1` (main submit/next).

- When possible (Gemini 1.5 / 2.x):
  - Configure the generative model with:
    - `responseMimeType: "application/json"`.
    - `responseSchema` describing `BehaviorFormMapping` or `GeminiMappingResponse`.
  - This removes most JSON-formatting fragility.

#### 5.2. Fallback: Markers (if schema mode is not available)

- In both AI entry points:
  - Wrap the JSON in hard markers:
    - `<RESULT_JSON>` and `</RESULT_JSON>`.
  - Require that **only** this block is returned.

- Update parsing logic accordingly:
  - Extract the substring between markers.
  - Run a single `JSON.parse` on that substring.
  - If parse fails:
    - Log the entire raw response.
    - Treat it as a structured failure (e.g., return `success: false` with an error message).
    - Optionally, perform **one retry** with a very short “you must only return valid JSON” instruction.

#### 5.3. Remove JSON “repair” behavior

- In `GeminiService.parseJsonResponse` and any similar helpers:
  - **Remove** logic that tries to:
    - Count braces/brackets.
    - Append extra `]` or `}` characters.
    - Guess where the JSON should end.
  - Keep only:
    - Optional markdown fence cleanup (if you still allow ```json code blocks).
    - Marker-based extraction (if used).
    - Single `JSON.parse` with clear failure handling.

---

### 6. Logging & Observability

**Objective**: Log to **separate files / streams** so we can inspect automation step-by-step and triage issues quickly.

- **Recommended log streams** (using existing or new loggers in `core/logger.ts`):
  - **Automation batch log** (e.g. `automationBatchLogger`):
    - Page-level context: URL, page type, total fields, number of parallel-eligible fields.
    - Batch runs:
      - Number of fields in parallel batch.
      - Concurrency cap (10) and actual max concurrent fills.
      - Total batch duration.
  - **Field fill log** (e.g. `fieldFillLogger`):
    - Per-field entries:
      - `fieldName`, `intent`, `behavior`, `selector`, `confidence`, `required`.
      - Strategy path taken (which strategies were tried, which succeeded).
      - Verification results and final `success` boolean.
      - Any thrown errors (sanitized).
  - **Gemini interaction log** (reuse `geminiPromptLogger` / `geminiResponseLogger`):
    - Prompt payload metadata (number of fields, truncated indicators).
    - Raw or schema-validated responses.
    - Any parse/validation failures.

- **Guidelines**:
  - Do **not** log raw client PII values; log structural identifiers and short summaries instead (field names, selectors, data category).
  - Ensure logging failures never break automation.

---

### 7. Summary of Code Touch Points(If required and feels more clean, modular or organized then create files whereever needed)

- **Core orchestration**
  - `src/main/services/automation.service.ts`
    - Parallel, capped-concurrency field filling.
    - Separation of eligible vs. non-eligible fields.
    - Required-field error handling after batches.
    - Keeping actions one-by-one.

- **Fillers**
  - `src/main/automation/fillers/base-filler.ts` and specific fillers:
    - Early-exit strategy orchestration.
    - Simplified, per-field verification.

- **Gemini integration**
  - `src/main/services/ai.service.ts`
  - `src/main/services/ai/gemini.service.ts`
    - Contract-first prompts.
    - Schema / marker-based response parsing.
    - Removal of JSON “fix” logic.

- **Logging**
  - `src/main/core/logger.ts` (or equivalent):
    - Define/extend loggers for batches, field fills, and Gemini traffic.

