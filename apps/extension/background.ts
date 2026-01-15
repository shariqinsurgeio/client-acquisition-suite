import { io, Socket } from "socket.io-client";

// =============================================================================
// SERVICE WORKER CACHE BYPASS - Forces Chrome to use fresh code
// =============================================================================

// Injected at build time via: PLASMO_PUBLIC_BUILD_TIME=$(date +%s) plasmo build
// This is baked into the bundle - no manual updates needed, auto-changes every build
const BUILD_VERSION = `V3-${process.env.PLASMO_PUBLIC_BUILD_TIME || "dev"}`;
const BUILD_VERSION_KEY = "cas_build_version";

// Force immediate activation of new service worker (bypasses waiting)
// @ts-ignore - self.skipWaiting exists in service worker context
if (typeof self !== 'undefined' && 'skipWaiting' in self) {
  // @ts-ignore
  self.skipWaiting();
}

// Check if this is a new version and force reload if needed
(async () => {
  try {
    const stored = await chrome.storage.local.get([BUILD_VERSION_KEY]);
    const storedVersion = stored[BUILD_VERSION_KEY];

    if (storedVersion !== BUILD_VERSION) {
      console.log(`[CAS] New version detected: ${storedVersion} → ${BUILD_VERSION}`);
      await chrome.storage.local.set({ [BUILD_VERSION_KEY]: BUILD_VERSION });

      // If upgrading from old version, reload extension to ensure fresh state
      if (storedVersion) {
        console.log("[CAS] Reloading extension for clean state...");
        chrome.runtime.reload();
      }
    } else {
      console.log(`[CAS] Version ${BUILD_VERSION} already active`);
    }
  } catch (err) {
    console.warn("[CAS] Version check failed:", err);
  }
})();

// =============================================================================
// CONFIGURATION
// =============================================================================

const SOCKET_URL = process.env.PLASMO_PUBLIC_API_URL || "http://127.0.0.1:3000";
const KEEPALIVE_ALARM = "keepAlive";
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds to stay under 30s service worker limit
const MAX_SCRAPE_ITERATIONS = 15;
const MAX_JOBS_PER_SCRAPE = 50;
const AUTH_TOKEN_KEY = "cas_auth_token";

// Enrichment Configuration - Two-Phase Scraping
const ENRICH_NEW_JOBS = true;           // Enable detail page enrichment for new jobs
const ENRICH_BATCH_SIZE = 10;           // Max jobs to enrich per scrape operation
const ENRICH_DELAY_MIN = 3000;          // Min delay between enrichments (ms)
const ENRICH_DELAY_MAX = 5000;          // Max delay between enrichments (ms)
const ENRICH_PAGE_LOAD_DELAY = 6500;    // Wait for detail page to load (ms) - increased for Angular SPA rendering

// =============================================================================
// ANTI-DETECTION & ACCOUNT PROTECTION (Phase 0)
// =============================================================================

type ScrapingMode = "conservative" | "balanced" | "aggressive";

const SCRAPING_MODES = {
  conservative: {
    minBetweenJobs: 5000,
    maxBetweenJobs: 10000,
    maxJobsPerSession: 30,
    maxDetailVisitsPerDay: 15,
    minBetweenSources: 20000,
    maxBetweenSources: 35000,
  },
  balanced: {
    minBetweenJobs: 3000,
    maxBetweenJobs: 6000,
    maxJobsPerSession: 50,
    maxDetailVisitsPerDay: 30,
    minBetweenSources: 15000,
    maxBetweenSources: 25000,
  },
  aggressive: {
    minBetweenJobs: 2000,
    maxBetweenJobs: 4000,
    maxJobsPerSession: 100,
    maxDetailVisitsPerDay: 50,
    minBetweenSources: 8000,
    maxBetweenSources: 15000,
  },
};

// Default to conservative mode for safety
let currentScrapingMode: ScrapingMode = "conservative";

// Rate limit state
const RATE_LIMITS = {
  // Per-action delays (milliseconds)
  minPageLoadDelay: 4000,
  maxPageLoadDelay: 6000,
  // Session limits
  maxJobsPerSession: 50,
  maxPagesPerSource: 3,
  sessionCooldownMs: 300000,  // 5 min cooldown between full scrapes
  // Daily limits (account protection)
  maxJobsPerDay: 200,
  maxDetailVisitsPerDay: 30,
};

// Cooldown state
let cooldownUntil: number | null = null;
let lastScrapeSessionEnd: number | null = null;

// Daily counters (reset on new day)
let dailyCounters = {
  date: new Date().toDateString(),
  jobsScraped: 0,
  detailPagesVisited: 0,
  sourcesScraped: 0,
  blocksDetected: 0,
};

// Detection signals interface
interface DetectionSignals {
  cloudflareChallenge: boolean;
  captchaPresent: boolean;
  rateLimitResponse: boolean;
  accountWarning: boolean;
  unusualActivity: boolean;
}

// Reset daily counters if new day
function checkAndResetDailyCounters(): void {
  const today = new Date().toDateString();
  if (dailyCounters.date !== today) {
    console.log("[CAS Protection] New day, resetting daily counters");
    dailyCounters = {
      date: today,
      jobsScraped: 0,
      detailPagesVisited: 0,
      sourcesScraped: 0,
      blocksDetected: 0,
    };
  }
}

// Check if we're in cooldown mode
function isInCooldown(): boolean {
  if (cooldownUntil && Date.now() < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    console.log(`[CAS Protection] In cooldown mode, ${remaining}s remaining`);
    return true;
  }
  cooldownUntil = null;
  return false;
}

// Enter cooldown mode
async function enterCooldownMode(durationMs: number, reason: string): Promise<void> {
  cooldownUntil = Date.now() + durationMs;
  const durationMinutes = Math.ceil(durationMs / 60000);
  console.warn(`[CAS Protection] Entering cooldown mode for ${durationMinutes} minutes. Reason: ${reason}`);

  // Notify server
  socket?.emit("SCRAPE_BLOCKED", {
    signal: reason,
    timestamp: new Date().toISOString(),
    action: "COOLDOWN_STARTED",
    cooldownMinutes: durationMinutes,
  });

  // Store in chrome.storage for persistence across service worker restarts
  await chrome.storage.local.set({
    cas_cooldown_until: cooldownUntil,
    cas_cooldown_reason: reason,
  });

  dailyCounters.blocksDetected++;
}

// Check for session cooldown (between scrape sessions)
function shouldEnforceSessionCooldown(): boolean {
  if (lastScrapeSessionEnd) {
    const elapsed = Date.now() - lastScrapeSessionEnd;
    if (elapsed < RATE_LIMITS.sessionCooldownMs) {
      const remaining = Math.ceil((RATE_LIMITS.sessionCooldownMs - elapsed) / 1000);
      console.log(`[CAS Protection] Session cooldown active, ${remaining}s remaining`);
      return true;
    }
  }
  return false;
}

// Check page for detection signals before scraping
async function checkForBlocks(tabId: number): Promise<DetectionSignals> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const pageText = document.body?.innerText?.toLowerCase() || "";
        const pageHtml = document.documentElement?.innerHTML?.toLowerCase() || "";

        return {
          // Cloudflare challenge page
          cloudflareChallenge: pageText.includes("checking your browser") ||
                              pageText.includes("please wait") && pageText.includes("cloudflare") ||
                              pageHtml.includes("cf-browser-verification") ||
                              pageHtml.includes("cf_chl_opt"),

          // CAPTCHA challenges
          captchaPresent: !!document.querySelector('[class*="captcha"], #captcha, [id*="captcha"]') ||
                         pageText.includes("verify you are human") ||
                         pageText.includes("complete the security check"),

          // Rate limiting
          rateLimitResponse: pageText.includes("too many requests") ||
                            pageText.includes("rate limit") ||
                            pageText.includes("slow down") ||
                            document.title.toLowerCase().includes("error"),

          // Account warnings
          accountWarning: pageText.includes("account restricted") ||
                         pageText.includes("account suspended") ||
                         pageText.includes("unusual activity detected") ||
                         pageText.includes("security alert"),

          // Unusual activity
          unusualActivity: pageText.includes("verify your identity") ||
                          pageText.includes("confirm your email") ||
                          pageText.includes("something went wrong") && pageText.includes("try again"),
        };
      },
    });

    return result[0]?.result || {
      cloudflareChallenge: false,
      captchaPresent: false,
      rateLimitResponse: false,
      accountWarning: false,
      unusualActivity: false,
    };
  } catch (err) {
    console.warn("[CAS Protection] Failed to check for blocks:", err);
    // Return safe defaults - if we can't check, assume safe
    return {
      cloudflareChallenge: false,
      captchaPresent: false,
      rateLimitResponse: false,
      accountWarning: false,
      unusualActivity: false,
    };
  }
}

// Handle detection - stop scraping and enter cooldown
async function handleDetection(signal: keyof DetectionSignals, tabId: number): Promise<void> {
  console.error(`[CAS Protection] ⚠️ DETECTION SIGNAL: ${signal}`);

  // Immediately close the tab to stop any further activity
  try {
    await chrome.tabs.remove(tabId);
  } catch { /* Tab might already be closed */ }

  // Enter 30-minute cooldown
  await enterCooldownMode(30 * 60 * 1000, signal);

  // Emit detailed alert to server
  socket?.emit("SCRAPE_BLOCKED", {
    signal,
    timestamp: new Date().toISOString(),
    action: "STOPPED",
    dailyCounters,
  });
}

// Get current rate limits based on scraping mode
function getCurrentRateLimits() {
  const mode = SCRAPING_MODES[currentScrapingMode];
  return {
    ...RATE_LIMITS,
    minBetweenJobs: mode.minBetweenJobs,
    maxBetweenJobs: mode.maxBetweenJobs,
    maxJobsPerSession: mode.maxJobsPerSession,
    maxDetailVisitsPerDay: mode.maxDetailVisitsPerDay,
    minBetweenSources: mode.minBetweenSources,
    maxBetweenSources: mode.maxBetweenSources,
  };
}

// Check daily limits before scraping
function checkDailyLimits(): { allowed: boolean; reason?: string } {
  checkAndResetDailyCounters();

  const limits = getCurrentRateLimits();

  if (dailyCounters.jobsScraped >= RATE_LIMITS.maxJobsPerDay) {
    return { allowed: false, reason: `Daily job limit reached (${RATE_LIMITS.maxJobsPerDay})` };
  }

  if (dailyCounters.detailPagesVisited >= limits.maxDetailVisitsPerDay) {
    return { allowed: false, reason: `Daily detail page limit reached (${limits.maxDetailVisitsPerDay})` };
  }

  return { allowed: true };
}

// Restore cooldown state from storage on startup
async function restoreCooldownState(): Promise<void> {
  const stored = await chrome.storage.local.get(["cas_cooldown_until", "cas_cooldown_reason"]);
  if (stored.cas_cooldown_until && stored.cas_cooldown_until > Date.now()) {
    cooldownUntil = stored.cas_cooldown_until;
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    console.log(`[CAS Protection] Restored cooldown state, ${remaining}s remaining (reason: ${stored.cas_cooldown_reason})`);
  }
}

// Initialize protection state
restoreCooldownState();

console.log(`[CAS] Initializing extension... (${BUILD_VERSION})`);

// =============================================================================
// AUTH TOKEN MANAGEMENT
// =============================================================================

let currentAuthToken: string | null = null;

async function getStoredToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_TOKEN_KEY], (result) => {
      resolve(result[AUTH_TOKEN_KEY] || null);
    });
  });
}

async function storeToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, resolve);
  });
}

async function clearToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([AUTH_TOKEN_KEY], resolve);
  });
}

// Request fresh token from dashboard (via content script on localhost:3000)
async function requestFreshTokenFromDashboard(): Promise<void> {
  try {
    // Find a tab with the dashboard open
    const tabs = await chrome.tabs.query({ url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"] });
    if (tabs.length > 0 && tabs[0].id) {
      console.log("[CAS] Found dashboard tab, requesting fresh token...");
      // Send message to the content script (auth-bridge) in that tab
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "REQUEST_FRESH_TOKEN_FROM_DASHBOARD",
      });
    } else {
      console.log("[CAS] No dashboard tab found, user needs to open dashboard first");
      lastError = "Please open the Dashboard to authenticate";
    }
  } catch (err) {
    console.error("[CAS] Failed to request fresh token:", err);
  }
}

