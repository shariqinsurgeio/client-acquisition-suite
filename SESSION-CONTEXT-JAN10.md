# Session Context - January 10, 2026

This document captures the full context of our Claude Code session for anyone picking up work on Client Acquisition Suite.

---

## TL;DR

- **Project**: Client Acquisition Suite - a "Puppet Master" system for aggregating freelance job leads
- **Environment**: GitHub Codespace (cloud-based, no local storage used)
- **Status**: Core features built, needs Codespace-specific configuration to work end-to-end
- **Blocker**: Chrome extension can't connect to Codespace backend yet (CORS/manifest updates needed)

---

## Part 1: What Is This Project?

### Architecture: "Puppet Master"

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                              │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │  Chrome Extension│◄────────────►│  Web Dashboard          │   │
│  │  "The Hands"     │   Socket.io  │  "The Brain"            │   │
│  │                  │              │                         │   │
│  │  - Scrapes jobs  │              │  - Shows job feed       │   │
│  │  - Executes      │              │  - Sends commands       │   │
│  │    commands      │              │  - Stores data          │   │
│  └─────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Location | Tech Stack |
|-----------|----------|------------|
| **Brain** (Web App) | `apps/web/` | Next.js 16, Socket.io, Prisma, Clerk Auth |
| **Hands** (Extension) | `apps/extension/` | Plasmo (Chrome MV3), Socket.io Client |

### What It Does

1. User logs into Upwork/LinkedIn/Fiverr in their browser (normal login)
2. User clicks "Scrape" button in the dashboard
3. Dashboard sends command to extension via Socket.io
4. Extension opens job listings, scrolls, extracts data
5. Jobs sent back to server, auto-scored (0-100 fit score)
6. Jobs appear in dashboard for review/action

---

## Part 2: Why Codespaces?

### The Problem

The project owner didn't want to consume local storage:
- Project lives on Google Drive (synced to Mac)
- `node_modules` would add ~500MB+ locally
- Google Drive sync + git = occasional corruption issues

### The Solution

GitHub Codespaces runs everything in the cloud:
- Code executes on GitHub's servers
- Local machine just runs a terminal (Ghostty) or browser
- Zero local storage used for dependencies

### Current Setup

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL MAC (Ghostty Terminal)                                   │
│                                                                 │
│  Tab 1: gh codespace ssh → Claude Code (this session)           │
│  Tab 2: (available for other work)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ SSH
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  GITHUB CODESPACE (Cloud VM)                                    │
│                                                                 │
│  - Full repo cloned                                             │
│  - node_modules installed (500MB+ lives HERE)                   │
│  - Claude Code running                                          │
│  - Port 3000 available for web server                           │
│                                                                 │
│  Codespace name: cautious-palm-tree-76qrxqxv9g52qgr             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: What's Already Built

### Fully Implemented (✅)

| Feature | Details |
|---------|---------|
| **Authentication** | Clerk integration for web + extension token relay |
| **Database Schema** | PostgreSQL/SQLite with Prisma (Job, PlatformSelector models) |
| **Job API** | Full CRUD with Zod validation, user isolation |
| **Job Feed UI** | Sorting, filtering, expand/collapse, fit scores |
| **Socket.io Protocol** | DATA_INGEST, CMD_EXECUTE, TASK_UPDATE, SCRAPE_PROGRESS |
| **Extension Scraping** | Scroll-until-exhausted, selector fallbacks, keepalive |
| **Fit Scoring** | Auto-calculated 0-100 on job ingestion |
| **Devcontainer** | Auto-setup for Codespaces (Node 20, Claude Code, Prisma, SSH) |
| **Deployment Config** | `render.yaml` ready for production |

### Partial/Placeholder (⚠️)

| Feature | Status |
|---------|--------|
| **Proposal Workbench** | UI exists, no functionality |
| **Multi-Platform** | Infrastructure ready, only Upwork tested |

### Not Built (❌)

| Feature | Notes |
|---------|-------|
| Auto-apply | No UI or extension handler |
| AI Proposal Generation | No Claude API integration |
| Bulk Operations | No multi-select |
| Advanced Filtering | No fit score range filter |

---

## Part 4: The Codespace Challenge

### The Problem

The Chrome extension runs in the **user's local browser**, but the backend runs in **Codespace** (cloud).

```
LOCAL BROWSER                     CODESPACE
┌─────────────┐                  ┌─────────────┐
│  Extension  │ ──── ? ────────► │  Server     │
│             │  Can't reach     │  Port 3000  │
│             │  localhost:3000  │             │
└─────────────┘                  └─────────────┘
```

When the extension tries to connect to `http://localhost:3000`, it's trying to reach the user's local machine, not the Codespace.

### The Solution

