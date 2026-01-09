import { io, Socket } from "socket.io-client";

// =============================================================================
// CONFIGURATION
// =============================================================================

const SOCKET_URL = process.env.PLASMO_PUBLIC_API_URL || "http://127.0.0.1:3000";
const KEEPALIVE_ALARM = "keepAlive";
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds to stay under 30s service worker limit
const MAX_SCRAPE_ITERATIONS = 15;
const MAX_JOBS_PER_SCRAPE = 50;

console.log("[AgencyOS] Initializing socket connection to:", SOCKET_URL);

// =============================================================================
// SOCKET CONNECTION
// =============================================================================

const socket: Socket = io(SOCKET_URL, {
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  transports: ["websocket"],
  autoConnect: true,
});

let lastError = "";
let isConnecting = false;

socket.on("connect", () => {
  console.log("[AgencyOS] Socket connected:", socket.id);
  lastError = "";
  isConnecting = false;
  socket.emit("EXTENSION_CONNECT", { extensionId: chrome.runtime.id });

  // Set up keepalive alarm
  setupKeepalive();
});

socket.on("connect_error", (err) => {
  console.error("[AgencyOS] Socket connection error:", err.message);
  lastError = err.message;
  isConnecting = false;
});

socket.on("disconnect", (reason) => {
  console.log("[AgencyOS] Socket disconnected:", reason);
  lastError = `Disconnected: ${reason}`;
});

socket.on("STATUS_UPDATE", (data) => {
  console.log("[AgencyOS] Status update:", data);
});

// =============================================================================
// KEEPALIVE MECHANISM (Critical for Service Worker)
// =============================================================================

function setupKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
  });
  console.log("[AgencyOS] Keepalive alarm set");
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    if (socket.connected) {
      socket.emit("PING", { from: "Extension", time: Date.now() });
    } else if (!isConnecting) {
      console.log("[AgencyOS] Keepalive: reconnecting socket...");
      isConnecting = true;
      socket.connect();
    }
  }
});

// =============================================================================
// SCRAPE COMMAND HANDLER
// =============================================================================

socket.on("CMD_EXECUTE", async (data) => {
  console.log("[AgencyOS] Received command:", data);

  if (data.action === "SCRAPE" && data.targetUrl) {
    await executeScrape(data.platform, data.targetUrl);
  }
});

