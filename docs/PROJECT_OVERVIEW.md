# Project Overview

Emigration Copilot - Desktop Application

Executive Summary
Emigration Copilot is an AI-powered desktop application designed for immigration and visa agencies to automate the tedious process of filling visa application forms across multiple government portals. The application combines intelligent data extraction from client documents using Google Gemini AI with browser automation powered by Playwright, all within a native desktop experience built on Electron.

Core Problem Statement
Immigration agencies face significant operational challenges:

Manual Data Entry: Agents spend hours manually filling repetitive visa forms across different portals

Error-Prone Process: Manual typing leads to mistakes that can delay or reject applications

Multiple Portals: Each country/visa type uses different portals with unique form structures

Document Chaos: Client documents (passports, education certificates, employment letters) are scattered and hard to organize

Repetitive Work: Same client information must be re-entered for every application

Solution Overview
Emigration Copilot provides a 3-step automated workflow:

Data Extraction: Upload client documents → AI extracts and structures information → Agent approves

Portal Selection: Choose immigration portal → AI analyzes form structure → Maps client data to fields

Automated Filling: AI fills forms page-by-page → Agent reviews → Handles CAPTCHAs/OTPs → Submission

The application runs entirely on the agent's desktop, providing a live browser preview alongside control panels for a seamless human-in-the-loop automation experience.

Technology Stack
Core Technologies
Electron: Cross-platform desktop framework (Windows, macOS, Linux)

Node.js 24: Backend runtime for main process

TypeScript: Type-safe development across entire codebase

React 18: Frontend UI framework

TailwindCSS v4 + shadcn/ui: Modern, accessible UI components

Webpack + Electron Forge: Build and packaging toolchain

AI & Automation
Google Gemini API: Multimodal AI for document extraction and form field mapping

Playwright: Browser automation engine

CDP (Chrome DevTools Protocol): Connects Playwright to embedded browser

Data & Storage
MongoDB Atlas: Cloud NoSQL database for companies, agents, clients, documents, extractions, portals, jobs

AWS S3: Cloud object storage for client documents (PDFs, images)

Supporting Libraries
Zustand: Lightweight state management

Zod: Schema validation

pdf-parse: PDF text extraction

Winston: Logging framework

bcrypt: Password hashing

Jest: Unit testing

Application Architecture
Electron Process Model
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS (Node.js)                  │
│  - Database connections (MongoDB)                           │
│  - File storage (S3)                                        │
│  - AI services (Gemini)                                     │
│  - Automation engine (Playwright + CDP)                     │
│  - Business logic services                                  │
│  - IPC handlers                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │ IPC (Inter-Process Communication)
                   │ contextBridge (Secure API)
┌──────────────────▼──────────────────────────────────────────┐
│                   RENDERER PROCESS (React)                  │
│  ┌────────────────────────────┬───────────────────────────┐ │
│  │   Control Panel (25%)      │  BrowserView (75%)        │ │
│  │  - Client selection        │  - Live portal preview    │ │
│  │  - Portal selection        │  - Real-time form filling │ │
│  │  - Start/Stop automation   │  - CAPTCHA/OTP handling   │ │
│  │  - Progress tracking       │  - Agent interaction      │ │
│  │  - Form preview/approval   │                           │ │
│  └────────────────────────────┴───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
Data Flow Architecture

User Documents (PDF/Image) → S3 Storage
                               ↓
                    PDF Text Extraction (pdf-parse)
                               ↓
                    Gemini API (Extraction Prompt)
                               ↓
            Structured JSON (Name, DOB, Passport, etc.)
                               ↓
                    MongoDB (extractions collection)
                               ↓
                    Agent Reviews & Approves
                               ↓
            Portal Selected → BrowserView Loads URL
                               ↓
            HTML Structure Extracted (Playwright)
                               ↓
    Gemini API (Mapping Prompt: HTML + Client Data)
                               ↓
    Automation Script (Field Selectors + Values)
                               ↓
            Agent Approves Mappings → Start Automation
                               ↓
    Playwright Fills Form → Agent Reviews → Submit
                               ↓
            Next Page Detection → Repeat Process
                               ↓
                Job Complete → Audit Log