// =============================================================================
// SOCKET CONNECTION
// =============================================================================

let socket: Socket | null = null;
let lastError = "";
let isConnecting = false;

async function initializeSocket() {
  // Get stored token
  currentAuthToken = await getStoredToken();

  if (!currentAuthToken) {
    console.log("[CAS] No auth token found, waiting for dashboard authorization");
    return;
  }

  connectSocket(currentAuthToken);
}

function connectSocket(token: string) {
  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }

  console.log("[CAS] Connecting to:", SOCKET_URL);

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ["websocket"],
    autoConnect: true,
  });

  socket.on("connect", () => {
    console.log("[CAS] Socket connected:", socket!.id);
    lastError = "";
    isConnecting = false;
    socket!.emit("EXTENSION_CONNECT", { extensionId: chrome.runtime.id });

    // Set up keepalive alarm
    setupKeepalive();
  });

  socket.on("connect_error", async (err) => {
    console.error("[CAS] Socket connection error:", err.message);
    lastError = err.message;
    isConnecting = false;

    // If authentication error, request fresh token from dashboard
    if (err.message.includes("Authentication") || err.message.includes("token") || err.message.includes("Invalid")) {
      console.log("[CAS] Auth error, requesting fresh token from dashboard...");
      await clearToken();
      currentAuthToken = null;

      // Request fresh token from dashboard via content script
      requestFreshTokenFromDashboard();
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("[CAS] Socket disconnected:", reason);
    lastError = `Disconnected: ${reason}`;
  });

  socket.on("STATUS_UPDATE", (data) => {
    console.log("[CAS] Status update:", data);
  });

  // Re-attach command handlers
  attachSocketEventHandlers();
}

// =============================================================================
// EXTERNAL MESSAGE HANDLER (From Web Dashboard)
// =============================================================================

chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  console.log("[CAS] External message from:", sender.url, message);

  if (message.type === "AUTH_TOKEN") {
    const { token } = message;

    if (token) {
      console.log("[CAS] Received auth token from dashboard");
      await storeToken(token);
      currentAuthToken = token;

      // Connect or reconnect with new token
      connectSocket(token);

      sendResponse({ success: true, status: "Token stored and connected" });
    } else {
      sendResponse({ success: false, error: "No token provided" });
    }
    return true;
  }

  if (message.type === "LOGOUT") {
    console.log("[CAS] Received logout from dashboard");
    await clearToken();
    currentAuthToken = null;

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    sendResponse({ success: true, status: "Logged out" });
    return true;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      status: socket?.connected ? "CONNECTED" : "DISCONNECTED",
      authenticated: !!currentAuthToken,
      error: lastError,
      socketId: socket?.id,
    });
    return true;
  }

  sendResponse({ error: "Unknown message type" });
  return true;
});

// =============================================================================
// KEEPALIVE MECHANISM (Critical for Service Worker)
// =============================================================================

function setupKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
  });
  console.log("[CAS] Keepalive alarm set");
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    if (socket?.connected) {
      socket.emit("PING", { from: "Extension", time: Date.now() });
    } else if (!isConnecting && currentAuthToken) {
      console.log("[CAS] Keepalive: reconnecting socket...");
      isConnecting = true;
      if (socket) {
        socket.connect();
      } else {
        connectSocket(currentAuthToken);
      }
    }
  }
});

// =============================================================================
// SOCKET EVENT HANDLERS (attached after connection)
// =============================================================================

function attachSocketEventHandlers() {
  if (!socket) return;

  // Remove existing listeners to prevent duplicates
  socket.off("CMD_EXECUTE");

  socket.on("CMD_EXECUTE", async (data) => {
    console.log("[CAS] ========== CMD_EXECUTE RECEIVED ==========");
    console.log("[CAS] Command data:", JSON.stringify(data));

    if (data.action === "SCRAPE_ALL") {
      console.log("[CAS] Calling executeScrapeAll...");
      await executeScrapeAll(data.platform, data.searchKeywords);
      console.log("[CAS] executeScrapeAll completed");
    } else if (data.action === "ENRICH_JOBS" && data.jobUrls && data.jobUrls.length > 0) {
      console.log("[CAS] ========== ENRICH_JOBS ==========");
      console.log("[CAS] Received jobUrls:", JSON.stringify(data.jobUrls));
      console.log("[CAS] First URL:", data.jobUrls[0]);
      console.log("[CAS] First URL starts with http?:", data.jobUrls[0]?.startsWith("http"));
      console.log("[CAS] Calling executeEnrichJobs...");
      await executeEnrichJobs(data.platform, data.jobUrls);
      console.log("[CAS] executeEnrichJobs completed");
    } else if (data.action === "SCRAPE" && data.targetUrl) {
      console.log("[CAS] Calling executeScrape...");
      await executeScrape(data.platform, data.targetUrl);
      console.log("[CAS] executeScrape completed");
    } else if (data.action === "REFRESH_JOBS" && data.jobUrls && data.jobUrls.length > 0) {
      console.log(`[CAS] Refreshing ${data.jobUrls.length} jobs...`);
      await executeRefreshJobs(data.platform, data.jobUrls);
      console.log("[CAS] Job refresh completed");
    } else {
      console.log("[CAS] Command not recognized or missing required data");
    }
  });
}

// =============================================================================
// DISCOVERY SOURCE BUILDER
// =============================================================================

interface DiscoverySource {
  name: string;
  url: string;
  mode: string;
}

/**
 * Builds discovery sources based on user's search keywords.
 * 2 fixed sources + up to 4 keyword-based sources with different sort strategies.
 */
function buildDiscoverySources(keywords: string[]): DiscoverySource[] {
  const sources: DiscoverySource[] = [
    // Fixed sources (always included)
    {
      name: "Best Matches",
      url: "https://www.upwork.com/nx/find-work/best-matches",
      mode: "best-matches",
    },
    {
      name: "Most Recent",
      url: "https://www.upwork.com/nx/find-work/most-recent",
      mode: "most-recent",
    },
  ];

  // Sort strategies for keyword searches
  const sortStrategies = [
    { sort: "relevance%2Bdesc", label: "Relevance" },
    { sort: "recency", label: "Recency" },
    { sort: "client_total_charge%2Bdesc", label: "Client Spend" },
    { sort: "client_rating%2Bdesc", label: "Client Rating" },
  ];

  // Add dynamic keyword sources (up to 4)
  keywords.slice(0, 4).forEach((keyword, index) => {
    const strategy = sortStrategies[index];
    const encodedKeyword = encodeURIComponent(keyword.trim());
    sources.push({
      name: `Search: "${keyword}" (${strategy.label})`,
      url: `https://www.upwork.com/nx/search/jobs/?nbs=1&q=${encodedKeyword}&sort=${strategy.sort}`,
      mode: `search-${index + 1}`,
    });
  });

  return sources;
}

// =============================================================================
// MULTI-SOURCE SCRAPE HANDLER (SCRAPE_ALL) - Discovery Pipeline
// =============================================================================

/**
 * Scrapes multiple sources sequentially with appropriate delays between them.
 * Collects all jobs and emits DISCOVERY_COMPLETE for server-side processing.
 * Server will then queue qualifying jobs for enrichment.
 */
async function executeScrapeAll(platform: string, searchKeywords?: string[]) {
  console.log("[CAS] executeScrapeAll called:", { platform, searchKeywords });

  if (!socket) {
    console.error("[CAS] Cannot scrape: not connected");
    return;
  }

  // Check protection status first
  if (isInCooldown()) {
    const remaining = cooldownUntil ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
    emitProgress(0, `⚠️ In cooldown mode. ${remaining}s remaining. Multi-source scrape cancelled.`);
    socket?.emit("TASK_UPDATE", {
      status: "BLOCKED",
      error: `Cooldown active (${remaining}s remaining)`,
    });
    return;
  }

  const limitCheck = checkDailyLimits();
  if (!limitCheck.allowed) {
    emitProgress(0, `⚠️ ${limitCheck.reason}. Multi-source scrape cancelled.`);
    socket?.emit("TASK_UPDATE", {
      status: "BLOCKED",
      error: limitCheck.reason,
    });
    return;
  }

  // Build dynamic sources based on user's keywords
  const keywords = searchKeywords && searchKeywords.length > 0
    ? searchKeywords
    : ["AI", "generative AI", "AI automation", "n8n"]; // defaults

  const sources = buildDiscoverySources(keywords);
  const limits = getCurrentRateLimits();

  // Collect ALL discovered jobs (for DISCOVERY_COMPLETE)
  const allDiscoveredJobs: ScrapedJob[] = [];

  emitProgress(0, `🚀 Discovery: Scraping ${sources.length} sources with ${keywords.length} keywords...`);
  socket?.emit("SCRAPE_PROGRESS", {
    current: 0,
    status: `Starting discovery from ${sources.length} sources...`,
    stage: "discovering",
  });

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];

    // Check limits between each source
    if (isInCooldown()) {
      console.warn(`[CAS] Cooldown triggered. Stopping after ${i} sources.`);
      emitProgress(0, `⚠️ Cooldown triggered. Stopping after ${i} sources.`);
      break;
    }

    // Progress: 0-50% for discovery phase
    const progress = Math.round((i / sources.length) * 50);
    emitProgress(progress, `[${i + 1}/${sources.length}] Discovering: ${source.name}...`);
    socket?.emit("SCRAPE_PROGRESS", {
      current: progress,
      status: `Scraping ${source.name}...`,
      stage: "discovering",
      jobCount: allDiscoveredJobs.length,
    });

    try {
      // Scrape this source (collect jobs, don't emit individually)
      const jobs = await scrapeSourceForDiscovery(platform, source.url);

      if (jobs.length > 0) {
        console.log(`[CAS] ${source.name}: found ${jobs.length} jobs`);
        allDiscoveredJobs.push(...jobs);
        dailyCounters.jobsScraped += jobs.length;
      }

      dailyCounters.sourcesScraped++;

      // Delay between sources (appears more human)
      if (i < sources.length - 1) {
        const delayMs = limits.minBetweenSources + Math.random() * (limits.maxBetweenSources - limits.minBetweenSources);
        const delaySeconds = Math.ceil(delayMs / 1000);
        emitProgress(progress, `⏳ Waiting ${delaySeconds}s before next source...`);
        await humanDelay(limits.minBetweenSources, limits.maxBetweenSources);
      }
    } catch (err) {
      console.error(`[CAS] Error scraping ${source.name}:`, err);
      // Continue with next source
    }
  }

  // Deduplicate jobs by URL
  const uniqueJobs = deduplicateJobsByUrl(allDiscoveredJobs);
  console.log(`[CAS] Discovery complete: ${uniqueJobs.length} unique jobs from ${allDiscoveredJobs.length} total`);

  // Record session end
  lastScrapeSessionEnd = Date.now();

  emitProgress(50, `✅ Discovery complete: ${uniqueJobs.length} jobs found. Processing...`);
  socket?.emit("SCRAPE_PROGRESS", {
    current: 50,
    status: `Found ${uniqueJobs.length} jobs. Server processing...`,
    stage: "scoring",
    jobCount: uniqueJobs.length,
  });

  // Emit DISCOVERY_COMPLETE to server for scoring and enrichment queueing
  socket?.emit("DISCOVERY_COMPLETE", {
    jobs: uniqueJobs.map(job => ({
      url: job.url,
      title: job.title,
      description: job.description,
      platform: platform,
      clientName: job.clientName,
      clientLocation: job.clientLocation,
      clientCountry: job.clientCountry,
      clientTotalSpent: job.clientTotalSpent,
      clientAvgHourly: job.clientAvgHourly,
      clientHireRate: job.clientHireRate,
      clientPaymentVerified: job.clientPaymentVerified,
      clientReviewCount: job.clientReviewCount,
      connectsCost: job.connectsCost,
      postedAgo: job.postedAgo,
      hasExternalLinks: job.hasExternalLinks,
      skillsRequired: job.skillsRequired,
    })),
    sourceCount: sources.length,
  });

  console.log(`[CAS] DISCOVERY_COMPLETE emitted with ${uniqueJobs.length} jobs`);
}

