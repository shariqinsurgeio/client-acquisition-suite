**Meta-Instruction**

The following is the **Immutable Truth** for this project. If standard Next.js patterns conflict with the 'Puppet Master' architecture described here (especially regarding the Custom Server and Socket.io), follow the architecture described here. Do not suggest Serverless solutions.

### **The "Client Acquisition Suite" Master Context File**

**Note:** This project was previously called "AgencyOS" / "Agency OS". Always use "Client Acquisition Suite" or "CAS" for naming.

---

# PROJECT: Client Acquisition Suite (The "Puppet Master" System)

## 1. Product Vision & User Persona

* **Users:** Two Co-Founders of a GenAI Agency.
* **Goal:** A "God Mode" Command Center to aggregate leads from Upwork, LinkedIn, Fiverr, and Freelancer, and automate the outreach process.
* **Core Philosophy:** "Remote Control." The user sits in the Webapp (Dashboard); the Browser Extension acts as the "Hands" to execute actions in the local browser context to avoid detection.

## 2. Architecture: "The Puppet Master"

The system consists of two distinct applications communicating in real-time.

### **A. The Brain (Server)**

* **Tech:** Next.js 16 (App Router), Node.js Custom Server (`server.ts`), PostgreSQL, Prisma, Render (Hosting).
* **Role:** Intelligence, State Management, RAG (Proposal Generation), Job Queue.
* **Critical Requirement:** Must use a **Custom Node.js Server (`server.ts`)** to host the Next.js app AND a **Socket.io** server instance on the same port. Standard Serverless API routes will NOT work for persistent extension connections.

### **B. The Hands (Browser Extension)**

* **Tech:** Plasmo Framework (React), Socket.io Client, `chrome.debugger` (Puppeteer-in-Browser).
* **Role:**
1. **Ingest:** Listens on job boards (e.g., `linkedin.com/jobs`) and sends scraped data to the Brain.
2. **Execute:** Receives commands (e.g., `TASK_APPLY`) from the Brain, opens tabs, fills forms, and submits.
3. **Proxy:** Uses the User's local session/cookies. **Never** attempts to log in via credentials.

### **C. Authentication (Clerk)**

* **Web App:** `@clerk/nextjs` for sign-in/sign-up pages, middleware protection
* **Extension:** Auth bridge via `chrome.runtime.sendMessage` to get token from web app
* **Socket.io:** Token verification middleware using `@clerk/backend`
* **Multi-User:** All data scoped by `userId` from Clerk

## 3. The Protocol (Socket.io Events)

* **`EXTENSION_CONNECT`:** Extension connects with `auth: { token, extensionId }`.
* **`DATA_INGEST` (Client -> Server):** Extension sends raw job data.
  * Payload: `{ platform: "LINKEDIN", jobs: [...], url: "..." }`

* **`CMD_EXECUTE` (Server -> Client):** Brain commands Hands to do work.
  * Payload: `{ action: "SCRAPE" | "APPLY", targetUrl: "...", data: {...} }`

* **`TASK_UPDATE` (Client -> Server):** Hands report progress.
  * Payload: `{ jobId: "123", status: "FILLED" | "SUBMITTED" | "ERROR" }`

* **`SCRAPE_PROGRESS` (Client -> Server):** Real-time scraping progress.
* **`JOB_UPDATE` (Server -> Client):** Broadcast new jobs to user's dashboard.
* **`STATUS_UPDATE` (Server -> All):** Extension online/offline status.

## 4. "No Hard-Coding" Rules (Strict)

* **Selectors:** CSS Selectors must NOT be hardcoded in the extension. They must be fetched from the `PlatformSelector` database table on startup.
* **Environment Variables:**
  * **Server:** `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  * **Extension:** `PLASMO_PUBLIC_API_URL` (The Render Domain or localhost)

## 5. The "Anti-Ban" Strategy (Implementation Details)

* **Human Jitter:** Automation logic must support random delays (e.g., `await wait(random(2000, 5000))`) between actions.
* **DOM Input:** Use `chrome.debugger` to simulate distinct keypress events (`Input.dispatchKeyEvent`), not just `element.value = "text"`.

## 6. Database Schema (Prisma - PostgreSQL)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 1. Dynamic Selectors (The config layer)
model PlatformSelector {
  id        String @id @default(uuid())
  userId    String // Clerk user ID - multi-user support
  platform  String // "LINKEDIN", "UPWORK"
  selectors String @db.Text // JSON string

  @@unique([userId, platform])
  @@index([userId])
}

// 2. The Job Feed
model Job {
  id          String   @id @default(uuid())
  userId      String   // Clerk user ID - multi-user support
  platform    String   // UPWORK, LINKEDIN
  title       String
  description String   @db.Text
  url         String
  status      String   @default("NEW") // NEW, SAVED, QUEUED, APPLIED
  fitScore    Int?     // 0-100
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, url])
  @@index([userId])
  @@index([userId, status])
  @@index([userId, createdAt])
}

// 3. The Proposal (RAG Output) - Future
model Proposal {
  id        String   @id @default(uuid())
  userId    String
  jobId     String
  content   String   @db.Text
  strategy  String?  @db.Text // Why we picked this approach
}
```

## 7. MVP Scope (Phase 1) - COMPLETED

* **Focus:** Establish the Socket Connection and the Dashboard UI.
* **UI:** A "Live Feed" of jobs + Connection Status Indicator.
* **Extension:** Popup showing connection status + Scrape controls.
* **Auth:** Clerk authentication for web app and extension.
* **Multi-User:** All data scoped by userId.

## 8. Deployment (Render)

* **Blueprint:** `render.yaml` in project root
* **Web Service:** `client-acquisition-suite` (Node.js)
* **Database:** `client-acquisition-db` (PostgreSQL)
* **Health Check:** `/api/health`

---