User Roles & Data Model
Company
Represents an immigration agency

Has unique company ID, name, settings

Can have multiple agents

Has its own portal list

Shares clients, documents, extractions, and jobs across all agents

Agent
Immigration consultant working for a company

Authenticates with email + password (bcrypt hashed)

Can create/edit clients, upload documents, trigger extractions, run automations

All actions logged in audit trail

Client
Visa seeker/immigration applicant

Stores basic information: name, email, phone, nationality, DOB, passport number, etc.

Linked to multiple documents (PDFs, images)

Can have multiple extractions (different prompts/document sets)

Can have multiple automation jobs (different portals)

Document
PDF or image file uploaded to S3

Metadata stored in MongoDB (filename, S3 URL, file type, upload date, clientId)

Types: Passport, visa, education certificate, employment letter, bank statement, etc.

Extraction
AI-extracted structured data from client documents

JSON format with predefined schema (configurable per company)

Status: PENDING → APPROVED/REJECTED

Links to documents used for extraction

Agent can edit extracted data before approval

Portal
Immigration portal URL (e.g., UK UKVI, Australia IMMI, Canada GCKey)

Company-specific (each company configures its own portal list)

Metadata: country, portal name, URL, description

Automation Job
Single automation run for one client on one portal

Tracks status: QUEUED → RUNNING → PAUSED → COMPLETED/FAILED

Stores pages processed, fields filled, errors encountered

Can be paused for CAPTCHA/OTP and resumed

Logs stored for debugging

Detailed User Flow
Phase 1: Installation & Registration
Download & Install

User downloads .exe (Windows), .dmg (macOS), or .zip (portable)

Installs application on desktop

Launches application

Company Registration

First-time user clicks "Register"

Enters company details: name, country, contact info

Enters first agent details: name, email, password

System creates:

Company record in MongoDB

Agent record linked to company

Hashes password with bcrypt

Generates session token

Login

Subsequent logins use email + password

System validates credentials

Creates session token

Redirects to dashboard

Phase 2: Client & Document Management
Dashboard Overview

Displays statistics: total clients, pending extractions, active jobs

Quick actions: Add client, Upload documents, Start automation

Recent activity feed

Create Client

Navigate to Clients → New Client

Fill form: name, email, phone, DOB, nationality, passport number

Zod validates input

Client saved to MongoDB with companyId

Upload Documents

Select client → Documents tab → Upload

Drag-drop or browse PDFs/images

Files uploaded to S3 bucket: emigration-copilot-docs/{companyId}/{clientId}/{filename}

Document metadata saved to MongoDB with S3 URL

Types: Passport, visa, education, employment, financial

Phase 3: Data Extraction
Trigger Extraction

Select client → Extractions tab → New Extraction

Select documents to extract from (multi-select)

Optionally add custom prompt (e.g., "Focus on education details")

Click "Start Extraction"

Extraction Process (Backend)


1. Retrieve document URLs from MongoDB
2. Download PDFs from S3
3. Extract text using pdf-parse (for PDFs)
4. For images: Send directly to Gemini (multimodal)
5. Build Gemini prompt:
   - Client basic info
   - Document texts/images
   - Extraction schema (JSON structure)
   - Custom prompt if provided
6. Send to Gemini API (gemini-2.0-flash)
7. Parse JSON response
8. Validate with Zod schema
9. Store in extractions collection with status: PENDING
10. Notify renderer process
Review & Approve Extraction

Extraction appears in UI as "Pending Review"

Agent clicks to view extracted data in structured JSON viewer

Agent can edit any field (e.g., correct misspelled name)

