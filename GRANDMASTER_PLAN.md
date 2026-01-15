# Client Acquisition Suite - Grandmaster Overhaul Plan

## Executive Summary

Transform the Client Acquisition Suite from MVP to a production-grade "Grandmaster Edition" - a high-velocity job hunting and proposal automation system that would impress the entire Upwork community and GenAI architects alike.

**Last Updated:** 2026-01-13
**Status:** Phases 1-4 Complete | Phases 5-8 Pending

---

## PHASE 1: UI Migration (Make V2 Primary) ✅ COMPLETED

### Objective
Remove legacy UI, make Grandmaster V2 the default experience.

### Current State
- `/` - Legacy page with old Header, JobFeed, Workbench
- `/v2/*` - New Grandmaster shell with modern UI
- Bug: `GrandmasterShell` references undefined `extensionConnected`
- Missing: `/v2/settings` page

### Tasks

#### 1.1 Fix GrandmasterShell Bug
**File:** `apps/web/components/grandmaster/shell.tsx`
```
Line 63: Change `extensionConnected` → `extensionStatus === "ONLINE"`
```

#### 1.2 Redirect Home to V2
**File:** `apps/web/app/page.tsx`
- Replace content with `redirect("/v2")`

#### 1.3 Update Shell Navigation
**File:** `apps/web/components/grandmaster/shell.tsx`
- Change "Home" link from `/` to `/v2`
- Or rename to "Dashboard" pointing to `/v2`

#### 1.4 Create Settings Page
**File:** `apps/web/app/v2/settings/page.tsx` (NEW)
- User preferences (signoff, rate guard)
- Selector management
- Extension configuration
- Persona management

#### 1.5 Archive Legacy Components (Optional)
- `apps/web/components/Header.tsx` → Move to `/archive`
- `apps/web/components/JobFeed.tsx` → Move to `/archive`
- `apps/web/components/Workbench.tsx` → Move to `/archive`

### Verification
- Navigate to `localhost:3000` → Should redirect to `/v2`
- All nav links work within v2 shell
- Extension status shows correctly in shell

---

## PHASE 2: Scraping Infrastructure Overhaul ✅ COMPLETED

### Objective
Capture ALL critical data from Upwork for intelligence-driven proposal writing.

### Current State (What's Being Scraped)
- Job title ✓
- Job description (truncated to 1000 chars) ✓
- Job URL ✓
- Budget (optional, often empty) ✓

### Missing Data (Critical Gaps)

#### Client Intelligence ("Sherlock" Fields)
| Field | Where to Find | Selector Strategy |
|-------|--------------|-------------------|
| Client Name | Job tile header OR reviews section | `[data-test="client-name"]`, `.client-name` |
| Client Location | Under client name | `[data-test="client-location"]` |
| Client Country | Location text parsing | Parse from location string |
| Total Spent | Client stats section | `[data-test="total-spent"]` |
| Avg Hourly Paid | Client stats | `[data-test="avg-hourly"]` |
| Hire Rate | Client stats | `[data-test="hire-rate"]` |
| Payment Verified | Badge presence | `.payment-verified-badge` |
| Review Count | Reviews section | `[data-test="review-count"]` |

#### Job Metadata
| Field | Where to Find | Purpose |
|-------|--------------|---------|
| Connects Cost | Job tile | ROI calculation |
| Posted Time | Job tile timestamp | Freshness scoring |
| Has External Links | Description parsing | Triggers AUDIT playbook |
| Skills Required | Tags section | Keyword matching |
| Job Type | Fixed/Hourly badge | Rate strategy |
| Experience Level | Badge | Fit scoring |
| Project Length | Duration text | Commitment assessment |

#### User Profile Data (NEW - Self-Scraping)
| Field | Where to Find | Purpose |
|-------|--------------|---------|
| Connects Balance | Profile/settings | Budget tracking |
| Proposals Sent | Stats page | Conversion analytics |
| Active Proposals | Dashboard | Pipeline management |
| Profile Completion | Profile page | Optimization alerts |
| Availability Status | Settings | Auto-update |

### Implementation Tasks

#### 2.1 Enhanced Job Scraping
**File:** `apps/extension/background.ts`

