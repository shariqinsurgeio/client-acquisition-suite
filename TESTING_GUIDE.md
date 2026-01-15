# Testing Guide - Grandmaster Edition

Follow this guide to test all features we've built. Record your feedback for each section.

---

## Prerequisites

### 1. Start the Development Servers

Open **Terminal 1** (Web App):
```bash
cd /Users/shariqqkhann/client-acquisition-suite
npm run dev:web
```
Wait for: `Server running on http://localhost:3000`

Open **Terminal 2** (Extension):
```bash
cd /Users/shariqqkhann/client-acquisition-suite
npm run dev:ext
```
Wait for: Build complete message

### 2. Load the Extension in Chrome

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select: `apps/extension/build/chrome-mv3-dev/`
5. Pin the extension to toolbar for easy access

### 3. Environment Setup (for AI features)

Create/update `apps/web/.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

## Test 1: Web Dashboard (V2 Shell)

### Steps
1. Open http://localhost:3000
2. You should be **redirected to /v2** automatically

### Verify
- [ ] Home redirects to /v2
- [ ] Grandmaster shell loads with dark theme
- [ ] Navigation shows: Hunt, Pipeline, Cortex, Settings
- [ ] Extension status indicator visible (top right)

### Your Feedback
```
Navigation:
UI/Design:
Performance:
Issues found:
```

---

## Test 2: Extension Popup

### Steps
1. Click the extension icon in Chrome toolbar
2. Observe the popup UI

### Verify
- [ ] "Grandmaster Edition" branding shows
- [ ] Online/Offline status indicator works
- [ ] 4 stats cards visible (Connects, Active Proposals, Scraped Today, Last Sync)
- [ ] "Scrape This Page" button visible
- [ ] "Sync Profile" and "Test Send" buttons visible
- [ ] "Open Dashboard" link in footer

### Test Actions
1. Click "Test Send" → Should show success message
2. Go to Dashboard → Check if test job appears in Hunt feed

### Your Feedback
```
Popup design:
Stats display:
Button functionality:
Issues found:
```

---

## Test 3: Extension ↔ Dashboard Connection

### Steps
1. With extension loaded, go to http://localhost:3000/v2
2. Sign in (if prompted)
3. Check extension popup status

### Verify
- [ ] Extension shows "Online" status
- [ ] Dashboard shows extension connected (in header)
- [ ] Test Send from extension appears in Hunt feed

### Your Feedback
```
Connection reliability:
Status sync:
Issues found:
```

---

## Test 4: Job Scraping (on Upwork)

### Steps
1. Log into your Upwork account
2. Navigate to job search: https://www.upwork.com/nx/find-work/
3. Click extension popup
4. Click "Scrape This Page"

### Verify
- [ ] "Scraping..." loading state shows
- [ ] Success message with job count appears
- [ ] "Scraped Today" counter increments
- [ ] Jobs appear in Dashboard Hunt feed

### Check Job Data Quality
Go to Dashboard → Hunt feed and verify:
- [ ] Job titles display correctly
- [ ] Fit scores calculated (0-100)
- [ ] Client location shows
- [ ] Connects cost shows
- [ ] "Has Link" badge for jobs with external URLs
- [ ] "Verified" badge for payment-verified clients
- [ ] Posted time shows

### Your Feedback
```
Scraping speed:
Data accuracy:
Missing fields:
UI display issues:
```

---

## Test 5: Hunt Page (Job Feed)

### Steps
1. Go to http://localhost:3000/v2 (Hunt page)
2. Interact with the job feed

### Verify
- [ ] Jobs load from database
- [ ] Sorting works (Best Fit, Newest, Lowest Connects)
- [ ] Refresh button reloads jobs
- [ ] Job cards show all Sherlock data:
  - Fit score badge
  - Connects cost
  - Client name (if found)
  - Client location
  - Avg rate, hire rate, total spent
  - Posted time
- [ ] Clicking a job shows details in Workbench

### Your Feedback
```
Job card design:
Sorting/filtering:
Data display:
Performance:
Issues found:
```

---

## Test 6: Pipeline Page

### Steps
1. Go to http://localhost:3000/v2/pipeline
2. Review the ROI Dashboard and Kanban board

### Verify ROI Dashboard
- [ ] 8 metrics display correctly:
  - Row 1: Connects Spent, Total Invested, Leads, Jobs Won
  - Row 2: Cost Per Lead, Response Rate, Win Rate, Proposals Sent
- [ ] Tooltips appear on hover
- [ ] "30-day view" badge shows
- [ ] Close button hides dashboard
- [ ] "Show ROI" button reveals it again

### Verify Kanban Board
- [ ] 4 columns: Drafts, Applied, Interviewing, Hired
- [ ] Jobs appear in correct columns based on status
- [ ] Job cards show fit score and connects
- [ ] Stale leads show warning (if any)
- [ ] Loading spinner shows during fetch

### Your Feedback
```
ROI metrics accuracy:
Kanban usability:
Visual design:
Missing features:
Issues found:
```

---

## Test 7: Settings Page

### Steps
1. Go to http://localhost:3000/v2/settings
2. Explore all tabs

### Verify Tabs
- [ ] Profile tab loads
- [ ] Extension tab shows connection status
- [ ] Selectors tab shows platform selectors
- [ ] Notifications tab loads
- [ ] Appearance tab loads

### Your Feedback
```
Settings organization:
Missing settings:
UI issues:
```

---

## Test 8: Cortex Page (Persona Builder)

### Steps
1. Go to http://localhost:3000/v2/cortex
2. Review the Persona Builder and Asset Vault

### Verify
- [ ] Persona cards display
- [ ] Can create/edit personas
- [ ] Asset vault accessible
- [ ] Rate Guard section visible

### Your Feedback
```
Persona management:
Asset vault:
Issues found:
```

---

## Test 9: Analytics API

### Steps
Run these curl commands in terminal:

```bash
# Summary endpoint
curl http://localhost:3000/api/analytics?type=summary