Agent clicks "Approve" or "Reject"

If approved: status → APPROVED, approvedAt timestamp, approvedBy agentId

If rejected: agent can re-run with different prompt

Phase 4: Portal Selection & Automation Setup
Portal Management

Navigate to Settings → Portals

View company's portal list

Add new portal: name, URL, country, description

Portals saved per company (not shared across companies)

Select Client & Portal

Navigate to Automation page

Select client from dropdown (only clients with approved extractions)

Select portal from company's portal list

Click "Load Portal"

BrowserView Initialization

Right panel (75% width) activates

Electron creates BrowserView instance

Loads portal URL

CDP server running on port 9222

Playwright connects via connectOverCDP('http://localhost:9222')

Agent can interact with page (scroll, click, type) before automation

Phase 5: Automated Form Filling
Start Automation

Agent clicks "Start Automation" in left control panel

Optionally adds custom prompt (e.g., "Select 'Work Visa' option")

System creates automation job record (status: RUNNING)

Page Processing Loop (Per Page)

STEP 1: HTML EXTRACTION
- Playwright extracts page HTML structure
- Identifies all form fields:
  - Input (text, email, tel, date, number)
  - Select/dropdown options
  - Radio buttons (groups)
  - Checkboxes
  - File upload fields
- For each field captures:
  - Tag name, type, name, id, placeholder
  - Label text (via for attribute, parent label, adjacent label)
  - Required attribute
  - Options (for select/radio)
  - Unique CSS selector (priority: #id > [name] > .class)

STEP 2: AI MAPPING
- Send to Gemini API:
  - Extracted HTML structure (fields array)
  - Client's approved extraction data (JSON)
  - Custom prompt (if provided)
- Gemini returns automation script:
  {
    "fields": [
      {
        "fieldIndex": 0,
        "fieldName": "fullName",
        "fieldLabel": "Full Name",
        "fieldType": "text",
        "selector": "#applicant-name",
        "value": "John Doe",
        "confidence": "high",
        "reasoning": "Matched 'Full Name' label to client.name"
      },
      ...
    ],
    "captcha": {
      "detected": false
    },
    "otp": {
      "detected": false
    },
    "submitButton": {
      "selector": "button[type='submit']",
      "text": "Continue"
    }
  }

STEP 3: AGENT APPROVAL
- Display mapped fields in form preview modal
- Show: Field label, Detected value, Confidence
- Agent can edit values inline
- Agent clicks "Approve & Fill" or "Reject & Retry"
- If rejected: agent adds new prompt, system re-runs mapping

STEP 4: AUTOMATED FILLING
- For each field in approved mapping:
  - Scroll field into view
  - Fill based on field type:
    - text/email/tel: page.fill(selector, value)
    - select: page.selectOption(selector, value)
    - radio: click appropriate radio by value/label
    - checkbox: page.check(selector) or page.uncheck(selector)
    - date: page.fill(selector, 'YYYY-MM-DD')
    - file: Upload from S3 → temp file → page.setInputFiles()
  - Visual feedback: highlight filled field
  - Wait 500ms between fields (human-like)
  - Update progress bar in UI

STEP 5: CAPTCHA/OTP DETECTION
- After filling, check for:
  - reCAPTCHA iframe
  - hCAPTCHA iframe
  - Cloudflare Turnstile
  - Custom image CAPTCHA
  - OTP input fields
- If detected:
  - Pause automation (status: PAUSED)
  - Send toast notification: "Please solve CAPTCHA"
  - Agent interacts with BrowserView manually
  - Agent clicks "Resume" when done

STEP 6: SUBMISSION
- Agent reviews filled form in BrowserView
- Agent clicks "Submit & Continue" in control panel
- Playwright clicks submit button
- Wait for navigation/page load

STEP 7: NEXT PAGE DETECTION
- Check if new page loaded (URL change or DOM change)
- If new page detected:
  - Log page completion
  - Repeat STEP 1-7 for next page
- If no new page (final submission):
  - Mark job as COMPLETED
  - Store completion timestamp
  - Show success notification
Phase 6: Job Monitoring & History
Job History

Navigate to Automation → History

View all past jobs with:

Client name

Portal name

Status (Completed, Failed, Paused)

Duration

Pages processed

Created date

Click job to view detailed logs

Audit Logs

Navigate to Settings → Audit Logs

View all agent actions:

Client created/edited

Document uploaded/deleted

Extraction triggered/approved/rejected

Automation started/completed/failed

Filter by date, agent, action type

Key Technical Features
1. Split-View Architecture
The automation page uses a unique split-view layout:

Left Panel (25%): Control center

Client selector dropdown

Portal selector dropdown

"Load Portal" button

"Start Automation" button

Custom prompt textarea

Progress bar (0-100%)

Status messages

Form preview (when available)

Approve/Reject buttons

Resume/Stop buttons

Right Panel (75%): Live browser

Embedded BrowserView (not iframe)

Full browser functionality

Agent can scroll, click, type

Used for manual CAPTCHA/OTP entry

Toggle visibility button

2. Human-in-the-Loop Automation
Critical checkpoints where agent intervention is required:

Extraction Approval: Agent verifies extracted data accuracy

Mapping Approval: Agent reviews AI field mappings before filling

CAPTCHA Solving: Agent solves CAPTCHAs manually in live browser

OTP Entry: Agent enters OTPs received via email/SMS

Final Review: Agent inspects filled form before submission

This ensures accuracy while maintaining speed through automation.

3. Multi-Page Form Handling
Immigration portals typically have 10-20 pages per application:

Personal details

Passport information

Education history

Employment history

Financial details

Travel history

Family information

Document uploads

Declaration & signatures

Review & submit

The system automatically detects page transitions and processes each page sequentially until completion.

4. Intelligent Field Mapping
Gemini AI handles complex mapping scenarios:

Ambiguous Labels: "Date of Birth" vs "DOB" vs "Birth Date"

Dropdown Matching: Map "Bachelor's Degree" to "Undergraduate" option

Radio Groups: Select appropriate radio based on value match

Date Formats: Convert "1990-05-15" to portal's required format (MM/DD/YYYY, DD-MM-YYYY, etc.)

Address Fields: Split "123 Main St, New York, NY 10001" into street, city, state, zip

Multi-Select: Handle fields requiring multiple selections

5. Error Handling & Recovery
Robust error handling at every layer:

Network Failures: Retry API calls with exponential backoff

Selector Failures: Try alternative selectors (ID → name → class)

Timeout Handling: Wait up to 30s for elements, then pause for manual intervention

Invalid Data: Zod validation catches malformed inputs before submission

Session Expiry: Detect portal session timeouts, notify agent to re-login

Job Resumption: Save job state to MongoDB, allow resuming from last successful page

6. Security & Privacy
Local-First: All automation runs on agent's desktop (not cloud-based RPA)

Encrypted Storage: Passwords hashed with bcrypt (10 rounds)

Context Isolation: Renderer process cannot access Node.js APIs directly

Secure IPC: All main-renderer communication validated with Zod schemas

Audit Trail: Every action logged with timestamp, agentId, companyId

S3 Pre-signed URLs: Documents accessed via temporary signed URLs (24hr expiry)

No Credential Storage: Portal credentials not stored (agent logs in manually)

Database Schema
companies Collection
typescript
{
  _id: ObjectId,
  name: string,
  country: string,
  email: string,
  phone: string,
  createdAt: Date,
  updatedAt: Date
}
agents Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  name: string,
  email: string,              // Unique
  passwordHash: string,       // bcrypt
  role: 'admin' | 'agent',
  isActive: boolean,
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
clients Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  name: string,
  email: string,
  phone: string,
  dateOfBirth: Date,
  nationality: string,
  passportNumber: string,
  // Additional custom fields per company
  customFields: object,
  createdBy: ObjectId,        // agentId
  createdAt: Date,
  updatedAt: Date
}
documents Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  clientId: ObjectId,
  filename: string,
  s3Url: string,
  s3Key: string,
  fileType: 'pdf' | 'jpg' | 'png',
  documentType: 'passport' | 'visa' | 'education' | 'employment' | 'financial' | 'other',
  fileSize: number,
  uploadedBy: ObjectId,       // agentId
  createdAt: Date
}
extractions Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  clientId: ObjectId,
  documentIds: ObjectId[],
  extractedData: object,      // Structured JSON from Gemini
  customPrompt: string,
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
  approvedAt: Date,
  approvedBy: ObjectId,       // agentId
  rejectionReason: string,
  createdBy: ObjectId,        // agentId
  createdAt: Date,
  updatedAt: Date
}
portals Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  name: string,
  url: string,
  country: string,
  description: string,
  isActive: boolean,
  createdBy: ObjectId,        // agentId
  createdAt: Date,
  updatedAt: Date
}
automation_jobs Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  clientId: ObjectId,
  portalId: ObjectId,
  extractionId: ObjectId,
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED',
  currentPage: number,
  totalPages: number,
  pagesProcessed: string[],   // Array of page URLs
  fieldsFilledCount: number,
  pauseReason: 'CAPTCHA' | 'OTP' | 'MANUAL_INTERVENTION' | null,
  customPrompt: string,
  errorLog: string,
  startedAt: Date,
  completedAt: Date,
  duration: number,           // milliseconds
  createdBy: ObjectId,        // agentId
  createdAt: Date,
  updatedAt: Date
}
audit_logs Collection
typescript
{
  _id: ObjectId,
  companyId: ObjectId,
  agentId: ObjectId,
  action: string,             // 'CLIENT_CREATED', 'DOCUMENT_UPLOADED', 'EXTRACTION_APPROVED', 'JOB_STARTED'
  resourceType: string,       // 'client', 'document', 'extraction', 'job'
  resourceId: ObjectId,
  details: object,
  ipAddress: string,
  createdAt: Date
}
AI Prompting Strategy
Extraction Prompt Template