/**
 * Scrapes a single source and returns jobs (doesn't emit DATA_INGEST).
 * Used by executeScrapeAll for the discovery pipeline.
 */
async function scrapeSourceForDiscovery(platform: string, sourceUrl: string): Promise<ScrapedJob[]> {
  console.log(`[CAS] Scraping source for discovery: ${sourceUrl}`);

  // Create or reuse tab
  const [existingTab] = await chrome.tabs.query({
    url: "*://www.upwork.com/*",
    active: false,
  });

  const tabId = existingTab?.id || (await chrome.tabs.create({ url: sourceUrl, active: false })).id;

  if (!tabId) {
    console.error("[CAS] Failed to get tab for scraping");
    return [];
  }

  // Navigate and wait
  if (!existingTab) {
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    await chrome.tabs.update(tabId, { url: sourceUrl });
    await new Promise(resolve => setTimeout(resolve, 4000));
  }

  // Fetch selectors
  let selectorConfig: Record<string, string> = {};
  if (currentAuthToken) {
    try {
      const selectorsRes = await fetch(
        `${SOCKET_URL}/api/selectors?platform=${platform}`,
        {
          headers: {
            "Authorization": `Bearer ${currentAuthToken}`,
          },
        }
      );
      if (selectorsRes.ok) {
        const selectors = await selectorsRes.json();
        if (selectors && selectors.length > 0) {
          selectorConfig = JSON.parse(selectors[0].selectors);
        }
      }
    } catch (err) {
      console.warn("[CAS] Failed to fetch selectors:", err);
    }
  }

  // Execute scraping script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeJobsFromPage,
    args: [selectorConfig],
  });

  const scrapeResult = results[0]?.result as ScrapeResult | undefined;

  if (!scrapeResult || !scrapeResult.jobs || scrapeResult.jobs.length === 0) {
    console.log(`[CAS] No jobs found at ${sourceUrl}`);
    return [];
  }

  console.log(`[CAS] Scraped ${scrapeResult.jobs.length} jobs from ${sourceUrl}`);
  return scrapeResult.jobs;
}

/**
 * Deduplicate jobs by URL, keeping the most complete version.
 */
function deduplicateJobsByUrl(jobs: ScrapedJob[]): ScrapedJob[] {
  const uniqueMap = new Map<string, ScrapedJob>();

  for (const job of jobs) {
    if (!job.url) continue;

    const existing = uniqueMap.get(job.url);
    if (!existing) {
      uniqueMap.set(job.url, job);
    } else {
      // Keep the one with more complete data (longer description)
      if ((job.description?.length || 0) > (existing.description?.length || 0)) {
        uniqueMap.set(job.url, job);
      }
    }
  }

  return Array.from(uniqueMap.values());
}

// =============================================================================
// ENRICHMENT HANDLER (ENRICH_JOBS)
// =============================================================================

/**
 * Enriches a batch of jobs by visiting their detail pages.
 * Called by server after discovery to get full descriptions for qualifying jobs.
 */
async function executeEnrichJobs(platform: string, jobUrls: string[]) {
  console.log(`[CAS] executeEnrichJobs called: ${jobUrls.length} jobs to enrich`);

  if (!socket) {
    console.error("[CAS] Cannot enrich: not connected");
    return;
  }

  // Check protection status
  if (isInCooldown()) {
    const remaining = cooldownUntil ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
    socket?.emit("TASK_UPDATE", {
      status: "BLOCKED",
      error: `Cooldown active (${remaining}s remaining)`,
    });
    return;
  }

  const limits = getCurrentRateLimits();
  const enrichedJobs: Array<{
    url: string;
    fullDescription: string;
    skillsRequired?: string[];
    hasExternalLinks?: boolean;
    jobType?: string;
    experienceLevel?: string;
    projectLength?: string;
  }> = [];

  emitProgress(50, `🔍 Enriching ${jobUrls.length} qualifying jobs...`);
  socket?.emit("SCRAPE_PROGRESS", {
    current: 50,
    status: `Starting enrichment of ${jobUrls.length} jobs...`,
    stage: "enriching",
    enrichCount: jobUrls.length,
  });

  for (let i = 0; i < jobUrls.length; i++) {
    const url = jobUrls[i];

    console.log(`[CAS] Processing job URL ${i + 1}/${jobUrls.length}:`, url);

    // Validate URL - must be a full URL starting with http(s)
    if (!url || !url.startsWith("http")) {
      console.error(`[CAS] Invalid URL (not a full URL): ${url}`);
      continue;
    }

    // Check daily limit for detail pages
    if (dailyCounters.detailPagesVisited >= RATE_LIMITS.maxDetailVisitsPerDay) {
      console.warn("[CAS] Daily detail page limit reached, stopping enrichment");
      break;
    }

    // Check cooldown
    if (isInCooldown()) {
      console.warn("[CAS] Cooldown triggered during enrichment, stopping");
      break;
    }

    // Progress: 50-100% for enrichment phase
    const progress = 50 + Math.round((i / jobUrls.length) * 50);
    const shortTitle = url.split("/").pop()?.substring(0, 30) || "job";
    emitProgress(progress, `[${i + 1}/${jobUrls.length}] Enriching: ${shortTitle}...`);
    socket?.emit("SCRAPE_PROGRESS", {
      current: progress,
      status: `Enriching job ${i + 1}/${jobUrls.length}...`,
      stage: "enriching",
      enrichCount: jobUrls.length - i,
    });

    let tabId: number | undefined;
    try {
      // Open the job detail page in a new tab
      console.log("[CAS] Opening tab for:", url);
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id!;
      console.log("[CAS] Tab created with ID:", tabId);

      // Wait for tab to finish loading
      await new Promise<void>((resolve) => {
        const checkTab = async () => {
          try {
            const tabInfo = await chrome.tabs.get(tabId!);
            console.log("[CAS] Tab status:", tabInfo.status);
            if (tabInfo.status === "complete") {
              resolve();
            } else {
              setTimeout(checkTab, 500);
            }
          } catch {
            resolve(); // Tab might be closed
          }
        };
        // Start checking after initial delay
        setTimeout(checkTab, 2000);
        // Timeout after 15 seconds
        setTimeout(resolve, 15000);
      });

      // Additional delay for Angular SPA to render content
      console.log("[CAS] Tab loaded, waiting for SPA render...");
      await humanDelay(3000, 4000);

      // Execute the scraper in the page context
      console.log("[CAS] Executing scraper script...");
      let results: chrome.scripting.InjectionResult<JobDetailResult | null>[] | null = null;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapeJobDetailPage,
        });
      } catch (scriptError) {
        console.error("[CAS] Script execution failed:", scriptError);
        results = null;
      }

      const scrapeResult = results?.[0]?.result as JobDetailResult | undefined;
      console.log("[CAS] Scrape result:", scrapeResult?.description?.length || 0, "chars, expired:", scrapeResult?.expired);

      // Close tab after extraction
      if (tabId) {
        await chrome.tabs.remove(tabId).catch(() => {});
        tabId = undefined;
      }

      if (scrapeResult && !scrapeResult.expired && scrapeResult.description) {
        dailyCounters.detailPagesVisited++;

        enrichedJobs.push({
          url,
          fullDescription: scrapeResult.description || "",
          skillsRequired: scrapeResult.skillsRequired,
          hasExternalLinks: scrapeResult.hasExternalLinks,
        });

        console.log(`[CAS] Enriched: ${shortTitle} (${scrapeResult.description?.length || 0} chars)`);
      } else if (scrapeResult?.expired) {
        console.warn(`[CAS] Job expired: ${shortTitle}`);
      } else {
        console.warn(`[CAS] Failed to enrich: ${shortTitle} - no description found`);
      }

      // Anti-detection delay between detail pages
      if (i < jobUrls.length - 1) {
        await humanDelay(limits.minBetweenJobs, limits.maxBetweenJobs);
      }
    } catch (err) {
      console.error(`[CAS] Error enriching ${url}:`, err);
      // Close tab if still open
      if (tabId) {
        await chrome.tabs.remove(tabId).catch(() => {});
      }
    }
  }

  console.log(`[CAS] Enrichment complete: ${enrichedJobs.length}/${jobUrls.length} jobs enriched`);

  emitProgress(100, `✅ Enrichment complete: ${enrichedJobs.length} jobs processed`);
  socket?.emit("SCRAPE_PROGRESS", {
    current: 100,
    status: `Enrichment complete: ${enrichedJobs.length} jobs processed`,
    stage: "complete",
  });

  // Emit ENRICHMENT_COMPLETE to server
  socket?.emit("ENRICHMENT_COMPLETE", {
    enrichedJobs,
    totalRequested: jobUrls.length,
  });

  console.log(`[CAS] ENRICHMENT_COMPLETE emitted with ${enrichedJobs.length} jobs`);
}

// =============================================================================
// SCRAPE COMMAND HANDLER
// =============================================================================

