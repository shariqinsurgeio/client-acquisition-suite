**Meta-Instruction**

The following is the **Immutable Truth** for this project. If standard Next.js patterns conflict with the 'Puppet Master' architecture described here (especially regarding the Custom Server and Socket.io), follow the architecture described here. Do not suggest Serverless solutions.

### **The "Agency OS" Master Context File**

---

# PROJECT: Agency OS (The "Puppet Master" System)

## 1. Product Vision & User Persona

* **Users:** Two Co-Founders of a GenAI Agency.
* **Goal:** A "God Mode" Command Center to aggregate leads from Upwork, LinkedIn, Fiverr, and Freelancer, and automate the outreach process.
* **Core Philosophy:** "Remote Control." The user sits in the Webapp (Dashboard); the Browser Extension acts as the "Hands" to execute actions in the local browser context to avoid detection.

## 2. Architecture: "The Puppet Master"

The system consists of two distinct applications communicating in real-time.

### **A. The Brain (Server)**

* **Tech:** Next.js 14 (App Router), Node.js Custom Server, PostgreSQL, Prisma, Coolify (Hosting).
* **Role:** Intelligence, State Management, RAG (Proposal Generation), Job Queue.
* **Critical Requirement:** Must use a **Custom Node.js Server (`server.js`)** to host the Next.js app AND a **Socket.io** server instance on the same port. Standard Serverless API routes will NOT work for persistent extension connections.

### **B. The Hands (Browser Extension)**

* **Tech:** Plasmo Framework (React), Socket.io Client, `chrome.debugger` (Puppeteer-in-Browser).
* **Role:**
1. **Ingest:** Listens on job boards (e.g., `linkedin.com/jobs`) and sends scraped data to the Brain.
2. **Execute:** Receives commands (e.g., `TASK_APPLY`) from the Brain, opens tabs, fills forms, and submits.
3. **Proxy:** Uses the User's local session/cookies. **Never** attempts to log in via credentials.



## 3. The Protocol (Socket.io Events)

* **`CONNECT`:** Extension connects using `auth: { extensionId: process.env.ALLOWED_EXTENSION_ID }`.
* **`DATA_INGEST` (Client -> Server):** Extension sends raw job data.
* Payload: `{ platform: "LINKEDIN", html: "...", url: "..." }`


* **`CMD_EXECUTE` (Server -> Client):** Brain commands Hands to do work.
* Payload: `{ action: "SCRAPE" | "APPLY", targetUrl: "...", data: {...} }`


* **`TASK_UPDATE` (Client -> Server):** Hands report progress.
* Payload: `{ jobId: "123", status: "FILLED" | "SUBMITTED" | "ERROR" }`



## 4. "No Hard-Coding" Rules (Strict)

* **Selectors:** CSS Selectors must NOT be hardcoded in the extension. They must be fetched from the `PlatformSelector` database table on startup.
* **Environment Variables:**
* **Server:** `DATABASE_URL` (Internal Docker URL), `ALLOWED_EXTENSION_ID`.
* **Extension:** `PLASMO_PUBLIC_API_URL` (The Coolify Domain).



## 5. The "Anti-Ban" Strategy (Implementation Details)

* **Human Jitter:** Automation logic must support random delays (e.g., `await wait(random(2000, 5000))`) between actions.
* **DOM Input:** Use `chrome.debugger` to simulate distinct keypress events (`Input.dispatchKeyEvent`), not just `element.value = "text"`.

## 6. Database Schema (Prisma)

```prisma
// 1. Dynamic Selectors (The config layer)
model PlatformSelector {
  id        String @id @default(uuid())
  platform  String // "LINKEDIN", "UPWORK"
  selectors Json   // { "jobCard": ".job-card", "applyBtn": "#apply" }
}

// 2. The Job Feed
model Job {
  id          String   @id @default(uuid())
  platform    String   // UPWORK, LINKEDIN
  title       String
  description String   @db.Text
  url         String   @unique
  status      String   // NEW, SAVED, QUEUED, APPLIED
  fitScore    Int?     // 0-100
  proposals   Proposal[]
}

// 3. The Proposal (RAG Output)
model Proposal {
  id        String   @id @default(uuid())
  jobId     String
  content   String   @db.Text
  strategy  String?  @db.Text // Why we picked this approach
  job       Job      @relation(fields: [jobId], references: [id])
}

```

## 7. MVP Scope (Phase 1)

* **Focus:** Establish the Socket Connection and the Dashboard UI.
* **UI:** A "Live Feed" of jobs (mock data initially) + Connection Status Indicator.
* **Extension:** A simple popup showing "Connected to Brain" + A button to "Test Scrape" (sends dummy data to server).

---