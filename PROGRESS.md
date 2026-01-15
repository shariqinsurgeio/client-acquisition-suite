# Client Acquisition Suite - Progress Tracker

**Last Updated:** 2026-01-15

## Key Documentation Files
- `CLAUDE.md` - Claude Code instructions (always read first)
- `GRANDMASTER_PLAN.md` - 8-phase overhaul plan for Grandmaster Edition
- `PROGRESS.md` - This file (session progress tracking)

---

## Grandmaster Edition - Overhaul Progress

### Phase 1: UI Migration ✅ COMPLETED
- [x] Fixed `GrandmasterShell` bug (`extensionConnected` → `extensionStatus === "ONLINE"`)
- [x] Redirected home page `/` to `/v2`
- [x] Removed legacy "Home" nav item, updated navigation
- [x] Created `/v2/settings` page with Profile, Extension, Selectors, Notifications, Appearance tabs

### Phase 2: Scraping Infrastructure Overhaul ✅ COMPLETED
- [x] Extended `ScrapedJob` interface with all Sherlock fields
- [x] Updated `scrapeJobsFromPage()` with comprehensive extraction logic
- [x] Added extraction helpers: `extractTextFromSelectors`, `parseMoneyValue`, `parsePercentage`, `parseConnectsCost`, `detectExternalLinks`, `extractCountry`
- [x] Updated `DATA_INGEST` emission to include all Sherlock fields
- [x] Updated `DataIngestSchema` in server.ts with all new fields
- [x] Updated `DataIngestPayload` interface
- [x] Enhanced `calculateFitScore()` with Sherlock intelligence (client quality, hire rate, Big Five bonus, etc.)

### Phase 3: Database Schema Enhancement ✅ COMPLETED
- [x] Added `UserProfile` model (connects balance, stats, profile health)
- [x] Added `ProposalDraft` model (saved proposals per job)
- [x] Added `DailyAnalytics` model (ROI tracking)
- [x] Added `ClientProfile` model (repeat client tracking)
- [x] Added `ProposalDraft[]` relation to Job model
- [x] Updated TypeScript types in `lib/types.ts`

### Phase 4: UI Display of Sherlock Fields ✅ COMPLETED
- [x] Job feed displays client name, location, country
- [x] Shows payment verified badge
- [x] Shows external links badge
- [x] Shows connects cost
- [x] Displays avg hourly, hire rate, total spent
- [x] Added posted time display

### Phase 5: Real-Time Pipeline & Analytics Dashboard ✅ COMPLETED
- [x] Created `/api/analytics/route.ts` with 4 endpoint types (summary, daily, funnel, pipeline)
- [x] ROI metrics: connectsSpent, responseRate, winRate, costPerLead, costPerWin
- [x] Enhanced Pipeline page with real API data instead of mock data
- [x] Real-time Socket.io updates for job changes
- [x] 8-metric ROI dashboard with tooltips
- [x] Loading states and refresh functionality

### Phase 6: AI Integration & Prompt Engineering ✅ COMPLETED
- [x] Created `lib/ai/prompts.ts` with playbook templates (AUDIT_PITCH, CONTEXT_TRAP, DIRECT_APPLY)
- [x] Created `lib/ai/proposal-generator.ts` with Claude integration
- [x] Created `/api/ai/generate/route.ts` with 5 actions: generate, improve, variations, recommend, quality
- [x] Playbook recommendation engine based on job characteristics
- [x] Proposal quality estimator with scoring and suggestions
- [x] Installed @anthropic-ai/sdk for Claude API integration

### Phase 7: Extension Enhancement ✅ COMPLETED
- [x] Enhanced popup.tsx with Grandmaster design
- [x] Stats cards: Connects, Active Proposals, Scraped Today, Last Sync
- [x] Quick actions: Scrape This Page, Sync Profile, Test Send
- [x] Real-time connection status indicator
- [x] Auto-refresh status every 5 seconds
- [x] Added SCRAPE_CURRENT_PAGE message handler in background.ts
- [x] Added SYNC_PROFILE message handler with profile stats extraction
- [x] Daily stats tracking (jobsScrapedToday, lastSyncedAt)
- [x] Injected scraping function for on-demand page scraping

### Remaining Phase
- [ ] Phase 8: Production Hardening

---

## Previous Work (Pre-Grandmaster)

