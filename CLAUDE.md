# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Client Acquisition Suite is a "Puppet Master" distributed system for a 2-person GenAI agency to aggregate job leads from Upwork, LinkedIn, Fiverr, and Freelancer. The user controls everything from a web dashboard while a browser extension acts as the "Hands" executing actions in the local browser context.

**Note:** This project was previously called "AgencyOS" / "Agency OS". Always use "Client Acquisition Suite" or "CAS" for naming.

## Architecture: The Puppet Master

Two distinct applications communicate via Socket.io:

**The Brain (Webapp)** - `apps/web/`
- Next.js with custom Node.js server (NOT serverless)
- Socket.io server for persistent extension connections
- SQLite database with Prisma ORM
- Runs on port 3000
- TypeScript server with Zod validation

**The Hands (Extension)** - `apps/extension/`
- Plasmo Framework (Chrome extension)
- Socket.io client connects to the Brain
- Chrome alarms for service worker keepalive
- Executes scraping commands and sends data back

**Critical:** The custom `server.ts` hosts both Next.js AND Socket.io on the same port. Standard serverless API routes will NOT work for persistent extension connections. Do not suggest serverless solutions.

## Development Commands

```bash
# From root - start both apps
npm run dev:web      # Start Next.js + Socket.io server (localhost:3000)
npm run dev:ext      # Start Plasmo extension builder (watch mode)

# Build all workspaces
npm run build

# From apps/web
npm run dev          # npx tsx server.ts (TypeScript server)
npm run build        # Next.js production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check

# From apps/extension
npm run dev          # Plasmo dev builder
npm run build        # Production build
npm run package      # Create distributable ZIP
npm run typecheck    # TypeScript check
```

**Loading the extension:** After `npm run dev:ext`, load the unpacked extension from `apps/extension/build/chrome-mv3-dev/` in `chrome://extensions`.

## Socket.io Protocol

| Event | Direction | Purpose |
|-------|-----------|---------|
| `EXTENSION_CONNECT` | Ext → Server | Initial handshake with extension ID |
| `CMD_EXECUTE` | Server → Ext | Commands: `{ action: "SCRAPE", platform: "UPWORK", targetUrl: "..." }` |
| `DATA_INGEST` | Ext → Server | Scraped job data (auto-calculates fitScore) |
| `TASK_UPDATE` | Ext → Server | Task completion status |
| `SCRAPE_PROGRESS` | Ext → Server | Real-time scraping progress |
| `JOB_UPDATE` | Server → Web | Broadcast new jobs to dashboards |
| `STATUS_UPDATE` | Server → All | Extension online/offline status |

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/server.ts` | TypeScript server with Socket.io + Zod validation |
| `apps/web/context/SocketContext.tsx` | Global Socket.io state for React |
| `apps/web/components/Header.tsx` | Nav with scrape button, progress, status |
| `apps/web/components/JobFeed.tsx` | Job list with fit scores, sorting, filtering, actions |
| `apps/web/app/api/jobs/route.ts` | GET/POST jobs with Zod validation |
| `apps/web/app/api/jobs/[id]/route.ts` | PATCH/DELETE individual jobs |
| `apps/web/prisma/schema.prisma` | Database models |
| `apps/extension/background.ts` | Extension service worker with keepalive |
| `apps/extension/popup.tsx` | Extension popup UI |

## Fit Scoring System

Jobs are automatically scored 0-100 on ingestion based on:
- **Positive keywords:** AI, automation, GenAI, LLM, Python, React, etc. (+8 each)
- **Negative keywords:** unpaid, volunteer, intern, data entry, etc. (-20 each)
- **Budget parsing:** Higher budgets get bonus points

Scoring rules are defined in `server.ts` and can be made configurable.

## Database

SQLite with Prisma. Schema at `apps/web/prisma/schema.prisma`.

**Models:**
- `PlatformSelector` - CSS selectors for scraping (stored as JSON, NOT hardcoded)
- `Job` - Job listings (title, description, url, platform, status, fitScore)

```bash
# Run migrations
cd apps/web && npx prisma migrate dev

# Generate client after schema changes
cd apps/web && npx prisma generate
```

## Security Features

- **CORS:** Restricted to localhost and chrome-extension:// origins
- **Socket.io Auth:** Extension ID validation on connect
- **Zod Validation:** All Socket events and API routes validated
- **Input Sanitization:** Max lengths enforced on all text fields

## Architecture Rules

1. **No hardcoded selectors** - CSS selectors are stored in `PlatformSelector` table
2. **Human-like automation** - Random delays, scroll detection, retry logic
3. **Extension never logs in** - Uses user's existing session/cookies
4. **Server broadcasts only new jobs** - Duplicates are silently updated
5. **Keepalive required** - Chrome alarms ping every 24s to maintain service worker

## Environment Variables

**apps/web/.env:**
```
DATABASE_URL="file:./dev.db"
```

**apps/extension/.env:**
```
PLASMO_PUBLIC_API_URL="http://127.0.0.1:3000"
```

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml`:
- TypeScript typecheck for web and extension
- ESLint for web app
- Build verification for both apps

## Tech Stack

- **Frontend:** React 19, Next.js 16, Tailwind CSS 4, Lucide Icons
- **Backend:** Node.js + tsx, Socket.io 4.8
- **Database:** SQLite + Prisma 6
- **Validation:** Zod 4
- **Extension:** Plasmo 0.90, TypeScript
- **Monorepo:** npm workspaces
