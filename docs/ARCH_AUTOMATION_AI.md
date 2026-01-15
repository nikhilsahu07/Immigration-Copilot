# Immigration Copilot: Automation & AI Architecture

This document details the internal architecture of the Automation and AI components of the Immigration Copilot. It specifically focuses on the backend workflow *after* the user triggers the automation process.

## 1. Architecture Overview

The automation engine operates as an **Iterative State Exploration Machine**. Unlike traditional scripts that follow a linear path, this engine uses a dynamic "Observe → Decide → Act" loop powered by Gemini AI. This allows it to handle complex Single Page Applications (SPAs), dynamic modals, tabbed interfaces, and unexpected flows resilience.

### Core Components

| Component | File Path | Responsibility |
|-----------|-----------|----------------|
| **AutomationService** | `src/main/services/automation.service.ts` | The Orchestrator. Manages job lifecycle (Start, Stop, Pause), resource loading, and initializes the explorer. |
| **StateExplorer** | `src/main/services/automation/state-explorer.ts` | The "Brain". Runs the infinite loop that drives the automation. Manages state, history, and approval queues. |
| **AIService** | `src/main/services/ai.service.ts` | The Intelligence. Constructs context-aware prompts and communicates with Gemini to determine the *next single action*. |
| **PageManager** | `src/main/services/automation/page-manager.ts` | The "Hands". Executes low-level actions (clicks, typing, file uploads) using Playwright/CDP. |
| **BrowserConnector** | `src/main/automation/browser-connector.ts` | Manages the connection to the Electron BrowserView via Chrome DevTools Protocol (CDP). |

---

## 2. Detailed Workflow: The Execution Pipeline

When a user selects a portal, client, and clicks "Start", the following process executes in the **Main Process**:

### Phase 1: Initialization & Context Loading
1.  **Trigger**: IPC event `AUTOMATION_START` is received.
2.  **Resource Fetching**: The `AutomationService` fetches:
    *   **Client Data**: Personal details, address, history.
    *   **Extraction Data**: The structured JSON data previously parsed from PDFs.
    *   **Documents**: Metadta about available PDF/Image files (for uploads).
3.  **Connection**: A `BrowserView` is spawned (or reused) and directed to the Portal URL. The `BrowserConnector` attaches to the page via CDP port 9222.
4.  **Mode Setup**: The `StateExplorer` is initialized with the user's selected mode (`Auto` or `Manual`).

### Phase 2: The "State Explorer" Loop
The `StateExplorer` enters a `while` loop that continues until the job is `DONE` or `Failed`.

#### Step A: Observe (The "Eyes")
*   **Capture**: The engine captures the current raw HTML of the visible page.
*   **Clean**: The HTML is passed through a cleaning pipeline (`html-cleaner.ts`):
    *   Removes separate styles, scripts, and hidden elements to reduce token usage.
    *   **Normalization**: Converts dynamic/unstable CSS classes (e.g., `css-1x2y3z`) into stable selectors (IDs, names, aria-labels).
    *   **Extraction**: Isolates visible forms, modals, and interactive elements.

#### Step B: Decide (The "Brain")
The cleaned HTML and current Context are sent to `AIService`.
1.  **Context Injection**: The AI is provided with:
    *   **Client Data**: The full JSON object of extracted client info.
    *   **Negative Mapping**: A list of selectors that have *already* been filled or visited (to prevent infinite loops).
    *   **Document List**: Available files for upload (e.g., `passport.pdf`, `transcript.pdf`).
2.  **Prompt Strategy**: A rigid system prompt enforces a priority logic:
    1.  **[MODAL]**: Is a popup open? Fill it first.
    2.  **[FIELDS]**: Are there empty required fields? Fill them.
    3.  **[UPLOAD]**: Is there a file input? Upload the matching doc.
    4.  **[NAVIGATE]**: Are there tabs/buttons to reveal more fields? Click them.
    5.  **[DONE]**: Is everything finished?