async function executeScrape(platform: string, targetUrl: string) {
  try {
    // Emit progress: starting
    emitProgress(0, "Fetching selectors...");

    // Fetch selectors from server
    const selectorsRes = await fetch(
      `${SOCKET_URL}/api/selectors?platform=${platform}`
    );
    const selectors = await selectorsRes.json();

    if (!selectors || selectors.length === 0) {
      console.error("[AgencyOS] No selectors found for platform:", platform);
      socket.emit("TASK_UPDATE", {
        status: "ERROR",
        error: "No selectors configured for " + platform,
      });
      return;
    }

    const selectorConfig = JSON.parse(selectors[0].selectors);
    console.log("[AgencyOS] Using selectors:", selectorConfig);

    emitProgress(0, "Opening page...");

    // Open target URL in new tab
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    const tabId = tab.id!;

    // Wait for initial page load
    await humanDelay(3500, 4500);
    emitProgress(0, "Page loaded, starting scrape...");

    // Scroll-until-exhausted loop with progress reporting
    let lastJobCount = 0;
    let noNewJobsIterations = 0;
    let allJobs: ScrapedJob[] = [];

    for (let i = 0; i < MAX_SCRAPE_ITERATIONS; i++) {
      emitProgress(allJobs.length, `Scroll ${i + 1}/${MAX_SCRAPE_ITERATIONS}...`);

      // Scrape current jobs with retry
      let currentJobs: ScrapedJob[] = [];
      for (let retry = 0; retry < 2; retry++) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: scrapeJobsFromPage,
            args: [selectorConfig],
          });
          currentJobs = results[0]?.result || [];
          break;
        } catch (err) {
          console.warn(`[AgencyOS] Scrape attempt ${retry + 1} failed:`, err);
          if (retry === 1) throw err;
          await humanDelay(1000, 2000);
        }
      }

      console.log(`[AgencyOS] Found ${currentJobs.length} jobs on page`);

      // Merge new jobs (deduplicate by URL)
      const existingUrls = new Set(allJobs.map((j) => j.url));
      for (const job of currentJobs) {
        if (job.url && !existingUrls.has(job.url)) {
          allJobs.push(job);
          existingUrls.add(job.url);
        }
      }

      emitProgress(allJobs.length, `Found ${allJobs.length} unique jobs`);

      // Check if we got new jobs
      if (allJobs.length === lastJobCount) {
        noNewJobsIterations++;
        console.log(`[AgencyOS] No new jobs (attempt ${noNewJobsIterations}/3)`);
        if (noNewJobsIterations >= 3) {
          console.log("[AgencyOS] Stopping: no new jobs after 3 scrolls");
          break;
        }
      } else {
        noNewJobsIterations = 0;
        lastJobCount = allJobs.length;
      }

      // Safety limit
      if (allJobs.length >= MAX_JOBS_PER_SCRAPE) {
        console.log("[AgencyOS] Reached max job limit");
        break;
      }

      // Scroll down
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.scrollBy(0, window.innerHeight * 2),
      });

      // Human-like wait for content
      await humanDelay(2000, 3500);
    }

    console.log(`[AgencyOS] Total unique jobs scraped: ${allJobs.length}`);
    emitProgress(allJobs.length, "Sending jobs to server...");

    // Send each job to server
    for (let i = 0; i < allJobs.length; i++) {
      const job = allJobs[i];
      socket.emit("DATA_INGEST", {
        platform,
        title: job.title,
        description: job.description,
        url: job.url,
        budget: job.budget,
      });

      // Update progress every 5 jobs
      if (i % 5 === 0) {
        emitProgress(allJobs.length, `Sent ${i + 1}/${allJobs.length} jobs`);
      }

      // Small delay between emits
      await humanDelay(30, 80);
    }

    // Close the tab
    await chrome.tabs.remove(tabId);

    // Emit completion
    socket.emit("TASK_UPDATE", {
      status: "COMPLETED",
      scraped: allJobs.length,
      message: `Scraped ${allJobs.length} jobs from ${platform}`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[AgencyOS] Scrape failed:", errorMessage);
    socket.emit("TASK_UPDATE", {
      status: "ERROR",
      error: errorMessage,
    });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ScrapedJob {
  title: string;
  description: string;
  url: string;
  budget?: string;
}

function emitProgress(current: number, status: string) {
  socket.emit("SCRAPE_PROGRESS", { current, status });
}

const humanDelay = (min = 1000, max = 3000): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(resolve, min + Math.random() * (max - min))
  );

// Content script function (injected into page)
function scrapeJobsFromPage(selectors: Record<string, string>): ScrapedJob[] {
  console.log("[AgencyOS Scraper] Running on:", window.location.href);

  const jobs: ScrapedJob[] = [];

  // Fallback selector chain for Upwork
  const cardSelectors = [
    'section.up-card-section[data-test="JobTile"]',
    '[data-test="job-tile-list"] > *',
    "article.job-tile",
    '[data-ev-label="job_tile_title"]',
    'div[class*="job-tile"]',
    ".air3-card-section",
    // Generic fallbacks
    '[class*="job-card"]',
    '[class*="JobCard"]',
  ];

  let cards: NodeListOf<Element> | null = null;

  for (const selector of cardSelectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) {
      console.log(`[AgencyOS Scraper] Found ${found.length} cards with: ${selector}`);
      cards = found;
      break;
    }
  }

  if (!cards || cards.length === 0) {
    // Try finding container and get children
    const containerSelectors = [
      '[data-test="job-tile-list"]',
      ".jobs-list",
      '[class*="job-list"]',
      '[class*="JobList"]',
    ];

    for (const containerSel of containerSelectors) {
      const container = document.querySelector(containerSel);
      if (container) {
        cards = container.querySelectorAll(":scope > *");
        console.log(`[AgencyOS Scraper] Found ${cards.length} children in container`);
        break;
      }
    }
  }

  if (!cards || cards.length === 0) {
    console.log("[AgencyOS Scraper] No job cards found");
    return jobs;
  }

  cards.forEach((card, i) => {
    if (i >= 20) return; // Limit per scroll

    // Find job link
    const links = card.querySelectorAll('a[href*="/jobs/"], a[href*="/job/"]');
    if (links.length === 0) return;

    const jobLink = links[0] as HTMLAnchorElement;
    const title =
      jobLink.textContent?.trim() ||
      card.querySelector("h4, h3, h2")?.textContent?.trim() ||
      "Unknown Job";

    // Get description
    const descSelectors = [
      '[class*="description"]',
      '[data-test="job-description"]',
      "p",
      'span[class*="text-body"]',
    ];

    let description = "";
    for (const descSel of descSelectors) {
      const descEl = card.querySelector(descSel);
      if (descEl?.textContent) {
        description = descEl.textContent.trim().slice(0, 1000);
        break;
      }
    }

    // Get budget if available
    let budget = "";
    const budgetSelectors = [
      '[data-test="budget"]',
      '[class*="budget"]',
      '[class*="Budget"]',
      '[data-test="job-type-budget"]',
    ];

    for (const budgetSel of budgetSelectors) {
      const budgetEl = card.querySelector(budgetSel);
      if (budgetEl?.textContent) {
        budget = budgetEl.textContent.trim();
        break;
      }
    }

    jobs.push({
      title,
      description,
      url: jobLink.href,
      budget,
    });
  });

  console.log("[AgencyOS Scraper] Scraped jobs:", jobs.length);
  return jobs;
}