### Phase 0: GitHub Repository Setup
- [x] Created dedicated GitHub repo: `shariqinsurgeio/client-acquisition-suite`
- [x] Initialized git, created `.gitignore`
- [x] Set up `main` and `develop` branches
- [x] CI/CD workflow at `.github/workflows/ci.yml`

### Phase 1: Clerk Authentication (Web App)
- [x] Installed `@clerk/nextjs` and `@clerk/backend`
- [x] Created middleware (`apps/web/proxy.ts`)
- [x] Updated layout with `ClerkProvider`
- [x] Created auth pages (`/sign-in`, `/sign-up`)
- [x] Clerk keys configured in `.env.local`

### Phase 2: PostgreSQL Migration
- [x] Updated `prisma/schema.prisma` for PostgreSQL
- [x] Added `userId` columns for multi-user support
- [x] Added proper indexes for performance

### Phase 3: Multi-User API Routes
- [x] Updated `/api/jobs` with auth + userId filtering
- [x] Updated `/api/jobs/[id]` with ownership verification
- [x] Updated `/api/selectors` scoped to userId

### Phase 4: Socket.io Authentication
- [x] Added Clerk token verification middleware to `server.ts`
- [x] User-scoped rooms for real-time updates
- [x] Updated `SocketContext.tsx` with token injection

### Phase 5: Extension Authentication
- [x] Created auth bridge (`contents/auth-bridge.ts`)
- [x] Updated `background.ts` with CAS message types
- [x] Updated `popup.tsx` with auth UI

---

## Current State Summary (Updated Jan 14, 2026)

**Web App:**
- V2 Grandmaster shell is primary (/ redirects to /v2)
- Settings page fully functional with 5 tabs
- Job feed shows all Sherlock intelligence ("Scraped Jobs" - renamed from "Live Feed")
- Pipeline page with real ROI dashboard (8 metrics)
- Cortex page with Persona Builder
- Analytics API with 4 endpoint types
- AI proposal generation API with 5 actions
- **NEW: Scrape History page** (`/v2/history`) with operation logs, stats, and debugging info

**Extension:**
- Enhanced scraping extracts 20+ fields per job
- Client intelligence (name, location, spent, hire rate, etc.)
- Job metadata (connects cost, posted time, external links, skills)
- Socket.io connection with Clerk auth
- **NEW: Token refresh mechanism** - automatically requests fresh token on auth errors
- **NEW: Force reconnect** requests fresh token from dashboard

**Database:**
- PostgreSQL with Prisma
- **10 models**: Job, PlatformSelector, UserPersona, Asset, UserSettings, UserProfile, ProposalDraft, DailyAnalytics, ClientProfile, **ScrapeOperation** (new)
- All Sherlock fields populated on job creation
- Scrape operations tracked with logs, timing, and job counts

**Fit Scoring:**
- **NEW: Multi-score breakdown** (Relevance 35%, Client Quality 40%, Competition 25%)
- **NEW: Auto-shortlist** jobs with Win Likelihood ≥80%
- Score tooltip shows breakdown on hover
- Big Five country bonus
- External links bonus (audit opportunity)
- Connects cost ROI factor

**Anti-Detection:**
- **NEW: Rate limiting** (conservative/balanced/aggressive modes)
- **NEW: Detection checks** for Cloudflare, CAPTCHAs, rate limits
- **NEW: Cooldown mode** (30 min pause on detection)
- **NEW: Daily usage tracking** (jobs scraped, detail pages visited)
- Protection status indicator in header

**Data Pipeline Improvements:**
- Comprehensive logging throughout (server.ts, job-feed.tsx, background.ts)
- Job feed auto-refetches on scrape completion (TASK_UPDATE event)
- Job feed auto-refetches when scrapeProgress hits 100%
- Real-time JOB_UPDATE events with fallback mechanisms

---

## Session Changes (Jan 13, 2026)

### Pipeline Audit & Fixes
- [x] Audited full scraping pipeline: Dashboard → Server → Extension → Server → DB → UI
- [x] Fixed token expiration issue: Extension now requests fresh tokens from dashboard
- [x] Added `requestFreshTokenFromDashboard()` function to extension background.ts
- [x] Updated auth-bridge.ts to forward token refresh requests
- [x] Updated SocketContext.tsx to handle `CAS_REQUEST_FRESH_TOKEN` messages
- [x] Added comprehensive logging throughout the pipeline

