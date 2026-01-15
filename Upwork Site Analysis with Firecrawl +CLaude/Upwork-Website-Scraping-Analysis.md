# Upwork Website Analysis for Scraping Engineers

> A comprehensive technical guide analyzing Upwork's website structure, content patterns, and data architecture based on actual scraped content.

**Date:** January 2026
**Scraping Tool:** Firecrawl API (parallel scraping with 2 API keys)
**Pages Analyzed:** 11 URLs across multiple page types

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Scraping Results Overview](#scraping-results-overview)
3. [Cloudflare Protection Analysis](#cloudflare-protection-analysis)
4. [Page Architecture & URL Patterns](#page-architecture--url-patterns)
5. [Content Structure Analysis](#content-structure-analysis)
6. [Navigation & Link Patterns](#navigation--link-patterns)
7. [Job Data Structure](#job-data-structure)
8. [CDN & Asset Infrastructure](#cdn--asset-infrastructure)
9. [Filter & Search Parameters](#filter--search-parameters)
10. [Taxonomy & Category System](#taxonomy--category-system)
11. [Scraping Strategy Recommendations](#scraping-strategy-recommendations)

---

## Executive Summary

### Key Findings

| Aspect | Finding |
|--------|---------|
| **Framework** | Angular SPA (Single Page Application) |
| **Protection** | Cloudflare Turnstile (selective by route) |
| **API** | GraphQL at `/api/graphql/v1` |
| **CDN** | Cloudinary (`res.cloudinary.com/upwork-cloud-*`) |
| **Accessibility** | Marketing pages accessible; App routes protected |

### Scraping Success Rate

| Route Pattern | Success | Reason |
|---------------|---------|--------|
| `/hire/*` | ✅ 100% | Static marketing pages |
| `/cat/*` | ✅ 100% | Category landing pages |
| `/o/jobs/browse/` | ✅ 100% | Public job directory |
| `/o/profiles/browse/` | ✅ 100% | Public profile directory |
| `/ab/jobs/search/` | ✅ 100% | Search interface (limited) |
| `/freelance-jobs/*` | ✅ Partial | SEO pages with job samples |
| `/nx/search/jobs/` | ❌ Blocked | Cloudflare Turnstile |
| `/nx/search/talent/` | ❌ Blocked | Cloudflare Turnstile |
| `/services/` | ❌ Blocked | Cloudflare Turnstile |

---

## Scraping Results Overview

### Files Generated

| File | Size | Content Type |
|------|------|--------------|
| `www.upwork.com-hire.md` | 41KB | Freelancer categories mega-menu |
| `www.upwork.com-cat-dev-it.md` | 31KB | Dev & IT category landing page |
| `www.upwork.com-o-jobs-browse.md` | 83KB | Complete job category index |
| `www.upwork.com-o-profiles-browse.md` | 41KB | Freelancer browse page |
| `www.upwork.com-freelance-jobs-web-development.md` | 54KB | Web dev jobs with samples |
| `www.upwork.com-ab-jobs-search.md` | 12KB | Search filters + job listings |
| `www.upwork.com-nx-search-jobs.md` | 1KB | Cloudflare challenge page |
| `www.upwork.com-nx-search-jobs-q=python.md` | 1KB | Cloudflare challenge page |
| `www.upwork.com-nx-search-talent.md` | 1KB | Cloudflare challenge page |
| `www.upwork.com-freelance-jobs.md` | 1KB | Cloudflare challenge page |
| `www.upwork.com-services.md` | 1KB | Cloudflare challenge page |

### Total Data Extracted: ~265KB of structured content

---

## Cloudflare Protection Analysis

### Protected Routes (Cloudflare Turnstile)

All routes starting with `/nx/` are protected:

```
/nx/search/jobs/          → Turnstile CAPTCHA
/nx/search/jobs/?q=*      → Turnstile CAPTCHA
/nx/search/talent/        → Turnstile CAPTCHA
/nx/settings/             → Requires auth + CAPTCHA
/nx/messages/             → Requires auth + CAPTCHA
```

Additional protected routes:
```
/freelance-jobs/          → Turnstile CAPTCHA
/services/                → Turnstile CAPTCHA
```

### Cloudflare Challenge Response (Captured)

```markdown
# Just a moment...
Checking your Browser…
Verify you are human
Verifying...

Stuck here? Send Feedback
Success! / Error
Having trouble? Send Feedback
Expired. Refresh
Timed out. Refresh

Privacy • Terms
Waiting for www.upwork.com to respond...
```

**Turnstile Site Key Identified:** `0x4AAAAAAADnPIDROrmt1Wwj`

### Unprotected Routes (Accessible)

```
/hire/*                   → Full access
/cat/*                    → Full access (category pages)
/o/jobs/browse/           → Full access (job directory)
/o/profiles/browse/       → Full access (freelancer directory)
/ab/jobs/search/          → Partial access (search UI)
/freelance-jobs/*/        → Partial (SEO pages only)
```

---

## Page Architecture & URL Patterns

### Route Taxonomy

| Prefix | Purpose | Auth Required | CF Protected |
|--------|---------|---------------|--------------|
| `/nx/` | New Experience (SPA) | Often | Yes |
| `/ab/` | A/B Test / App | Mixed | Partial |
| `/o/` | Old/Original | No | No |
| `/cat/` | Categories | No | No |
| `/hire/` | Hiring pages | No | No |
| `/freelance-jobs/` | SEO job pages | No | Partial |
| `/services/` | Project Catalog | No | Yes |

### URL Structure Patterns

**Job Listings:**
```
/freelance-jobs/{category}/              # Category page
/freelance-jobs/{skill}/                 # Skill-specific
/freelance-jobs/apply/{job-slug}_~{id}/  # Apply link
/jobs/~{job_id}                          # Direct job link
```

**Freelancer Profiles:**
```
/hire/{specialty}/                       # Specialty hire page
/hire/{specialty}-developers/            # Developer specialty
/freelancers/~{user_id}                  # Direct profile
```

**Categories:**
```
/cat/dev-it/                             # Development & IT
/cat/design-creative/                    # Design & Creative
/cat/sales-and-marketing/                # Sales & Marketing
/cat/admin-customer-support/             # Admin & Support
/cat/writing-translation/                # Writing
/cat/finance-accounting/                 # Finance
/cat/hr-training/                        # HR
/cat/legal/                              # Legal
/cat/engineering-architecture/           # Engineering
/cat/ai/                                 # AI Services
```

---

## Content Structure Analysis

### Page Components Identified

#### 1. Global Navigation (All Pages)

```markdown
Find talent
├── Talent Marketplace™
│   ├── Development & IT
│   ├── Design & Creative
│   ├── Sales & Marketing
│   └── ... (10 categories)
├── Project Catalog™
│   ├── Logo Design
│   ├── Social Media Marketing
│   ├── Articles & Blog Posts
│   └── ... (services)
└── Consultations
    ├── Web programming
    ├── AI & machine learning
    └── ... (consultation types)

Find work
├── Ways to earn
├── Find work for your skills
├── Win work with ads
└── Join Freelancer Plus

Why Upwork
├── Success Stories
├── How to hire
├── Reviews
└── How to find work
```

#### 2. Category Landing Pages (`/cat/*`)

**Structure Pattern:**
```
# Hero Section
  - Title: "Dev and IT experts to scale your org"
  - CTA: "Get started"
  - Trust logos: Microsoft, Airbnb, Automattic, Bissell, Cloudflare

# Stats Section
  - "4.91 star rating - Average rating for work with tech talent"
  - "211K+ contracts - Involving development and IT work"
  - "1,665 skills - Represented by talent on Upwork"

# Featured Talent Cards
  - Java Developers (4.8 rating)
  - PHP Developers (4.8 rating)
  - JavaScript Developers (4.8 rating)
  - ... (9 specialty cards)

# Project Types
  - Mobile App Development
  - Shopify Development
  - WordPress Development
  - Data Visualization
  - Machine Learning
  - Cybersecurity & Data Protection

# Case Study
  - "PGA of America Tests New Ideas With On-Demand Devs"
  - "3x faster project completion times"

# FAQ Section
# Skills Directory (extensive links)
```

#### 3. Job Listings (`/freelance-jobs/*/`)

**Job Card Structure (from scraped content):**
```markdown
## [Job Title](apply_link)
- New/Posted X hours ago
- **$X,XXX** / Fixed-price OR **Hourly: $XX - $XX**
- **Experience level:** Entry/Intermediate/Expert
- **Est. time:** X to X months, X hrs/week
- **Duration:** Less than 1 month / 1-3 months / etc.

[Truncated job description...]

Skills: Skill1, Skill2, Skill3, Skill4
```

#### 4. Search Interface (`/ab/jobs/search/`)

**Filter Categories Identified:**
```
Category: Select Categories
Experience level: Entry Level (756), Intermediate (5,494), Expert (3,275)
Job type: Hourly (6,917), Fixed-Price (2,610)
  Fixed ranges: <$100, $100-$500, $500-$1K, $1K-$5K, $5K+
Client history: No hires (2,997), 1-9 hires (2,824), 10+ hires (3,702)
Client location: Select dropdown
Client time zones: Select dropdown
Project length: <1 month, 1-3 months, 3-6 months, 6+ months
Hours per week: <30 hrs/week, 30+ hrs/week
Contract-to-hire roles: (1706)

Total: 9,527 jobs found
```

---

## Navigation & Link Patterns

### Mega Menu Structure (from `/hire/`)

**10 Main Categories with subcategories:**

1. **Development & IT** (`/cat/dev-it/`)
   - Data Science & Analytics (8 items)
   - E-commerce Development (5 items)
   - Emerging Tech (8 items)
   - Game Development (6 items)
   - IT & Networking (8 items)
   - Mobile App Development (6 items)
   - Development (18 items)
   - Web Development & Design (18 items)
   - Other (14 items)

2. **AI Services** (`/cat/ai/`)
   - AI Writing (3 items)
   - AI Art (3 items)
   - AI Development (14 items)
   - AI & Data Services (2 items)
   - Other (14 items)

3. **Design & Creative** (`/cat/design-creative/`)
   - Animation (9 items)
   - Audio Production (7 items)
   - Fashion Design (5 items)
   - Graphic Design (17 items)
   - Illustration (7 items)
   - Interior Design (5 items)
   - Video Production (5 items)
   - Other (13 items)

4. **Sales & Marketing** (`/cat/sales-and-marketing/`)
5. **Admin & Customer Support** (`/cat/admin-customer-support/`)
6. **Writing & Translation** (in "More" dropdown)
7. **Finance & Accounting** (in "More" dropdown)
8. **Engineering & Architecture** (in "More" dropdown)
9. **Legal** (in "More" dropdown)
10. **HR & Training** (in "More" dropdown)

### Link Count from Scraped Data

| Page | Internal Links | External Links |
|------|----------------|----------------|
| `/hire/` | ~600+ | ~10 |
| `/cat/dev-it/` | ~200+ | ~5 |
| `/o/jobs/browse/` | ~400+ | ~5 |
| `/freelance-jobs/web-development/` | ~300+ | ~5 |

---

## Job Data Structure

### Job Card Fields (Extracted from Real Jobs)

From `/freelance-jobs/web-development/`:

```javascript
const jobData = {
  title: "Web Design and Development for E-commerce",
  url: "/freelance-jobs/apply/Web-Design-and-Development-for-commerce_~022011032211493165914/",

  // Job ID extracted from URL
  jobId: "022011032211493165914",  // 18-digit ID

  // Timing
  status: "New",
  postedTime: "8 hours ago",

  // Compensation
  paymentType: "Fixed-price",  // OR "Hourly"
  budget: "$1,000",            // Fixed
  hourlyRate: null,            // OR "$30.00 - $100.00"

  // Requirements
  experienceLevel: "Intermediate",  // Entry/Intermediate/Expert
  duration: null,                    // For fixed
  estimatedTime: null,               // "1 to 3 months"
  hoursPerWeek: null,                // "Less than 30 hrs/week"

  // Description
  description: "Seeking a talented web designer/developer to create a website for TOGGLE...",

  // Skills
  skills: ["Web Developer", "Shopify", "HTML5", "PHP", "Web Development"]
};
```

### Job ID Pattern Analysis

```
Job ID Format: ~XXXXXXXXXXXXXXXXXXXX (18 digits)
Examples found:
  ~022011032211493165914  (Web Design)
  ~022011033450563307758  (WordPress)
  ~022011034857639053550  (Update Text)
  ~022011035777275671111  (Website Creation)
  ~022011036660946977621  (Wix Developer)
```

### Real Job Examples (from scraped data)

| Title | Type | Budget/Rate | Level | Skills |
|-------|------|-------------|-------|--------|
| Web Design and Development for E-commerce | Fixed | $1,000 | Intermediate | Shopify, HTML5, PHP |
| WordPress Developer Needed | Hourly | — | Intermediate | SEO Performance |
| Update Text Fields on Website | Fixed | $100 | Intermediate | PHP, HTML |
| Wix Web Developer for iFrame | Hourly | — | Intermediate | CSS, JS, HTML |
| WordPress Telehealth Website | Fixed | $400 | Expert | PHP |
| Full-Stack Developer for NFT dApps | Hourly | — | Intermediate | Solidity, JS |
| Senior WordPress Developer for Booking | Fixed | $1,000 | Expert | PHP |
| WordPress & Elementor Design | Fixed | $40 | Entry | JS, PHP, Elementor |

---

## CDN & Asset Infrastructure

### Image CDN (Cloudinary)

**Primary Domains:**
```
res.cloudinary.com/upwork-cloud-acquisition-prod/
cdn.prod.website-files.com/
```

**URL Patterns:**
```
# Avatar images
res.cloudinary.com/upwork-cloud-acquisition-prod/image/upload/c_fit/arges/avatars/{name}.jpg

# Logo images
res.cloudinary.com/upwork-cloud-acquisition-prod/image/upload/c_fit/general/logobar/colored/{company}.svg

# Category images
cdn.prod.website-files.com/{project_id}/{filename}.webp
cdn.prod.website-files.com/{project_id}/{filename}.jpeg
```

### Asset Examples Found

**Avatars:**
- Andrea R. (Lead Software Engineer)
- Jane S. (AI Engineer)
- Martin G. (Data Scientist)
- Vanessa J. (Virtual Assistant)
- Fernando B. (Sr. Product Manager)
- Konstantin V. (Sr. Web Designer)

**Trust Logos:**
- Microsoft, Airbnb, GE, Automattic, Bissell, COTY, Glassdoor, Pladis, Unilever, Cloudflare

---

## Filter & Search Parameters

### URL Query Parameters (from `/ab/jobs/search/`)

```
# Category
?category2_uid=XXXXX

# Experience Level
?contractor_tier=1          # Entry
?contractor_tier=2          # Intermediate
?contractor_tier=3          # Expert
?contractor_tier=1,2,3      # Multiple

# Job Type
?t=0                        # Fixed-price
?t=1                        # Hourly
?t=0,1                      # Both

# Budget (Fixed)
?amount=100-500             # $100-$500
?amount=500-1000            # $500-$1K
?amount=1000-5000           # $1K-$5K
?amount=5000-               # $5K+

# Client History
?client_hires=0             # No hires
?client_hires=1-9           # 1-9 hires
?client_hires=10-           # 10+ hires

# Project Length
?duration_v3=week           # Less than 1 month
?duration_v3=month          # 1-3 months
?duration_v3=semester       # 3-6 months
?duration_v3=ongoing        # 6+ months

# Hours Per Week
?workload=as_needed         # Less than 30
?workload=part_time         # 30+
?workload=full_time         # 40+

# Location
?location=United%20States

# Sort
?sort=recency               # Newest first
?sort=relevance             # Most relevant

# Search
?q=python                   # Keyword search
```

### Filter Counts (from live scrape)

```javascript
const filterCounts = {
  experienceLevel: {
    entry: 756,
    intermediate: 5494,
    expert: 3275
  },
  jobType: {
    hourly: 6917,
    fixed: 2610
  },
  fixedBudget: {
    lessThan100: 552,
    "100to500": 945,
    "500to1K": 404,
    "1Kto5K": 546,
    "5KPlus": 163
  },
  clientHistory: {
    noHires: 2997,
    "1to9": 2824,
    "10Plus": 3702
  },
  projectLength: {
    lessThanMonth: 4422,
    "1to3months": 5243,
    "3to6months": 3401,
    "6PlusMonths": 4291
  },
  hoursPerWeek: {
    lessThan30: 2901,
    moreThan30: 4118
  },
  contractToHire: 1706,
  totalJobs: 9527
};
```

---

## Taxonomy & Category System

### Complete Skill/Job Categories (from `/o/jobs/browse/`)

**Alphabetical Index Structure:**

```
0-9: 7 entries
  - 3D Visualizations, 2D Game Art, 3D Modeler, 3D Printing,
    3D Rendering, 3D Design, 3D CAD Design

A: 55+ entries
  - Amazon FBA, Administrative Assistant, Adobe After Effects,
    Android App Developer, AWS Developer, AI Engineer, etc.

B: 17 entries
  - Book Designer, Branding, Blockchain Developer, Bookkeeper, etc.

C: 44 entries
  - Chat Support, Children's Book Illustrator, CSS Developer,
    Chrome Extension Developer, CRM Specialist, etc.

... (continues through Z)
```

### URL Pattern for Job Categories

```
/freelance-jobs/{category-slug}/

Examples:
/freelance-jobs/python/
/freelance-jobs/web-scraping/
/freelance-jobs/chrome-extension/
/freelance-jobs/blockchain/
/freelance-jobs/chatgpt/
/freelance-jobs/machine-learning/
```

---

## Scraping Strategy Recommendations

### 1. Accessible Public Data (No Auth Required)

**Best Sources:**

| Source | Data Available | Rate Limit Risk |
|--------|----------------|-----------------|
| `/o/jobs/browse/` | Full category taxonomy | Low |
| `/hire/*` | All freelancer categories | Low |
| `/cat/*` | Category stats & featured talent | Low |
| `/freelance-jobs/{skill}/` | Sample job listings (10 per page) | Medium |
| `/ab/jobs/search/` | Filter UI + limited listings | Medium |

### 2. Protected Data (Requires Auth/Extension)

| Source | Data Available | Access Method |
|--------|----------------|---------------|
| `/nx/search/jobs/` | Full job search | Browser extension |
| `/nx/search/talent/` | Freelancer search | Browser extension |
| `/jobs/~{id}` | Full job details | Browser extension |
| `/freelancers/~{id}` | Full profiles | Browser extension |

### 3. Data Extraction Priority

**From Public Pages:**
```
1. Category/Skill Taxonomy     → /o/jobs/browse/
2. Freelancer Categories       → /hire/*
3. Category Statistics         → /cat/*
4. Sample Job Listings         → /freelance-jobs/*/
5. Filter Options/Counts       → /ab/jobs/search/
```

**From Authenticated Sessions (Extension):**
```
1. Job Search Results          → /nx/search/jobs/
2. Full Job Details            → /jobs/~{id}
3. Client Information          → Within job pages
4. Freelancer Profiles         → /freelancers/~{id}
5. User Account Data           → /nx/settings/
```

### 4. Rate Limiting Recommendations

```javascript
const rateLimits = {
  // Public pages (Firecrawl)
  publicPages: {
    requestsPerMinute: 10,
    delayBetweenRequests: 6000,  // 6 seconds
    maxPagesPerSession: 50
  },

  // Extension scraping (authenticated)
  extensionScraping: {
    requestsPerMinute: 15,
    delayBetweenPages: 3000,     // 3 seconds
    maxPagesPerSession: 100
  }
};
```

### 5. Anti-Detection Best Practices

1. **Rotate User Agents** - Cloudflare tracks browser fingerprints
2. **Respect robots.txt** - `/robots.txt` may have guidelines
3. **Use delays** - Random delays between 2-5 seconds
4. **Session management** - Don't scrape for extended periods
5. **Browser extension** - Runs in authenticated context, avoids CAPTCHA

### 6. Data Storage Schema

```sql
-- Jobs table
CREATE TABLE jobs (
  id VARCHAR(20) PRIMARY KEY,       -- ~022011032211493165914
  title VARCHAR(500),
  url TEXT,
  payment_type ENUM('hourly', 'fixed'),
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  experience_level ENUM('entry', 'intermediate', 'expert'),
  duration VARCHAR(50),
  hours_per_week VARCHAR(50),
  description TEXT,
  posted_at TIMESTAMP,
  scraped_at TIMESTAMP,
  client_id VARCHAR(50),
  category VARCHAR(100)
);

-- Skills table
CREATE TABLE job_skills (
  job_id VARCHAR(20),
  skill VARCHAR(100),
  PRIMARY KEY (job_id, skill)
);

-- Categories table
CREATE TABLE categories (
  slug VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200),
  parent_slug VARCHAR(100),
  job_count INT
);
```

---

## Appendix: Raw Markdown Structure Samples

### Job Card HTML → Markdown Conversion

**Original Structure (inferred from markdown):**
```html
<article class="job-tile">
  <h2><a href="/freelance-jobs/apply/...">Job Title</a></h2>
  <span class="status">New</span>
  <span class="payment-type">Fixed-price</span>
  <span class="posted-time">8 hours ago</span>
  <span class="budget">$1,000</span>
  <span class="experience">Intermediate</span>
  <p class="description">Truncated description...</p>
  <div class="skills">
    <span>Skill1</span>
    <span>Skill2</span>
  </div>
</article>
```

**Firecrawl Markdown Output:**
```markdown
## [Job Title](apply_link)
New
Fixed-price ‐ Posted 8 hours ago
**$1,000**
Fixed-price
**Intermediate**
Experience level
Truncated description...
Skill1Skill2Skill3
[See more](apply_link)
```

### Navigation Menu Structure

**Megamenu Pattern:**
```markdown
- [Category Name](category_url)
  - Subcategory Name
  - [Link Text](link_url)
  - [Link Text](link_url)
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total pages scraped | 11 |
| Successful scrapes | 6 |
| Blocked by Cloudflare | 5 |
| Total content size | ~265KB |
| Unique job IDs found | 10+ |
| Category links extracted | 600+ |
| Skill categories identified | 400+ |

---

*Analysis completed: January 2026*
*Tool: Firecrawl Parallel Scraper*