You are an expert data extraction assistant for immigration applications.

TASK: Extract structured information from the following client documents.

CLIENT BASIC INFO:
{clientBasicInfo}

DOCUMENTS:
{documentTexts and/or images}

CUSTOM INSTRUCTIONS:
{agentCustomPrompt}

OUTPUT SCHEMA:
{
  "personalInfo": {
    "fullName": string,
    "dateOfBirth": "YYYY-MM-DD",
    "gender": "Male" | "Female" | "Other",
    "nationality": string,
    "placeOfBirth": string
  },
  "passport": {
    "number": string,
    "issueDate": "YYYY-MM-DD",
    "expiryDate": "YYYY-MM-DD",
    "issuingCountry": string
  },
  "education": [
    {
      "degree": string,
      "institution": string,
      "country": string,
      "yearOfCompletion": number
    }
  ],
  "employment": [
    {
      "jobTitle": string,
      "company": string,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD" | "Present",
      "country": string
    }
  ],
  // ... additional fields
}

INSTRUCTIONS:
1. Extract ALL information accurately from documents
2. Use exact dates in YYYY-MM-DD format
3. If information is unclear, use null
4. Return ONLY valid JSON, no explanations
Automation Mapping Prompt Template

You are an expert form automation assistant.

TASK: Map client data to HTML form fields.