### Hunt Feed Improvements
- [x] Renamed "Live Job Feed" to "Scraped Jobs" (more accurate)
- [x] Added TASK_UPDATE listener to auto-refetch on scrape completion
- [x] Added scrapeProgress listener to auto-refetch when progress hits 100%
- [x] Added "Updated Xs ago" indicator in header

### Scrape History Feature
- [x] Created `ScrapeOperation` model in Prisma schema
- [x] Created `/api/scrape-history` endpoints (GET list, POST create)
- [x] Created `/api/scrape-history/[id]` endpoints (GET details, PATCH update)
- [x] Updated server.ts CMD_EXECUTE to create scrape operations
- [x] Updated server.ts TASK_UPDATE to complete scrape operations
- [x] Updated server.ts DATA_INGEST to track job counts
- [x] Created `/v2/history` page with expandable operation cards
- [x] Added "History" nav item to sidebar
- [x] Ran Prisma migration: `add_scrape_operation`

---

## Session Changes (Jan 14, 2026)

### Multi-Level Scraping Architecture ✅ COMPLETED

Implemented comprehensive 3-tier scraping strategy:

**Phase 0: Anti-Detection Foundation** ✅
- Added rate limit constants and `SCRAPING_MODES` (conservative/balanced/aggressive)
- Implemented `checkForBlocks()` detection system for Cloudflare, CAPTCHAs, rate limits
- Added `enterCooldownMode()` and cooldown state management
- Added `SCRAPE_BLOCKED` handler to server
- Added `DailyUsage` model for tracking scraping volume
- Added protection status display in shell.tsx (Safe/Cooldown/Blocked indicators)

**Phase 1: Multi-Source Discovery** ✅
- Added scrape mode dropdown to shell.tsx with "Scrape All" button
- Updated server CMD_EXECUTE for mode handling
- Added `executeScrapeAll()` to extension with rate limits
- Added delays between sources (15-30s) to appear human

**Phase 2: Multi-Factor Scoring** ✅
- Added score fields to Prisma schema (`scoreRelevance`, `scoreClientQuality`, `scoreCompetition`, `scoreWinLikelihood`)
- Implemented `calculateMultiScore()` in server with weighted formula:
  - Client Quality: 40%
  - Relevance: 35%
  - Competition: 25%
- Updated job feed UI to show score breakdown on hover (Tooltip with 3 sub-scores)

**Phase 3: Auto-Shortlist** ✅
- Added `isShortlisted` and `shortlistedAt` fields to schema
- Implemented auto-shortlist logic (threshold: 80% win likelihood)
- Added "Shortlisted Only" filter toggle to job feed
- Added shortlist badge (yellow star) on job cards

### Bug Fixes (Jan 14, 2026)

**Bug Fix 1: Update Jobs Button Stuck** ✅
- Problem: Button showed "Updating..." for up to 2 minutes
- Root cause: Hardcoded 120-second timeout in shell.tsx
- Fix: Changed to event-driven reset via TASK_UPDATE socket events
- Extended fallback timeout to 300 seconds (emergency backup only)
- Added logging to verify TASK_UPDATE events received

**Bug Fix 2: Truncated Job Descriptions** ✅
- Problem: Descriptions ending incomplete (e.g., "or simil")
- Root cause: Page load delay (4.5s) insufficient for Angular SPA
- Fix: Increased `ENRICH_PAGE_LOAD_DELAY` from 4500ms to 6500ms
- Fix: Updated `refreshSingleJob()` to use ENRICH_PAGE_LOAD_DELAY instead of hardcoded 4-5s

**Bug Fix 3: Enhanced Detail Page Selectors** ✅
- Problem: Selectors not matching current Upwork DOM structure
- Fix: Added 15+ description selectors for better coverage
- Fix: Selector now finds longest matching text (most complete)
- Added detailed logging for selector matching
- Added fallback mechanism if description < 200 chars

