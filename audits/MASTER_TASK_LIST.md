# Agency OS: Master Task List

**Philosophy:** Ship features that create massive user value, backed by robust infrastructure. No busywork.

---

## Priority Legend

| Tag | Meaning |
|-----|---------|
| `[VALUE]` | Directly impacts user outcomes |
| `[ROBUST]` | Ensures reliability of value-delivering features |
| `[DEVOPS]` | Enables team velocity and quality |

---

## Phase 1: Foundation (Week 1-2)
*Goal: Make what exists actually work reliably*

### Security - Non-Negotiable

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 1.1 | Restrict CORS to known origins (extension ID, localhost) | `[ROBUST]` | Anyone can currently connect and inject fake jobs |
| 1.2 | Add Socket.io authentication middleware (validate extension ID) | `[ROBUST]` | Prevents unauthorized command execution |
| 1.3 | Add Zod validation for all Socket events and API routes | `[ROBUST]` | Prevents malformed data crashing the system |

**Implementation:**
```typescript
// server.ts - Add this
import { z } from 'zod';

const DataIngestSchema = z.object({
  platform: z.enum(['UPWORK', 'LINKEDIN', 'FIVERR', 'FREELANCER']),
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  url: z.string().url()
});
```

### Reliability

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 1.4 | Convert `server.js` to `server.ts` with typed Socket events | `[ROBUST]` | Catch bugs at compile time, not runtime |
| 1.5 | Add service worker keepalive in extension (Chrome alarms) | `[ROBUST]` | Socket connection drops silently without this |
| 1.6 | Restrict extension permissions to specific domains | `[ROBUST]` | Required for Chrome Web Store; current setup will be rejected |

### DevOps Setup

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 1.7 | Create GitHub repo structure with branch protection | `[DEVOPS]` | Prevents accidental pushes to main |
| 1.8 | Add GitHub Action: TypeScript type-check on PR | `[DEVOPS]` | Catches type errors before merge |
| 1.9 | Add GitHub Action: ESLint on PR | `[DEVOPS]` | Maintains code quality automatically |
| 1.10 | Create `.env.example` files for both apps | `[DEVOPS]` | Onboarding new devs / machines |

**GitHub Actions Template:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build --workspace=apps/web
      - run: cd apps/extension && npx tsc --noEmit