CLIENT DATA (Approved Extraction):
{extractedData}

HTML FORM STRUCTURE:
{htmlFieldsArray}

CUSTOM INSTRUCTIONS:
{agentCustomPrompt}

OUTPUT SCHEMA:
{
  "fields": [
    {
      "fieldIndex": number,
      "fieldName": string,
      "fieldLabel": string,
      "fieldType": "text" | "select" | "radio" | "checkbox" | "date" | "email" | "tel" | "file",
      "selector": string,        // CSS selector
      "value": string,           // Value to fill
      "confidence": "high" | "medium" | "low",
      "reasoning": string
    }
  ],
  "captcha": {
    "detected": boolean,
    "type": "reCAPTCHA" | "hCAPTCHA" | "Cloudflare" | "Custom" | null
  },
  "otp": {
    "detected": boolean,
    "fieldSelector": string | null
  },
  "submitButton": {
    "selector": string,
    "text": string
  }
}

CRITICAL RULES:
1. Match field labels to client data intelligently (handle variations)
2. For SELECT fields: return exact "value" attribute from options
3. For RADIO fields: match by label text, then value
4. For DATE fields: convert to portal's expected format
5. Use most reliable CSS selector (prefer #id > [name] > .class)
6. If unsure, mark confidence as "medium" or "low"
7. Detect CAPTCHA/OTP fields and mark them
8. Return COMPLETE valid JSON with all closing brackets
Performance & Scalability
Expected Performance Metrics
Extraction: 10-30 seconds per client (depends on document count)

Mapping: 5-10 seconds per page

Form Filling: 30-60 seconds per page (with human-like delays)

Complete Application: 10-30 minutes per portal (10-20 pages)

Concurrency Limits
Single Automation at a Time: Due to BrowserView limitation (one visible browser per window)

Background Extractions: Can run while automation is active

Multiple Agents: Each agent runs on separate desktop instance

Scalability Considerations
MongoDB: Atlas handles thousands of companies with auto-scaling

S3: Unlimited document storage, CDN for faster downloads

Gemini API: Rate limits: 15 RPM (free tier), 360 RPM (paid tier)

Electron: Desktop app scales horizontally (each agent = separate instance)

Testing Strategy
Unit Tests (Jest)
Services: Auth, extraction, automation orchestration logic

Utilities: Crypto, validation, date formatting

AI Parsing: Gemini response parsing and error recovery

Field Fillers: Individual field type filling logic

Manual Testing Checklist
Registration and login flow

Client CRUD operations

Document upload to S3

Extraction triggering and approval

Portal loading in BrowserView

Automation start and field filling

CAPTCHA/OTP detection

Multi-page navigation

Job completion and history

Deployment & Distribution
Build Process
bash
npm run build              # Webpack bundles main + renderer
electron-forge package     # Creates platform-specific packages
electron-forge make        # Generates installers
Installers
Windows: .exe (Squirrel installer, auto-updates)

macOS: .dmg (drag-to-Applications, code-signed)

Linux: .AppImage (portable, no installation required)

Update Mechanism
Future: Implement electron-updater for auto-updates

Check for updates on app startup

Download and install in background

Security Considerations
No Cloud Automation: All form filling happens locally on agent's machine

No Credential Storage: Agent logs into portals manually (not automated login)

Document Encryption: S3 server-side encryption enabled

Session Management: JWT tokens with 7-day expiry

Input Sanitization: All user inputs validated with Zod before MongoDB insertion

Audit Logging: Every action tracked for compliance

Future Enhancements (v2)
Batch Automation: Queue multiple clients for same portal

Template System: Save field mappings as templates per portal

OCR for Images: Extract text from scanned documents

Multi-Language Support: UI localization

Browser Extensions: Auto-capture portal sessions

Analytics Dashboard: Success rates, average completion time per portal

Team Collaboration: Real-time job status sharing across agents

API Access: Allow third-party integrations

Conclusion
Emigration Copilot transforms immigration agencies' operations by combining AI-powered data extraction with intelligent browser automation, all within a secure, desktop-native application. The human-in-the-loop approach ensures accuracy while dramatically reducing manual work, allowing agents to process 5-10x more applications per day.