async function executeScrape(platform: string, targetUrl: string) {
  console.log("[CAS] executeScrape called:", { platform, targetUrl });
  if (!socket) {
    console.error("[CAS] Cannot scrape: not connected");
    return;
  }

  // ==========================================================================
  // ANTI-DETECTION CHECKS (Phase 0)
  // ==========================================================================

  // Check if in cooldown mode
  if (isInCooldown()) {
    const remaining = cooldownUntil ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
    emitProgress(0, `⚠️ In cooldown mode. ${remaining}s remaining. Scrape cancelled.`);
    socket?.emit("TASK_UPDATE", {
      status: "BLOCKED",
      error: `Cooldown active (${remaining}s remaining)`,
    });
    return;
  }

  // Check daily limits
  const limitCheck = checkDailyLimits();
  if (!limitCheck.allowed) {
    emitProgress(0, `⚠️ ${limitCheck.reason}. Scrape cancelled for account protection.`);
    socket?.emit("TASK_UPDATE", {
      status: "BLOCKED",
      error: limitCheck.reason,
    });
    return;
  }

  // Check session cooldown (not as strict as detection cooldown)
  if (shouldEnforceSessionCooldown()) {
    const elapsed = lastScrapeSessionEnd ? Date.now() - lastScrapeSessionEnd : 0;
    const remaining = Math.ceil((RATE_LIMITS.sessionCooldownMs - elapsed) / 1000);
    emitProgress(0, `⏳ Session cooldown active (${remaining}s). Please wait before next scrape.`);
    // Don't block, just warn - let user decide
  }

  try {
    // Emit progress: starting
    console.log("[CAS] Starting scrape, emitting progress...");
    emitProgress(0, `STARTING SCRAPE [${currentScrapingMode} mode] - Fetching selectors...`);

    // Fetch selectors from server with auth
    let selectorConfig: Record<string, string> = {};

    if (currentAuthToken) {
      try {
        const selectorsRes = await fetch(
          `${SOCKET_URL}/api/selectors?platform=${platform}`,
          {
            headers: {
              "Authorization": `Bearer ${currentAuthToken}`,
            },
          }
        );

        if (selectorsRes.ok) {
          const selectors = await selectorsRes.json();
          if (selectors && selectors.length > 0) {
            selectorConfig = JSON.parse(selectors[0].selectors);
            console.log("[CAS] Using DB selectors:", selectorConfig);
          }
        }
      } catch (err) {
        console.warn("[CAS] Failed to fetch selectors, using fallbacks:", err);
      }
    }

    emitProgress(0, "Opening page...");

    // Open target URL in new tab (active: true for Angular SPA to render properly)
    emitProgress(0, ">>> NEW CODE v2 - Opening Upwork tab...");
    const tab = await chrome.tabs.create({ url: targetUrl, active: true });
    const tabId = tab.id!;

    // Wait for Angular SPA to fully render - Upwork needs 8+ seconds
    emitProgress(0, ">>> Waiting 8 seconds for Angular SPA to render...");
    await humanDelay(8000, 10000);

    // ==========================================================================
    // DETECTION CHECK after page load
    // ==========================================================================
    emitProgress(0, "🔍 Checking for bot detection signals...");
    const detectionSignals = await checkForBlocks(tabId);

    // Check each signal and handle if detected
    for (const [signal, detected] of Object.entries(detectionSignals)) {
      if (detected) {
        emitProgress(0, `⚠️ DETECTION: ${signal} - Stopping scrape immediately!`);
        await handleDetection(signal as keyof DetectionSignals, tabId);
        return; // Exit scrape immediately
      }
    }
    emitProgress(0, "✓ No detection signals - proceeding safely");

    // Poll for job cards to appear (wait up to 10 seconds)
    emitProgress(0, "Checking for job cards...");
    let foundCards = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const checkResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            // Check various selectors that might contain jobs
            const selectors = [
              '[data-ev-sublocation="job_feed_tile"]',
              '[data-test="job-tile"]',
              'section[data-ev-feed_name]',
              '[data-test="job-tile-list"]',
              'article.job-tile',
            ];
            for (const sel of selectors) {
              const count = document.querySelectorAll(sel).length;
              if (count > 0) return { found: true, selector: sel, count };
            }
            // Also check if page is still loading
            const loading = document.querySelector('.loading, [class*="loading"], [class*="spinner"]');
            return { found: false, loading: !!loading, url: window.location.href };
          },
        });
        const result = checkResult[0]?.result;
        if (result?.found) {
          emitProgress(0, `Found ${result.count} cards with "${result.selector}"`);
          foundCards = true;
          break;
        }
        emitProgress(0, `Attempt ${attempt + 1}/5: No cards yet (loading: ${result?.loading}, url: ${result?.url?.slice(0, 50)})`);
        await humanDelay(2000, 2500);
      } catch (err) {
        emitProgress(0, `Check attempt ${attempt + 1} failed: ${err}`);
        await humanDelay(1500, 2000);
      }
    }

    if (!foundCards) {
      emitProgress(0, "WARNING: No job cards found after polling, proceeding anyway...");
    }

    emitProgress(0, "Starting scrape...");

    // Scroll-until-exhausted loop with progress reporting
    let lastJobCount = 0;
    let noNewJobsIterations = 0;
    let allJobs: ScrapedJob[] = [];

    for (let i = 0; i < MAX_SCRAPE_ITERATIONS; i++) {
      emitProgress(allJobs.length, `Scroll ${i + 1}/${MAX_SCRAPE_ITERATIONS}...`);

      // Scrape current jobs with retry
      let currentJobs: ScrapedJob[] = [];
      let scrapeDebug = "";
      for (let retry = 0; retry < 2; retry++) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: scrapeJobsFromPage,
            args: [selectorConfig],
          });
          const scrapeResult = results[0]?.result as ScrapeResult | undefined;
          currentJobs = scrapeResult?.jobs || [];
          scrapeDebug = scrapeResult?.debug || "No debug info";

          // Emit debug info on first iteration
          if (i === 0) {
            emitProgress(0, `DEBUG: ${scrapeResult?.usedSelector || 'none'} found ${scrapeResult?.cardsFound || 0} cards on ${scrapeResult?.url || 'unknown'}`);
            // Also emit the full debug log which has card-level details
            emitProgress(0, `CARD_DEBUG: ${scrapeDebug.slice(0, 300)}`);
          }
          break;
        } catch (err) {
          console.warn(`[CAS] Scrape attempt ${retry + 1} failed:`, err);
          if (retry === 1) throw err;
          await humanDelay(1000, 2000);
        }
      }

      console.log(`[CAS] Found ${currentJobs.length} jobs on page. Debug: ${scrapeDebug}`);

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
        console.log(`[CAS] No new jobs (attempt ${noNewJobsIterations}/3)`);
        if (noNewJobsIterations >= 3) {
          console.log("[CAS] Stopping: no new jobs after 3 scrolls");
          break;
        }
      } else {
        noNewJobsIterations = 0;
        lastJobCount = allJobs.length;
      }

      // Safety limit
      if (allJobs.length >= MAX_JOBS_PER_SCRAPE) {
        console.log("[CAS] Reached max job limit");
        break;
      }

      // Scroll down
      emitProgress(allJobs.length, ">>> Scrolling page...");
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.scrollBy(0, window.innerHeight * 2),
      });

      // Human-like wait for content - give time for lazy loading
      emitProgress(allJobs.length, ">>> Waiting 4s for content...");
      await humanDelay(4000, 5000);
    }

    console.log(`[CAS] Total unique jobs scraped: ${allJobs.length}`);

    // Close the feed tab - we're done with the feed
    await chrome.tabs.remove(tabId);

    // =========================================================================
    // PHASE 2: Check which jobs are new vs existing
    // =========================================================================
    emitProgress(allJobs.length, "Phase 2: Checking for new jobs...");

    const discoveredUrls = allJobs.map((j) => j.url);
    let newUrls: string[] = [];
    let existingUrls: string[] = [];

    // Ask server which URLs are new
    try {
      const checkResponse = await new Promise<{ newUrls: string[]; existingUrls: string[] }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("CHECK_JOB_URLS timeout")), 10000);
        socket.emit("CHECK_JOB_URLS", { urls: discoveredUrls }, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
      newUrls = checkResponse.newUrls;
      existingUrls = checkResponse.existingUrls;
    } catch (err) {
      console.warn("[CAS] CHECK_JOB_URLS failed, treating all as new:", err);
      newUrls = discoveredUrls;
      existingUrls = [];
    }

    console.log(`[CAS] Classification: ${newUrls.length} new, ${existingUrls.length} existing`);
    emitProgress(allJobs.length, `Found ${newUrls.length} new jobs to enrich`);

    const newUrlSet = new Set(newUrls);
    const newJobs = allJobs.filter((j) => newUrlSet.has(j.url));
    const existingJobs = allJobs.filter((j) => !newUrlSet.has(j.url));

    // =========================================================================
    // PHASE 3: Enrich NEW jobs by visiting their detail pages
    // =========================================================================
    let enrichedCount = 0;
    let enrichFailedCount = 0;

    if (ENRICH_NEW_JOBS && newJobs.length > 0) {
      const jobsToEnrich = newJobs.slice(0, ENRICH_BATCH_SIZE); // Limit enrichment batch
      const skippedCount = newJobs.length - jobsToEnrich.length;

      if (skippedCount > 0) {
        console.log(`[CAS] Enriching ${jobsToEnrich.length} jobs, ${skippedCount} will get partial data`);
      }

      emitProgress(allJobs.length, `Phase 3: Enriching ${jobsToEnrich.length} new jobs...`);

      for (let i = 0; i < jobsToEnrich.length; i++) {
        const job = jobsToEnrich[i];
        const shortTitle = job.title?.slice(0, 35) || "Unknown";
        emitProgress(allJobs.length, `Enriching [${i + 1}/${jobsToEnrich.length}]: ${shortTitle}...`);

        try {
          const enrichResult = await enrichJobFromDetailPage(job.url);

          if (enrichResult.success && enrichResult.data) {
            // Merge feed data with enriched detail data
            socket.emit("DATA_INGEST", {
              platform,
              // Use enriched data (overwrites feed data)
              title: enrichResult.data.title || job.title,
              description: enrichResult.data.description || job.description,
              url: job.url,
              budget: enrichResult.data.budget || job.budget,
              // Full Sherlock Fields from detail page
              clientName: enrichResult.data.clientName,
              clientLocation: enrichResult.data.clientLocation || job.clientLocation,
              clientCountry: enrichResult.data.clientCountry || job.clientCountry,
              clientTotalSpent: enrichResult.data.clientTotalSpent,
              clientAvgHourly: enrichResult.data.clientAvgHourly,
              clientHireRate: enrichResult.data.clientHireRate,
              clientPaymentVerified: enrichResult.data.clientPaymentVerified ?? job.clientPaymentVerified,
              clientReviewCount: enrichResult.data.clientReviewCount,
              // Full Job Metadata from detail page
              connectsCost: enrichResult.data.connectsCost,
              postedAgo: enrichResult.data.postedAgo || job.postedAgo,
              hasExternalLinks: enrichResult.data.hasExternalLinks ?? job.hasExternalLinks,
              skillsRequired: enrichResult.data.skillsRequired,
              jobType: enrichResult.data.jobType,
              experienceLevel: enrichResult.data.experienceLevel,
              projectLength: enrichResult.data.projectLength,
            });
            enrichedCount++;
            console.log(`[CAS] Enriched job ${i + 1}: ${shortTitle}`);
          } else if (enrichResult.expired) {
            console.log(`[CAS] Job expired, skipping: ${shortTitle}`);
            enrichFailedCount++;
          } else {
            // Enrichment failed, fall back to partial feed data
            console.warn(`[CAS] Enrichment failed for ${shortTitle}: ${enrichResult.error}`);
            socket.emit("DATA_INGEST", {
              platform,
              title: job.title,
              description: job.description,
              url: job.url,
              budget: job.budget,
              clientLocation: job.clientLocation,
              clientCountry: job.clientCountry,
              clientPaymentVerified: job.clientPaymentVerified,
              postedAgo: job.postedAgo,
              hasExternalLinks: job.hasExternalLinks,
            });
            enrichFailedCount++;
          }
        } catch (err) {
          console.error(`[CAS] Enrichment error for ${shortTitle}:`, err);
          // Fall back to partial feed data
          socket.emit("DATA_INGEST", {
            platform,
            title: job.title,
            description: job.description,
            url: job.url,
            budget: job.budget,
            clientLocation: job.clientLocation,
            clientCountry: job.clientCountry,
            clientPaymentVerified: job.clientPaymentVerified,
            postedAgo: job.postedAgo,
            hasExternalLinks: job.hasExternalLinks,
          });
          enrichFailedCount++;
        }

        // Rate limiting delay between enrichments
        if (i < jobsToEnrich.length - 1) {
          await humanDelay(ENRICH_DELAY_MIN, ENRICH_DELAY_MAX);
        }
      }

      // Send partial data for new jobs that weren't enriched (over batch limit)
      if (skippedCount > 0) {
        emitProgress(allJobs.length, `Sending ${skippedCount} jobs with partial data...`);
        const skippedJobs = newJobs.slice(ENRICH_BATCH_SIZE);
        for (const job of skippedJobs) {
          socket.emit("DATA_INGEST", {
            platform,
            title: job.title,
            description: job.description,
            url: job.url,
            budget: job.budget,
            clientLocation: job.clientLocation,
            clientCountry: job.clientCountry,
            clientPaymentVerified: job.clientPaymentVerified,
            postedAgo: job.postedAgo,
            hasExternalLinks: job.hasExternalLinks,
          });
          await humanDelay(30, 80);
        }
      }
    } else if (newJobs.length > 0) {
      // Enrichment disabled, send partial data for all new jobs
      emitProgress(allJobs.length, `Sending ${newJobs.length} new jobs (no enrichment)...`);
      for (const job of newJobs) {
        socket.emit("DATA_INGEST", {
          platform,
          title: job.title,
          description: job.description,
          url: job.url,
          budget: job.budget,
          clientLocation: job.clientLocation,
          clientCountry: job.clientCountry,
          clientPaymentVerified: job.clientPaymentVerified,
          postedAgo: job.postedAgo,
          hasExternalLinks: job.hasExternalLinks,
        });
        await humanDelay(30, 80);
      }
    }

    // =========================================================================
    // PHASE 4: Update existing jobs with fresh feed data (timestamp refresh)
    // =========================================================================
    if (existingJobs.length > 0) {
      emitProgress(allJobs.length, `Phase 4: Updating ${existingJobs.length} existing jobs...`);
      for (const job of existingJobs) {
        socket.emit("DATA_INGEST", {
          platform,
          title: job.title,
          description: job.description,
          url: job.url,
          budget: job.budget,
          clientLocation: job.clientLocation,
          clientCountry: job.clientCountry,
          clientPaymentVerified: job.clientPaymentVerified,
          postedAgo: job.postedAgo,
          hasExternalLinks: job.hasExternalLinks,
        });
        await humanDelay(30, 80);
      }
    }

    // =========================================================================
    // COMPLETION
    // =========================================================================

    // Update daily counters for account protection
    dailyCounters.jobsScraped += allJobs.length;
    dailyCounters.sourcesScraped += 1;
    dailyCounters.detailPagesVisited += enrichedCount;

    // Record session end for cooldown tracking
    lastScrapeSessionEnd = Date.now();

    const enrichSummary = ENRICH_NEW_JOBS && newJobs.length > 0
      ? ` (${enrichedCount} enriched, ${enrichFailedCount} partial)`
      : "";

    socket?.emit("TASK_UPDATE", {
      status: "COMPLETED",
      scraped: allJobs.length,
      message: `Scraped ${allJobs.length} jobs from ${platform}${enrichSummary}`,
      dailyCounters, // Include protection stats
    });

    console.log(`[CAS] Scrape complete: ${allJobs.length} total, ${newJobs.length} new${enrichSummary}`);
    console.log(`[CAS Protection] Daily stats: ${dailyCounters.jobsScraped} jobs, ${dailyCounters.detailPagesVisited} detail pages`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[CAS] Scrape failed:", errorMessage);
    socket?.emit("TASK_UPDATE", {
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
  // Client Intelligence (Sherlock Fields)
  clientName?: string;
  clientLocation?: string;
  clientCountry?: string;
  clientTotalSpent?: number;
  clientAvgHourly?: number;
  clientHireRate?: number;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number;
  // Job Metadata
  connectsCost?: number;
  postedAgo?: string;
  hasExternalLinks?: boolean;
  skillsRequired?: string[];
  jobType?: string;
  experienceLevel?: string;
  projectLength?: string;
}

// =============================================================================
// REFRESH JOBS COMMAND HANDLER
// =============================================================================

const REFRESH_BATCH_SIZE = 5; // Process 5 jobs at a time
const REFRESH_DELAY_BETWEEN_JOBS = 3000; // 3 seconds between jobs
const REFRESH_DELAY_BETWEEN_BATCHES = 8000; // 8 seconds between batches

// Guard to prevent concurrent refresh operations
let isRefreshInProgress = false;

async function executeRefreshJobs(platform: string, jobUrls: string[]) {
  console.log(`[CAS] executeRefreshJobs called: ${jobUrls.length} URLs`);

  // Prevent concurrent refresh operations
  if (isRefreshInProgress) {
    console.warn("[CAS] Refresh already in progress, ignoring duplicate request");
    socket?.emit("TASK_UPDATE", {
      status: "ERROR",
      message: "Refresh already in progress",
    });
    return;
  }

  if (!socket) {
    console.error("[CAS] Cannot refresh: not connected");
    return;
  }

  isRefreshInProgress = true;
  console.log("[CAS] Refresh lock acquired");

  try {
    emitProgress(0, `REFRESHING ${jobUrls.length} jobs individually...`);

    let successCount = 0;
    let failCount = 0;
    let expiredCount = 0;

    // Process jobs in batches
    for (let batchStart = 0; batchStart < jobUrls.length; batchStart += REFRESH_BATCH_SIZE) {
      const batch = jobUrls.slice(batchStart, batchStart + REFRESH_BATCH_SIZE);
      const batchNum = Math.floor(batchStart / REFRESH_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(jobUrls.length / REFRESH_BATCH_SIZE);

      emitProgress(
        Math.round((batchStart / jobUrls.length) * 100),
        `Batch ${batchNum}/${totalBatches}: Refreshing ${batch.length} jobs...`
      );

      // Process each job in the batch
      for (let i = 0; i < batch.length; i++) {
        const jobUrl = batch[i];
        const overallIndex = batchStart + i + 1;

        try {
          emitProgress(
            Math.round((overallIndex / jobUrls.length) * 100),
            `[${overallIndex}/${jobUrls.length}] Refreshing job...`
          );

          const result = await refreshSingleJob(platform, jobUrl);

          if (result.success) {
            successCount++;
            console.log(`[CAS] Refreshed job ${overallIndex}/${jobUrls.length}: ${result.title?.slice(0, 40)}...`);
          } else if (result.expired) {
            expiredCount++;
            console.log(`[CAS] Job ${overallIndex}/${jobUrls.length} expired/removed`);
            // Notify server that job is expired
            socket?.emit("TASK_UPDATE", {
              status: "JOB_EXPIRED",
              jobUrl,
              message: "Job no longer available on Upwork",
            });
          } else {
            failCount++;
            console.warn(`[CAS] Failed to refresh job ${overallIndex}/${jobUrls.length}: ${result.error}`);
          }

        } catch (err) {
          failCount++;
          console.error(`[CAS] Error refreshing job ${overallIndex}:`, err);
        }

        // Delay between jobs (except last job in batch)
        if (i < batch.length - 1) {
          await humanDelay(REFRESH_DELAY_BETWEEN_JOBS, REFRESH_DELAY_BETWEEN_JOBS + 1000);
        }
      }

      // Delay between batches (except last batch)
      if (batchStart + REFRESH_BATCH_SIZE < jobUrls.length) {
        emitProgress(
          Math.round(((batchStart + batch.length) / jobUrls.length) * 100),
          `Batch ${batchNum} complete. Waiting before next batch...`
        );
        await humanDelay(REFRESH_DELAY_BETWEEN_BATCHES, REFRESH_DELAY_BETWEEN_BATCHES + 2000);
      }
    }

    // Emit completion with summary
    const message = `Refreshed ${successCount} jobs. ${expiredCount > 0 ? `${expiredCount} expired. ` : ""}${failCount > 0 ? `${failCount} failed.` : ""}`;
    console.log(`[CAS] Refresh complete: ${message}`);

    socket?.emit("TASK_UPDATE", {
      status: "COMPLETED",
      message,
      scraped: successCount,
      expired: expiredCount,
      failed: failCount,
    });

  } catch (err) {
    console.error("[CAS] Refresh error:", err);
    socket?.emit("TASK_UPDATE", {
      status: "ERROR",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    // Always release the lock
    isRefreshInProgress = false;
    console.log("[CAS] Refresh lock released");
  }
}

interface RefreshResult {
  success: boolean;
  expired?: boolean;
  title?: string;
  error?: string;
}

async function refreshSingleJob(platform: string, jobUrl: string): Promise<RefreshResult> {
  let tabId: number | undefined;

  try {
    // Open the job detail page
    const tab = await chrome.tabs.create({ url: jobUrl, active: false });
    tabId = tab.id!;

    // Wait for page to load (increased for Angular SPA rendering)
    await humanDelay(ENRICH_PAGE_LOAD_DELAY, ENRICH_PAGE_LOAD_DELAY + 1000);

    // Check if job still exists and extract data
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeJobDetailPage,
    });

    const scrapeResult = results[0]?.result as JobDetailResult | undefined;

    // Close tab immediately after scraping
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
      tabId = undefined;
    }

    if (!scrapeResult) {
      return { success: false, error: "No scrape result" };
    }

    if (scrapeResult.expired) {
      return { success: false, expired: true };
    }

    if (!scrapeResult.title || !scrapeResult.description) {
      return { success: false, error: "Missing required fields" };
    }

    // Send refreshed data to server
    socket?.emit("DATA_INGEST", {
      platform,
      title: scrapeResult.title,
      description: scrapeResult.description,
      url: jobUrl,
      budget: scrapeResult.budget,
      // Sherlock Fields
      clientName: scrapeResult.clientName,
      clientLocation: scrapeResult.clientLocation,
      clientCountry: scrapeResult.clientCountry,
      clientTotalSpent: scrapeResult.clientTotalSpent,
      clientAvgHourly: scrapeResult.clientAvgHourly,
      clientHireRate: scrapeResult.clientHireRate,
      clientPaymentVerified: scrapeResult.clientPaymentVerified,
      clientReviewCount: scrapeResult.clientReviewCount,
      // Job Metadata
      connectsCost: scrapeResult.connectsCost,
      postedAgo: scrapeResult.postedAgo,
      hasExternalLinks: scrapeResult.hasExternalLinks,
      skillsRequired: scrapeResult.skillsRequired,
      jobType: scrapeResult.jobType,
      experienceLevel: scrapeResult.experienceLevel,
      projectLength: scrapeResult.projectLength,
      // Mark as refresh
      isRefresh: true,
    });

    return { success: true, title: scrapeResult.title };

  } catch (err) {
    // Clean up tab if still open
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// =============================================================================
// ENRICHMENT HELPER - Extract full details from job detail page
// =============================================================================

interface EnrichmentResult {
  success: boolean;
  expired?: boolean;
  data?: Partial<ScrapedJob>;
  error?: string;
}

async function enrichJobFromDetailPage(jobUrl: string): Promise<EnrichmentResult> {
  let tabId: number | undefined;

  try {
    // Open job detail page in background
    const tab = await chrome.tabs.create({ url: jobUrl, active: false });
    tabId = tab.id!;

    // Wait for page to load
    await humanDelay(ENRICH_PAGE_LOAD_DELAY, ENRICH_PAGE_LOAD_DELAY + 500);

    // Extract full data
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeJobDetailPage,
    });

    const result = results[0]?.result as JobDetailResult | undefined;

    // Close tab immediately
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
      tabId = undefined;
    }

    if (!result) {
      return { success: false, error: "No scrape result" };
    }

    if (result.expired) {
      return { success: false, expired: true };
    }

    // Return enriched data (all Sherlock fields)
    return {
      success: true,
      data: {
        title: result.title,
        description: result.description,
        budget: result.budget,
        clientName: result.clientName,
        clientLocation: result.clientLocation,
        clientCountry: result.clientCountry,
        clientTotalSpent: result.clientTotalSpent,
        clientAvgHourly: result.clientAvgHourly,
        clientHireRate: result.clientHireRate,
        clientPaymentVerified: result.clientPaymentVerified,
        clientReviewCount: result.clientReviewCount,
        connectsCost: result.connectsCost,
        postedAgo: result.postedAgo,
        hasExternalLinks: result.hasExternalLinks,
        skillsRequired: result.skillsRequired,
        jobType: result.jobType,
        experienceLevel: result.experienceLevel,
        projectLength: result.projectLength,
      },
    };

  } catch (err) {
    console.error(`[CAS] Failed to enrich job ${jobUrl}:`, err);
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

interface JobDetailResult {
  expired: boolean;
  title?: string;
  description?: string;
  budget?: string;
  clientName?: string;
  clientLocation?: string;
  clientCountry?: string;
  clientTotalSpent?: number;
  clientAvgHourly?: number;
  clientHireRate?: number;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number;
  connectsCost?: number;
  postedAgo?: string;
  hasExternalLinks?: boolean;
  skillsRequired?: string[];
  jobType?: string;
  experienceLevel?: string;
  projectLength?: string;
}

// Content script function to extract data from job detail page
function scrapeJobDetailPage(): JobDetailResult | null {
  const VERSION = "DETAIL-V4-2026-01-14";

  try {
    console.log(`[CAS Detail Scraper ${VERSION}] Running on:`, window.location.href);
    console.log(`[CAS Detail Scraper ${VERSION}] Document ready state:`, document.readyState);
    console.log(`[CAS Detail Scraper ${VERSION}] Body exists:`, !!document.body);
    console.log(`[CAS Detail Scraper ${VERSION}] Body text length:`, document.body?.innerText?.length || 0);

    // Check if job is expired/removed
    const pageText = document.body?.innerText?.toLowerCase() || "";
  const expiredIndicators = [
    "this job is no longer available",
    "job not found",
    "this job has been removed",
    "job is closed",
    "no longer accepting proposals",
    "position has been filled",
  ];

  for (const indicator of expiredIndicators) {
    if (pageText.includes(indicator)) {
      console.log(`[CAS Detail Scraper ${VERSION}] Job expired: found "${indicator}"`);
      return { expired: true };
    }
  }

  // Helper to get text from first matching selector
  const getText = (selectors: string[]): string => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      } catch { /* invalid selector */ }
    }
    return "";
  };

  // Helper to parse money values
  const parseMoney = (text: string): number | undefined => {
    if (!text) return undefined;
    const cleaned = text.replace(/[,$K+]/gi, (m) => m.toLowerCase() === "k" ? "000" : "");
    const match = cleaned.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : undefined;
  };

  // Helper to parse percentage
  const parsePercent = (text: string): number | undefined => {
    const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : undefined;
  };

  // Extract title
  console.log(`[CAS Detail Scraper ${VERSION}] Extracting title...`);
  const title = getText([
    'h1[data-test="job-title"]',
    'h1.job-title',
    'header h1',
    '.job-details-header h1',
    'h1',
  ]);
  console.log(`[CAS Detail Scraper ${VERSION}] Title found:`, title?.slice(0, 50));

  // Try to expand "Read more" / "Show more" buttons to get full description
  console.log(`[CAS Detail Scraper ${VERSION}] Looking for expand buttons...`);
  try {
    const expandButtons = document.querySelectorAll(
      '[data-test="read-more"], [class*="read-more"], [class*="show-more"], ' +
      'button[class*="truncation"], a[class*="truncation"], ' +
      '.air3-truncation button, .air3-truncation a'
    );
    console.log(`[CAS Detail Scraper ${VERSION}] Found ${expandButtons.length} expand buttons`);
    expandButtons.forEach((btn) => {
      try {
        const text = btn.textContent?.toLowerCase() || "";
        if (text.includes("more") || text.includes("expand") || text.includes("read")) {
          (btn as HTMLElement).click();
          console.log(`[CAS Detail Scraper ${VERSION}] Clicked expand button:`, text.slice(0, 30));
        }
      } catch { /* ignore click errors */ }
    });
  } catch (e) {
    console.log(`[CAS Detail Scraper ${VERSION}] Error with expand buttons:`, e);
  }

  // Also try clicking any "..." or truncation indicators
  try {
    const ellipsisElements = document.querySelectorAll('[class*="ellipsis"], [class*="truncat"]');
    ellipsisElements.forEach((el) => {
      try {
        if (el.tagName === "BUTTON" || el.tagName === "A") {
          (el as HTMLElement).click();
        }
      } catch { /* ignore */ }
    });
  } catch (e) {
    console.log(`[CAS Detail Scraper ${VERSION}] Error with ellipsis:`, e);
  }

  // Extract description - Using selectors that work with current Upwork DOM (2026)
  // Primary: .job-details-content (4400+ chars), Fallback: [data-test="Description"] (3200+ chars)
  console.log(`[CAS Detail Scraper ${VERSION}] Extracting description...`);

  const descriptionSelectors = [
    // Primary selectors (proven to work)
    '.job-details-content',
    '[data-test="Description"]',
    // Fallback selectors
    '[data-test="job-description"]',
    '[data-qa="description"]',
    '.job-description',
    '.description',
    '[class*="job-description"]',
  ];

  let description = "";
  for (const sel of descriptionSelectors) {
    try {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || "";
      // Use the longest description found (more complete)
      if (text.length > description.length) {
        description = text;
        console.log(`[CAS Detail Scraper ${VERSION}] Found desc from "${sel}": ${text.length} chars`);
      }
    } catch { /* invalid selector */ }
  }

  console.log(`[CAS Detail Scraper ${VERSION}] Description extracted: ${description?.length || 0} chars`);

  // Last resort: find the largest text block in the page
  if (description.length < 100) {
    console.log(`[CAS Detail Scraper ${VERSION}] Description too short, trying fallback...`);
    const allElements = document.querySelectorAll('p, div, section, article');
    let longestText = "";
    allElements.forEach((el) => {
      const text = el.textContent?.trim() || "";
      const className = (el.className || "").toLowerCase();
      if (className.includes('nav') || className.includes('footer') || className.includes('header') ||
          className.includes('sidebar') || className.includes('menu')) {
        return;
      }
      if (text.length > longestText.length && text.length < 10000) {
        longestText = text;
      }
    });
    if (longestText.length > description.length) {
      description = longestText;
      console.log(`[CAS Detail Scraper ${VERSION}] Used fallback, length: ${description.length}`);
    }
  }

  // Extract budget
  const budgetText = getText([
    '[data-test="budget"]',
    '[data-test="job-budget"]',
    '.budget',
    '[class*="budget"]',
  ]);

  // Extract client info
  const clientSection = document.querySelector('[data-test="about-client"], .client-info, [class*="client"]');

  let clientLocation = "";
  let clientCountry = "";
  let clientTotalSpent: number | undefined;
  let clientAvgHourly: number | undefined;
  let clientHireRate: number | undefined;
  let clientPaymentVerified = false;
  let clientReviewCount: number | undefined;

  if (clientSection) {
    const clientText = clientSection.textContent || "";

    // Location
    const locationEl = clientSection.querySelector('[data-test="client-location"], [class*="location"]');
    clientLocation = locationEl?.textContent?.trim() || "";

    // Extract country from location
    const countries = ["United States", "USA", "US", "United Kingdom", "UK", "Canada", "Australia", "Germany", "India", "Pakistan", "Philippines"];
    const locLower = clientLocation.toLowerCase();
    for (const country of countries) {
      if (locLower.includes(country.toLowerCase())) {
        clientCountry = country === "USA" || country === "US" ? "United States" : country === "UK" ? "United Kingdom" : country;
        break;
      }
    }
    if (!clientCountry && clientLocation.includes(",")) {
      clientCountry = clientLocation.split(",").pop()?.trim() || "";
    }

    // Total spent
    const spentMatch = clientText.match(/\$?([\d,]+(?:\.\d+)?[KMB]?)\s*(?:spent|total)/i);
    if (spentMatch) {
      clientTotalSpent = parseMoney(spentMatch[1]);
    }

    // Avg hourly
    const hourlyMatch = clientText.match(/\$?([\d.]+)\s*\/\s*hr/i);
    if (hourlyMatch) {
      clientAvgHourly = parseFloat(hourlyMatch[1]);
    }

    // Hire rate
    const hireMatch = clientText.match(/(\d+(?:\.\d+)?)\s*%?\s*hire\s*rate/i);
    if (hireMatch) {
      clientHireRate = parseFloat(hireMatch[1]);
    }

    // Payment verified
    clientPaymentVerified = clientText.toLowerCase().includes("payment verified") ||
                           clientText.toLowerCase().includes("payment method verified") ||
                           !!clientSection.querySelector('[data-test="payment-verified"], .payment-verified, [class*="verified"]');

    // Review count
    const reviewMatch = clientText.match(/(\d+)\s*(?:reviews?|ratings?)/i);
    if (reviewMatch) {
      clientReviewCount = parseInt(reviewMatch[1], 10);
    }
  }

  // Extract connects cost
  let connectsCost: number | undefined;
  const connectsText = getText([
    '[data-test="connects-required"]',
    '[class*="connects"]',
  ]);
  const connectsMatch = (connectsText || pageText).match(/(\d+)\s*connects/i);
  if (connectsMatch) {
    connectsCost = parseInt(connectsMatch[1], 10);
  }

  // Extract posted time
  const postedAgo = getText([
    '[data-test="posted-on"]',
    '[data-test="job-posted"]',
    '.posted-on',
    '[class*="posted"]',
    'time',
  ]).replace(/posted\s*/i, "");

  // Check for external links
  const hasExternalLinks = /https?:\/\/[^\s]+/i.test(description) ||
                          /www\.[^\s]+/i.test(description) ||
                          /\.com|\.io|\.org|\.net/i.test(description);

  // Extract skills
  const skillElements = document.querySelectorAll('[data-test="skill"], .skill-badge, [class*="skill"] a, .skills a');
  const skillsRequired = Array.from(skillElements)
    .map((el) => el.textContent?.trim())
    .filter((s): s is string => !!s && s.length < 50)
    .slice(0, 15);

  // Extract job type, experience level, project length
  const jobType = getText(['[data-test="job-type"]', '[class*="job-type"]']);
  const experienceLevel = getText(['[data-test="experience-level"]', '[class*="experience"]']);
  const projectLength = getText(['[data-test="project-length"]', '[data-test="duration"]', '[class*="duration"]']);

  console.log(`[CAS Detail Scraper ${VERSION}] Extracted:`, {
    title: title?.slice(0, 50),
    descLen: description?.length,
    clientLocation,
    clientCountry,
    clientPaymentVerified,
    postedAgo,
  });

  return {
    expired: false,
    title: title || undefined,
    description: description || undefined,
    budget: budgetText || undefined,
    clientName: undefined, // Usually not on detail page, comes from reviews
    clientLocation: clientLocation || undefined,
    clientCountry: clientCountry || undefined,
    clientTotalSpent,
    clientAvgHourly,
    clientHireRate,
    clientPaymentVerified,
    clientReviewCount,
    connectsCost,
    postedAgo: postedAgo || undefined,
    hasExternalLinks,
    skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
    jobType: jobType || undefined,
    experienceLevel: experienceLevel || undefined,
    projectLength: projectLength || undefined,
  };
  } catch (error) {
    console.error(`[CAS Detail Scraper] ERROR:`, error);
    console.error(`[CAS Detail Scraper] Error message:`, error instanceof Error ? error.message : String(error));
    console.error(`[CAS Detail Scraper] Stack:`, error instanceof Error ? error.stack : "No stack");
    return null;
  }
}

