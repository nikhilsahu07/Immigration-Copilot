## Pause/Resume Phase 3 – Single Job Loop & Checkpoints

This document captures the implementation plan and task list for fixing the remaining issues in the automation pause/resume design by introducing a **single job loop** and **checkpoint-aware iteration**, instead of recursive `processPage` calls and ad‑hoc `setTimeout` recursion.

---

### 1. Reality check: how the current code behaves

#### 1.1. Recursive control flow hotspots

Current `AutomationService` still has **recursive / re‑entrant control flow**:

- **Retry on missing page (polling)**:
```112:135:src/main/services/automation.service.ts
private async processPage(
  client: Client, 
  extraction: Extraction, 
  portalUrl: string,
  customPrompt?: string
) {
  if (!this.isRunning || this.isPaused) return;

  try {
    // ...
    try {
      page = await browserConnector.getPageByUrl(portalDomain);
    } catch (_e) {
      logger.warn(`Could not find page for ${portalDomain}, waiting for page load...`);
      EventEmitter.emitStatus('Waiting for page load...', 15);
      setTimeout(() => this.processPage(client, extraction, portalUrl, customPrompt), 100);
      return;
    }
    // ...
  }
}
```

- **Dashboard → next page**:
```221:287:src/main/services/automation.service.ts
private async processDashboardPage(
  pageManager: PageManager,
  aiResult: any,
  client: Client,
  extraction: Extraction,
  portalUrl: string,
  customPrompt?: string
) {
  // ...
  if (success) {
    // wait for navigation
    // ...
    if (this.isRunning && !this.isPaused) {
      this.processPage(client, extraction, portalUrl, customPrompt);
    }
  }
}
```

- **Form submit → next page**:
```597:642:src/main/services/automation.service.ts
async approveMapping(_mapping: FormMapping) {
  // ...
  if (this.currentJob && this.isRunning && !this.isPaused) {
    // refetch client/extraction/portal
    if (c && e && p) {
      this.processPage(c, e, p.url);
    }
  }
}
```


This means:

- Multiple **independent invocations** of `processPage` can be scheduled over time.
- `pause()` only guards **entry** to the function; it does **not cancel** already scheduled `setTimeout` callbacks.
- The system behaves like a **tree of calls**, not a single linear loop.

#### 1.2. How accurate is the critique?

Your assessment is **correct for the current implementation**:

- There is no **single authoritative job loop**; `processPage` can be entered from:
  - The initial `start()`
  - The polling `setTimeout`
  - `processDashboardPage` (navigation)
  - `approveMapping` (form submit)
- Pausing does **not cancel**:
  - Existing `setTimeout` callbacks
  - In‑flight `processPage` recursion
- This can lead to:
  - Duplicate processing of the same page
  - Ghost resumes when an old scheduled call fires after the user thinks job is paused/stopped
  - Hard‑to‑debug race behaviour under long runs or flaky portals

The proposed **single job loop** (e.g. `runJobLoop`) is aligned with how a senior backend engineer would structure long‑running workflows in Node/Electron:

- Loop iteration = “one pass of page processing”.
- Check pause/stop flags at the **top** of each iteration.
- Decide what to do (fresh vs resume) based on **checkpoint state**, not on who called `processPage`.

---

### 2. Target design: single job loop + checkpoint‑aware iteration

#### 2.1. Core idea

- Introduce a **single entry point** for a running automation job, e.g. `runJobLoop(jobId)`.
- Each iteration of the loop:
  - Verifies `isRunning` / `isPaused`.
  - Looks up the job + checkpoint from Mongo.
  - Creates or reuses a `PageManager`.
  - Either:
    - **Resumes** from checkpoint, or
    - Performs a **fresh page workflow** (HTML structure → AI → fill → submit).
- All progression to “next page” is handled by **continuing the loop**, not by calling `processPage` recursively.

High‑level sketch:

```ts
async runJobLoop(companyId: string, agentId: string, job: AutomationJob) {
  this.isRunning = true;

  while (this.isRunning) {
    if (this.isPaused) return;

    const freshJob = await automationJobRepository.findById(job._id);
    if (!freshJob) return; // job deleted

    const checkpoint = freshJob.checkpoint;

    if (checkpoint) {
      await this.resumeFromCheckpoint(freshJob, checkpoint);
    } else {
      await this.executeWorkflowForCurrentPage(freshJob);
    }

    // Decide whether we should continue:
    // - Check status (completed/failed/paused)
    // - Check max pages, etc.
  }
}
```

#### 2.2. Responsibilities split

- **`start()`**:
  - Creates job, sets status `running`.
  - Opens BrowserView and connects via CDP.
  - **Starts** the job loop (fire‑and‑forget `runJobLoop`).

- **`runJobLoop()`**:
  - Top‑level coordinator.
  - Single place that decides “what to do next”.

- **`executeWorkflowForCurrentPage()`**:
  - The **non‑recursive** version of current `processPage` for a single page.
  - No `setTimeout` / no calls to `this.processPage` at the end.
  - At natural page boundaries, it:
    - Updates `currentUrl` / `currentPage`.
    - Stores or clears checkpoints.
    - Returns to the loop.

- **`resumeFromCheckpoint()`**:
  - Reads `checkpoint.step` and dispatches to step‑specific resume helpers.
  - Never calls `processPage` directly; it only operates within the current iteration.

---

### 3. Implementation plan (backend)

#### 3.1. Phase A – Introduce the job loop shell (without changing behaviour)

**Goal:** Create a skeleton `runJobLoop` and route `start()` to it, but internally still call the existing `processPage` so nothing breaks yet.

Tasks:

- **A1** – Add a private method to `AutomationService`:
  - `private async runJobLoop(companyId: string, agentId: string, job: AutomationJob): Promise<void>`
  - Basic structure:
    - `while (this.isRunning) { if (this.isPaused) return; /* TEMP: call this.processPage(...) */ break; }`
- **A2** – In `start(...)`:
  - Instead of calling `this.processPage(...)` directly, call `this.runJobLoop(...)` (fire‑and‑forget `void this.runJobLoop(...)`).
- **A3** – Ensure errors in `runJobLoop` are caught and:
  - Update job status to `failed`.
  - Emit `Automation stopped`/error events.

At this point, behaviour is **almost identical**; we just have an outer loop that only executes once.

#### 3.2. Phase B – Remove recursive re‑entry points

**Goal:** Make `runJobLoop` the only place that invokes page processing. Remove all recursive `this.processPage(...)` and timer recursion.

Tasks:

- **B1** – In the main page workflow:
  - Replace:
    - `setTimeout(() => this.processPage(...), 100);`
  - With:
    - A **non‑recursive signal** that tells the loop “page not ready; skip this iteration and try again”.
    - Minimal change: return a specific result type, e.g. `{ status: 'retry', delayMs: 100 }`.

- **B2** – In `processDashboardPage`:
  - Remove `this.processPage(client, extraction, portalUrl, customPrompt);`.
  - Instead:
    - Update job state (`currentUrl`, `currentPage`, `pagesProcessed` if needed).
    - Return a value to the loop indicating “page navigation completed, loop should continue”.

- **B3** – In `approveMapping`:
  - Remove direct `this.processPage(c, e, p.url);`.
  - After successful submit + navigation:
    - Only update job state, clear checkpoint.
    - Do **not** call page processing; loop sees the new state on next iteration.

- **B4** – Update `runJobLoop` to interpret workflow return values:
  - Example result union:
    - `{ kind: 'retry', delayMs: number }`
    - `{ kind: 'page_done' }`
    - `{ kind: 'job_completed' }`
  - Handle `retry` by `await new Promise(resolve => setTimeout(resolve, delayMs));` then continue loop.

At the end of Phase B there should be **no remaining calls** to `this.processPage(...)` from:

- `processDashboardPage`
- `approveMapping`
- `setTimeout` callbacks

#### 3.3. Phase C – Integrate checkpoints into the loop

Assuming you follow the checkpoint design from the previous plan:

Tasks:

- **C1** – In each loop iteration:
  - Fetch fresh job from DB: `const job = await automationJobRepository.findById(this.currentJob._id)`.
  - Abort loop if:
    - Job not found.
    - Job status is `completed` or `failed`.
  - Read `job.checkpoint`.

- **C2** – If `job.checkpoint` exists:
  - Call `await this.resumeFromCheckpoint(job, job.checkpoint);`
  - That function:
    - Uses `checkpoint.step` to decide whether to:
      - Skip AI call,
      - Skip field extraction,
      - Skip filling, etc.

- **C3** – If no checkpoint:
  - Call `await this.executeWorkflowForCurrentPage(job, client, extraction, portalUrl, customPrompt);`
  - Ensure this method:
    - Has **no recursion**.
    - Only uses:
      - `saveCheckpoint(...)`
      - `clearCheckpoint(...)`
      - Normal returns.

- **C4** – At natural completion points (no more pages / portal indicates done):
  - Set job status to `completed`.
  - Break the loop.

#### 3.4. Phase D – Tighten pause/stop semantics

Tasks:

- **D1** – At the **top** of each `while` iteration in `runJobLoop`:
  - If `!this.isRunning` → break.
  - If `this.isPaused` → return (job remains paused; loop ends).

- **D2** – In `pause()`:
  - Only set `isPaused` + update DB.
  - Do not schedule new work; existing iteration will observe `isPaused` early and exit.

- **D3** – In `stop()`:
  - Set `isRunning = false`, update DB.
  - Loop will break on next check.

---

### 4. Implementation plan (frontend / Zustand)

Frontend already just sends `pause`/`resume` IPC and listens for status events. With a single job loop:

- No major API changes are required.
- You **may** optionally expose richer state (e.g. current step) for better UX.

Tasks:

- **F1** – (Optional) Add `currentStep?: string` to `AutomationState` contract and to `useAutomationStore`.
- **F2** – (Optional) Show “Paused after AI analysis” / “Resuming from checkpoint” messages based on backend events.

---

### 5. Task list summary

**Backend – control flow**

1. **A1–A3**: Add `runJobLoop` and route `start()` through it (single entry point).
2. **B1**: Replace `setTimeout(() => this.processPage(...))` with a non‑recursive “retry later” result handled by the loop.
3. **B2**: Remove recursive `this.processPage` from `processDashboardPage`; return a result instead.
4. **B3**: Remove recursive `this.processPage` from `approveMapping`; rely on loop to pick up the next page.
5. **B4**: Refactor `processPage` into `executeWorkflowForCurrentPage` returning a typed result (no recursion).

**Backend – checkpoints & state**

6. **C1–C4**: In `runJobLoop`, on each iteration:

   - Fetch fresh job.
   - Inspect `checkpoint`.
   - Call `resumeFromCheckpoint` or `executeWorkflowForCurrentPage`.

7. **D1–D3**: Harden pause/stop behaviour using loop guards instead of scattered conditions.

**Frontend (optional)**

8. **F1–F2**: Expose and display current workflow step/checkpoint info in the UI for visibility.

Once these tasks are complete:

- There will be **no recursive scheduling** of `processPage`.
- A single `runJobLoop` will own the job lifecycle.
- Checkpoints (from the earlier design) will control **what the next iteration does**, not **which function gets called**.