3.  **Gemini Response**: The AI analyzes the HTML and returns a **SINGLE** JSON decision:
    ```json
    {
      "type": "FILL",
      "fields": [{ "selector": "#name", "value": "John Doe", "reason": "..." }]
    }
    ```
    *(Or `NAVIGATE`, `UPLOAD`, `DONE`)*.

#### Step C: Approval (Manual Mode Only)
If in **Manual Mode**:
1.  The loop **PAUSES**.
2.  An event is emitted to the UI (`EVENT_ACTION_PENDING`) showing "AI wants to Fill Name with 'John Doe'".
3.  The backend waits for an `APPROVE` or `REJECT` IPC message from the user.
4.  If Rejected, the action is skipped, and the loop continues (AI will likely try a different approach next time).

#### Step D: Act (The "Hands")
The `PageManager` executes the decision:
*   **Text/Select**: Uses Playwright to fill inputs and fire necessary `change`/`blur` events.
*   **Clicks**: intelligently scrolls to the element and clicks.
*   **File Uploads**: Resolves the S3 Key of the requested document, downloads a temp copy (if needed), and sets the file input payload.

#### Step E: Wait & Repeat
*   The engine waits for network idle and DOM stability (approx. 500ms - 3s).
*   The loop restarts at **Step A** to verify the action's result and decide the next move.

---

## 3. Data Flow: "How PDF Parse"

The "PDF Parse" is a pre-requisite step (Extraction Phase) that feeds the Automation Phase.

### 1. The Extraction Phase (Pre-Automation)
When a user adds a document to a client:
1.  **PDF-Parse**: The node module `pdf-parse` reads the raw binary of the PDF and extracts raw text strings.
2.  **Structure Generation**: This raw text is sent to Gemini with the `EXTRACTION_PROMPT_TEMPLATE`.
3.  **Normalization**: Gemini converts the unstructured text into a standard JSON schema (e.g., `{ "personal": { "firstName": "..." } }`).
4.  **Storage**: This JSON is saved in the `extractions` database collection.

### 2. The Automation Phase (Runtime)
When Automation runs:
1.  **Retrieval**: `AutomationService` pulls this saved JSON from the DB.
2.  **Injection**: The JSON is injected into the **System Prompt** of the `StateExplorer` as "CLIENT DATA".
3.  **Mapping**: Gemini's "Decide" step maps this JSON data to the observed HTML fields on the fly. *Example: It maps `context.personal.firstName` to `<input name="f_name">`.*

---

## 4. AI Prompting Strategy

The system uses a highly specialized prompt to Ensure reliability.

**Key Prompt Engineering Techniques:**
*   **Negative Constraints**: "NEVER use :contains() selectors", "IGNORE fields in this list: [...]".
*   **State Awareness**: The prompt includes a history of `visitedElements` and `filledFieldSelectors`.
*   **One-Shot Decisions**: The AI is forced to make only *one* type of move at a time (Fill vs Navigate) to prevent execution errors.

### Example Prompt Context (Simplified)
```text
TASK: You are an automation agent.
PRIORITY: Fill Modals -> Fill Fields -> Upload -> Navigate.

CONTEXT: { "firstName": "John", "lastName": "Doe" }
IGNORE ALREADY FILLED: ["#firstName", "#address"]

VISIBLE HTML:
<form>
   <input id="lastName" /> 
   <button id="next">Next</button>
</form>

DECISION:
```
**AI Output:**
```json
{ "type": "FILL", "fields": [{ "selector": "#lastName", "value": "Doe" }] }
```

---

## 5. Error Handling & Recovery

*   **Hallucinations**: If AI invents a selector that doesn't exist, `PageManager` throws an error, the loop catches it, and retries the loop (the next Observation will show the field is still empty).
*   **Popups/Modals**: The `StateExplorer` is trained to prioritize Modals. If a sudden popup blocks the form, the next "Observe" step sees the popup HTML, and the AI switches strategy to handle the popup first.
*   **Stuck Loops**: If the AI tries the same action 3 times without DOM change, the `visitedElements` tracker forces it to try a different path.
