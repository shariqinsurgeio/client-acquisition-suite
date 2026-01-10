# GitHub Codespaces Setup Guide

This guide covers how to develop the Client Acquisition Suite in GitHub Codespaces without consuming local storage.

## Why Codespaces?

- Project files live on Google Drive (synced locally)
- `node_modules` would add 500MB+ to local storage
- Codespaces runs everything in GitHub's cloud
- Your Mac just runs a browser/terminal - zero storage used

## How It Works

```
Your GitHub Repo (origin)
        │
        │ git clone (when Codespace created)
        ▼
┌─────────────────────────────────┐
│  Codespace VM (the copy)        │
│  - Full clone of your repo      │
│  - node_modules lives here      │
│  - You edit files here          │
│  - Changes are LOCAL to the VM  │
└─────────────────────────────────┘
        │
        │ git push (when YOU decide)
        ▼
Your GitHub Repo (updated)
```

**Key point:** Changes don't sync to GitHub until you `git commit` + `git push`.

## Prerequisites

1. GitHub CLI installed: `brew install gh`
2. Authenticated: `gh auth login`
3. Codespace scope added: `gh auth refresh -h github.com -s codespace`

## Quick Start

### Create a Codespace

```bash
gh codespace create -R shariqinsurgeio/client-acquisition-suite -b develop -m basicLinux32gb
```

### Check Status

```bash
gh codespace list
```

Wait until status shows "Available" (takes ~2 min for initial setup).

### Connect via SSH (for Ghostty)

```bash
gh codespace ssh -c CODESPACE-NAME
```

Example:
```bash
gh codespace ssh -c cautious-palm-tree-76qrxqxv9g52qgr
```

### Or Open in VS Code

```bash
gh codespace code -c CODESPACE-NAME
```

## Inside the Codespace

The devcontainer auto-installs:
- Node 20
- Claude Code (`claude` command)
- All npm dependencies
- Prisma client
- SSH server (for Ghostty access)

### Start Developing

```bash
# Sign into Claude Code
claude

# Start the web server
npm run dev:web

# Build extension (if needed)
npm run dev:ext
```

### Git Workflow

Same as local development:
```bash
git add .
git commit -m "Your message"
git push
```

## Using Ghostty + Codespaces

You can use Ghostty as your terminal while code runs in the cloud:

```bash
# Terminal 1 (Ghostty) - SSH into Codespace
gh codespace ssh -c CODESPACE-NAME

# Terminal 2 (optional) - VS Code for editing
gh codespace code -c CODESPACE-NAME
```

**Note:** If Claude Code is running in Ghostty, exit it first (`/exit`) before running `gh codespace ssh` to get an interactive shell.

## Managing Codespaces

### List All

```bash
gh codespace list
```

### Stop (saves state, stops billing)

```bash
gh codespace stop -c CODESPACE-NAME
```

### Delete

```bash
gh codespace delete -c CODESPACE-NAME

# Force delete (if unsaved changes)
gh codespace delete -c CODESPACE-NAME --force
```

### Rebuild (after devcontainer.json changes)

Note: Rebuild doesn't pull latest commits. Delete and recreate instead:
```bash
gh codespace delete -c CODESPACE-NAME --force
gh codespace create -R shariqinsurgeio/client-acquisition-suite -b develop -m basicLinux32gb
```

## Codespace Persistence

| Scenario | What Happens |
|----------|--------------|
| Close browser/terminal | Codespace keeps running |
| Auto-stops after 30 min idle | Uncommitted changes preserved |
| Manually stop | Changes preserved, billing stops |
| Delete Codespace | Everything lost (push first!) |
| 30 days inactive | Auto-deleted |

## Devcontainer Configuration

Located at `.devcontainer/devcontainer.json`:

```json
{
  "name": "Client Acquisition Suite",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/sshd:1": {
      "version": "latest"
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code && npm install && cd apps/web && npx prisma generate",
  "forwardPorts": [3000],
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "prisma.prisma",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "postStartCommand": "cp -n apps/extension/.env.example apps/extension/.env 2>/dev/null || true"
}
```

## Troubleshooting

### "no terminal" error when creating Codespace

Specify machine type directly:
```bash
gh codespace create -R owner/repo -b branch -m basicLinux32gb
```

### "error getting answers: no terminal" on SSH

Exit Claude Code first (`/exit`), then run the SSH command.

### SSH server not installed error

The devcontainer needs the sshd feature. Already configured in this project.

### Git authentication fails

```bash
gh auth setup-git
```

### Need codespace scope

```bash
gh auth refresh -h github.com -s codespace
```

## Cost

- Free tier: 60 hours/month
- `basicLinux32gb` = 2-core, 8GB RAM (uses fewer free hours)
- Billing stops when Codespace is stopped/deleted
