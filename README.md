# Immigration Copilot

AI-powered desktop application for immigration agencies to automate visa form filling.

## Features

- **User Authentication**: Company registration and agent login
- **Client Management**: Manage visa applicants and their documents
- **AI-Powered Extraction**: Extract structured data from PDFs and images using Gemini
- **Form Automation**: Auto-fill immigration portals with Playwright
- **Split-View UI**: Control panel with live browser preview
- **Human-in-the-Loop**: Agent approval at critical checkpoints
- **CAPTCHA/OTP Handling**: Pause for manual intervention

## Tech Stack

- **Desktop**: Electron + Electron Forge
- **Frontend**: React + TypeScript + TailwindCSS + shadcn/ui
- **State**: Zustand
- **Validation**: Zod
- **Database**: MongoDB Atlas
- **Storage**: AWS S3
- **AI**: Google Gemini API
- **Automation**: Playwright

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB Atlas account
- AWS S3 bucket
- Gemini API key

### Installation

```bash
# Install dependencies
npm install

# Copy environment file and fill in values
cp .env.example .env

# Start development
npm start
```

### Build

```bash
# Create distributable
npm run make
```

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── core/       # Window, BrowserView, Logger
│   ├── config/     # Environment, database, AI config
│   ├── database/   # MongoDB repositories
│   ├── storage/    # S3 document storage
│   ├── services/   # Auth, AI services
│   └── ipc/        # IPC handlers
├── renderer/       # React frontend
│   ├── components/ # UI components
│   ├── pages/      # Application pages
│   ├── stores/     # Zustand stores
│   └── lib/        # API bridge, utilities
└── shared/         # Shared types, schemas, constants
```

## Environment Variables

See `.env.example` for required variables:
- `MONGODB_URI` - MongoDB Atlas connection string
- `AWS_*` - S3 credentials and bucket
- `GEMINI_API_KEY` - Google Gemini API key
- `SESSION_SECRET` - Session encryption key

## License

MIT
