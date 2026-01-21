## Pause/Resume Phase 3 – Task List (Single Job Loop & Checkpoints)

This file tracks the concrete engineering tasks to move from the current recursive `processPage` flow to a single `runJobLoop` with checkpoint‑aware iterations.  
Testing (unit/E2E) tasks are intentionally omitted for now.

---

### A. Introduce single job loop shell

- **A1 – Add `runJobLoop` skeleton to `AutomationService`**
  - Add a private method:
    - `private async runJobLoop(companyId: string, agentId: string, job: AutomationJob): Promise<void>`
  - Initial implementation:
    - `while (this.isRunning) {`
      - `if (this.isPaused) return;`
      - `// TEMP: call existing processPage(...) once`
      - `break;`
    - `}`

- **A2 – Route `start()` through `runJobLoop`**
  - In `AutomationService.start(...)`:
    - After BrowserView load + `browserConnector.connect()` succeed:
      - Replace direct `this.processPage(...)` with:
        - `void this.runJobLoop(companyId, agentId, job);`
      - Keep error handling around the `connect()` path unchanged.

- **A3 – Add error handling inside `runJobLoop`**
  - Wrap loop body in `try/catch`.
  - On error:
    - Log the error.
    - Update job status to `failed`.
    - Set `this.isRunning = false`.
    - Emit an error + status event to the renderer.

---

### B. Remove recursive control‑flow entry points

- **B1 – Replace `setTimeout(...processPage...)` retry with loop‑handled retry**
  - In the current `processPage` implementation:
    - Remove:
      - `setTimeout(() => this.processPage(client, extraction, portalUrl, customPrompt), 100);`
    - Introduce a typed result from the per‑page workflow, e.g.:
      - `{ kind: 'retry', delayMs: 100 }`
    - When page is not found:
      - Return this result instead of scheduling another `processPage`.
  - In `runJobLoop`:
    - If result is `retry`:
      - `await new Promise(r => setTimeout(r, delayMs));`
      - `continue;`

- **B2 – Make `processDashboardPage` non‑recursive**
  - Change `processDashboardPage` to:
    - Return a result (`{ kind: 'page_done' }` or `{ kind: 'retry', delayMs }`).
    - **Remove**:
      - `this.processPage(client, extraction, portalUrl, customPrompt);`
  - After successful navigation + wait:
    - Update job state (URL/page counters if needed).
    - Return `{ kind: 'page_done' }`.
  - `runJobLoop` interprets this result and moves to the next iteration.

- **B3 – Make `approveMapping` non‑recursive**
  - In `approveMapping`:
    - After successful submit + navigation wait:
      - Update job state (`currentUrl`, `currentPage`, etc. as appropriate).
      - Clear any checkpoints related to the just‑submitted page.
      - Do **not** call `processPage(...)`.
    - Option: have `approveMapping` return a status (e.g. `boolean` or `{ kind: 'page_done' }`) for logging, but let the loop pick up on the next iteration.

- **B4 – Refactor `processPage` into a per‑page workflow**
  - Extract the body of `processPage` into:
    - `private async executeWorkflowForCurrentPage(job: AutomationJob, client: Client, extraction: Extraction, portalUrl: string, customPrompt?: string): Promise<PageIterationResult>`
  - `PageIterationResult` should be a union for:
    - `{ kind: 'retry', delayMs: number }`
    - `{ kind: 'page_done' }`
    - `{ kind: 'job_completed' }`
    - (extend as needed)
  - Remove any calls inside this method that re‑enter `processPage`; all returns go back to `runJobLoop`.

---

### C. Integrate checkpoints into the loop

- **C1 – Fetch fresh job each loop iteration**
  - In `runJobLoop`:
    - At the top of the `while`:
      - Fetch fresh job from DB using `automationJobRepository.findById(this.currentJob._id)`.
      - If job is `null`:
        - Log and `break` the loop.
      - If job status is `completed` or `failed`:
        - `break` the loop.

- **C2 – Branch on checkpoint presence**
  - Still in `runJobLoop`:
    - If `job.checkpoint` exists:
      - Call `await this.resumeFromCheckpoint(job, job.checkpoint);`
    - Else:
      - Call `await this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);`
    - Ensure both paths return a `PageIterationResult` consumed by the loop.

- **C3 – Keep per‑page workflow non‑recursive**
  - Ensure `executeWorkflowForCurrentPage`:
    - Uses `saveCheckpoint(...)` and `clearCheckpoint(...)` internally.
    - Never calls `processPage`.
    - Returns only typed results to `runJobLoop`.

- **C4 – Handle natural job completion**
  - When workflow determines there are no more pages or the portal is complete:
    - Update job status to `completed` in the repository.
    - Clear any remaining checkpoint.
    - Return `{ kind: 'job_completed' }`.
  - In `runJobLoop`, on `job_completed`:
    - Set `this.isRunning = false`.
    - `break` the loop.

---

### D. Harden pause/stop semantics around the loop

- **D1 – Add top‑of‑loop guards in `runJobLoop`**
  - At the start of each `while` iteration:
    - If `!this.isRunning`: `break`.
    - If `this.isPaused`: `return;` (job remains paused; loop stops until `resume()` is called again).

- **D2 – Keep `pause()` simple and loop‑driven**
  - In `pause()`:
    - Set `this.isPaused = true`.
    - Update job status to `paused` and set `pauseReason`.
    - Do **not** schedule any new work or call page logic directly.
  - Rely on:
    - The next `runJobLoop` iteration to see `isPaused` and return.

- **D3 – Ensure `stop()` breaks the loop cleanly**
  - In `stop()`:
    - Set `this.isRunning = false`.
    - Update job status to `failed` (or another appropriate terminal state).
    - Clear `currentMapping`, reset internal flags as you already do.
  - Since the loop checks `isRunning` at the top, it will exit promptly.

---

### E. Frontend (optional enhancements, no API breaking changes)

- **E1 – Optional: surface current workflow step**
  - Extend shared `AutomationState` (and `automation.store.ts`) with:
    - `currentStep?: string` (e.g. `'ai_analysis_done'`, `'fields_filled'`).
  - Wire this from backend events if/when you expose it.

- **E2 – Optional: improve UX messages**
  - Use `currentStep` or new status messages to show:
    - “Paused after AI analysis”
    - “Resuming from checkpoint”
  - This is purely presentational; no backend contract changes required for the core loop.