Update `scrapeJobsFromPage()` function to extract:
```typescript
// New fields to extract per job card
{
  // Existing
  title, description, url, budget,

  // Client Intelligence (NEW)
  clientName: extractClientName(card),
  clientLocation: extractClientLocation(card),
  clientTotalSpent: extractClientSpent(card),
  clientAvgHourly: extractClientAvgHourly(card),
  clientHireRate: extractClientHireRate(card),
  clientPaymentVerified: hasPaymentVerifiedBadge(card),
  clientReviewCount: extractReviewCount(card),

  // Job Meta (NEW)
  connectsCost: extractConnectsCost(card),
  postedAgo: extractPostedTime(card),
  hasExternalLinks: detectExternalLinks(description),
  skillsRequired: extractSkillTags(card),
  jobType: extractJobType(card),
  experienceLevel: extractExperienceLevel(card),
  projectLength: extractProjectLength(card),
}
```

#### 2.2 Create Selector Extraction Functions
**File:** `apps/extension/lib/extractors.ts` (NEW)

```typescript
export function extractClientName(card: Element): string | null
export function extractClientLocation(card: Element): string | null
export function extractClientSpent(card: Element): number | null
export function extractClientHireRate(card: Element): number | null
export function extractConnectsCost(card: Element): number
export function extractPostedTime(card: Element): string | null
export function detectExternalLinks(text: string): boolean
export function extractSkillTags(card: Element): string[]
// ... etc
```

#### 2.3 Profile Self-Scraping Feature
**File:** `apps/extension/background.ts`

Add new command handler:
```typescript
case "SCRAPE_PROFILE":
  // Navigate to upwork.com/freelancers/settings
  // Extract: connects, proposals sent, profile completion
  // Send via DATA_INGEST with type: "PROFILE_UPDATE"
```

#### 2.4 Update DATA_INGEST Handler
**File:** `apps/web/server.ts`

Modify `DATA_INGEST` event to:
- Accept all new fields from enhanced scraping
- Populate Job model's Sherlock fields
- Handle PROFILE_UPDATE type separately

#### 2.5 Update Zod Validation Schema
**File:** `apps/web/server.ts`

Expand `DataIngestSchema` to validate all new fields.

#### 2.6 Intelligent Selector Fallbacks
**File:** `apps/extension/lib/selectors.ts` (NEW)

Create robust selector chains that try multiple strategies:
```typescript
const UPWORK_SELECTORS = {
  clientName: [
    '[data-test="client-name"]',
    '.job-tile-client-name',
    'h5.client-name',
    // Parse from "About the client" section
  ],
  // ... cascading fallbacks for each field
}
```

### Verification
- Scrape jobs → All client fields populated
- Check database → Sherlock fields have data
- UI shows → Client name, location, hire rate, etc.

---

## PHASE 3: Database Schema Enhancement ✅ COMPLETED

### Objective
Extend data model to support full proposal lifecycle and analytics.

### New Models Required

