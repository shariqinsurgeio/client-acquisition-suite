You are acting as a Senior Full-Stack Architect specialized in Agentic Systems. I have provided the full context in the `project_context.md` file (attached above).

Your goal is to build the "Phase 1 MVP" of the Agency OS. We need to validate the "Puppet Master" architecture (Webapp <-> Extension link) and the Dashboard UI immediately.

**Execute the following plan stepwise:**

1.  **Project Scaffolding:**
    * Create a monorepo structure: `/apps/web` (Next.js) and `/apps/extension` (Plasmo).
    * Set up the Shared Prisma Client in `/packages/database` (or inside `/apps/web` if simpler for MVP).

2.  **The Brain (Server Setup):**
    * Create the `server.js` file in `/apps/web` to initialize Next.js AND the Socket.io server.
    * Implement the `io.on('connection')` logic to handle `DATA_INGEST` events from the extension.
    * Ensure CORS is configured to accept connections only from the Extension ID (loaded via `.env`).

3.  **The Hands (Extension Setup):**
    * Initialize the Plasmo extension.
    * Implement `background.ts` to connect to the Socket.io server using `PLASMO_PUBLIC_API_URL`.
    * Create a simple "Popup UI" in the extension with a "Status: Connected/Disconnected" indicator and a test button "Send Ping to Brain".

4.  **The Dashboard UI (Webapp):**
    * Build the "Agency Cockpit" layout using Tailwind CSS.
    * Left Panel: "Live Job Feed" (Mock data for now, but wired to the `Job` Prisma model).
    * Right Panel: "Proposal Workbench".
    * Add a visual indicator in the Header: "Extension Status: 🟢 Online / 🔴 Offline" (driven by the Socket connection state).

**Strict Requirements:**
* Use `lucide-react` for icons.
* Ensure the `server.js` implementation allows for HMR (Hot Module Replacement) during development so I don't have to restart the server constantly.
* Do NOT implement the complex `chrome.debugger` logic yet. Just establish the reliable Socket.io bridge first.

Start by generating the file structure and the critical `server.js` and `background.ts` code blocks.