function emitProgress(current: number, status: string) {
  socket?.emit("SCRAPE_PROGRESS", { current, status });
}

const humanDelay = (min = 1000, max = 3000): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(resolve, min + Math.random() * (max - min))
  );

// =============================================================================
// EXTRACTION HELPERS (Injected into page context)
// =============================================================================

function extractTextFromSelectors(element: Element, selectors: string[]): string {
  for (const sel of selectors) {
    const el = element.querySelector(sel);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }
  return "";
}

function parseMoneyValue(text: string): number | undefined {
  if (!text) return undefined;
  // Handle formats: "$10K+", "$1,234", "$50/hr", "10000"
  const cleaned = text.replace(/[,$K+]/gi, (match) => {
    if (match.toLowerCase() === "k") return "000";
    return "";
  });
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : undefined;
}

function parsePercentage(text: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : undefined;
}

function parseConnectsCost(text: string): number | undefined {
  if (!text) return undefined;
  // "6 Connects" or "Connects to submit: 6"
  const match = text.match(/(\d+)\s*(?:Connects|connects)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function detectExternalLinks(text: string): boolean {
  if (!text) return false;
  // Look for URLs or common external link patterns
  const patterns = [
    /https?:\/\/[^\s]+/i,
    /www\.[^\s]+/i,
    /\.com|\.io|\.org|\.net/i,
    /check out|see my|visit my|portfolio at/i,
  ];
  return patterns.some((p) => p.test(text));
}

function extractCountry(locationText: string): string | undefined {
  if (!locationText) return undefined;
  // Common country patterns
  const countries = [
    "United States",
    "USA",
    "US",
    "United Kingdom",
    "UK",
    "Canada",
    "Australia",
    "Germany",
    "India",
    "Pakistan",
    "Philippines",
    "Bangladesh",
    "Israel",
    "Singapore",
    "Netherlands",
    "France",
    "Spain",
    "Italy",
    "Brazil",
    "Mexico",
    "UAE",
    "Saudi Arabia",
  ];
  const text = locationText.toLowerCase();
  for (const country of countries) {
    if (text.includes(country.toLowerCase())) {
      // Normalize some common variants
      if (country === "USA" || country === "US") return "United States";
      if (country === "UK") return "United Kingdom";
      return country;
    }
  }
  // Return last part after comma as fallback
  const parts = locationText.split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : undefined;
}

// Content script function (injected into page)
interface ScrapeResult {
  jobs: ScrapedJob[];
  debug: string;
  url: string;
  cardsFound: number;
  usedSelector: string;
}

function scrapeJobsFromPage(selectors: Record<string, string>): ScrapeResult {
  // ============================================================
  // VERSION MARKER - If you see this in logs, new code is running
  // ============================================================
  const VERSION = "V3-INLINE-2026-01-14";
  console.log(`[CAS Scraper ${VERSION}] Running on:`, window.location.href);
  console.log(`[CAS Scraper ${VERSION}] Page title:`, document.title);

  const jobs: ScrapedJob[] = [];
  const debugLines: string[] = [`VERSION:${VERSION}`];

  // ============================================================
  // COMPLETELY INLINED HELPERS - No function calls to fail
  // ============================================================

  // Inline helper: extract text from first matching selector
  const getText = (element: Element, selectorList: string[]): string => {
    for (const sel of selectorList) {
      try {
        const el = element.querySelector(sel);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      } catch { /* invalid selector, continue */ }
    }
    return "";
  };

  // ============================================================
  // STEP 1: Find job cards using multiple selector strategies
  // ============================================================

  const cardSelectors = [
    '[data-ev-sublocation="job_feed_tile"]',
    '[data-test="job-tile"]',
    'section[data-ev-feed_name]',
    '[data-test="job-tile-list"] > section',
    'article[data-test="JobTile"]',
    '[data-test="JobTile"]',
    'article.job-tile',
  ];

  let cards: Element[] = [];
  let usedSelector = "none";

  for (const selector of cardSelectors) {
    try {
      const found = document.querySelectorAll(selector);
      debugLines.push(`${selector.slice(0,30)}:${found.length}`);
      if (found.length > 0) {
        cards = Array.from(found);
        usedSelector = selector;
        console.log(`[CAS Scraper ${VERSION}] Found ${cards.length} cards with "${selector}"`);
        break;
      }
    } catch { /* invalid selector */ }
  }

  // Fallback: Find job links and traverse up to containers
  if (cards.length === 0) {
    console.log(`[CAS Scraper ${VERSION}] No cards found, trying link-parent strategy...`);
    const jobLinks = document.querySelectorAll('a[href*="/jobs/~"], a[href*="/jobs/"][href*="_~"]');
    debugLines.push(`JobLinks:${jobLinks.length}`);

    const parentSet = new Set<Element>();
    jobLinks.forEach(link => {
      let parent: Element | null = link.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        const tag = parent.tagName.toLowerCase();
        const classes = parent.className?.toLowerCase() || "";
        const dataTest = parent.getAttribute("data-test")?.toLowerCase() || "";

        if (tag === "article" || tag === "section" ||
            classes.includes("job") || classes.includes("tile") ||
            dataTest.includes("job") || dataTest.includes("tile")) {
          parentSet.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });

    if (parentSet.size > 0) {
      cards = Array.from(parentSet);
      usedSelector = "link-parents";
      debugLines.push(`LinkParents:${cards.length}`);
    }
  }

  if (cards.length === 0) {
    debugLines.push("NO_CARDS_FOUND");
    console.log(`[CAS Scraper ${VERSION}] No job cards found!`);
    return {
      jobs: [],
      debug: debugLines.join("|"),
      url: window.location.href,
      cardsFound: 0,
      usedSelector: "none",
    };
  }

  console.log(`[CAS Scraper ${VERSION}] Processing ${cards.length} cards...`);

  // ============================================================
  // STEP 2: Extract job data from each card (FULLY INLINED)
  // ============================================================

  cards.forEach((card, i) => {
    if (i >= 25) return; // Limit per scroll

    try {
      // Find the job link - this is the most reliable identifier
      const allLinks = card.querySelectorAll('a');
      let jobUrl = "";
      let jobTitle = "";

      for (const link of Array.from(allLinks)) {
        const href = (link as HTMLAnchorElement).href || "";

        // Skip navigation/search links
        if (href.includes('/search/') || href.includes('/find-work')) continue;

        // Match job URLs: /jobs/~xxx or /jobs/Title_~xxx
        if (href.match(/\/jobs\/[^\/\?]+/)) {
          jobUrl = href;
          jobTitle = link.textContent?.trim() || "";
          break;
        }
      }

      if (!jobUrl) {
        debugLines.push(`C${i}:NOURL`);
        return;
      }

      // If no title from link, try headers
      if (!jobTitle) {
        const headerEl = card.querySelector('h2, h3, h4, [data-test*="title"]');
        jobTitle = headerEl?.textContent?.trim() || "Unknown Job";
      }

      // Get description - try multiple selectors inline
      let description = "";
      const descSelectors = [
        '[data-test="job-description-text"]',
        '[data-test*="description"]',
        '[class*="description"]',
        'p',
      ];
      for (const sel of descSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el?.textContent && el.textContent.length > 30) {
            description = el.textContent.trim().slice(0, 2000);
            break;
          }
        } catch { /* continue */ }
      }

      // Budget - inline extraction
      let budget = "";
      const budgetSelectors = ['[data-test="budget"]', '[data-test*="price"]', '[class*="budget"]'];
      for (const sel of budgetSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim()) {
            budget = el.textContent.trim();
            break;
          }
        } catch { /* continue */ }
      }

      // Client location - inline extraction
      let clientLocation = "";
      const locSelectors = ['[data-test="client-location"]', '[data-test="location"]', '[class*="location"]'];
      for (const sel of locSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim()) {
            clientLocation = el.textContent.trim();
            break;
          }
        } catch { /* continue */ }
      }

      // Extract country from location (INLINED - no function call)
      let clientCountry: string | undefined = undefined;
      if (clientLocation) {
        const countryList = ["United States", "USA", "US", "United Kingdom", "UK", "Canada",
                            "Australia", "Germany", "India", "Pakistan", "Philippines"];
        const locLower = clientLocation.toLowerCase();
        for (const country of countryList) {
          if (locLower.includes(country.toLowerCase())) {
            clientCountry = (country === "USA" || country === "US") ? "United States" :
                           (country === "UK") ? "United Kingdom" : country;
            break;
          }
        }
        if (!clientCountry) {
          const parts = clientLocation.split(",");
          clientCountry = parts.length > 1 ? parts[parts.length - 1].trim() : undefined;
        }
      }

      // Payment verified - inline check
      const paymentVerified = !!card.querySelector('[data-test="payment-verified"], [class*="payment-verified"], .payment-verified');

      // Posted time - inline extraction
      let postedAgo = "";
      const timeSelectors = ['[data-test="posted-on"]', 'time', '[class*="posted"]'];
      for (const sel of timeSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim()) {
            postedAgo = el.textContent.trim();
            break;
          }
        } catch { /* continue */ }
      }

      // Has external links - inline check
      const hasExternalLinks = /https?:\/\/[^\s]+/i.test(description) && !/upwork\.com/i.test(description);

      // Build job object
      const jobData: ScrapedJob = {
        title: jobTitle,
        description,
        url: jobUrl,
        budget: budget || undefined,
        clientLocation: clientLocation || undefined,
        clientCountry,
        clientPaymentVerified: paymentVerified,
        postedAgo: postedAgo || undefined,
        hasExternalLinks,
      };

      jobs.push(jobData);
      debugLines.push(`J${i}:OK`);
      console.log(`[CAS Scraper ${VERSION}] Job ${i}: ${jobTitle.slice(0, 40)}`);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLines.push(`E${i}:${errMsg.slice(0, 30)}`);
      console.error(`[CAS Scraper ${VERSION}] Card ${i} error:`, errMsg);
    }
  });

  console.log(`[CAS Scraper ${VERSION}] Extracted ${jobs.length} jobs from ${cards.length} cards`);
  debugLines.push(`TOTAL:${jobs.length}/${cards.length}`);

  return {
    jobs,
    debug: debugLines.join("|"),
    url: window.location.href,
    cardsFound: cards.length,
    usedSelector,
  };
}