#### 3.1 UserProfile Model
```prisma
model UserProfile {
  id              String   @id @default(uuid())
  userId          String   @unique

  // Upwork Profile
  upworkUsername  String?
  upworkProfileUrl String?
  profileBio      String?  @db.Text

  // Connects & Budget
  connectsBalance Int      @default(0)
  connectsSpentTotal Int   @default(0)
  connectsRefundedTotal Int @default(0)

  // Stats
  proposalsSentTotal Int   @default(0)
  proposalsActiveCount Int @default(0)
  interviewsTotal Int      @default(0)
  hiresTotal Int           @default(0)

  // Profile Health
  profileCompletionPct Int @default(0)
  availabilityStatus String @default("available")

  // Sync
  lastSyncedAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

#### 3.2 ProposalDraft Model
```prisma
model ProposalDraft {
  id          String   @id @default(uuid())
  userId      String
  jobId       String
  job         Job      @relation(fields: [jobId], references: [id])

  // Content
  playbook    String   // AUDIT_PITCH, CONTEXT_TRAP, DIRECT_APPLY
  content     String   @db.Text
  psLine      String?

  // Assets Used
  assetsUsed  String[] // Array of Asset IDs

  // Status
  status      String   @default("draft") // draft, ready, sent
  sentAt      DateTime?

  // Versioning
  version     Int      @default(1)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([jobId])
}
```

#### 3.3 Analytics Model
```prisma
model DailyAnalytics {
  id              String   @id @default(uuid())
  userId          String
  date            DateTime @db.Date

  // Activity
  jobsScraped     Int      @default(0)
  proposalsSent   Int      @default(0)
  connectsSpent   Int      @default(0)

  // Outcomes
  responsesReceived Int    @default(0)
  interviewsScheduled Int  @default(0)
  jobsWon         Int      @default(0)

  // Financials
  revenueEarned   Float    @default(0)

  createdAt       DateTime @default(now())

  @@unique([userId, date])
  @@index([userId])
}
```

#### 3.4 ClientProfile Model (For repeat clients)
```prisma
model ClientProfile {
  id              String   @id @default(uuid())
  userId          String

  // Identity
  clientName      String
  upworkClientId  String?  // If extractable

  // Stats (aggregated from jobs)
  totalJobsPosted Int      @default(0)
  avgBudget       Float?
  avgHourlyRate   Float?
  totalSpent      Float?
  hireRate        Float?

  // Relationship
  previousWorkCount Int    @default(0)
  lastContactAt   DateTime?
  notes           String?  @db.Text
  isVIP           Boolean  @default(false)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, clientName])
  @@index([userId])
}
```

### Migration Tasks

#### 3.5 Create Migration
```bash
npx prisma migrate dev --name enhanced_analytics_models
```

#### 3.6 Update Types
**File:** `apps/web/lib/types.ts`
- Add TypeScript interfaces for all new models

### Verification
- `npx prisma studio` → See all new tables
- API routes work with new models

---

## PHASE 4: Enhanced Fit Scoring & Intelligence ✅ COMPLETED

### Objective
Build a sophisticated scoring system that predicts proposal success.

### Current Scoring (Simple)
- Base: 50 points
- Positive keywords: +8 each
- Negative keywords: -20 each
- Budget tiers: ±15 points

### Enhanced Scoring System

#### 4.1 Multi-Factor Scoring Algorithm
```typescript
function calculateEnhancedFitScore(job: JobData, userProfile: UserProfile): FitScore {
  return {
    // Overall (0-100)
    overall: calculateOverall(...),

    // Component Scores (0-100 each)
    keywordMatch: calculateKeywordMatch(job.description),
    clientQuality: calculateClientQuality(job.client),
    budgetFit: calculateBudgetFit(job.budget, userProfile.minRate),
    competitionLevel: calculateCompetition(job.connectsCost, job.proposalCount),
    freshness: calculateFreshness(job.postedAgo),

    // Flags
    hasContext: job.hasExternalLinks,
    isBigFive: BIG_FIVE.includes(job.clientCountry),
    isPaymentVerified: job.clientPaymentVerified,

    // Recommendation
    playbook: recommendPlaybook(job),
    priority: calculatePriority(...),
  }
}
```

#### 4.2 Client Quality Score
```typescript
function calculateClientQuality(client: ClientData): number {
  let score = 50;

  // Payment verification (+20)
  if (client.paymentVerified) score += 20;

  // Hire rate (0-20 based on %)
  score += (client.hireRate / 100) * 20;

  // Total spent tiers
  if (client.totalSpent >= 10000) score += 15;
  else if (client.totalSpent >= 1000) score += 10;
  else if (client.totalSpent >= 100) score += 5;
  else score -= 10; // New client, higher risk

  // Review count
  if (client.reviewCount >= 10) score += 5;

  return clamp(score, 0, 100);
}
```

#### 4.3 Playbook Recommendation Engine
```typescript
function recommendPlaybook(job: JobData): PlaybookRecommendation {
  // AUDIT_PITCH: Client has external links, can provide free audit
  if (job.hasExternalLinks) {
    return {
      type: "AUDIT_PITCH",
      reason: "External links detected - offer free audit",
      confidence: 0.9
    };
  }

  // CONTEXT_TRAP: Vague job, need more info
  if (job.description.length < 200 || isVagueDescription(job.description)) {
    return {
      type: "CONTEXT_TRAP",
      reason: "Limited context - ask clarifying questions",
      confidence: 0.8
    };
  }

  // DIRECT_APPLY: Clear requirements, just apply
  return {
    type: "DIRECT_APPLY",
    reason: "Clear requirements - direct pitch",
    confidence: 0.7
  };
}
```

### Implementation Files
- `apps/web/lib/scoring.ts` (NEW) - All scoring logic
- `apps/web/server.ts` - Update calculateFitScore call
- `apps/web/lib/types.ts` - FitScore interface

### Verification
- Jobs show multi-factor scores in UI
- Playbook auto-selects based on job context

---

## PHASE 5: Real-Time Pipeline & Analytics Dashboard

### Objective
Build comprehensive pipeline tracking and ROI analytics.

### Features

#### 5.1 Enhanced Pipeline Page
**File:** `apps/web/app/v2/pipeline/page.tsx`

- Kanban board with drag-and-drop
- Columns: Drafts → Applied → Interviewing → Hired → Lost
- Stale lead detection (>7 days no response)
- "Draft Nudge" quick action for follow-ups
- Filter by date range, platform, client quality

#### 5.2 ROI Dashboard Metrics
```typescript
interface ROIDashboard {
  // Investment
  connectsSpent: number;
  connectsCost: number; // $ value at $0.15/connect