```

---

## Phase 2: Core Value Loop (Week 3-4)
*Goal: Complete the find → evaluate → apply cycle*

### Fit Scoring - The Filter That Saves Hours

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 2.1 | Implement rules-based fit scoring on job ingest | `[VALUE]` | Users waste 70% of time on bad-fit jobs |
| 2.2 | Add scoring config UI in settings (keywords, min budget) | `[VALUE]` | Personalized relevance = higher engagement |
| 2.3 | Sort job feed by fit score (highest first) | `[VALUE]` | Best opportunities surface immediately |
| 2.4 | Add visual fit indicator (score badge, color coding) | `[VALUE]` | Instant visual triage |

**Scoring Logic:**
```typescript
function calculateFitScore(job: Job, rules: ScoringRules): number {
  let score = 50; // Base score

  const text = `${job.title} ${job.description}`.toLowerCase();

  // Positive signals
  rules.positiveKeywords.forEach(kw => {
    if (text.includes(kw.toLowerCase())) score += 15;
  });

  // Negative signals (deal breakers)
  rules.negativeKeywords.forEach(kw => {
    if (text.includes(kw.toLowerCase())) score -= 30;
  });

  return Math.max(0, Math.min(100, score));
}
```

### Scraping Reliability

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 2.5 | Add real-time scrape progress events (`SCRAPE_PROGRESS`) | `[VALUE]` | Users hate blind waits; shows system is working |
| 2.6 | Implement selector fallback chain (try multiple selectors) | `[ROBUST]` | Upwork changes DOM frequently; one selector breaks, others work |
| 2.7 | Add scrape error recovery (retry once on failure) | `[ROBUST]` | Transient failures shouldn't require manual retry |
| 2.8 | Log selector failures to database for monitoring | `[ROBUST]` | Know when selectors break before users report |

### Job Detail & Actions

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 2.9 | Add expandable job detail panel (full description, budget, timeline) | `[VALUE]` | Users need full context to decide |
| 2.10 | Add "Open on Upwork" button with one click | `[VALUE]` | Reduces friction to act |
| 2.11 | Add Save/Archive/Hide actions on jobs | `[VALUE]` | Users can organize their pipeline |
| 2.12 | Persist job status changes (SAVED, APPLIED, HIDDEN) | `[VALUE]` | State survives page refresh |

---

## Phase 3: AI Proposals - The Killer Feature (Week 5-6)
*Goal: 10x faster proposal writing*

### AI Integration

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 3.1 | Add OpenAI/Anthropic API integration | `[ROBUST]` | Foundation for AI features |
| 3.2 | Create proposal generation endpoint with streaming | `[VALUE]` | Users see AI "thinking" in real-time |
| 3.3 | Design proposal prompt with agency context injection | `[VALUE]` | Personalized proposals win more |
| 3.4 | Add "Draft Proposal" button on job cards | `[VALUE]` | One-click AI assistance |
| 3.5 | Build proposal editor UI (editable, regenerate, copy) | `[VALUE]` | Users must refine AI output |

**Prompt Structure:**
```typescript
const proposalPrompt = `
You are writing a proposal for a GenAI agency.

## Agency Context
${agencyContext} // Skills, past work, tone preferences

## Job Details
Title: ${job.title}
Description: ${job.description}
Budget: ${job.budget || 'Not specified'}

## Instructions
Write a 150-word proposal that:
1. Opens with a specific insight about their problem
2. Mentions one relevant past project
3. Proposes a clear next step
4. Sounds human, not templated
`;
```

### Proposal Workflow

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 3.6 | Add proposal drafts storage (per job) | `[VALUE]` | Resume work on proposals |
| 3.7 | Track proposal status (DRAFT, SENT, WON, LOST) | `[VALUE]` | Pipeline visibility |
| 3.8 | Add "Copy & Mark as Sent" action | `[VALUE]` | Single action to complete workflow |

---

## Phase 4: Data & Insights (Week 7-8)
*Goal: Learn what wins*

### Database Robustness

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 4.1 | Add indexes on Job (platform, status, fitScore, createdAt) | `[ROBUST]` | Queries stay fast as data grows |
| 4.2 | Implement cursor-based pagination for jobs API | `[ROBUST]` | Feed scales beyond 100s of jobs |
| 4.3 | Add Proposal model to schema (linked to Job) | `[ROBUST]` | Store AI drafts and outcomes |

### Win/Loss Tracking

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 4.4 | Add outcome tracking UI (Won/Lost/No Response) | `[VALUE]` | Know your actual win rate |
| 4.5 | Display win rate stats on dashboard | `[VALUE]` | Motivation + performance insight |
| 4.6 | Export job/proposal data to CSV | `[VALUE]` | Analysis in spreadsheets |

---

## Phase 5: Scale & Polish (Week 9+)
*Goal: Production-ready system*

### Production Infrastructure

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 5.1 | Migrate from SQLite to PostgreSQL | `[ROBUST]` | Concurrent writes, better performance |
| 5.2 | Add Redis adapter for Socket.io | `[ROBUST]` | Enables horizontal scaling |
| 5.3 | Set up error tracking (Sentry) | `[ROBUST]` | Know when things break in production |
| 5.4 | Add health check endpoint | `[DEVOPS]` | Monitoring and alerting |

### DevOps Maturity

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 5.5 | Add GitHub Action: Build extension on release tag | `[DEVOPS]` | Automated release builds |
| 5.6 | Create staging environment | `[DEVOPS]` | Test before production |
| 5.7 | Add database migration CI check | `[DEVOPS]` | Catch schema issues early |
| 5.8 | Document deployment process in README | `[DEVOPS]` | Bus factor reduction |

### Multi-Platform (Only After Upwork is Solid)

| # | Task | Type | Why It Matters |
|---|------|------|----------------|
| 5.9 | Add LinkedIn job scraping | `[VALUE]` | Second largest opportunity source |
| 5.10 | Add Fiverr scraping | `[VALUE]` | Diversify lead sources |
| 5.11 | Unified job normalization layer | `[ROBUST]` | Consistent data across platforms |

---

## GitHub Project Setup

### Recommended Labels

```
priority/critical   - Security, data loss risks
priority/high       - Core value features
priority/medium     - Quality of life
priority/low        - Nice to have