### Files Modified (Jan 14)
| File | Changes |
|------|---------|
| `apps/extension/background.ts` | Rate limits, detection, executeScrapeAll, increased delays, enhanced selectors |
| `apps/web/server.ts` | SCRAPE_BLOCKED handler, calculateMultiScore, auto-shortlist logic |
| `apps/web/components/grandmaster/shell.tsx` | Protection status UI, scrape dropdown, fixed button timeout |
| `apps/web/components/grandmaster/job-feed.tsx` | Score tooltip breakdown, shortlist badge/filter |
| `apps/web/prisma/schema.prisma` | Score fields, DailyUsage model, isShortlisted |
| `apps/web/lib/types.ts` | Multi-score type definitions |

### Plan File
Full implementation plan saved at: `~/.claude/plans/vectorized-mapping-iverson.md`

---

## Session Changes (Jan 14, 2026 - Part 2)

### Complete Discovery-to-Enrichment Pipeline ✅ COMPLETED

Implemented the full discovery-to-enrichment pipeline with user-configurable search keywords:

**Phase 1: Database Schema** ✅
- Added `searchKeywords` field to `UserSettings` model (JSON array)
- Added `needsEnrichment` and `enrichedAt` fields to `Job` model
- Ran migration: `add_search_keywords_and_enrichment`

**Phase 2: Settings API** ✅
- Created `/api/settings/route.ts` with GET/PATCH endpoints
- GET returns searchKeywords with defaults: `["AI", "generative AI", "AI automation", "n8n"]`
- PATCH updates searchKeywords in UserSettings

**Phase 3: Settings UI** ✅
- Added "Search" tab to Settings page
- Tag-style keyword input with add/remove
- Info banner explaining how keywords are used with sort strategies
- Save Keywords button with loading state

**Phase 4: Server Handlers** ✅
- Added `DiscoveryCompleteSchema` and `EnrichmentCompleteSchema` Zod schemas
- Updated `CMD_EXECUTE` for `SCRAPE_ALL` to fetch user's keywords from settings
- Added `DISCOVERY_COMPLETE` handler:
  - Processes discovered jobs with Pass 1 scoring
  - 70% threshold for qualifying jobs
  - Queues qualifying jobs for enrichment (max 30 per run)
  - Emits `JOBS_DISCOVERED` and `CMD_EXECUTE` for enrichment
- Added `ENRICHMENT_COMPLETE` handler:
  - Re-scores with full description (Pass 2)
  - 80% threshold for auto-shortlist
  - Emits `JOB_ENRICHED` and `JOB_UPDATE` events
  - Completes scrape operation

**Phase 5: Extension Functions** ✅
- Added `buildDiscoverySources()` - builds 6 sources (2 fixed + 4 keyword searches)
- Updated `executeScrapeAll()` to accept keywords array and emit `DISCOVERY_COMPLETE`
- Added `scrapeSourceForDiscovery()` - scrapes without emitting DATA_INGEST
- Added `deduplicateJobsByUrl()` - dedupes jobs keeping most complete
- Added `executeEnrichJobs()` - enriches qualifying jobs and emits `ENRICHMENT_COMPLETE`
- Updated CMD_EXECUTE handler for `ENRICH_JOBS` action

**Phase 6: Shell UI** ✅
- Added multi-stage progress state (discovering/scoring/enriching/complete)
- Added job count tracking (discovered, qualifying, enriching)
- Updated scrape button to show stage-specific progress
- Added listeners for `SCRAPE_PROGRESS` and `JOBS_DISCOVERED` events

