# Client Acquisition Suite - Progress Tracker

**Last Updated:** 2026-01-12 20:45 UTC

## Key Documentation Files
- `CLAUDE.md` - Claude Code instructions (always read first)
- `Project Context/master_context.md` - Immutable architecture truth
- `Project Context/project_context.md` - Tech stack & constraints
- `PROGRESS.md` - This file (session progress tracking)

---

## Current Development Environment

### GitHub Codespaces Setup
- **Codespace:** `cautious-palm-tree-76qrxqxv9g52qgr`
- **Server URL:** `https://cautious-palm-tree-76qrxqxv9g52qgr-3000.app.github.dev`
- **Branch:** `develop`
- **Database:** Neon PostgreSQL (cloud-based)

### Quick Start Commands
```bash
# SSH into Codespace from local Mac
gh codespace ssh -c cautious-palm-tree-76qrxqxv9g52qgr

# Attach to tmux session (keeps server alive even if SSH drops)
tmux attach -t cas

# If server not running, start it inside tmux:
npm run dev:web

# Build extension (if needed)
npm run build --workspace=apps/extension
```

### Port Forwarding
The Codespaces URL is stable as long as the Codespace exists. Port 3000 must be set to **Public** visibility in VS Code's PORTS tab.

---

## Session Log - 2026-01-12 (Comprehensive)

### Security Hardening (Clerk)
**Problem:** Public URL + open sign-ups = anyone who finds URL can create account

**Solution:** Enabled Clerk "Restricted Mode" in dashboard
- Sign-ups disabled
- Only invited/manually created users can access
- Users added: `shariq@insurge.io`, `saif@insurge.io`

**Location:** https://dashboard.clerk.com → User & Authentication → Restrictions

---

### Switched from Cloudflare Quick Tunnel to Codespaces Port Forwarding

**Why:** Cloudflare quick tunnels generate new random URLs on every restart (e.g., `expensive-august-conferencing-learned.trycloudflare.com`). This required updating extension `.env` and rebuilding constantly.

**New Setup:** Codespaces built-in port forwarding
- Stable URL: `https://cautious-palm-tree-76qrxqxv9g52qgr-3000.app.github.dev`
- URL stays same while Codespace exists
- No external tunnel needed

**Trade-off:** URL changes if Codespace is deleted (after 30 days inactivity)

---

### Connection Stability Fixes

#### 1. SSH Keep-Alive (Local Mac)
**Problem:** SSH connection to Codespace drops after idle period

**Solution:** Added to `~/.ssh/config` on local Mac:
```
Host *.github.dev
  ServerAliveInterval 60
  ServerAliveCountMax 3
  TCPKeepAlive yes
```

#### 2. tmux for Session Persistence
**Problem:** When SSH drops, all running processes die (server, Claude, etc.)

**Solution:** Installed tmux in Codespace (also added to devcontainer.json for auto-install)

**How it works:**
- `tmux new -s cas` - Create session named "cas"
- `tmux attach -t cas` - Reconnect after SSH drop
- Server keeps running even if SSH disconnects

**Ghostty Terminal Fix:** If using Ghostty terminal, run:
```bash
TERM=xterm-256color tmux new -s cas
```

#### 3. Codespace Timeout Settings
**Location:** https://github.com/settings/codespaces
- Idle timeout: Set to 240 minutes (max 4 hours)
- Retention period: 30 days

#### 4. Keepalive Cron Job (Prevents Idle Timeout)
**Problem:** Even with 4-hour timeout, Codespace goes to sleep if "idle" (no activity)

**Solution:** Cron job pings every 3 minutes to generate activity
```bash
# Installed cron and added job:
*/3 * * * * /workspaces/client-acquisition-suite/scripts/keepalive.sh
```

**Auto-setup:** devcontainer.json now:
- Installs cron in `postCreateCommand`
- Starts cron and adds the job in `postStartCommand`

**To verify it's running:**
```bash
sudo service cron status        # Should say "cron is running"
crontab -l                      # Should show keepalive entry
cat /tmp/keepalive.log          # Should show recent pings
```

**Note:** This keeps the Codespace active indefinitely as long as it's not manually stopped. The Codespace will still stop if you explicitly stop it or if GitHub has maintenance.

---

### Extension Fixes for Codespaces URLs

**Problem:** Extension wasn't connecting because it didn't recognize `*.app.github.dev` URLs

**Files Modified:**

#### `apps/extension/contents/auth-bridge.ts`
Added to `matches` array:
```typescript
"https://*.app.github.dev/*",  // GitHub Codespaces
```

#### `apps/extension/package.json`
Added to `host_permissions`:
```json
"https://*.app.github.dev/*"
```

Added to `externally_connectable.matches`:
```json
"https://*.app.github.dev/*"
```

#### `apps/extension/.env`
```
PLASMO_PUBLIC_API_URL="https://cautious-palm-tree-76qrxqxv9g52qgr-3000.app.github.dev"
```

**Critical:** After URL changes, must rebuild extension:
```bash
npm run build --workspace=apps/extension
```
Then reload in Chrome at `chrome://extensions`

---

### Extension Build Locations

| Build Type | Folder | When to Use |
|------------|--------|-------------|
| Dev | `apps/extension/build/chrome-mv3-dev/` | `npm run dev:ext` |
| **Prod** | `apps/extension/build/chrome-mv3-prod/` | `npm run build` - **USE THIS ONE** |

