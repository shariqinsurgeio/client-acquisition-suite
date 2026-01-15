# Upwork Browser Extension Scraping Guide

> Comprehensive technical guide for building a Chrome extension to scrape Upwork data from the client browser.

**Created:** January 2026
**Purpose:** Extract job postings, job owners, client profiles, and logged-in account data via browser extension

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Upwork Technology Stack](#upwork-technology-stack)
3. [Security & Anti-Bot Measures](#security--anti-bot-measures)
4. [URL Structure & Routing](#url-structure--routing)
5. [Page Types & Data Sources](#page-types--data-sources)
6. [DOM Structure Analysis](#dom-structure-analysis)
7. [GraphQL API (Internal)](#graphql-api-internal)
8. [Data Models](#data-models)
9. [Extension Architecture](#extension-architecture)
10. [Extraction Strategies](#extraction-strategies)
11. [Code Examples](#code-examples)
12. [Best Practices & Limitations](#best-practices--limitations)

---

## Executive Summary

Upwork is a heavily protected platform using:
- **Cloudflare Turnstile** for bot detection
- **Angular** single-page application architecture
- **GraphQL** for internal API communication
- **OAuth 2.0** for official API access

**Key Insight:** Browser extension scraping bypasses Cloudflare because the user is already authenticated and browsing normally. The extension operates within the authenticated session context.

### What Can Be Extracted

| Data Type | Availability | Method |
|-----------|--------------|--------|
| Job listings (search results) | ✅ Full | DOM + GraphQL |
| Job details (individual) | ✅ Full | DOM + GraphQL |
| Client/Job owner info | ✅ Visible data | DOM |
| Freelancer profiles | ✅ Public data | DOM |
| Logged-in account data | ✅ Full | DOM + Cookies + GraphQL |
| Proposals/Applications | ✅ Own data | GraphQL |
| Contracts | ✅ Own data | GraphQL |
| Messages | ✅ Own data | GraphQL |

---

## Upwork Technology Stack

### Frontend
| Technology | Usage |
|------------|-------|
| **Angular** (Modern) | Main SPA framework |
| **TypeScript** | Primary language |
| **RxJS** | Reactive state management |
| **SCSS** | Styling |
| **Cloudinary** | Image CDN (`res.cloudinary.com/upwork-cloud-*`) |

### Backend/API
| Technology | Usage |
|------------|-------|
| **GraphQL** | Primary API (replacing REST) |
| **REST API** | Legacy (deprecated) |
| **OAuth 2.0** | Authentication |

### CDN & Security
| Technology | Usage |
|------------|-------|
| **Cloudflare** | WAF, DDoS protection, Turnstile CAPTCHA |
| **Cloudflare Turnstile** | Human verification (site key: `0x4AAAAAAADnPIDR...`) |

### Infrastructure
- SSR (Server-Side Rendering) with Angular Universal
- State hydration via embedded JSON
- WebSocket for real-time features (messages, notifications)

---

## Security & Anti-Bot Measures

### Cloudflare Turnstile

Protected routes trigger Turnstile challenges:

```
/nx/search/jobs/          → PROTECTED
/nx/search/talent/        → PROTECTED
/ab/jobs/search/          → PROTECTED
/freelance-jobs/          → PROTECTED
/services/                → PROTECTED
```

**Non-protected (marketing pages):**
```
/hire/                    → PUBLIC
/cat/dev-it/              → PUBLIC (redirects to protected)
```

### Why Extension Scraping Works

1. **Authenticated Session**: Extension runs in user's logged-in browser
2. **No CAPTCHA**: User already passed Cloudflare challenge
3. **Same Origin**: Extension content scripts run in page context
4. **Session Cookies**: Browser sends cookies automatically

### Detection Risks

| Risk | Mitigation |
|------|------------|
| Unusual navigation speed | Add human-like delays (2-5s between pages) |
| Too many requests | Rate limit to <20 pages/minute |
| Headless browser patterns | N/A - Extension is real browser |
| Cookie manipulation | Don't modify; read-only |

---

## URL Structure & Routing

### Job Search
```
/nx/search/jobs/                              # Default job search
/nx/search/jobs/?q=python                     # Keyword search
/nx/search/jobs/?category2_uid=531770282580668426  # Category filter
/nx/search/jobs/?contractor_tier=1,2,3        # Experience level
/nx/search/jobs/?workload=as_needed,part_time,full_time
/nx/search/jobs/?t=0,1                        # Job type (hourly/fixed)
/nx/search/jobs/?amount=500-                  # Budget min
/nx/search/jobs/?duration_v3=week,month,semester,ongoing
/nx/search/jobs/?location=United%20States     # Client location
```

### Job Details
```
/jobs/~<job_id>                               # Shortened URL
/jobs/<job-title-slug>_~<job_id>              # Full URL with title
/ab/proposals/job/~<job_id>/apply             # Apply page
```

### Profile/Account
```
/freelancers/~<user_id>                       # Freelancer profile
/agencies/~<agency_id>                        # Agency profile
/ab/find-work/                                # My Feed
/ab/find-work/best-matches                    # Best Matches
/ab/proposals/                                # My Proposals
/ab/contracts/                                # My Contracts
/nx/messages/                                 # Messages
/nx/settings/                                 # Account Settings
```

### Client Pages
```
/client/jobs/                                 # Client job postings
/o/profiles/browse/                           # Browse freelancers
/ab/applicants/<job_id>/                      # View applicants
```

---

## Page Types & Data Sources

### 1. Job Search Results (`/nx/search/jobs/`)

**Data Available:**
- Job title, ID, URL
- Posted time
- Job type (hourly/fixed)
- Budget/Rate range
- Experience level required
- Project length
- Skills/tags
- Job description (truncated)
- Client info (country, spend, hires, rating)
- Proposal count
- Payment verification status

**Data Source:** DOM + Initial State JSON

### 2. Job Detail Page (`/jobs/~<id>`)

**Additional Data:**
- Full job description
- Client company info
- Client hire rate
- Client total spent
- Client member since
- Similar jobs
- Attachments (if any)

### 3. My Proposals (`/ab/proposals/`)

**Data Available:**
- All submitted proposals
- Proposal status (pending, archived, withdrawn)
- Bid amount
- Cover letter
- Submission date
- Client response status

### 4. My Contracts (`/ab/contracts/`)

**Data Available:**
- Active contracts
- Contract terms (hourly/fixed)
- Weekly limits
- Earnings
- Time tracked
- Client details
- Milestones

### 5. Account Settings (`/nx/settings/`)

**Data Available:**
- Profile information
- Billing/payment methods
- Notification settings
- Connects balance
- Membership type (Basic/Plus)

---

## DOM Structure Analysis

### Job Card Selectors (Search Results)

> **Note:** Upwork uses Angular and dynamically generated classes. Use `data-*` attributes when possible.

```javascript
// Job card container patterns (verify in DevTools)
const SELECTORS = {
  // Job listing container
  jobList: '[data-test="job-tile-list"]',
  jobCard: '[data-test="job-tile"]',
  // Or Angular component pattern:
  jobCardAlt: 'article.job-tile, .up-card-section',

  // Within job card
  jobTitle: '[data-test="job-tile-title"], .job-tile-title a',
  jobDescription: '[data-test="job-description"], .job-tile-description',
  jobType: '[data-test="job-type"], .job-type-label',
  budget: '[data-test="budget"], .budget',
  hourlyRate: '[data-test="hourly-rate"]',
  skills: '[data-test="skill"], .skill-badge, .up-skill-badge',
  postedTime: '[data-test="posted-on"], .time-posted',

  // Client info within job
  clientCountry: '[data-test="client-country"]',
  clientSpent: '[data-test="client-total-spent"]',
  clientRating: '[data-test="client-rating"]',
  paymentVerified: '[data-test="payment-verified"]',
  clientHireRate: '[data-test="hire-rate"]',

  // Proposal count
  proposalCount: '[data-test="proposals"], .proposals-tier',
};
```

### Extracting Job Data

```javascript
function extractJobFromCard(card) {
  const getText = (sel) => card.querySelector(sel)?.textContent?.trim() || '';
  const getAttr = (sel, attr) => card.querySelector(sel)?.getAttribute(attr) || '';

  // Job URL contains the ID
  const jobLink = card.querySelector('a[href*="/jobs/"]');
  const jobUrl = jobLink?.href || '';
  const jobIdMatch = jobUrl.match(/~([a-zA-Z0-9]+)/);

  return {
    id: jobIdMatch?.[1] || '',
    url: jobUrl,
    title: getText('[data-test="job-tile-title"]') || getText('.job-tile-title'),
    description: getText('[data-test="job-description"]'),
    postedTime: getText('[data-test="posted-on"]'),
    jobType: getText('[data-test="job-type"]'),
    budget: getText('[data-test="budget"]'),
    experienceLevel: getText('[data-test="experience-level"]'),
    duration: getText('[data-test="duration"]'),
    skills: [...card.querySelectorAll('[data-test="skill"], .skill-badge')]
      .map(el => el.textContent?.trim()),
    proposalCount: getText('[data-test="proposals"]'),
    client: {
      country: getText('[data-test="client-country"]'),
      totalSpent: getText('[data-test="client-total-spent"]'),
      rating: getText('[data-test="client-rating"]'),
      hireRate: getText('[data-test="hire-rate"]'),
      paymentVerified: !!card.querySelector('[data-test="payment-verified"]')
    },
    scrapedAt: new Date().toISOString()
  };
}
```

### Job Detail Page Selectors

```javascript
const JOB_DETAIL_SELECTORS = {
  // Main content
  title: 'h1, [data-test="job-title"]',
  description: '[data-test="job-description"], .job-description',

  // Sidebar
  budget: '[data-test="budget"], .budget-amount',
  projectLength: '[data-test="project-length"]',
  experienceLevel: '[data-test="experience-level"]',
  hoursPerWeek: '[data-test="hours-per-week"]',

  // Client card
  clientName: '[data-test="client-name"]',
  clientLocation: '[data-test="client-location"]',
  clientMemberSince: '[data-test="member-since"]',
  clientTotalSpent: '[data-test="total-spent"]',
  clientTotalHires: '[data-test="total-hires"]',
  clientActiveJobs: '[data-test="active-jobs"]',
  clientHireRate: '[data-test="hire-rate"]',
  clientAvgHourlyPaid: '[data-test="avg-hourly-paid"]',
  clientTotalHours: '[data-test="total-hours"]',

  // Skills
  skills: '[data-test="skill"], .skill-badge',

  // Activity
  proposals: '[data-test="proposals"]',
  interviewing: '[data-test="interviewing"]',
  invitesSent: '[data-test="invites-sent"]',
  lastViewed: '[data-test="last-viewed"]',
};
```

---

## GraphQL API (Internal)

### Overview

Upwork uses GraphQL internally for most data fetching. The extension can intercept these requests or make its own using the user's session.

**Endpoint:** `https://www.upwork.com/api/graphql/v1`

### Headers Required

```javascript
const headers = {
  'Content-Type': 'application/json',
  'X-Upwork-Accept-Language': 'en-US',
  'Authorization': `Bearer ${accessToken}`, // From cookies/session
  // CSRF token may be required
  'X-Requested-With': 'XMLHttpRequest'
};
```

### Key Queries

#### Get Job Details
```graphql
query GetJobDetails($jobId: String!) {
  job(id: $jobId) {
    id
    title
    description
    jobType
    budget {
      amount
      currencyCode
    }
    hourlyBudget {
      min
      max
    }
    duration
    workload
    skills {
      name
    }
    client {
      id
      name
      country
      totalSpent
      totalHires
      memberSince
      rating
      feedback
    }
    activity {
      proposalsCount
      interviewingCount
      invitesSent
      lastViewed
    }
  }
}
```

#### Get My Proposals
```graphql
query GetMyProposals($status: ProposalStatus, $first: Int) {
  viewer {
    proposals(status: $status, first: $first) {
      edges {
        node {
          id
          status
          bidAmount
          coverLetter
          createdAt
          job {
            id
            title
            client {
              name
              country
            }
          }
        }
      }
    }
  }
}
```

#### Get My Contracts
```graphql
query GetMyContracts($status: ContractStatus, $first: Int) {
  viewer {
    contracts(status: $status, first: $first) {
      edges {
        node {
          id
          title
          contractType
          status
          weeklyLimit
          hourlyRate
          client {
            id
            name
          }
          earnings {
            total
            thisWeek
          }
        }
      }
    }
  }
}
```

### Intercepting GraphQL Requests

```javascript
// In content script - monitor XHR/Fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);

  if (args[0]?.includes('/api/graphql')) {
    const clone = response.clone();
    const data = await clone.json();

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'GRAPHQL_RESPONSE',
      url: args[0],
      data: data
    });
  }

  return response;
};
```

---

## Data Models

### Job Model

```typescript
interface UpworkJob {
  id: string;                    // e.g., "1234567890123456789"
  url: string;
  title: string;
  description: string;
  descriptionFull?: string;      // From detail page

  // Type & Budget
  jobType: 'hourly' | 'fixed';
  budget?: {
    amount: number;
    currency: string;
  };
  hourlyRate?: {
    min: number;
    max: number;
  };

  // Requirements
  experienceLevel: 'entry' | 'intermediate' | 'expert';
  duration: string;              // "Less than 1 week", "1-3 months", etc.
  workload: string;              // "Less than 30 hrs/week", etc.
  skills: string[];

  // Activity
  proposalsCount: number;
  interviewingCount?: number;
  invitesSent?: number;
  lastViewed?: string;

  // Timestamps
  postedAt: string;              // ISO date
  scrapedAt: string;             // When we scraped it

  // Client Reference
  client: UpworkClient;
}
```

### Client/Job Owner Model

```typescript
interface UpworkClient {
  id?: string;
  name?: string;                  // May be hidden

  // Location
  country: string;
  city?: string;
  timezone?: string;

  // History
  memberSince?: string;
  totalSpent: string;            // e.g., "$50K+"
  totalHires: number;
  activeJobs?: number;

  // Reputation
  rating?: number;               // 1-5 scale
  reviewCount?: number;
  hireRate?: string;             // e.g., "75%"

  // Payment
  paymentVerified: boolean;
  avgHourlyPaid?: string;
  totalHoursWorked?: number;

  // Company
  companyName?: string;
  companySize?: string;
  industry?: string;
}
```

### Logged-in Account Model

```typescript
interface UpworkAccount {
  // Basic Info
  userId: string;
  email: string;
  name: string;
  title: string;
  profileUrl: string;

  // Stats
  jobSuccessScore?: number;      // 0-100%
  totalEarnings: number;
  hourlyRate: number;
  availability: string;

  // Connects
  connectsBalance: number;
  connectsUsedThisMonth?: number;

  // Membership
  membershipType: 'basic' | 'plus';

  // Profile Visibility
  profileVisibility: 'public' | 'private' | 'upwork_only';

  // Settings
  emailNotifications: boolean;
  availability: string;
}
```

### Proposal Model

```typescript
interface UpworkProposal {
  id: string;
  jobId: string;
  status: 'pending' | 'active' | 'archived' | 'withdrawn';

  // Bid Details
  bidType: 'hourly' | 'fixed';
  bidAmount: number;
  bidCurrency: string;

  // Content
  coverLetter: string;
  questions?: {
    question: string;
    answer: string;
  }[];

  // Timeline
  submittedAt: string;
  lastUpdated: string;

  // Status
  clientViewed: boolean;
  clientViewedAt?: string;
  shortlisted: boolean;
  messaged: boolean;
}
```

---

## Extension Architecture

### Manifest V3 Structure

```json
{
  "manifest_version": 3,
  "name": "Upwork Data Extractor",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "cookies"
  ],
  "host_permissions": [
    "https://www.upwork.com/*",
    "https://api.upwork.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://www.upwork.com/*"],
    "js": ["content.js"],
    "css": ["content.css"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon48.png"
  }
}
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Content Script** | DOM scraping, page monitoring, GraphQL interception |
| **Background Worker** | Data storage, API calls, coordination |
| **Popup** | User controls, export options, status display |
| **Storage** | IndexedDB for large datasets, chrome.storage for settings |

### File Structure

```
upwork-extension/
├── manifest.json
├── background.js          # Service worker
├── content/
│   ├── content.js         # Main content script
│   ├── extractors/
│   │   ├── jobs.js        # Job extraction logic
│   │   ├── profiles.js    # Profile extraction
│   │   ├── account.js     # Account data extraction
│   │   └── graphql.js     # GraphQL interception
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── lib/
│   ├── storage.js         # IndexedDB wrapper
│   └── utils.js           # Utilities
└── icons/
```

---

## Extraction Strategies

### Strategy 1: DOM Scraping (Simple)

**Best for:** Job search results, visible data

```javascript
// content.js
function scrapeJobList() {
  const jobs = [];
  const cards = document.querySelectorAll('[data-test="job-tile"]');

  cards.forEach(card => {
    jobs.push(extractJobFromCard(card));
  });

  return jobs;
}

// Trigger on page load and SPA navigation
const observer = new MutationObserver(() => {
  if (document.querySelector('[data-test="job-tile-list"]')) {
    const jobs = scrapeJobList();
    chrome.runtime.sendMessage({ type: 'JOBS_SCRAPED', jobs });
  }
});

observer.observe(document.body, { childList: true, subtree: true });
```

### Strategy 2: Initial State Extraction

Angular apps often embed initial state in the HTML. Look for:

```javascript
function extractInitialState() {
  // Look for JSON in script tags
  const scripts = document.querySelectorAll('script:not([src])');

  for (const script of scripts) {
    const content = script.textContent;

    // Look for state patterns
    if (content.includes('window.__INITIAL_STATE__')) {
      const match = content.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (match) {
        return JSON.parse(match[1]);
      }
    }

    // Angular transfer state
    if (content.includes('__APOLLO_STATE__') ||
        content.includes('TransferState')) {
      // Parse and extract
    }
  }

  return null;
}
```

### Strategy 3: GraphQL Interception

Capture all GraphQL responses as user browses:

```javascript
// graphql.js
class GraphQLInterceptor {
  constructor() {
    this.cache = new Map();
    this.init();
  }

  init() {
    this.interceptFetch();
    this.interceptXHR();
  }

  interceptFetch() {
    const original = window.fetch;
    const self = this;

    window.fetch = async function(input, init) {
      const response = await original.apply(this, arguments);

      if (self.isGraphQLRequest(input)) {
        const clone = response.clone();
        self.processResponse(input, init, clone);
      }

      return response;
    };
  }

  isGraphQLRequest(url) {
    return url?.toString().includes('/graphql') ||
           url?.toString().includes('/api/');
  }

  async processResponse(url, init, response) {
    try {
      const data = await response.json();

      // Cache by operation name
      const body = init?.body ? JSON.parse(init.body) : {};
      const operationName = body.operationName || 'unknown';

      this.cache.set(operationName, {
        data,
        timestamp: Date.now()
      });

      // Notify background
      chrome.runtime.sendMessage({
        type: 'GRAPHQL_DATA',
        operation: operationName,
        data
      });
    } catch (e) {
      console.error('GraphQL parse error:', e);
    }
  }
}

new GraphQLInterceptor();
```

### Strategy 4: Page-Specific Extraction

```javascript
// Route handler
function handlePageLoad() {
  const path = window.location.pathname;

  if (path.includes('/nx/search/jobs')) {
    return extractJobSearchPage();
  } else if (path.match(/\/jobs\/~[\w]+/)) {
    return extractJobDetailPage();
  } else if (path.includes('/ab/proposals')) {
    return extractProposalsPage();
  } else if (path.includes('/ab/contracts')) {
    return extractContractsPage();
  } else if (path.includes('/nx/settings')) {
    return extractAccountSettings();
  }
}

// SPA navigation listener
let lastPath = location.pathname;
new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    setTimeout(handlePageLoad, 1000); // Wait for content
  }
}).observe(document.body, { childList: true, subtree: true });
```

---

## Code Examples

### Complete Job Extractor

```javascript
// extractors/jobs.js

const SELECTORS = {
  // Update these based on current Upwork DOM
  jobList: 'section[data-test="job-tile-list"], .job-tile-list',
  jobCard: 'article[data-test="job-tile"], .job-tile',
  title: 'a[data-test="job-tile-title-link"], .job-tile-title-link',
  description: '[data-test="job-description-text"], .job-description',
  jobType: '[data-test="job-type"], .job-type',
  budget: '[data-test="budget"], .budget-amount',
  skills: '[data-test="token"], .skill-badge',
  proposalCount: '[data-test="proposals-tier"], .proposal-count',
  clientCountry: '[data-test="client-location"], .client-location',
  clientSpent: '[data-test="client-spent"], .client-spent',
  paymentVerified: '[data-test="payment-verified"]',
  postedTime: '[data-test="posted-on"], .posted-time'
};

export function extractJobCards() {
  const container = document.querySelector(SELECTORS.jobList);
  if (!container) return [];

  const cards = container.querySelectorAll(SELECTORS.jobCard);
  return Array.from(cards).map(extractJobData);
}

function extractJobData(card) {
  const titleEl = card.querySelector(SELECTORS.title);
  const url = titleEl?.href || '';
  const idMatch = url.match(/~([\w]+)/);

  return {
    id: idMatch?.[1] || generateTempId(),
    url: url,
    title: titleEl?.textContent?.trim() || '',
    description: getTextContent(card, SELECTORS.description),
    jobType: getTextContent(card, SELECTORS.jobType),
    budget: parseBudget(getTextContent(card, SELECTORS.budget)),
    skills: getMultiple(card, SELECTORS.skills),
    proposalCount: parseProposalCount(getTextContent(card, SELECTORS.proposalCount)),
    postedTime: getTextContent(card, SELECTORS.postedTime),
    client: {
      country: getTextContent(card, SELECTORS.clientCountry),
      totalSpent: getTextContent(card, SELECTORS.clientSpent),
      paymentVerified: !!card.querySelector(SELECTORS.paymentVerified)
    },
    extractedAt: new Date().toISOString(),
    pageUrl: window.location.href
  };
}

function getTextContent(parent, selector) {
  return parent.querySelector(selector)?.textContent?.trim() || '';
}

function getMultiple(parent, selector) {
  return Array.from(parent.querySelectorAll(selector))
    .map(el => el.textContent?.trim())
    .filter(Boolean);
}

function parseBudget(text) {
  if (!text) return null;

  const fixedMatch = text.match(/\$?([\d,]+)/);
  if (fixedMatch) {
    return {
      type: 'fixed',
      amount: parseFloat(fixedMatch[1].replace(/,/g, ''))
    };
  }

  const hourlyMatch = text.match(/\$?([\d.]+)\s*-\s*\$?([\d.]+)/);
  if (hourlyMatch) {
    return {
      type: 'hourly',
      min: parseFloat(hourlyMatch[1]),
      max: parseFloat(hourlyMatch[2])
    };
  }

  return { type: 'unknown', raw: text };
}

function parseProposalCount(text) {
  const match = text.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);

  // Handle ranges like "10-15" or "Less than 5"
  if (text.toLowerCase().includes('less than')) {
    return 5; // Approximate
  }
  return 0;
}

function generateTempId() {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
```

### Account Data Extractor

```javascript
// extractors/account.js

export async function extractAccountData() {
  // Method 1: From cookies
  const cookies = await getUpworkCookies();

  // Method 2: From GraphQL cache/state
  const graphqlState = extractGraphQLState();

  // Method 3: From settings page DOM
  const domData = extractFromDOM();

  return mergeAccountData(cookies, graphqlState, domData);
}

async function getUpworkCookies() {
  // Request from background script
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: 'GET_COOKIES', domain: 'upwork.com' },
      response => resolve(response.cookies)
    );
  });
}

function extractGraphQLState() {
  // Look for Apollo state
  const stateScripts = document.querySelectorAll('script');
  for (const script of stateScripts) {
    if (script.textContent.includes('__APOLLO_STATE__')) {
      try {
        const match = script.textContent.match(/__APOLLO_STATE__\s*=\s*({[\s\S]*?});/);
        if (match) {
          const state = JSON.parse(match[1]);
          return extractUserFromApolloState(state);
        }
      } catch (e) {}
    }
  }
  return null;
}

function extractUserFromApolloState(state) {
  // Look for viewer/currentUser in Apollo cache
  const keys = Object.keys(state);
  const userKey = keys.find(k => k.includes('User:') || k.includes('viewer'));

  if (userKey && state[userKey]) {
    return {
      id: state[userKey].id,
      name: state[userKey].name,
      email: state[userKey].email,
      // ... extract more fields
    };
  }
  return null;
}

function extractFromDOM() {
  // From header/nav
  const avatar = document.querySelector('[data-test="user-avatar"]');
  const name = document.querySelector('[data-test="user-name"]');

  return {
    name: name?.textContent?.trim(),
    avatarUrl: avatar?.src
  };
}
```

### Background Service Worker

```javascript
// background.js

// Storage
let jobsCache = new Map();
let accountData = null;

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'JOBS_SCRAPED':
      handleJobsScraped(message.jobs);
      break;

    case 'GRAPHQL_DATA':
      handleGraphQLData(message.operation, message.data);
      break;

    case 'GET_COOKIES':
      getCookies(message.domain).then(sendResponse);
      return true; // Async

    case 'EXPORT_DATA':
      exportData(message.format).then(sendResponse);
      return true;

    case 'GET_STATS':
      sendResponse({
        jobsCount: jobsCache.size,
        hasAccount: !!accountData
      });
      break;
  }
});

async function handleJobsScraped(jobs) {
  for (const job of jobs) {
    if (job.id && !job.id.startsWith('temp_')) {
      jobsCache.set(job.id, {
        ...jobsCache.get(job.id),
        ...job,
        updatedAt: new Date().toISOString()
      });
    }
  }

  // Persist to storage
  await saveToStorage('jobs', Object.fromEntries(jobsCache));

  // Update badge
  chrome.action.setBadgeText({ text: jobsCache.size.toString() });
}

async function getCookies(domain) {
  return chrome.cookies.getAll({ domain });
}

async function saveToStorage(key, data) {
  await chrome.storage.local.set({ [key]: data });
}

async function exportData(format) {
  const jobs = Object.fromEntries(jobsCache);

  switch (format) {
    case 'json':
      return JSON.stringify(jobs, null, 2);
    case 'csv':
      return jobsToCSV(jobs);
    default:
      return jobs;
  }
}

function jobsToCSV(jobs) {
  const rows = Object.values(jobs);
  if (rows.length === 0) return '';

  const headers = ['id', 'title', 'url', 'jobType', 'budget', 'skills',
                   'proposalCount', 'clientCountry', 'postedTime'];

  const csv = [headers.join(',')];

  for (const job of rows) {
    const row = headers.map(h => {
      let val = job[h];
      if (h === 'skills') val = (val || []).join('; ');
      if (h === 'budget') val = JSON.stringify(val);
      if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`;
      return val || '';
    });
    csv.push(row.join(','));
  }

  return csv.join('\n');
}
```

---

## Best Practices & Limitations

### Rate Limiting

```javascript
// Respect Upwork's servers
const RATE_LIMITS = {
  minDelayBetweenPages: 3000,     // 3 seconds
  maxPagesPerMinute: 15,
  maxPagesPerSession: 100,
  sessionCooldown: 60 * 60 * 1000 // 1 hour
};

class RateLimiter {
  constructor() {
    this.requests = [];
    this.sessionCount = 0;
  }

  async waitForSlot() {
    const now = Date.now();

    // Remove old requests
    this.requests = this.requests.filter(t => now - t < 60000);

    if (this.requests.length >= RATE_LIMITS.maxPagesPerMinute) {
      const waitTime = 60000 - (now - this.requests[0]);
      await sleep(waitTime);
    }

    if (this.sessionCount >= RATE_LIMITS.maxPagesPerSession) {
      throw new Error('Session limit reached. Please wait before continuing.');
    }

    this.requests.push(now);
    this.sessionCount++;

    await sleep(RATE_LIMITS.minDelayBetweenPages);
  }
}
```

### Error Handling

```javascript
// Graceful degradation
function extractWithFallbacks(card) {
  const strategies = [
    () => extractUsingDataTest(card),
    () => extractUsingClasses(card),
    () => extractUsingStructure(card)
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && result.title) return result;
    } catch (e) {
      console.warn('Extraction strategy failed:', e);
    }
  }

  return null;
}
```

### Storage Management

```javascript
// IndexedDB for large datasets
const DB_NAME = 'upwork_scraper';
const DB_VERSION = 1;

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Jobs store
      if (!db.objectStoreNames.contains('jobs')) {
        const jobsStore = db.createObjectStore('jobs', { keyPath: 'id' });
        jobsStore.createIndex('postedTime', 'postedTime');
        jobsStore.createIndex('clientCountry', 'client.country');
      }

      // Account store
      if (!db.objectStoreNames.contains('account')) {
        db.createObjectStore('account', { keyPath: 'userId' });
      }
    };
  });
}
```

### Legal & Ethical Considerations

1. **Terms of Service**: Scraping may violate Upwork's ToS
2. **Personal Use Only**: Don't redistribute scraped data
3. **Rate Limits**: Respect the platform
4. **Privacy**: Don't scrape others' private information
5. **Data Protection**: Secure stored data appropriately

### Known Limitations

| Limitation | Workaround |
|------------|------------|
| Dynamic class names | Use `data-test` attributes, structure-based selectors |
| SPA navigation | MutationObserver, history API monitoring |
| Lazy-loaded content | Wait for elements, scroll triggers |
| GraphQL schema changes | Version checking, fallback extraction |
| Session timeouts | Monitor auth state, prompt user |

---

## References & Resources

- [Upwork Developer Documentation](https://www.upwork.com/developer)
- [GraphQL API Explorer](https://www.upwork.com/developer/explorer/)
- [Chrome Extension Manifest V3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Angular Documentation](https://angular.io/docs)

### Related Tools

- [Apify Upwork Scraper](https://apify.com/bytebrains/upwork-job-scraper)
- [GitHub: UpworkScraper](https://github.com/roperi/UpworkScraper)
- [Chrome: Upwork Job Scraper + Webhook](https://chromewebstore.google.com/detail/upwork-job-scraper-+-webh/mojpfejnpifdgjjknalhghclnaifnjkg)

---

## Appendix: Selector Discovery Checklist

When Upwork updates their UI, use this process to update selectors:

1. **Open DevTools** (F12) on Upwork job search page
2. **Inspect job card** - Right-click → Inspect
3. **Look for stable identifiers:**
   - `data-test="..."` attributes (most stable)
   - `data-cy="..."` attributes (Cypress tests)
   - Semantic element structure (article, section)
   - ARIA labels and roles
4. **Avoid:**
   - Hashed/minified class names (e.g., `_1a2b3c`)
   - Index-based selectors (`:nth-child`)
   - Deeply nested paths
5. **Test selectors** in Console:
   ```javascript
   document.querySelectorAll('[data-test="job-tile"]').length
   ```
6. **Document changes** with screenshots and timestamps

---

*Last Updated: January 2026*