  // Funnel
  proposalsSent: number;
  responsesReceived: number;
  interviewsScheduled: number;
  jobsWon: number;

  // Rates
  responseRate: number; // responses / sent
  interviewRate: number; // interviews / responses
  winRate: number; // won / interviews

  // ROI
  costPerLead: number; // $ per interview
  costPerWin: number; // $ per hire

  // Revenue
  totalEarned: number;
  roi: number; // (earned - invested) / invested
}
```

#### 5.3 Analytics API Endpoints
**File:** `apps/web/app/api/analytics/route.ts` (NEW)

- GET `/api/analytics/summary` - ROI dashboard data
- GET `/api/analytics/daily?range=30` - Daily breakdown
- GET `/api/analytics/funnel` - Conversion funnel

#### 5.4 Real-Time Updates
- Pipeline updates via Socket.io
- Live counters in header
- Notification on status changes

### Verification
- Pipeline shows all jobs in correct stages
- ROI metrics calculate correctly
- Real-time updates work

---

## PHASE 6: AI Integration & Prompt Engineering

### Objective
Integrate Claude/GPT for intelligent proposal generation.

### Features

#### 6.1 AI Proposal Generator
**File:** `apps/web/lib/ai/proposal-generator.ts` (NEW)

```typescript
interface ProposalGeneratorConfig {
  model: "claude-3-sonnet" | "gpt-4o";
  persona: UserPersona;
  job: Job;
  playbook: PlaybookType;
  assets: Asset[];
  maxLength: number;
}

async function generateProposal(config: ProposalGeneratorConfig): Promise<GeneratedProposal> {
  const prompt = buildPrompt(config);
  const response = await callAI(prompt);
  return parseProposal(response);
}
```

#### 6.2 Prompt Templates
**File:** `apps/web/lib/ai/prompts.ts` (NEW)

```typescript
const AUDIT_PITCH_PROMPT = `
You are {persona.name}, {persona.bio}.

A potential client has posted a job on Upwork:
Title: {job.title}
Description: {job.description}
Budget: {job.budget}
Client: {job.clientName} from {job.clientLocation}
Client Stats: ${job.clientTotalSpent} spent, {job.clientHireRate}% hire rate

They have external links in their posting: {job.externalLinks}

Write a proposal using the AUDIT PITCH playbook:
1. Greet them by name (if known)
2. Reference their specific project
3. Offer to record a FREE Loom audit of their current solution
4. Include a relevant portfolio piece: {assets[0].url}
5. End with "{persona.defaultSignOff}"

Keep it under 150 words. Be {persona.tone}.
`;
```

#### 6.3 AI-Powered Client Research
```typescript
async function researchClient(clientName: string, jobUrl: string): Promise<ClientInsights> {
  // Use AI to:
  // 1. Search for client reviews on Upwork
  // 2. Analyze past job postings
  // 3. Identify patterns (budget, response time, etc.)
  // 4. Generate personalized P.S. suggestions
}
```

#### 6.4 API Integration
**File:** `apps/web/app/api/ai/generate/route.ts` (NEW)

- POST `/api/ai/generate` - Generate proposal
- POST `/api/ai/improve` - Improve existing draft
- POST `/api/ai/research` - Client research

### Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_MODEL_DEFAULT=claude-3-sonnet
```

### Verification
- Generate proposal button works
- AI respects playbook templates
- Client research provides insights

---

## PHASE 7: Extension Enhancement

### Objective
Make extension robust, intelligent, and user-friendly.

### Features

#### 7.1 Smart Selector Recovery
**File:** `apps/extension/lib/selector-recovery.ts` (NEW)

```typescript
// When primary selectors fail, try:
// 1. Fuzzy matching on class names
// 2. Text content matching
// 3. DOM structure analysis
// 4. Visual element detection (via bounding boxes)
// 5. Report failure to server for selector update
```

#### 7.2 Background Sync
- Periodic profile sync (every 30 min)
- Connects balance monitoring
- Proposal status tracking