**Important:** We're using the PROD build in Chrome. Always rebuild with:
```bash
npm run build --workspace=apps/extension
```

---

## Completed Work Summary

### Phase 0: Repository & CI/CD
- [x] GitHub repo: `shariqinsurgeio/client-acquisition-suite`
- [x] Branches: `main`, `develop`
- [x] CI workflow: `.github/workflows/ci.yml`
- [x] Codespaces devcontainer configured

### Phase 1: Authentication (Clerk)
- [x] Web app: `@clerk/nextjs` middleware, sign-in/up pages
- [x] Extension: Auth bridge syncs token from web to extension
- [x] Socket.io: Token verification, user-scoped rooms
- [x] **Restricted mode enabled** - invite-only access

### Phase 2: Database (PostgreSQL)
- [x] Migrated from SQLite to PostgreSQL
- [x] Using Neon cloud database (no local Docker needed)
- [x] Multi-user schema with `userId` columns

### Phase 3: Extension Connection
- [x] Added Cloudflare tunnel URL support (`*.trycloudflare.com`)
- [x] Added Codespaces URL support (`*.app.github.dev`)
- [x] Added Render URL support (`*.onrender.com`)
- [x] Popup redesign (clean status UI, removed debug buttons)

### Phase 4: Dashboard Features
- [x] Workbench → Stats Panel (Total Jobs, New Today, Saved, High Score)
- [x] JobFeed: Keyword search, bulk selection, archive/delete

### Phase 5: Development Environment
- [x] GitHub Codespaces setup with devcontainer
- [x] tmux for session persistence
- [x] SSH keep-alive configuration
- [x] Stable Codespaces URL for extension

---

## Uncommitted Changes

```
M .devcontainer/devcontainer.json   # Added tmux to postCreateCommand
M PROGRESS.md
M apps/extension/background.ts
M apps/extension/contents/auth-bridge.ts  # Added *.app.github.dev
M apps/extension/package.json        # Added *.app.github.dev to permissions
M apps/extension/popup.tsx
M apps/web/components/JobFeed.tsx
M apps/web/components/Workbench.tsx
M apps/web/server.ts
M package-lock.json
```

---

## Testing Checklist

- [x] Clerk auth: Sign in/out works
- [x] Clerk restriction: Only invited users can access
- [x] Database: Neon PostgreSQL connects
- [x] Socket auth: Token verification working
- [x] Extension connects: Popup shows CONNECTED
- [x] Codespaces URL: Extension works with `*.app.github.dev`
- [ ] Real scrape: Trigger Upwork scrape, verify jobs appear
- [ ] Bulk actions: Archive/delete multiple jobs
- [ ] Multi-user isolation: User A cannot see User B's jobs

---

## Next Steps

1. **Test real Upwork scrape** - Go to Upwork, trigger scrape from dashboard, verify jobs appear
2. **Test bulk actions** - Select multiple jobs, archive/delete
3. **Commit all changes** - Everything is working, time to commit
4. **Consider:** ARCHIVED filter option, confirm dialogs for destructive actions

---

## Troubleshooting Reference

### Extension shows "DISCONNECTED"
1. Check server is running: `lsof -i :3000`
2. Check Codespaces port 3000 is set to Public
3. Verify extension .env has correct URL
4. Rebuild extension: `npm run build --workspace=apps/extension`
5. Reload extension in Chrome

### Extension shows "No auth token"
1. Sign in to the web dashboard first
2. Refresh the dashboard page
3. Click extension popup again

### SSH keeps disconnecting
1. Check `~/.ssh/config` has keep-alive settings (on local Mac)
2. Use tmux: `tmux attach -t cas`

### tmux error with Ghostty terminal
Run: `TERM=xterm-256color tmux new -s cas`

### Server won't start (lock file)
```bash
pkill -f "node.*server" ; rm -f apps/web/.next/dev/lock && npm run dev:web
```

### Codespace URL changed
1. Update `apps/extension/.env` with new URL
2. Rebuild: `npm run build --workspace=apps/extension`
3. Reload extension in Chrome

---

## Architecture Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Codespaces                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Web Server (apps/web)          Port 3000 (Public)      │    │
│  │  - Next.js app                                           │    │
│  │  - Socket.io server                                      │    │
│  │  - Clerk middleware                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↑                                   │
│                     Neon PostgreSQL (cloud)                      │
└─────────────────────────────────────────────────────────────────┘
                               ↑
                    HTTPS (Codespaces URL)
                               ↑
┌─────────────────────────────────────────────────────────────────┐
│                     Local Chrome Browser                         │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  Web Dashboard      │←──→│  Browser Extension          │    │
│  │  (React + Socket.io)│    │  - Auth bridge (gets token) │    │
│  └─────────────────────┘    │  - Background (Socket.io)   │    │
│                              │  - Content scripts (scrape) │    │
│                              └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session History

| Date | Key Changes |
|------|-------------|
| Jan 10 | Initial Clerk auth, PostgreSQL migration, extension auth bridge |
| Jan 11 | Neon PostgreSQL setup, Codespaces devcontainer |
| Jan 12 | Clerk restricted mode, Codespaces port forwarding, tmux setup, extension URL fixes |