# Daily breakdown
curl http://localhost:3000/api/analytics?type=daily

# Funnel metrics
curl http://localhost:3000/api/analytics?type=funnel

# Pipeline stats
curl http://localhost:3000/api/analytics?type=pipeline
```

### Verify
- [ ] Summary returns connectsSpent, rates, costs
- [ ] Daily returns array of daily data
- [ ] Funnel returns stage progression
- [ ] Pipeline returns stage counts and stale leads

### Your Feedback
```
Data accuracy:
Missing metrics:
API performance:
```

---

## Test 10: AI Proposal Generation (requires ANTHROPIC_API_KEY)

### Steps
If you have an Anthropic API key configured:

```bash
# Test playbook recommendation
curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "recommend",
    "job": {
      "title": "Build a web scraper",
      "description": "Need someone to build a scraper for my website https://example.com",
      "hasExternalLinks": true
    }
  }'

# Test quality estimation
curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "quality",
    "proposal": "I am excited to apply for this position. I have extensive experience and am confident I can help."
  }'
```

### Verify
- [ ] Recommend returns playbook type (should be AUDIT_PITCH for job with link)
- [ ] Quality returns score with issues and suggestions

### Your Feedback
```
Playbook recommendations:
Quality scoring accuracy:
Issues found:
```

---

## Test 11: Real-Time Updates

### Steps
1. Open Dashboard in one browser tab
2. Open extension popup
3. Send a test job from extension
4. Watch the Dashboard

### Verify
- [ ] New job appears in Hunt feed without refresh
- [ ] No page reload needed

### Your Feedback
```
Real-time reliability:
Update speed:
Issues found:
```

---

## Overall Feedback

### What Works Well
```

```

### What Needs Improvement
```

```

### Critical Bugs Found
```

```

### Feature Requests
```

```

### Priority Fixes Needed
```
1.
2.
3.
```

---

## After Testing

Save this file with your feedback and share it with me. We'll use your feedback to:
1. Fix any bugs found
2. Enhance the UX based on your observations
3. Optimize performance issues
4. Add missing features you identified
5. Proceed to Phase 8 (Production Hardening) with real-world insights