#### 7.3 Quick Actions Popup
**File:** `apps/extension/popup.tsx`

- Current connects balance
- Active proposals count
- Quick scrape button
- Connection status
- Last sync time

#### 7.4 Content Script Enhancements
**File:** `apps/extension/contents/upwork-enhancer.ts` (NEW)

- Inject fit scores into Upwork job tiles
- Add "Quick Save" button to job cards
- Highlight jobs matching user's criteria
- Show client quality indicators inline

### Verification
- Extension shows correct status
- Quick actions work from popup
- Inline enhancements visible on Upwork

---

## PHASE 8: Production Hardening

### Objective
Make the system stable, secure, and performant.

### Tasks

#### 8.1 Error Handling
- Global error boundary in React
- Socket.io reconnection logic
- Scraping retry with exponential backoff
- Graceful degradation when extension offline

#### 8.2 Rate Limiting
- API route rate limiting (100 req/min)
- Scraping cooldown (1 per 5 min)
- Socket event throttling

#### 8.3 Data Validation
- Strict Zod schemas on all inputs
- Sanitize HTML in job descriptions
- Validate URLs before storage

#### 8.4 Security
- CSRF protection on API routes
- Content Security Policy headers
- Secure cookie handling
- Input length limits (prevent DoS)

#### 8.5 Performance
- Database query optimization
- Pagination on large lists
- Lazy loading components
- Socket event batching

#### 8.6 Monitoring
- Error logging (Sentry integration)
- Performance monitoring
- Uptime checks
- User analytics (Posthog/Mixpanel)

### Verification
- No unhandled errors in console
- API responds within 200ms
- Extension reconnects after disconnect

---

## Implementation Order

### Week 1: Foundation
1. Phase 1: UI Migration
2. Phase 2: Scraping Overhaul - Job data
3. Phase 3: Database Schema

### Week 2: Intelligence
4. Phase 4: Enhanced Scoring
5. Phase 2 continued: Profile scraping
6. Phase 5: Pipeline & Analytics

### Week 3: AI & Polish
7. Phase 6: AI Integration
8. Phase 7: Extension Enhancement

### Week 4: Hardening
9. Phase 8: Production Hardening

---

## Critical Files to Modify

| Phase | File | Changes |
|-------|------|---------|
| 1 | `apps/web/app/page.tsx` | Redirect to /v2 |
| 1 | `apps/web/components/grandmaster/shell.tsx` | Fix extensionConnected bug |
| 2 | `apps/extension/background.ts` | Enhanced scraping logic |
| 2 | `apps/extension/lib/extractors.ts` | NEW - Extraction functions |
| 2 | `apps/web/server.ts` | Updated DATA_INGEST handler |
| 3 | `apps/web/prisma/schema.prisma` | New models |
| 3 | `apps/web/lib/types.ts` | New interfaces |
| 4 | `apps/web/lib/scoring.ts` | NEW - Enhanced scoring |
| 5 | `apps/web/app/v2/pipeline/page.tsx` | Enhanced pipeline |
| 5 | `apps/web/app/api/analytics/route.ts` | NEW - Analytics API |
| 6 | `apps/web/lib/ai/proposal-generator.ts` | NEW - AI integration |
| 6 | `apps/web/app/api/ai/generate/route.ts` | NEW - AI API |
| 7 | `apps/extension/popup.tsx` | Enhanced popup |
| 7 | `apps/extension/contents/upwork-enhancer.ts` | NEW - Page enhancements |

---

## Success Metrics

- **Scraping Coverage**: 100% of available Upwork data fields captured
- **Fit Score Accuracy**: 80%+ correlation with actual job outcomes
- **Proposal Quality**: 30%+ response rate improvement
- **Pipeline Velocity**: 50%+ faster time from scrape to apply
- **User Experience**: <200ms page load, <3s scrape initiation
- **Stability**: 99.9% uptime, automatic error recovery

---

## Verification Plan

1. **Manual Testing**
   - Navigate all routes
   - Trigger scrape and verify data
   - Check database for new fields
   - Test AI generation

2. **Integration Testing**
   - Extension ↔ Server communication
   - Real-time updates
   - Authentication flows

3. **Load Testing**
   - 1000+ jobs in database
   - Multiple concurrent users
   - Rapid scraping requests

4. **User Acceptance**
   - Walkthrough with stakeholder
   - Feedback collection
   - Iteration based on usage
