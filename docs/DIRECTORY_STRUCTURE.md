## Directory Structure

```
/emigration-copilot
    ├── package.json
    ├── tsconfig.json
    ├── forge.config.ts
    ├── tailwind.config.js                          # TailwindCSS config
    ├── postcss.config.js                           # PostCSS for Tailwind
    ├── components.json                             # shadcn/ui config
    ├── .env
    ├── .env.example
    ├── .eslintrc.json
    ├── .prettierrc
    ├── .gitignore
    ├── README.md
    │
    ├── /src
    │   │
    │   ├── /main                                    # Electron Main Process
    │   │   ├── index.ts                             # Entry point + CDP setup (port 9222)
    │   │   ├── preload.ts                           # ContextBridge API
    │   │   │
    │   │   ├── /core                                # Application infrastructure
    │   │   │   ├── app.ts                           # App lifecycle management
    │   │   │   ├── window-manager.ts                # BrowserWindow creation & state
    │   │   │   ├── browser-view-manager.ts          # BrowserView lifecycle (75% right panel)
    │   │   │   ├── error-handler.ts                 # Global error handling
    │   │   │   └── logger.ts                        # Winston logger
    │   │   │
    │   │   ├── /config                              # Configuration management
    │   │   │   ├── index.ts                         # Config aggregator
    │   │   │   ├── environment.ts                   # .env loader & validation (Zod)
    │   │   │   ├── database.config.ts               # MongoDB connection string
    │   │   │   ├── storage.config.ts                # AWS S3 credentials
    │   │   │   ├── ai.config.ts                     # Gemini API key & settings
    │   │   │   └── logger.config.ts                 # Winston config (file paths, levels)
    │   │   │
    │   │   ├── /database                            # MongoDB persistence layer
    │   │   │   ├── index.ts                         # DB connection singleton
    │   │   │   ├── client.ts                        # MongoClient setup
    │   │   │   ├── collections.ts                   # Collection definitions
    │   │   │   ├── indexes.ts                       # Index creation on startup
    │   │   │   └── /repositories                    # Data access objects
    │   │   │       ├── company.repository.ts
    │   │   │       ├── agent.repository.ts
    │   │   │       ├── client.repository.ts         # Visa seekers/immigration clients
    │   │   │       ├── document.repository.ts       # PDF/Image documents linked to clients
    │   │   │       ├── extraction.repository.ts     # Extracted client data from Gemini
    │   │   │       ├── portal.repository.ts         # Company's portal list
    │   │   │       ├── automation-job.repository.ts # Job status, pages filled, completion
    │   │   │       └── audit-log.repository.ts
    │   │   │
    │   │   ├── /storage                             # AWS S3 document storage
    │   │   │   ├── s3-client.ts                     # S3 SDK initialization
    │   │   │   ├── upload.service.ts                # Upload PDFs/images to S3
    │   │   │   ├── download.service.ts              # Pre-signed URL generation
    │   │   │   └── document-manager.ts              # High-level document ops
    │   │   │
    │   │   ├── /services                            # Business logic layer
    │   │   │   ├── /auth
    │   │   │   │   ├── auth.service.ts              # Register company + agent, login/logout
    │   │   │   │   ├── session.service.ts           # Session management (JWT or session ID)
    │   │   │   │   ├── password.service.ts          # Password hashing (bcrypt)
    │   │   │   │   └── permission.service.ts        # Company-based access control
    │   │   │   │
    │   │   │   ├── /company
    │   │   │   │   ├── company.service.ts           # CRUD for companies
    │   │   │   │   └── company-validator.ts         # Zod validation
    │   │   │   │
    │   │   │   ├── /agent
    │   │   │   │   ├── agent.service.ts             # Agent CRUD under company
    │   │   │   │   └── agent-validator.ts
    │   │   │   │
    │   │   │   ├── /client
    │   │   │   │   ├── client.service.ts            # CRUD for clients (visa seekers)
    │   │   │   │   ├── client-validator.ts          # Validate client basic details
    │   │   │   │   └── client-enrichment.ts         # Data normalization (phone, address)
    │   │   │   │
    │   │   │   ├── /document
    │   │   │   │   ├── document.service.ts          # Link docs to clients
    │   │   │   │   ├── pdf-parser.service.ts        # Parse PDF text (pdf-parse library)
    │   │   │   │   └── document-validator.ts        # Validate file type (PDF/Image only)
    │   │   │   │
    │   │   │   ├── /extraction                      # New extraction service
    │   │   │   │   ├── extraction.service.ts        # Orchestrate extraction process
    │   │   │   │   ├── data-extractor.ts            # Send client data + docs to Gemini
    │   │   │   │   ├── extraction-parser.ts         # Parse Gemini JSON response
    │   │   │   │   └── extraction-validator.ts      # Validate extracted data structure
    │   │   │   │
    │   │   │   ├── /ai
    │   │   │   │   ├── gemini.service.ts            # Gemini API wrapper with retry logic
    │   │   │   │   ├── prompt-builder.ts            # Dynamic prompt generation
    │   │   │   │   ├── response-parser.ts           # Parse & fix incomplete JSON from Gemini
    │   │   │   │   └── token-counter.ts             # Track token usage
    │   │   │   │
    │   │   │   ├── /automation
    │   │   │   │   ├── automation-orchestrator.ts   # Job queue & lifecycle
    │   │   │   │   ├── job-runner.ts                # Execute automation jobs
    │   │   │   │   ├── page-processor.ts            # Process each page with AI
    │   │   │   │   ├── form-filler.ts               # Fill forms based on Gemini output
    │   │   │   │   ├── navigation-handler.ts        # Multi-page navigation (Next/Submit)
    │   │   │   │   ├── captcha-detector.ts          # Detect CAPTCHA/OTP from HTML
    │   │   │   │   └── approval-handler.ts          # Agent approval before submission
    │   │   │   │
    │   │   │   ├── /portal
    │   │   │   │   ├── portal.service.ts            # Company portal CRUD
    │   │   │   │   └── portal-validator.ts
    │   │   │   │
    │   │   │   └── /notification
    │   │   │       └── notification.service.ts      # In-app toast notifications
    │   │   │
    │   │   ├── /automation                          # Playwright + CDP engine
    │   │   │   ├── index.ts
    │   │   │   ├── browser-connector.ts             # CDP connection to BrowserView
    │   │   │   ├── page-manager.ts                  # Page lifecycle
    │   │   │   ├── html-extractor.ts                # Extract form structure from page
    │   │   │   ├── field-mapper.ts                  # Map fields to extracted client data
    │   │   │   ├── /fillers                         # Field-specific filling logic
    │   │   │   │   ├── base-filler.ts               # Base class for all fillers
    │   │   │   │   ├── text-filler.ts
    │   │   │   │   ├── select-filler.ts
    │   │   │   │   ├── radio-filler.ts
    │   │   │   │   ├── checkbox-filler.ts
    │   │   │   │   ├── date-filler.ts
    │   │   │   │   └── file-upload-filler.ts        # Upload docs from S3 to form
    │   │   │   │
    │   │   │   └── /human-loop
    │   │   │       ├── pause-manager.ts             # Pause automation for CAPTCHA/OTP
    │   │   │       ├── approval-handler.ts          # Agent approval workflow
    │   │   │       └── manual-intervention.ts       # Handle manual inputs
    │   │   │
    │   │   ├── /ipc                                 # IPC communication layer
    │   │   │   ├── index.ts                         # Register all handlers
    │   │   │   ├── channel-names.ts                 # Centralized channel definitions
    │   │   │   │
    │   │   │   ├── /handlers                        # IPC request handlers
    │   │   │   │   ├── auth.handlers.ts             # Register, login, logout
    │   │   │   │   ├── company.handlers.ts
    │   │   │   │   ├── agent.handlers.ts
    │   │   │   │   ├── client.handlers.ts
    │   │   │   │   ├── document.handlers.ts
    │   │   │   │   ├── extraction.handlers.ts       # Extraction IPC handlers
    │   │   │   │   ├── portal.handlers.ts
    │   │   │   │   ├── automation.handlers.ts       # Start/stop automation, approve
    │   │   │   │   └── browser-view.handlers.ts     # Show/hide/resize BrowserView
    │   │   │   │
    │   │   │   └── /middleware
    │   │   │       ├── validation.middleware.ts     # Zod schema validation
    │   │   │       ├── auth.middleware.ts           # Verify agent session
    │   │   │       └── error.middleware.ts          # Standardize error responses
    │   │   │
    │   │   └── /utils
    │   │       ├── crypto.ts                        # Password hashing, encryption
    │   │       ├── validator.ts                     # Input validation helpers
    │   │       ├── file-system.ts                   # File operations
    │   │       ├── date-utils.ts                    # Date formatting
    │   │       └── sanitizer.ts                     # Sanitize logs (remove secrets)
    │   │
    │   ├── /renderer                                # React Frontend
    │   │   ├── index.tsx                            # React entry point
    │   │   ├── index.css                            # Tailwind directives (@tailwind base, components, utilities)
    │   │   ├── App.tsx                              # Root component with routing
    │   │   │
    │   │   ├── /pages                               # Page components
    │   │   │   ├── RegisterPage.tsx                 # Register company + agent
    │   │   │   ├── LoginPage.tsx
    │   │   │   ├── DashboardPage.tsx                # Overview stats
    │   │   │   │
    │   │   │   ├── /clients
    │   │   │   │   ├── ClientListPage.tsx           # List all clients
    │   │   │   │   ├── ClientDetailPage.tsx         # View client details + documents
    │   │   │   │   ├── ClientCreatePage.tsx         # Create new client
    │   │   │   │   └── ClientEditPage.tsx           # Edit client basic info
    │   │   │   │
    │   │   │   ├── /documents
    │   │   │   │   ├── DocumentListPage.tsx         # All documents per client
    │   │   │   │   └── DocumentUploadPage.tsx       # Upload PDF/Image to S3
    │   │   │   │
    │   │   │   ├── /extractions                     # Extraction pages
    │   │   │   │   ├── ExtractionListPage.tsx       # List all extractions per client
    │   │   │   │   ├── ExtractionCreatePage.tsx     # Trigger extraction with prompt
    │   │   │   │   ├── ExtractionDetailPage.tsx     # View extracted data
    │   │   │   │   └── ExtractionApprovalPage.tsx   # Approve/edit extracted data
    │   │   │   │
    │   │   │   ├── /automation
    │   │   │   │   ├── AutomationPage.tsx           # Main automation UI (split view)
    │   │   │   │   ├── JobHistoryPage.tsx           # Past automation jobs
    │   │   │   │   └── PortalSelectionPage.tsx      # Select portal before automation
    │   │   │   │
    │   │   │   ├── /portals                         # Portal management
    │   │   │   │   ├── PortalListPage.tsx           # List company's portals
    │   │   │   │   └── PortalCreatePage.tsx         # Add new portal URL
    │   │   │   │
    │   │   │   └── /settings
    │   │   │       ├── SettingsPage.tsx
    │   │   │       ├── CompanySettingsPage.tsx
    │   │   │       └── AgentManagementPage.tsx      # Manage agents in company
    │   │   │
    │   │   ├── /components                          # Reusable components
    │   │   │   ├── /ui                              # shadcn/ui components
    │   │   │   │   ├── button.tsx                   # shadcn Button
    │   │   │   │   ├── input.tsx                    # shadcn Input
    │   │   │   │   ├── select.tsx                   # shadcn Select
    │   │   │   │   ├── dialog.tsx                   # shadcn Modal/Dialog
    │   │   │   │   ├── table.tsx                    # shadcn Table
    │   │   │   │   ├── card.tsx                     # shadcn Card
    │   │   │   │   ├── toast.tsx                    # shadcn Toast
    │   │   │   │   ├── badge.tsx                    # shadcn Badge
    │   │   │   │   ├── progress.tsx                 # shadcn Progress bar
    │   │   │   │   ├── separator.tsx                # shadcn Separator
    │   │   │   │   ├── checkbox.tsx                 # shadcn Checkbox
    │   │   │   │   ├── radio-group.tsx              # shadcn RadioGroup
    │   │   │   │   ├── tabs.tsx                     # shadcn Tabs
    │   │   │   │   └── scroll-area.tsx              # shadcn ScrollArea
    │   │   │   │
    │   │   │   ├── /layout
    │   │   │   │   ├── Sidebar.tsx                  # Left sidebar navigation
    │   │   │   │   ├── Header.tsx                   # Top header with user info
    │   │   │   │   ├── MainLayout.tsx               # Layout wrapper
    │   │   │   │   └── SplitView.tsx                # Split view (25% left + 75% right)
    │   │   │   │
    │   │   │   ├── /client
    │   │   │   │   ├── ClientCard.tsx               # Client card display
    │   │   │   │   ├── ClientForm.tsx               # Create/edit client form
    │   │   │   │   ├── ClientDataDisplay.tsx        # Display client details
    │   │   │   │   └── ClientSelector.tsx           # Dropdown to select client
    │   │   │   │
    │   │   │   ├── /document
    │   │   │   │   ├── DocumentCard.tsx             # Document card with thumbnail
    │   │   │   │   ├── DocumentUploader.tsx         # Drag-drop uploader
    │   │   │   │   └── DocumentPreview.tsx          # PDF/Image preview modal
    │   │   │   │
    │   │   │   ├── /extraction                      # Extraction components
    │   │   │   │   ├── ExtractionCard.tsx           # Display extraction summary
    │   │   │   │   ├── ExtractionForm.tsx           # Trigger extraction with prompt
    │   │   │   │   ├── ExtractionDataViewer.tsx     # JSON viewer for extracted data
    │   │   │   │   └── ExtractionApprovalDialog.tsx # Approve/reject extracted data
    │   │   │   │
    │   │   │   ├── /automation
    │   │   │   │   ├── PortalList.tsx               # List of portals
    │   │   │   │   ├── BrowserViewContainer.tsx     # Right panel (75% width) browser
    │   │   │   │   ├── ControlPanel.tsx             # Left panel (25% width) controls
    │   │   │   │   ├── StatusBar.tsx                # Progress bar + status message
    │   │   │   │   ├── FormPreview.tsx              # Show AI-mapped fields
    │   │   │   │   ├── ApprovalDialog.tsx           # Agent approval before submit
    │   │   │   │   ├── CaptchaAlert.tsx             # CAPTCHA detection alert
    │   │   │   │   ├── OtpInput.tsx                 # OTP input field
    │   │   │   │   └── JobStatusCard.tsx            # Job status display
    │   │   │   │
    │   │   │   ├── /portal                          # Portal components
    │   │   │   │   ├── PortalCard.tsx               # Display portal metadata
    │   │   │   │   └── PortalForm.tsx               # Add/edit portal
    │   │   │   │
    │   │   │   └── /common
    │   │   │       ├── Spinner.tsx                  # Loading spinner
    │   │   │       ├── ErrorBoundary.tsx            # React error boundary
    │   │   │       ├── Toaster.tsx                  # Toast container (shadcn)
    │   │   │       └── ConfirmDialog.tsx            # Confirmation modal
    │   │   │
    │   │   ├── /hooks                               # Custom React hooks
    │   │   │   ├── useAuth.ts                       # Auth state & actions
    │   │   │   ├── useCompany.ts                    # Company data
    │   │   │   ├── useAgents.ts                     # Agent management
    │   │   │   ├── useClients.ts                    # Client CRUD operations
    │   │   │   ├── useDocuments.ts                  # Document upload/download
    │   │   │   ├── useExtractions.ts                # Extraction operations
    │   │   │   ├── usePortals.ts                    # Portal CRUD
    │   │   │   ├── useAutomation.ts                 # Automation job control
    │   │   │   ├── useBrowserView.ts                # BrowserView show/hide/resize
    │   │   │   ├── useToast.ts                      # shadcn toast hook
    │   │   │   └── useIPC.ts                        # Generic IPC hook
    │   │   │
    │   │   ├── /services                            # Frontend service layer
    │   │   │   ├── ipc.service.ts                   # Type-safe IPC wrapper
    │   │   │   ├── auth.service.ts
    │   │   │   ├── company.service.ts               # Company IPC calls
    │   │   │   ├── agent.service.ts                 # Agent IPC calls
    │   │   │   ├── client.service.ts
    │   │   │   ├── document.service.ts
    │   │   │   ├── extraction.service.ts            # Extraction IPC calls
    │   │   │   ├── portal.service.ts
    │   │   │   └── automation.service.ts
    │   │   │
    │   │   ├── /store                               # State management (Zustand)
    │   │   │   ├── index.ts                         # Store aggregator
    │   │   │   ├── authStore.ts                     # Auth state (current agent)
    │   │   │   ├── companyStore.ts                  # Company data
    │   │   │   ├── clientStore.ts                   # Selected client state
    │   │   │   ├── documentStore.ts                 # Document list state
    │   │   │   ├── extractionStore.ts               # Extraction state
    │   │   │   ├── portalStore.ts                   # Portal list state
    │   │   │   └── automationStore.ts               # Automation job state
    │   │   │
    │   │   ├── /lib                                 # Utility library (shadcn convention)
    │   │   │   └── utils.ts                         # cn() helper for className merging
    │   │   │
    │   │   ├── /styles
    │   │   │   └── globals.css                      # Global styles + Tailwind
    │   │   │
    │   │   └── /types
    │   │       └── window.d.ts                      # Extend Window for electronAPI
    │   │
    │   └── /shared                                  # Code shared between main & renderer
    │       ├── /types
    │       │   ├── common.types.ts
    │       │   ├── company.types.ts
    │       │   ├── agent.types.ts
    │       │   ├── client.types.ts                  # Visa seeker entity
    │       │   ├── document.types.ts                # PDF/Image document entity
    │       │   ├── extraction.types.ts              # Extracted data entity
    │       │   ├── portal.types.ts                  # Portal metadata
    │       │   ├── automation.types.ts              # Job status, progress, etc.
    │       │   ├── ipc-contracts.types.ts           # IPC request/response types
    │       │   └── gemini.types.ts                  # Gemini API types
    │       │
    │       ├── /constants
    │       │   ├── document-types.constants.ts      # Allowed file types (PDF, JPG, PNG)
    │       │   ├── field-types.constants.ts         # Form field types
    │       │   ├── error-codes.constants.ts         # Application error codes
    │       │   ├── extraction-status.constants.ts   # PENDING, APPROVED, REJECTED
    │       │   ├── job-status.constants.ts          # RUNNING, PAUSED, COMPLETED, FAILED
    │       │   └── ipc-channels.constants.ts        # All IPC channel names
    │       │
    │       ├── /schemas                             # Validation schemas (Zod)
    │       │   ├── company.schema.ts
    │       │   ├── agent.schema.ts
    │       │   ├── client.schema.ts
    │       │   ├── document.schema.ts
    │       │   ├── extraction.schema.ts             # Extraction validation
    │       │   ├── portal.schema.ts
    │       │   └── automation.schema.ts
    │       │
    │       └── /utils
    │           ├── date-utils.ts
    │           ├── validation-utils.ts
    │           └── format-utils.ts
    │
    ├── /resources
    │   ├── /icons
    │   │   ├── icon.icns                            # macOS
    │   │   ├── icon.ico                             # Windows
    │   │   └── icon.png                             # Linux
    │   │
    │   └── /logs                                    # Winston log files
    │       ├── error.log
    │       ├── combined.log
    │       └── automation.log
    │
    ├── /tests                                       # Jest unit tests only
    │   └── /unit
    │       ├── /services
    │       │   ├── auth.service.test.ts
    │       │   ├── extraction.service.test.ts       # Extraction service tests
    │       │   └── gemini.service.test.ts
    │       ├── /automation
    │       │   ├── html-extractor.test.ts
    │       │   └── form-filler.test.ts
    │       └── /utils
    │           ├── crypto.test.ts
    │           └── validator.test.ts
    │
    ├── /scripts
    │   ├── setup-dev.sh                             # Initial dev setup
    │   ├── install-shadcn.sh                        # Install shadcn components
    │   └── build-production.sh
    │
    └── /docs
        ├── ARCHITECTURE.md
        ├── USER_FLOW.md                             # Document complete user flow
        ├── DATABASE_SCHEMA.md
        ├── EXTRACTION_GUIDE.md                      # Extraction workflow
        └── AUTOMATION_GUIDE.md
```