// =============================================================================
// MESSAGE HANDLERS (Popup Communication)
// =============================================================================

const waitForConnection = (timeout = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (socket.connected) {
      resolve(true);
      return;
    }

    console.log("[AgencyOS] Waiting for socket connection...");
    if (!isConnecting) {
      isConnecting = true;
      socket.connect();
    }

    let resolved = false;

    const onConnect = () => {
      if (!resolved) {
        resolved = true;
        socket.off("connect", onConnect);
        resolve(true);
      }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.off("connect", onConnect);
        resolve(false);
      }
    }, timeout);

    socket.on("connect", onConnect);
  });
};

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (req.type) {
      case "GET_STATUS":
        sendResponse({
          status: socket.connected ? "CONNECTED" : "DISCONNECTED",
          error: lastError,
          socketId: socket.id,
        });
        break;

      case "PING":
        const connected = await waitForConnection();
        if (connected) {
          socket.emit("PING", { from: "Extension", time: Date.now() });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: lastError || "Connection timeout" });
        }
        break;

      case "SIMULATE_SCRAPE":
        const isConnected = await waitForConnection();
        if (isConnected) {
          const mockJob = {
            platform: "LINKEDIN",
            title: "Software Engineer - AI Agents (Test Job)",
            description: "This is a test job from the extension popup.",
            url: "https://linkedin.com/jobs/view/test-" + Date.now(),
          };
          socket.emit("DATA_INGEST", mockJob);
          sendResponse({ success: true, job: mockJob });
        } else {
          sendResponse({ success: false, error: lastError || "Connection timeout" });
        }
        break;

      case "FORCE_RECONNECT":
        socket.disconnect();
        await humanDelay(500, 1000);
        socket.connect();
        sendResponse({ success: true, message: "Reconnection initiated" });
        break;

      default:
        sendResponse({ error: "Unknown message type" });
    }
  };

  handleAsync();
  return true; // Keep channel open for async response
});

// Initialize keepalive on startup
setupKeepalive();

export default socket;