1. **Make port 3000 public** in Codespace (exposes it to internet)
2. **Update CORS** to allow `*.app.github.dev` origins
3. **Update extension manifest** to allow Codespace URLs
4. **Update extension `.env`** with Codespace public URL

```
LOCAL BROWSER                     CODESPACE (Public URL)
┌─────────────┐                  ┌─────────────────────────────────┐
│  Extension  │ ────────────────►│  https://xxx-3000.app.github.dev │
│             │  Works!          │  (publicly accessible)           │
└─────────────┘                  └─────────────────────────────────┘
```

---

## Part 5: What Needs To Happen Next

### Phase 1: Codespace Environment Setup

**Files to modify:**

| File | Change |
|------|--------|
| `apps/web/server.ts` | Add `*.app.github.dev` to CORS allowed origins |
| `apps/extension/package.json` | Add `https://*.app.github.dev/*` to `externally_connectable` |
| `apps/extension/.env` | Set `PLASMO_PUBLIC_API_URL` to Codespace public URL |
| `apps/web/.env` | Set `NEXT_PUBLIC_APP_URL` to Codespace public URL |

**Manual step:**
- In Codespace ports panel, set port 3000 visibility to "Public"

### Phase 2: Database Setup

```bash
# Start PostgreSQL in Codespace
docker run --name cas-postgres -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=clientacquisition -p 5432:5432 -d postgres:16

# Update apps/web/.env
DATABASE_URL="postgresql://postgres:password@localhost:5432/clientacquisition"

# Run migrations
cd apps/web && npx prisma migrate dev
```

### Phase 3: Build & Test

```bash
# Start web server
npm run dev:web

# In another terminal, build extension
npm run dev:ext

# Load extension in Chrome from:
# apps/extension/build/chrome-mv3-dev/
```

### Phase 4: End-to-End Testing

- [ ] Sign in via Clerk
- [ ] Extension shows "CONNECTED"
- [ ] Scrape button works
- [ ] Jobs appear in dashboard
- [ ] Jobs are user-isolated

### Phase 5: Feature Completion

Priority order:
1. Proposal Workbench (make it functional)
2. AI Proposal Generation (Claude API)
3. Multi-platform selector optimization
4. Advanced filtering
5. Bulk operations
6. Auto-apply workflow

### Phase 6: Production Deployment

- Deploy to Render via `render.yaml`
- Update extension for production URL
- Full verification

---

## Part 6: Key Files Reference

| File | Purpose |
|------|---------|
| `apps/web/server.ts` | Custom Node server with Socket.io + CORS |
| `apps/web/context/SocketContext.tsx` | React Socket.io state management |
| `apps/web/components/Header.tsx` | Nav with scrape button, status |
| `apps/web/components/JobFeed.tsx` | Job list with actions |
| `apps/web/prisma/schema.prisma` | Database models |
| `apps/extension/background.ts` | Service worker, scraping logic |
| `apps/extension/contents/auth-bridge.ts` | Token relay to extension |
| `.devcontainer/devcontainer.json` | Codespace auto-setup config |
| `CODESPACES-GUIDE.md` | How to use Codespaces for this project |
| `CLAUDE.md` | Claude Code instructions |
| `PROGRESS.md` | Progress tracking |

---

## Part 7: Commands Quick Reference

```bash
# Start web server (from root)
npm run dev:web

# Build extension (from root)
npm run dev:ext

# Run both builds
npm run build

# Prisma commands (from apps/web)
npx prisma generate    # Generate client
npx prisma migrate dev # Run migrations
npx prisma studio      # Visual database browser

# Git workflow
git add .
git commit -m "message"
git push origin develop

# Codespace management (from local terminal)
gh codespace list
gh codespace ssh -c <name>
gh codespace stop -c <name>
gh codespace delete -c <name>
```

---

## Part 8: Session History Summary

### Previous Session (Local Mac)

1. Scanned project, found it substantially built
2. User didn't want local storage consumption
3. Created `.devcontainer/devcontainer.json` for Codespaces
4. Fixed SSH issues (added sshd feature)
5. Created `CODESPACES-GUIDE.md`
6. Successfully SSH'd into Codespace
7. Started Claude Code in Codespace

### This Session (Inside Codespace)

1. Identified current location (Codespace on Azure)
2. Explored codebase status
3. Identified the extension ↔ Codespace connection challenge
4. Created comprehensive task list at `/home/node/.claude/plans/zippy-pondering-goblet.md`
5. Reviewed previous session context
6. Created this guide

---

## Questions?

Key contacts/resources:
- **Repo**: `shariqinsurgeio/client-acquisition-suite`
- **Branch**: `develop` (working branch) → `main` (production)
- **Docs**: `CLAUDE.md`, `PROGRESS.md`, `CODESPACES-GUIDE.md`
- **Audits**: `audits/` folder has strategic analysis documents