// =============================================================================
// MESSAGE HANDLERS (Popup Communication)
// =============================================================================

const waitForConnection = (timeout = 5000): Promise<boolean> => {
  return new Promise(async (resolve) => {
    if (socket?.connected) {
      resolve(true);
      return;
    }

    // If no token, can't connect
    if (!currentAuthToken) {
      console.log("[CAS] No auth token, cannot connect");
      resolve(false);
      return;
    }

    console.log("[CAS] Waiting for socket connection...");
    if (!isConnecting) {
      isConnecting = true;
      if (socket) {
        socket.connect();
      } else {
        connectSocket(currentAuthToken);
      }
    }

    let resolved = false;

    const checkConnection = () => {
      if (!resolved && socket?.connected) {
        resolved = true;
        resolve(true);
      }
    };

    // Check periodically
    const interval = setInterval(checkConnection, 100);

    setTimeout(() => {
      clearInterval(interval);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, timeout);
  });
};

// =============================================================================
// INJECTED SCRAPING FUNCTIONS
// =============================================================================

// This function runs in the page context (injected via chrome.scripting.executeScript)
function scrapeJobsFromPageInjected() {
  const jobs: Array<{
    title: string;
    description: string;
    url: string;
    clientName?: string;
    clientLocation?: string;
    clientTotalSpent?: number;
    clientHireRate?: number;
    clientPaymentVerified?: boolean;
    connectsCost?: number;
    postedAgo?: string;
    hasExternalLinks?: boolean;
  }> = [];

  // Default selectors for Upwork job feed
  const selectors = {
    jobCard: '[data-test="JobTile"], article.job-tile, .up-card-section',
    jobTitle: '[data-test="job-tile-title-link"], .job-tile-title a, h2 a',
    jobDescription: '[data-test="job-description-text"], .job-tile-description, .description',
    jobLink: '[data-test="job-tile-title-link"], .job-tile-title a, h2 a',
    clientLocation: '[data-test="client-location"], .client-location, .air3-badge',
    postedTime: '[data-test="posted-time"], .posted-time, time',
    connects: '[data-test="connects-to-apply"], .connects-amount',
    paymentVerified: '.payment-verified, [data-test="payment-verified"]',
  };

  const jobCards = document.querySelectorAll(selectors.jobCard);

  jobCards.forEach((card) => {
    const titleEl = card.querySelector(selectors.jobTitle);
    const descEl = card.querySelector(selectors.jobDescription);
    const linkEl = card.querySelector(selectors.jobLink) as HTMLAnchorElement | null;
    const locationEl = card.querySelector(selectors.clientLocation);
    const postedEl = card.querySelector(selectors.postedTime);
    const connectsEl = card.querySelector(selectors.connects);
    const verifiedEl = card.querySelector(selectors.paymentVerified);

    if (!titleEl || !linkEl) return;

    const title = titleEl.textContent?.trim() || '';
    const description = descEl?.textContent?.trim().slice(0, 1000) || '';
    const url = linkEl.href || '';

    if (!title || !url) return;

    // Parse connects
    let connectsCost = 16;
    if (connectsEl?.textContent) {
      const match = connectsEl.textContent.match(/(\d+)/);
      if (match) connectsCost = parseInt(match[1], 10);
    }

    // Check for external links
    const hasExternalLinks = /https?:\/\/(?!upwork\.com)/i.test(description);

    jobs.push({
      title,
      description,
      url,
      clientLocation: locationEl?.textContent?.trim(),
      clientPaymentVerified: !!verifiedEl,
      connectsCost,
      postedAgo: postedEl?.textContent?.trim(),
      hasExternalLinks,
    });
  });

  return jobs;
}

// Extract profile stats from Upwork page (connects, proposals)
function extractProfileStats() {
  const stats: { connects?: number; proposals?: number } = {};

  // Try to find connects balance
  const connectsSelectors = [
    '[data-test="available-connects"]',
    '.connects-balance',
    '.air3-badge:contains("Connects")',
  ];

  for (const sel of connectsSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent) {
        const match = el.textContent.match(/(\d+)/);
        if (match) {
          stats.connects = parseInt(match[1], 10);
          break;
        }
      }
    } catch {
      // Selector might be invalid, continue
    }
  }

  // Try to find active proposals count
  const proposalSelectors = [
    '[data-test="active-proposals"]',
    '.proposals-count',
    'a[href*="proposals"] .count',
  ];

  for (const sel of proposalSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent) {
        const match = el.textContent.match(/(\d+)/);
        if (match) {
          stats.proposals = parseInt(match[1], 10);
          break;
        }
      }
    } catch {
      // Selector might be invalid, continue
    }
  }

  return stats;
}