type/feature        - New functionality
type/bug            - Something broken
type/tech-debt      - Refactoring, cleanup
type/devops         - CI/CD, tooling

area/web            - Dashboard app
area/extension      - Browser extension
area/api            - Backend/Socket
area/ai             - AI proposal features
```

### Milestone Structure

```
v0.2.0 - Secure Foundation
  └── Tasks 1.1 - 1.10

v0.3.0 - Smart Job Feed
  └── Tasks 2.1 - 2.12

v0.4.0 - AI Proposals
  └── Tasks 3.1 - 3.8

v0.5.0 - Insights & Analytics
  └── Tasks 4.1 - 4.6

v1.0.0 - Production Ready
  └── Tasks 5.1 - 5.11
```

### Branch Strategy

```
main                    # Production-ready code only
├── develop             # Integration branch
├── feature/fit-scoring # Feature branches
├── feature/ai-proposals
└── fix/socket-auth     # Bug fixes
```

### PR Template

```markdown
## What
Brief description of changes

## Why
Link to task (e.g., Task 2.1 - Fit Scoring)

## Type
- [ ] Feature
- [ ] Bug Fix
- [ ] Tech Debt
- [ ] DevOps

## Testing
How was this tested?

## Checklist
- [ ] Types pass (`npm run build`)
- [ ] No new `any` types introduced
- [ ] Tested with extension connected
```

---

## Quick Reference: What Creates Value vs. What's Busywork

### HIGH VALUE (Do These)
- Fit scoring - saves hours of manual filtering
- AI proposals - 10x faster proposal writing
- Scrape progress - reduces anxiety, builds trust
- Job actions (save/apply) - completes the workflow
- Win/loss tracking - enables learning

### LOW VALUE (Skip or Defer)
- Dark mode - nice but not a differentiator
- Multiple color themes - vanity feature
- Complex analytics dashboards - premature optimization
- Mobile app - desktop is the primary use case
- Social features - this is a solo/small team tool

### NECESSARY BUT NOT EXCITING (Do Quickly, Don't Overthink)
- Security fixes - table stakes, not a feature
- TypeScript migration - one-time investment
- CI/CD setup - set and forget
- Database indexes - 30 minutes of work

---

## Success Metrics for Each Phase

| Phase | Key Metric | Target |
|-------|------------|--------|
| 1 | Zero security vulnerabilities | 0 critical/high issues |
| 2 | Scrape success rate | >95% |
| 2 | Jobs reviewed per session | 3x current (via fit scoring) |
| 3 | Proposals drafted with AI | >50% of applications |
| 3 | Time to first proposal draft | <2 minutes |
| 4 | Win rate visibility | 100% of outcomes tracked |
| 5 | System uptime | >99.5% |

---

## Total Task Count

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| Phase 1: Foundation | 10 | 1-2 weeks |
| Phase 2: Core Value | 12 | 2 weeks |
| Phase 3: AI Proposals | 8 | 2 weeks |
| Phase 4: Data & Insights | 6 | 1 week |
| Phase 5: Scale & Polish | 11 | 2-3 weeks |
| **Total** | **47** | **8-10 weeks** |

---

*Focus on Phases 1-3. That's where 80% of the value lives. Phases 4-5 are polish and scale—only needed once you're using the tool daily.*