### Architecture: Two-Pass Scoring Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SCRAPE ALL PIPELINE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Build Sources (6 total):                                                │
│     Fixed:   best-matches, most-recent                                      │
│     Dynamic: {keyword1}×relevance, {keyword2}×recency,                      │
│              {keyword3}×client_spend, {keyword4}×client_rating              │
│                                                                             │
│  2. Discovery Phase (0-50%):                                                │
│     ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│     │ Scrape 6 │ → │ Dedupe   │ → │ Emit     │ → │ Server   │              │
│     │ sources  │   │ by URL   │   │ DISCOVERY│   │ receives │              │
│     └──────────┘   └──────────┘   │ COMPLETE │   └──────────┘              │
│                                   └──────────┘                              │
│                                                                             │
│  3. Scoring Phase (Pass 1):                                                 │
│     ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
│     │ Score    │ → │ Filter   │ → │ Queue    │                             │
│     │ all jobs │   │ ≥70%     │   │ ENRICH   │                             │
│     └──────────┘   └──────────┘   │ JOBS cmd │                             │
│                                   └──────────┘                              │
│                                                                             │
│  4. Enrichment Phase (50-100%):                                             │
│     ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
│     │ Visit    │ → │ Extract  │ → │ Emit     │                             │
│     │ detail   │   │ full     │   │ ENRICH   │                             │
│     │ pages    │   │ desc     │   │ COMPLETE │                             │
│     └──────────┘   └──────────┘   └──────────┘                              │
│                                                                             │
│  5. Re-Scoring Phase (Pass 2):                                              │
│     ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
│     │ Score    │ → │ Auto-    │ → │ Emit     │                             │
│     │ with full│   │ shortlist│   │ JOB_     │                             │
│     │ desc     │   │ ≥80%     │   │ ENRICHED │                             │
│     └──────────┘   └──────────┘   └──────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Files Modified (Jan 14, Part 2)
| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Added searchKeywords, needsEnrichment, enrichedAt fields |
| `apps/web/app/api/settings/route.ts` | NEW - GET/PATCH for search keywords |
| `apps/web/app/v2/settings/page.tsx` | Added Search tab with keyword management |
| `apps/web/server.ts` | Added DISCOVERY_COMPLETE, ENRICHMENT_COMPLETE handlers |
| `apps/extension/background.ts` | Added buildDiscoverySources, executeEnrichJobs, updated executeScrapeAll |
| `apps/web/components/grandmaster/shell.tsx` | Multi-stage progress display |

---

## Session Changes (Jan 15, 2026)

### Firecrawl Analysis Integration ✅ COMPLETED

Integrated comprehensive improvements from the Firecrawl analysis documents:

**Git Details:**
- Rollback checkpoint: `61aac4e` (commit before Firecrawl changes)
- Command to rollback: `git checkout 61aac4e`
- Changes are currently uncommitted (staged for review)
- Modified files:
  - `apps/extension/background.ts`
  - `apps/web/app/v2/dom-captures/page.tsx`
  - `apps/web/prisma/schema.prisma`
- New migration: `20260115120915_add_job_activity_and_client_fields`

**1. Prisma Schema Enhancements** ✅
- Added job detail fields: `jobType`, `budget`, `budgetMin`, `budgetMax`, `experienceLevel`, `projectLength`, `hoursPerWeek`, `skillsRequired`
- Added job activity fields: `proposalCount`, `proposalTier`, `interviewingCount`, `invitesSent`, `lastViewedByClient`
- Added enhanced client fields: `clientMemberSince`, `clientTotalHires`, `clientActiveJobs`, `clientTotalHours`, `clientRating`
- Added `DomCapture` model for selector development and self-healing

**2. Verified Selector Updates** ✅
- Updated job list scraper with verified `data-test` attributes from Firecrawl analysis
- Updated job detail scraper with verified selectors for client data extraction
- Added fallback selectors for backward compatibility

**3. GraphQL Interception** ✅
- Added `setupGraphQLInterceptionInjected()` function to intercept `/api/graphql/v1` responses
- Captures operation names and response data
- Stores captures in sessionStorage for access by content scripts

**4. Initial State Extraction** ✅
- Added `extractInitialStateInjected()` function for Angular SSR data extraction
- Supports `__INITIAL_STATE__`, `__APOLLO_STATE__`, and `TransferState` patterns
- Extracts pre-rendered job and user data

**5. Rate Limits Updated** ✅
- Updated `RATE_LIMITS` based on Firecrawl recommendations:
  - `minPageLoadDelay`: 3000ms (3s minimum between pages)
  - `maxPagesPerMinute`: 15 (maximum throughput limit)
  - Added `minBetweenDetailPages`: 4000ms for extra caution on detail visits
  - Added `humanLikeScrollDelay`: 1500ms and `readTimePerJob`: 800ms

**6. Coverage Tracker Expanded** ✅
- Added new page types to DOM captures page:
  - `job-detail-apply`: Application form page
  - `best-matches`: Alternative best matches feed (`/ab/find-work/best-matches`)
  - `messages`: Messages inbox
- Updated page type detection in background.ts for `/ab/find-work` URLs

### Files Modified (Jan 15)
| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | New job detail fields, activity fields, client fields, DomCapture model |
| `apps/extension/background.ts` | Verified selectors, GraphQL interception, Initial State extraction, rate limits |
| `apps/web/app/v2/dom-captures/page.tsx` | Expanded REQUIRED_PAGE_TYPES with new page types |