// =============================================================================
// DOM CAPTURE FUNCTION (Injected into page for selector development)
// =============================================================================

// More granular page types for comprehensive DOM capture coverage
type UpworkPageType =
  | "job-list-best-match"      // /nx/search/jobs (default sort)
  | "job-list-most-recent"     // /nx/search/jobs?sort=recency
  | "job-list-saved"           // /nx/search/jobs/saved
  | "job-list-search"          // /nx/search/jobs?q=keyword
  | "job-detail"               // /jobs/~01xxxxx
  | "job-detail-apply"         // /jobs/~01xxxxx/apply (application page)
  | "profile-stats"            // /freelancers/settings/my-stats
  | "profile-settings"         // /freelancers/settings/*
  | "proposals"                // /nx/proposals/*
  | "messages"                 // /nx/messages/*
  | "unknown";

interface DomCaptureResult {
  pageType: UpworkPageType;
  urlPattern: string;  // Normalized URL pattern for matching
  dataAttributes: Array<{
    attr: string | null;
    tag: string;
    classes: string;
    textPreview?: string;
  }>;
  jobCardSample?: string;
  clientSection?: string;
  fullStructure?: {
    title?: string;
    jobCount?: number;
    hasClientInfo: boolean;
    hasJobCards: boolean;
    uniqueDataAttrs: string[];
    uniqueClasses: string[];
  };
}

