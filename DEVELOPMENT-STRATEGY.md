# Development Strategy - Codespace + Render Workflow

## Decision Made: January 10, 2026

**Choice:** Option B - Don't expose Codespace publicly. Deploy to Render for extension testing.

---

## Why This Approach?

### The Problem We Faced

```
LOCAL BROWSER                     CODESPACE (Cloud)
┌─────────────────┐              ┌─────────────────┐
│  Chrome         │              │  Server on      │
│  Extension      │  ─── X ───►  │  port 3000      │
│                 │   Can't      │                 │
│                 │   reach!     │                 │
└─────────────────┘              └─────────────────┘
```

The extension runs locally, but the server is in GitHub's cloud. To connect them, we'd need to make port 3000 **public** (accessible to anyone on the internet).

### Why We Said No

| Risk | Why It Matters |
|------|----------------|
| **Anyone can access** | Dev servers have debug info, verbose errors |
| **No rate limiting** | Could be abused |
| **URL can leak** | If shared accidentally, server is exposed |
| **Overkill for dev** | We only need extension testing occasionally |

### The Safer Path

```
CODESPACE                         RENDER (Production)
┌─────────────────┐              ┌─────────────────────┐
│                 │              │                     │
│  Write code     │  ── git ──►  │  Server runs here   │
│  Run web app    │    push      │  (secure, proper    │
│  Test UI        │              │   production setup) │
│                 │              │                     │
└─────────────────┘              └──────────┬──────────┘
                                            │
                                            │ HTTPS
                                            ▼
                                 ┌─────────────────────┐
                                 │  Chrome Extension   │
                                 │  connects here      │
                                 │  (your local        │
                                 │   browser)          │
                                 └─────────────────────┘
```

---

## The Workflow

### Phase 1: Code in Codespace

Use Codespace for all development work:

```bash
# Start the web server
npm run dev:web

# Access via Codespace's forwarded port (browser inside Codespace or VS Code)
# URL: https://xxx-3000.app.github.dev (private, only you can access)
```

**What you CAN test in Codespace:**
- Web dashboard UI
- API endpoints (via browser or curl)
- Database operations
- Authentication flow (Clerk)
- Socket.io server-side logic

**What you CANNOT test in Codespace:**
- Chrome extension connecting to the server
- Full scraping workflow (extension → server → database → UI)

### Phase 2: Push to GitHub

When ready to test extension:

```bash
git add .
git commit -m "feat: description of changes"
git push origin develop
```

### Phase 3: Deploy to Render

Render automatically deploys from your repo (once set up):

1. **First time:** Connect repo to Render, configure environment
2. **After that:** Every push to `main` (or configured branch) auto-deploys

Render URL: `https://your-app-name.onrender.com`

### Phase 4: Test Extension Against Render

1. Update `apps/extension/.env`:
   ```
   PLASMO_PUBLIC_API_URL="https://your-app-name.onrender.com"
   ```

2. Rebuild extension:
   ```bash
   cd apps/extension && npm run build
   ```

3. Reload extension in Chrome

4. Test the full flow:
   - Sign in on Render-hosted dashboard
   - Extension receives auth token
   - Click "Scrape" → Extension executes → Jobs appear

---

## What This Means for Our Task List

### Do in Codespace (Safe)

| Task | Notes |
|------|-------|
| Database setup | PostgreSQL in Codespace, run migrations |
| Web app development | All UI, API, Socket.io server work |
| Proposal Workbench | Build the UI and API |
| AI integration | Add Claude API for proposals |
| Unit testing | Test individual components |

### Do After Render Deploy (Requires Production)

| Task | Notes |
|------|-------|
| Extension connection testing | Full Socket.io flow |
| Scraping workflow | Extension → Server → DB |
| End-to-end testing | Complete user journey |
| Multi-platform testing | Upwork, LinkedIn, etc. |

---

## Updated Development Phases

### Phase 1: Codespace Setup (Current)
- [x] Devcontainer configured
- [x] SSH access working
- [x] Claude Code running
- [ ] PostgreSQL running
- [ ] Prisma migrations applied
- [ ] Web app starts successfully

### Phase 2: Feature Development (In Codespace)
- [ ] Test existing UI works
- [ ] Build Proposal Workbench
- [ ] Add AI proposal generation
- [ ] Improve job filtering

### Phase 3: Render Deployment
- [ ] Create Render account/project
- [ ] Add environment variables
- [ ] Deploy from `develop` or `main`
- [ ] Verify health check passes

### Phase 4: Extension Testing (Against Render)
- [ ] Update extension `.env` with Render URL
- [ ] Rebuild and reload extension
- [ ] Test full scraping flow
- [ ] Test auth token relay
- [ ] Verify job ingestion

### Phase 5: Production Polish
- [ ] Multi-platform selector optimization
- [ ] Error handling improvements
- [ ] Rate limiting
- [ ] Final security review

---

## Quick Reference

| Environment | URL | Use For |
|-------------|-----|---------|
| **Codespace** | `https://xxx-3000.app.github.dev` (private) | Coding, UI testing, API testing |
| **Render** | `https://your-app.onrender.com` | Extension testing, production |
| **Local** | `http://localhost:3000` | Only if running locally (not our approach) |

---

## Key Insight

> **Codespace is for coding. Render is for testing the full system.**

This separation keeps development fast (no deploy needed to test UI changes) while keeping security tight (no public exposure of dev servers).

---

## Files to Update When Switching Environments

| File | Codespace | Render |
|------|-----------|--------|
| `apps/extension/.env` | N/A (don't test extension) | `PLASMO_PUBLIC_API_URL="https://your-app.onrender.com"` |
| `apps/web/.env` | `DATABASE_URL="postgresql://..."` (local PG) | Set by Render automatically |

The web app doesn't need URL changes - it serves itself. Only the extension needs to know where to connect.
