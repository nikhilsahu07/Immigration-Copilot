## Phase 2: Automation Engine – Task List

### A. Parallel Field Filling with Concurrency Cap

- **A1 – Identify eligible fields**
  - [x] In `AutomationService.processFormPage`, derive `parallelFields` from `aiResult.fields`:
    - Include fields with `confidence === "high"` and non-empty `expectedValue`.
    - Include fields with `confidence === "medium"` and non-empty `expectedValue` (at least in auto mode).
    - Exclude fields with `confidence === "low"` or `status === "missing_data"` or `expectedValue === "__MISSING__"`.

- **A2 – Build concurrency-limited runner**
  - [x] Implement a small helper (in `automation.service.ts` or a tiny internal util) to run an array of async jobs with **max 10 concurrent** executions.
  - [x] Each job should:
    - Resolve with `{ success: boolean, fieldMetadata, error?: string }`.
    - Never throw; all errors should be captured in the result payload.

- **A3 – Integrate runner into `processFormPage`**
  - [x] For each eligible field:
    - Build the `automatedField` object (same shape as Phase 1).
    - Get the correct filler via `BehaviorFillerFactory.getFiller(field.behavior, pageManager.getPage())`.
    - Create a job that calls `filler.fill(automatedField)` with its own try/catch.
  - [x] Run all jobs through the concurrency-limited runner (cap 10).
  - [x] After completion, collect all results for required-field checks.

- **A4 – Required-field post-processing**
  - [x] For each field marked required where `success === false`:
    - Log a "required field failed" entry with field name, selector, behavior, and error.
    - Emit a `fill_error` event via `EventEmitter.emitError`.
  - [x] Ensure no single-field failure aborts the whole page unless it indicates a global failure (e.g., page closed).

---

### B. Early-Exit Strategies & Verification

- **B1 – Normalize strategy chain**
  - [x] In `BaseFiller.fill` (and any subclasses that override the main logic):
    - Express strategy order as an array (e.g. `native`, `dom`, `uiLibrary`, `keyboard`).
  - [x] Implement a simple loop:
    - Run each strategy in order.
    - If the strategy fails, log and continue.
    - If the strategy reports success, run a single verification step:
      - On verification pass → immediately `return true`.
      - On verification fail → log and continue to the next strategy.

- **B2 – Keep verification simple but safe**
  - [x] Ensure `verifyFill(field)`:
    - Only runs after success from a strategy.
    - Uses minimal necessary DOM reads and normalization.
  - [x] For high-confidence, simple text-entry fills:
    - Confirm verification cost is small (one `inputValue` read + light string normalization).
  - [x] For complex behaviors (search-select, OTP, file upload, etc.):
    - Keep strict verification.

---

### C. Gemini Contract & JSON Handling

- **C1 – Tighten prompts to be contract-first**
  - [x] In `AIService.analyzePageAndMapFields` and `GeminiService.buildMappingPrompt`:
    - Reinforce rules:
      - Single JSON object only.
      - `actions.length === 1` for every page.
      - Dashboard: `fields: []`, `actions.length === 1`.
      - Form: all visible fields mapped, `actions.length === 1`.
      - Missing data uses `expectedValue: "__MISSING__"` + `status: "missing_data"`.

- **C2 – Prefer schema mode where possible**
  - [ ] When initializing Gemini models:
    - Add `responseMimeType: "application/json"` and `responseSchema` for the mapping/behavior objects (if the SDK and model support it in your environment).
  - [ ] If schema mode is enabled:
    - Access response JSON directly (no regex-based cleanup).
    - On schema validation failure, treat it as a hard error with clear logs.

- **C3 – Fallback markers (if schema mode not used)**
  - [x] Update prompts to require:
    - Output wrapped inside `<RESULT_JSON>` and `</RESULT_JSON>`.
  - [x] Implement parsing:
    - Extract the substring between markers.
    - Run `JSON.parse` once.
  - [x] On parse failure:
    - Log raw response and error.
    - Optionally retry once with a short repair instruction.

- **C4 – Remove JSON "repair" logic**
  - [x] In `GeminiService.parseJsonResponse` (and any similar code paths):
    - Delete or disable brace/bracket counting with synthetic `]`/`}` appends.
    - Limit cleanup to markdown fence stripping and marker extraction.
    - Ensure the function either returns a valid parsed object or throws / signals failure explicitly.

---

### D. Logging & Observability

- **D1 – Define/extend dedicated loggers**
  - [x] In `core/logger.ts` (or equivalent):
    - Add or refine loggers for:
      - `automationBatchLogger` – page-level and batch-level automation stats.
      - `fieldFillLogger` – per-field fill and strategy details.
      - Reuse `geminiPromptLogger` / `geminiResponseLogger` for AI traffic.

- **D2 – Log parallel batch behavior**
  - [x] In `AutomationService.processFormPage`:
    - Log:
      - Page URL and page type.
      - Total number of fields, number of eligible parallel fields.
      - Concurrency cap (10) and approximate actual concurrency.
      - Total time taken for the batch.

- **D3 – Log per-field behavior**
  - [x] Around each `filler.fill(automatedField)`:
    - Log:
      - Field name, intent, behavior, selector, confidence, required flag.
      - Strategy sequence used and which strategy succeeded.
      - Verification result and final success/failure.
      - Any error messages (sanitized).

- **D4 – Log Gemini contract adherence**
  - [x] In Gemini-related services:
    - Log:
      - When responses violate the contract (e.g. missing `fields`, wrong `actions` length).
      - Parse/validation failures and any retries.
      - Final decision (success/failure) returned to callers.

---

### E. Manual Validation & Tuning (No Automated Tests in Phase 2)

- **E1 – Manual sanity checks**
  - [ ] Run automation on:
    - A simple toy form (few fields).
    - A larger real-world form (10+ fields).
  - [ ] Observe:
    - That up to 10 fields are filled in parallel.
    - That low-confidence and missing-data fields still trigger manual input / pauses.
    - That the primary action (submit/next) runs only after fills and is executed once.

- **E2 – Log-based analysis**
  - [ ] Inspect new log files/streams to answer:
    - Which fields failed and why?
    - Which strategies are most commonly succeeding?
    - Are there any pages where concurrency=10 is too aggressive (e.g. unstable portals)?
  - [ ] Adjust policy (e.g. which confidences are allowed in parallel in manual vs auto mode) if needed based on real runs.

- **E3 – Documentation updates**
  - [x] Confirm `PHASE2_IMPLEMENTATION_PLAN.md` and `PHASE2_TASK_LIST.md` reflect the actual implementation.
  - [ ] Optionally update `AUTOMATION_ANALYSIS.md` with a short "Phase 2 changes" section: parallel fills, early-exit strategies, stricter Gemini contracts, and new logging streams.