### DOM Capture Testing & Analysis ✅ COMPLETED

Successfully tested DOM capture system and analyzed all page types:

**Pages Captured (9/10 - 90% coverage):**
| Page Type | Status | Data Attributes |
|-----------|--------|-----------------|
| `job-list-best-match` | ✅ | 965 |
| `job-list-most-recent` | ✅ | 971 |
| `job-list-search` | ✅ | 983 |
| `job-list-saved` | ✅ | 675 |
| `best-matches` | ✅ | 250 |
| `job-detail` | ✅ | 164 |
| `job-detail-apply` | ✅ | 128 |
| `profile-stats` | ✅ | 211 |
| `proposals` | ✅ | 125 |
| `messages` | ⏭️ Skipped (no messages) |

**URL Pattern Fixes Applied:**
- Fixed job apply URL detection: `/nx/proposals/job/~ID/apply/`
- Fixed profile stats URL: `/nx/my-stats/`
- Added `best-matches` as separate page type for `/nx/find-work/best-matches`

**Key Finding: Two Different DOM Structures**

Upwork uses different selectors for different page types:

**Structure 1: `/nx/search/jobs` pages (JobTile pattern)**
```
data-test="JobTile"              - Job card container
data-test="job-tile-title-link"  - Job title
data-test="JobInfo"              - Budget, level, duration
data-test="JobInfoClient"        - Client verification, rating
data-test="JobInfoClientMore"    - Proposals count
data-test="job-pubilshed-date"   - Posted time
data-test="experience-level"     - Experience level
data-test="duration-label"       - Duration
```

**Structure 2: `/nx/find-work` pages (job-tile-list pattern)**
```
data-test="job-tile-list"              - Job list container
data-test="job-description-text"       - Job title/description
data-test="job-type"                   - Budget ("Hourly: $50-$100")
data-test="contractor-tier"            - Experience level
data-test="proposals"                  - Proposal count
data-test="client-country"             - Client location
data-test="client-spendings"           - Client spend
data-test="payment-verification-status" - Payment verified
data-test="posted-on"                  - Posted time
data-test="connects-section"           - Connects cost
data-test="budget"                     - Fixed price budget
```

**Structure 3: Job Detail Page**
```
data-test="Description"              - Full description
data-test="client-spend"             - "$11K total spent"
data-test="client-hourly-rate"       - Avg hourly rate
data-test="client-location"          - Location
data-test="client-contract-date"     - Member since
data-test="client-hires"             - "428 hires, 1 active"
data-test="client-hours"             - Total hours
data-test="client-job-posting-stats" - Hire rate, open jobs
data-test="buyer-rating"             - Client rating
data-test="job-title"                - Job title
```

**Structure 4: Profile Stats Page**
```
data-test="stats-connects-info"       - "Connects: 90"
data-test="stats-earnings-amount"     - "$0"
data-test="stats-job-success"         - Job success score
data-test="stats-badge-title"         - "Rising talent"
```

---

## Current Situation (Jan 15, 2026)

**What's Running:**
- Web app: http://localhost:3000 (running in background)
- Extension: Built and loaded in Chrome

**What Was Just Completed:**
1. ✅ DOM Capture system fully tested
2. ✅ All critical page types captured
3. ✅ Full analysis of data-test attributes complete
4. ✅ Identified two different DOM structures (search vs find-work)

**Uncommitted Changes:**
- `apps/extension/background.ts` - Updated selectors, rate limits, page detection
- `apps/web/app/v2/dom-captures/page.tsx` - Fixed URLs, added page types
- `apps/web/prisma/schema.prisma` - New fields + DomCapture model
- Migration: `20260115120915_add_job_activity_and_client_fields`

---

## Session Changes (Jan 15, 2026)

### Scraper Sync Architecture Fixes ✅ COMPLETED

**Issue 1: Search Pages Finding 0 Jobs** ✅
- Problem: `/nx/search/jobs/` returned 0 while `/nx/find-work/*` worked
- Root cause: Different DOM structures - JobTile vs job-tile-list
- Fix: Switched to multi-strategy `scrapeJobsFromPageInjected` function
- Added extra wait time for search pages (6s vs 4s)
- Added scroll trigger for lazy-loaded content

