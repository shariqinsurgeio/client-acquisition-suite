# PROJECT CONTEXT: Agency OS (The "Puppet Master" System)

## 1. Executive Summary
We are building a "Command Center" for a 2-person GenAI agency. It is a unified dashboard that aggregates leads from Upwork, LinkedIn, Fiverr, and Freelancer.
**Core Architecture:** "Puppet Master." A central Next.js Webapp acts as the "Brain," and a Chrome Extension acts as the "Hands" (local agent) to scrape data and execute actions using legitimate browser fingerprints.

## 2. Tech Stack & Deployment
* **Hosting:** Coolify (Self-hosted VPS).
* **Backend:** Next.js 14 (App Router) + Custom Node.js Server (for Socket.io).
* **Database:** PostgreSQL (via Coolify Docker) + Prisma ORM.
* **Frontend:** React, Tailwind CSS, Lucide Icons.
* **Extension:** Plasmo Framework (React).
* **Real-Time Bridge:** Socket.io (Bi-directional communication between Webapp and Extension).
* **Automation:** Puppeteer-in-Browser (via `chrome.debugger` API).

## 3. The "Puppet Master" Workflow
1.  **Brain (Webapp):** User clicks "Scrape LinkedIn" or "Apply". Server emits a Socket event (`CMD_EXECUTE`).
2.  **Bridge:** Socket.io passes command to the specific user's connected Extension.
3.  **Hands (Extension):** Receives command. Opens a background tab. Navigates to target site. Scrapes data or fills forms (using `chrome.debugger` for "Human" input simulation). Sends result back to Server via Socket.

## 4. Key Constraints & Rules
* **NO Hard-Coded Selectors:** CSS Selectors (e.g., `.job-card`) must be stored in the DB (`PlatformSelector` model) and fetched by the extension.
* **NO Hard-Coded Secrets:** All URLs/Keys must use `process.env`.
* **Lean MVP First:** Focus on the Dashboard UI (Feed) and the Extension Connection (Socket Bridge).

## 5. Database Schema (Prisma)
```prisma
model PlatformSelector {
  id        String @id @default(uuid())
  platform  String // "LINKEDIN", "UPWORK"
  selectors Json   // { "jobCard": ".job-card", "applyBtn": "#apply" }
}

model Job {
  id          String   @id @default(uuid())
  platform    String   // UPWORK, LINKEDIN
  title       String
  description String   @db.Text
  url         String   @unique
  status      String   // NEW, SAVED, APPLIED
  fitScore    Int?     // 0-100
  createdAt   DateTime @default(now())
}

## 6. Infrastructure Logic
Server: Must use a Custom Server (server.js) to handle Next.js render AND Socket.io connections on the same port.

Extension: Must use background.ts to maintain a persistent Socket connection.

***