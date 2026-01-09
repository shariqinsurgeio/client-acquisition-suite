# PROJECT CONTEXT: Client Acquisition Suite (The "Puppet Master" System)

**Note:** This project was previously called "AgencyOS" / "Agency OS". Always use "Client Acquisition Suite" or "CAS" for naming.

## 1. Executive Summary
We are building a "Command Center" for a 2-person GenAI agency. It is a unified dashboard that aggregates leads from Upwork, LinkedIn, Fiverr, and Freelancer.
**Core Architecture:** "Puppet Master." A central Next.js Webapp acts as the "Brain," and a Chrome Extension acts as the "Hands" (local agent) to scrape data and execute actions using legitimate browser fingerprints.

## 2. Tech Stack & Deployment
* **Hosting:** Render (Web Service + PostgreSQL)
* **Backend:** Next.js 16 (App Router) + Custom Node.js Server (`server.ts` for Socket.io)
* **Database:** PostgreSQL (via Render) + Prisma ORM
* **Frontend:** React 19, Tailwind CSS 4, Lucide Icons
* **Extension:** Plasmo Framework 0.90 (React)
* **Real-Time Bridge:** Socket.io 4.8 (Bi-directional communication between Webapp and Extension)
* **Authentication:** Clerk (Web + Extension via auth bridge)
* **Validation:** Zod 4
* **Monorepo:** npm workspaces

## 3. The "Puppet Master" Workflow
1. **Brain (Webapp):** User clicks "Scrape LinkedIn" or "Apply". Server emits a Socket event (`CMD_EXECUTE`).
2. **Bridge:** Socket.io passes command to the specific user's connected Extension (scoped by userId room).
3. **Hands (Extension):** Receives command. Opens a background tab. Navigates to target site. Scrapes data or fills forms (using `chrome.debugger` for "Human" input simulation). Sends result back to Server via Socket.

## 4. Key Constraints & Rules
* **NO Hard-Coded Selectors:** CSS Selectors (e.g., `.job-card`) must be stored in the DB (`PlatformSelector` model) and fetched by the extension.
* **NO Hard-Coded Secrets:** All URLs/Keys must use `process.env`.
* **Multi-User Isolation:** All data scoped by `userId` from Clerk authentication.
* **Custom Server Required:** Standard serverless routes will NOT work for persistent Socket.io connections.

## 5. Database Schema (Prisma - PostgreSQL)
```prisma
model PlatformSelector {
  id        String @id @default(uuid())
  userId    String // Clerk user ID
  platform  String // "LINKEDIN", "UPWORK"
  selectors String @db.Text

  @@unique([userId, platform])
  @@index([userId])
}

model Job {
  id          String   @id @default(uuid())
  userId      String   // Clerk user ID
  platform    String   // UPWORK, LINKEDIN
  title       String
  description String   @db.Text
  url         String
  status      String   @default("NEW") // NEW, SAVED, APPLIED
  fitScore    Int?     // 0-100
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, url])
  @@index([userId])
  @@index([userId, status])
  @@index([userId, createdAt])
}
```

## 6. Infrastructure Logic
* **Server:** Must use a Custom Server (`server.ts`) to handle Next.js render AND Socket.io connections on the same port (3000).
* **Extension:** Must use `background.ts` to maintain a persistent Socket connection with keepalive via Chrome alarms.
* **Auth Bridge:** Extension gets Clerk token from web app via `chrome.runtime.sendMessage` (CAS_* message types).

## 7. Key Files
| File | Purpose |
|------|---------|
| `apps/web/server.ts` | Custom server with Socket.io + Clerk verification |
| `apps/web/context/SocketContext.tsx` | Global Socket.io state for React |
| `apps/web/prisma/schema.prisma` | Database models |
| `apps/extension/background.ts` | Extension service worker with keepalive |
| `apps/extension/contents/auth-bridge.ts` | Clerk token bridge |
| `render.yaml` | Render deployment blueprint |

---