function captureDomStructureInjected(): DomCaptureResult {
  // Detect page type based on URL and content
  const url = window.location.href;
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  let pageType: UpworkPageType = "unknown";
  let urlPattern = "unknown";

  // Job Detail Pages
  if (pathname.includes("/jobs/") && pathname.includes("~")) {
    if (pathname.includes("/apply")) {
      pageType = "job-detail-apply";
      urlPattern = "/jobs/~ID/apply";
    } else {
      pageType = "job-detail";
      urlPattern = "/jobs/~ID";
    }
  }
  // Job List Pages - various types
  else if (pathname.includes("/nx/search/jobs") || pathname.includes("/search/jobs") || pathname.includes("/nx/find-work")) {
    urlPattern = pathname;

    if (pathname.includes("/saved")) {
      pageType = "job-list-saved";
      urlPattern = "/nx/search/jobs/saved";
    } else if (searchParams.has("q") || searchParams.has("query")) {
      pageType = "job-list-search";
      urlPattern = "/nx/search/jobs?q=KEYWORD";
    } else if (searchParams.get("sort") === "recency") {
      pageType = "job-list-most-recent";
      urlPattern = "/nx/search/jobs?sort=recency";
    } else {
      pageType = "job-list-best-match";
      urlPattern = "/nx/search/jobs (best match)";
    }
  }
  // Profile/Stats Pages
  else if (pathname.includes("/freelancers/")) {
    if (pathname.includes("/my-stats") || pathname.includes("/stats")) {
      pageType = "profile-stats";
      urlPattern = "/freelancers/settings/my-stats";
    } else if (pathname.includes("/settings")) {
      pageType = "profile-settings";
      urlPattern = "/freelancers/settings/*";
    }
  }
  // Proposals
  else if (pathname.includes("/nx/proposals") || pathname.includes("/proposals")) {
    pageType = "proposals";
    urlPattern = "/nx/proposals/*";
  }
  // Messages
  else if (pathname.includes("/nx/messages") || pathname.includes("/messages")) {
    pageType = "messages";
    urlPattern = "/nx/messages/*";
  }

  // Capture all elements with data-test or data-qa attributes
  const dataElements = document.querySelectorAll("[data-test], [data-qa], [data-cy], [data-testid]");
  const dataAttributes: DomCaptureResult["dataAttributes"] = [];

  dataElements.forEach((el) => {
    const attr =
      el.getAttribute("data-test") ||
      el.getAttribute("data-qa") ||
      el.getAttribute("data-cy") ||
      el.getAttribute("data-testid");

    dataAttributes.push({
      attr,
      tag: el.tagName.toLowerCase(),
      classes: el.className?.toString() || "",
      textPreview: el.textContent?.slice(0, 100)?.trim() || undefined,
    });
  });

  // Capture first job card sample
  const jobCardSelectors = [
    '[data-test="job-tile"]',
    '[data-test="JobTile"]',
    ".job-tile",
    '[class*="JobTile"]',
    '[class*="job-tile"]',
    "article.job-tile",
    'section[data-test*="job"]',
  ];

  let jobCardSample: string | undefined;
  for (const sel of jobCardSelectors) {
    try {
      const card = document.querySelector(sel);
      if (card) {
        jobCardSample = card.outerHTML.slice(0, 15000); // Truncate to 15KB
        break;
      }
    } catch {
      // Invalid selector, continue
    }
  }

  // Capture client info section
  const clientSelectors = [
    '[data-test*="client"]',
    '[class*="client-info"]',
    '[class*="ClientInfo"]',
    ".client-info",
    '[data-test="about-client"]',
    '[class*="about-client"]',
  ];

  let clientSection: string | undefined;
  for (const sel of clientSelectors) {
    try {
      const section = document.querySelector(sel);
      if (section) {
        clientSection = section.outerHTML.slice(0, 10000); // Truncate to 10KB
        break;
      }
    } catch {
      // Invalid selector, continue
    }
  }

  // Build structure summary
  const allClasses = new Set<string>();
  const allDataAttrs = new Set<string>();

  document.querySelectorAll("*").forEach((el) => {
    if (el.className && typeof el.className === "string") {
      el.className.split(/\s+/).forEach((c) => {
        if (c && (c.includes("job") || c.includes("Job") || c.includes("client") || c.includes("Client"))) {
          allClasses.add(c);
        }
      });
    }
    const dataAttr = el.getAttribute("data-test") || el.getAttribute("data-qa");
    if (dataAttr) {
      allDataAttrs.add(dataAttr);
    }
  });

  const fullStructure = {
    title: document.title,
    jobCount: document.querySelectorAll('[data-test*="job"], [class*="job-tile"], [class*="JobTile"]').length,
    hasClientInfo: !!clientSection,
    hasJobCards: !!jobCardSample,
    uniqueDataAttrs: Array.from(allDataAttrs).slice(0, 100),
    uniqueClasses: Array.from(allClasses).slice(0, 100),
  };

  return {
    pageType,
    urlPattern,
    dataAttributes,
    jobCardSample,
    clientSection,
    fullStructure,
  };
}

// Track daily stats
let dailyStats = {
  jobsScrapedToday: 0,
  lastSyncedAt: null as string | null,
  connectsBalance: null as number | null,
  activeProposals: null as number | null,
};

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (req.type) {
      case "GET_STATUS":
        sendResponse({
          status: socket?.connected ? "CONNECTED" : "DISCONNECTED",
          authenticated: !!currentAuthToken,
          error: lastError,
          socketId: socket?.id,
          // Enhanced stats for popup
          connectsBalance: dailyStats.connectsBalance,
          activeProposals: dailyStats.activeProposals,
          lastSyncedAt: dailyStats.lastSyncedAt,
          jobsScrapedToday: dailyStats.jobsScrapedToday,
        });
        break;

      case "AUTH_TOKEN_FROM_DASHBOARD":
        // Token received from content script (auth-bridge)
        if (req.token) {
          console.log("[CAS] Received auth token from dashboard (via content script)");
          await storeToken(req.token);
          currentAuthToken = req.token;
          connectSocket(req.token);
          sendResponse({ success: true, status: "Token stored and connecting" });
        } else {
          sendResponse({ success: false, error: "No token provided" });
        }
        break;

      case "LOGOUT_FROM_DASHBOARD":
        // Logout received from content script
        console.log("[CAS] Received logout from dashboard (via content script)");
        await clearToken();
        currentAuthToken = null;
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        sendResponse({ success: true, status: "Logged out" });
        break;

      case "PING":
        const connected = await waitForConnection();
        if (connected && socket) {
          socket.emit("PING", { from: "Extension", time: Date.now() });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: lastError || "Not connected" });
        }
        break;

      case "SIMULATE_SCRAPE":
        const isConnected = await waitForConnection();
        if (isConnected && socket) {
          const mockJob = {
            platform: "LINKEDIN",
            title: "Software Engineer - AI Agents (Test Job)",
            description: "This is a test job from the extension popup.",
            url: "https://linkedin.com/jobs/view/test-" + Date.now(),
          };
          socket.emit("DATA_INGEST", mockJob);
          sendResponse({ success: true, job: mockJob });
        } else {
          sendResponse({ success: false, error: lastError || "Not connected" });
        }
        break;

      case "FORCE_RECONNECT":
        // Always request fresh token first, then connect
        console.log("[CAS] Force reconnect requested, requesting fresh token...");
        if (socket) {
          socket.disconnect();
        }
        // Clear old token and request fresh one
        await clearToken();
        currentAuthToken = null;
        lastError = "Requesting fresh token...";
        await requestFreshTokenFromDashboard();
        sendResponse({ success: true, message: "Fresh token requested - will reconnect automatically" });
        break;

      case "SCRAPE_CURRENT_PAGE":
        // Scrape jobs from the current active tab
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url?.includes("upwork.com")) {
            sendResponse({ success: false, error: "Not on Upwork" });
            break;
          }
          if (!tab.id) {
            sendResponse({ success: false, error: "No tab ID" });
            break;
          }

          const isSocketConnected = await waitForConnection();
          if (!isSocketConnected || !socket) {
            sendResponse({ success: false, error: "Not connected to server" });
            break;
          }

          // Inject and execute scraping script
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeJobsFromPageInjected,
          });

          const jobs = results[0]?.result || [];
          console.log(`[CAS] Scraped ${jobs.length} jobs from current page`);

          // Send jobs to server
          let successCount = 0;
          for (const job of jobs) {
            socket.emit("DATA_INGEST", {
              ...job,
              platform: "UPWORK",
            });
            successCount++;
          }

          // Update daily stats
          dailyStats.jobsScrapedToday += successCount;
          dailyStats.lastSyncedAt = new Date().toISOString();

          sendResponse({ success: true, jobCount: successCount });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error("[CAS] Scrape current page error:", errorMessage);
          sendResponse({ success: false, error: errorMessage });
        }
        break;

      case "SYNC_PROFILE":
        // Sync user profile data (connects balance, proposals, etc.)
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

          // Try to get stats from Upwork page
          if (tab?.url?.includes("upwork.com") && tab.id) {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: extractProfileStats,
            });

            const stats = results[0]?.result;
            if (stats) {
              dailyStats.connectsBalance = stats.connects ?? dailyStats.connectsBalance;
              dailyStats.activeProposals = stats.proposals ?? dailyStats.activeProposals;
              dailyStats.lastSyncedAt = new Date().toISOString();

              // Also send to server if connected
              if (socket?.connected) {
                socket.emit("PROFILE_UPDATE", {
                  connectsBalance: stats.connects,
                  activeProposals: stats.proposals,
                });
              }

              sendResponse({ success: true, stats });
            } else {
              sendResponse({ success: false, error: "Could not extract profile stats" });
            }
          } else {
            sendResponse({ success: false, error: "Not on Upwork - navigate to Upwork first" });
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error("[CAS] Profile sync error:", errorMessage);
          sendResponse({ success: false, error: errorMessage });
        }
        break;

      case "CAPTURE_DOM":
        // Capture DOM structure for selector development
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url?.includes("upwork.com")) {
            sendResponse({ success: false, error: "Not on Upwork" });
            break;
          }
          if (!tab.id) {
            sendResponse({ success: false, error: "No tab ID" });
            break;
          }

          const isSocketConnected = await waitForConnection();
          if (!isSocketConnected || !socket) {
            sendResponse({ success: false, error: "Not connected to server" });
            break;
          }

          // Inject and execute DOM capture script
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: captureDomStructureInjected,
          });

          const captureData = results[0]?.result as DomCaptureResult | undefined;
          if (!captureData) {
            sendResponse({ success: false, error: "Failed to capture DOM" });
            break;
          }

          console.log(`[CAS] DOM captured: ${captureData.pageType}, ${captureData.dataAttributes.length} data attrs`);

          // Send to server via Socket.io
          socket.emit("DOM_CAPTURE", {
            pageUrl: tab.url,
            pageType: captureData.pageType,
            urlPattern: captureData.urlPattern,
            platform: "UPWORK",
            dataAttributes: captureData.dataAttributes,
            jobCardSample: captureData.jobCardSample,
            clientSection: captureData.clientSection,
            fullStructure: captureData.fullStructure,
          });

          sendResponse({
            success: true,
            pageType: captureData.pageType,
            dataAttributeCount: captureData.dataAttributes.length,
          });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error("[CAS] DOM capture error:", errorMessage);
          sendResponse({ success: false, error: errorMessage });
        }
        break;

      default:
        sendResponse({ error: "Unknown message type" });
    }
  };

  handleAsync();
  return true; // Keep channel open for async response
});

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize socket connection on startup (if token exists)
initializeSocket();

// Set up keepalive alarm
setupKeepalive();

export { socket };
