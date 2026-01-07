## Tech Stacks

- **Runtime:** Node.js 24 – modern JavaScript runtime for the Electron main process and backend services. Or whatever electron has, my system has node 24. 
- **Desktop Framework:** Electron – cross-platform desktop shell hosting main (Node) and renderer (React) processes.  
- **Language:** TypeScript – typed superset of JavaScript for safer, more maintainable code across main, renderer, and shared layers.  
- **Frontend Framework:** React – component-based UI for all screens (auth, clients, documents, extractions, automation).  
- **Styling:** TailwindCSS v4 – utility-first CSS for rapid, consistent styling in the renderer.  
- **UI Library:** shadcn/ui – headless, copy-paste React components on top of Tailwind for high-quality, accessible UI primitives.  
- **State Management:** Zustand – lightweight global state for auth, clients, portals, extractions, and automation jobs.  
- **Validation:** Zod – schema-based validation for IPC payloads, environment variables, and domain models.  
- **Database:** MongoDB (Atlas) – cloud-hosted NoSQL database for companies, agents, clients, documents, extractions, portals, and jobs.  
- **File Storage:** AWS S3 – object storage for client documents (PDFs and images) with pre-signed access.  
- **AI:** Google Gemini API – LLM for document data extraction and HTML form field mapping into structured JSON and if image as document is uploaded then image will be sent to Gemini.  
- **Automation:** Playwright (core) – browser automation attached to Electron via CDP to fill portals inside the desktop app.  
- **PDF Parsing:** pdf-parse – server-side text extraction from uploaded PDFs to feed Gemini.  
- **Logging:** Winston – centralized, leveled logging with file-based transports for errors and automation events.  
- **Packaging:** Electron Forge + Webpack – build, bundle, and package the TypeScript + React Electron app into installers.  
- **Auth Security:** bcrypt – password hashing for agent accounts within companies.  
- **Testing:** Jest – basic unit tests for services, automation helpers, and utilities.  
- **Config Management:** dotenv – environment variable loading for DB URL, S3, and Gemini credentials.