**Issue 2: ScrapeOperation Stuck at 0/0/0** ✅
- Problem: History view showed operations stuck in RUNNING with 0 counts
- Root cause: DISCOVERY_COMPLETE only emitted events, never updated DB
- Fix: Added direct `prisma.scrapeOperation.update()` in both handlers:
  - DISCOVERY_COMPLETE (when no enrichment needed)
  - ENRICHMENT_COMPLETE (after enrichment)

**Issue 3: Missing Frontend Event Listeners** ✅
- Problem: Server emitted ERROR and JOB_SHORTLISTED but frontend ignored them
- Fix: Added listeners in SocketContext.tsx
- Exposed: `lastError`, `recentShortlisted`, `clearError()`

**Issue 4: Neon Connection Pool Exhaustion** ✅
- Problem: Intermittent "connection pool timeout" errors
- Fix: Added concurrency guard to cleanup function
- Added per-operation error handling
- Delayed initial cleanup to let connections warm up

**Issue 5: Zod Schema Validation** ✅
- Problem: "Too big: expected string to have <=500 characters"
- Fix: Removed max limits on title/description fields

**Issue 6: TypeScript Type Errors** ✅
- Added DOM_CAPTURE/DOM_CAPTURED to socket event types
- Fixed ZodError `.errors` → `.flatten()`
- Fixed scrape result type handling

### Commits Made (Jan 15)
1. `24d40a6` - feat: add multi-strategy job card detection
2. `d34c5d6` - fix: scraper sync issues, event listeners, and connection pool stability

### Test Results (Jan 15)
```
Scrape All: 39 jobs discovered
Server: 14 new, 25 existing
History View: Shows 39 Found / 14 New / 25 Updated ✅
All operations complete with correct counts ✅
```

---

## Session 3: Shortlist Bug Investigation (Jan 15)

### Problem
Jobs showing 70-90% match scores on dashboard were NOT being shortlisted.

### Root Cause
1. **29 old jobs (Jan 14)** have `scoreWinLikelihood = NULL` because they were scraped before commit `61aac4e` added DB persistence
2. **69 new jobs (Jan 15)** have `scoreWinLikelihood` populated but max is 74% (below 80% threshold)
3. UI displays `fitScore` as fallback when `scoreWinLikelihood` is NULL, but auto-shortlist only checks `scoreWinLikelihood`

### Timeline
- Jan 14, 07:20 UTC: 29 jobs scraped (no scoreWinLikelihood in code)
- Jan 15, 12:08 UTC: Commit `61aac4e` added scoreWinLikelihood to DB writes
- Jan 15, 18:39 UTC: 69 jobs scraped with proper scores

### Fixes Applied
1. **Manual shortlist button** - Added star button to job cards (card + table view)
2. **API support** - Added `isShortlisted` to PATCH `/api/jobs/[id]` schema

### Pending
- Backfill 29 old jobs: set `scoreWinLikelihood = fitScore`
- Auto-shortlist 7 jobs with fitScore >= 80%

---

## Next Steps

### P0 - Critical (Shortlist Fix)
1. **Backfill old jobs** - Set `scoreWinLikelihood = fitScore` for 29 NULL jobs
2. **Auto-shortlist** - 7 jobs with fitScore >= 80%
3. **Commit UI changes** - Manual shortlist button

### P1 - High Priority
4. **Persist daily counters to database** - Currently only in chrome.storage
5. **Investigate multi-score algorithm** - May be too conservative (max 74% vs 90% fitScore)

### P2 - Medium Priority
6. GraphQL interception enhancement
7. Add isRefresh flag to enrichment
8. Deduplicate within DISCOVERY_COMPLETE batch

### P3 - Nice to Have
9. Add "reason" to JOB_EXPIRED status
10. Transaction/rollback for multi-job operations

---

## Quick Resume Commands

```bash
# Navigate to project
cd /Users/shariqqkhann/client-acquisition-suite

# Start development
npm run dev:web   # Terminal 1
npm run dev:ext   # Terminal 2

# Run Prisma migrations
cd apps/web && npx prisma migrate dev

# View Prisma Studio
cd apps/web && npx prisma studio
```

---

## Rollback Information

If anything breaks:
```bash
git checkout 61aac4e
```

This will restore to the state before Firecrawl analysis changes.
