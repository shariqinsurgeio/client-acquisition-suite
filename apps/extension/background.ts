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

// Rate limit state (based on Firecrawl analysis recommendations)
const RATE_LIMITS = {
  // Per-action delays (milliseconds) - 3s min per Firecrawl analysis
  minPageLoadDelay: 3000,      // Minimum 3 seconds between page loads
  maxPageLoadDelay: 5000,      // Max 5 seconds for natural variation
  minBetweenDetailPages: 4000, // Extra delay for detail page visits
  maxBetweenDetailPages: 7000,
  // Throughput limits (15 pages/min per Firecrawl analysis)
  maxPagesPerMinute: 15,       // Maximum pages to load per minute
  maxJobsPerSession: 50,
  maxPagesPerSource: 3,
  sessionCooldownMs: 300000,   // 5 min cooldown between full scrapes
  // Daily limits (account protection)
  maxJobsPerDay: 200,
  maxDetailVisitsPerDay: 30,
  // Anti-detection patterns
  humanLikeScrollDelay: 1500,  // Delay before scrolling after page load
  readTimePerJob: 800,         // Simulated reading time per job card
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
  // Search pages (with query params) need more time to load results
  const isSearchPage = sourceUrl.includes('/search/jobs');
  const loadWaitTime = isSearchPage ? 6000 : 4000;

  if (!existingTab) {
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    await chrome.tabs.update(tabId, { url: sourceUrl });
    console.log(`[CAS] Waiting ${loadWaitTime}ms for page load (search=${isSearchPage})...`);
    await new Promise(resolve => setTimeout(resolve, loadWaitTime));
  }

  // Inject GraphQL interceptor to capture any API calls during scrolling
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: setupGraphQLInterceptionInjected,
      world: "MAIN", // Run in page context to intercept fetch
    });
    console.log("[CAS] GraphQL interceptor injected");
  } catch (err) {
    console.warn("[CAS] Failed to inject GraphQL interceptor:", err);
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

  // Scroll to trigger lazy-loaded content (especially important for search pages)
  if (isSearchPage) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          console.log("[CAS] Scrolling to trigger lazy load...");
          window.scrollTo(0, 500);
          setTimeout(() => window.scrollTo(0, 0), 500);
        },
      });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for content to load
      console.log("[CAS] Scroll + wait complete for search page");
    } catch (err) {
      console.warn("[CAS] Scroll failed:", err);
    }
  }

  // Execute scraping script (using multi-strategy function for both page types)
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeJobsFromPageInjected,
    // No args needed - selectors are built into the function
  });

  const scrapeResult = results[0]?.result as ScrapeResult | undefined;

  if (!scrapeResult || !scrapeResult.jobs || scrapeResult.jobs.length === 0) {
    console.log(`[CAS] No jobs found at ${sourceUrl}`);
    return [];
  }

  // Retrieve any GraphQL captures made during page load/scrolling
  try {
    const gqlResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: getGraphQLCapturesInjected,
      world: "MAIN",
    });
    const captures = gqlResults[0]?.result as GraphQLCaptureResult[] | undefined;
    if (captures && captures.length > 0) {
      console.log(`[CAS] GraphQL captures: ${captures.length} operations`);
      captures.forEach(c => console.log(`  - ${c.operationName}: ${JSON.stringify(c.data).substring(0, 200)}...`));
    }
  } catch (err) {
    console.warn("[CAS] Failed to retrieve GraphQL captures:", err);
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

  // Job details
  jobType?: string;
  experienceLevel?: string;
  projectLength?: string;
  hoursPerWeek?: string;
  skillsRequired?: string[];

  // Job activity (NEW from Firecrawl analysis)
  proposalCount?: number;
  proposalTier?: string;
  interviewingCount?: number;
  invitesSent?: number;
  lastViewedByClient?: string;

  // Client info (enhanced from analysis)
  clientName?: string;
  clientLocation?: string;
  clientCountry?: string;
  clientMemberSince?: string;
  clientTotalSpent?: number;
  clientTotalHires?: number;
  clientActiveJobs?: number;
  clientAvgHourly?: number;
  clientTotalHours?: number;
  clientHireRate?: number;
  clientRating?: number;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number;

  // Meta
  connectsCost?: number;
  postedAgo?: string;
  hasExternalLinks?: boolean;
}

// Content script function to extract data from job detail page
function scrapeJobDetailPage(): JobDetailResult | null {
  const VERSION = "DETAIL-V5-2026-01-15";

  try {
    console.log(`[CAS Detail Scraper ${VERSION}] Running on:`, window.location.href);
    console.log(`[CAS Detail Scraper ${VERSION}] Document ready state:`, document.readyState);
    console.log(`[CAS Detail Scraper ${VERSION}] Body exists:`, !!document.body);
    console.log(`[CAS Detail Scraper ${VERSION}] Body text length:`, document.body?.innerText?.length || 0);

    // === VERIFIED SELECTORS FROM DOM CAPTURE ANALYSIS (Jan 15, 2026) ===
    // These are the EXACT data-test attributes found on live Upwork job detail pages
    const DETAIL_SELECTORS = {
      // Main content
      title: '[data-test="job-title"], h1.job-title, header h1, h1',
      description: '[data-test="Description"], .job-details-content, [data-test="job-description"]',

      // Job details sidebar
      budget: '[data-test="budget"], .budget-amount',
      projectLength: '[data-test="date"], [data-test="duration"]',  // "Jan 2026 - Jan 2026"
      experienceLevel: '[data-test="expertise"], [data-test="contractor-tier"]',
      hoursPerWeek: '[data-test="stats"]',
      jobType: '[data-test="fixed-price"], [data-test="stats"]',

      // Client card (VERIFIED from DOM capture - about-client-container)
      clientSection: '[data-test="about-client-container"], [data-test="about-client"], .client-info',
      clientName: '[data-test="client-name"]',
      clientLocation: '[data-test="client-location"]',  // "United Kingdom Carnassarie"
      clientMemberSince: '[data-test="client-contract-date"]',  // "Member since Nov 19, 2024"
      clientTotalSpent: '[data-test="client-spend"]',  // "$11K total spent"
      clientTotalHires: '[data-test="client-hires"]',  // "428 hires, 1 active"
      clientActiveJobs: '[data-test="client-job-posting-stats"]',  // "385 jobs posted, 92% hire rate, 19 open jobs"
      clientHireRate: '[data-test="client-job-posting-stats"]',  // Parse "92% hire rate" from this
      clientAvgHourlyPaid: '[data-test="client-hourly-rate"]',  // "$9.52 /hr avg hourly rate paid"
      clientTotalHours: '[data-test="client-hours"]',  // "150 hours"
      clientRating: '[data-test="buyer-rating"]',  // "Rating is 5.0 out of 5"
      paymentVerified: '[data-test="UpCVerifiedBadge"], [data-test="payment-verified"]',

      // Client work history
      workHistory: '[data-test="work-history-title"]',  // "Client's recent history (50)"

      // Activity metrics (may not be on detail page - more on job cards)
      proposals: '[data-test="proposals"], .proposals-count',
      interviewing: '[data-test="interviewing"]',
      invitesSent: '[data-test="invites-sent"]',
      lastViewed: '[data-test="last-viewed"]',

      // Skills
      skills: '[data-test="TokenClamp"] span, [data-test="skill"], [data-test="token"], .skill-badge',

      // Connects
      connects: '[data-test="connects-required"], [data-test="connects-to-apply"]',

      // Apply button (confirms job is active)
      applyButton: '[data-test="submit-proposal-button"]',

      // Posted time
      postedTime: '[data-test="posted-on"], [data-test="job-posted"], time',
    };

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
    const getText = (selectors: string[] | string): string => {
      const selectorList = Array.isArray(selectors) ? selectors : selectors.split(', ');
      for (const sel of selectorList) {
        try {
          const el = document.querySelector(sel.trim());
          if (el?.textContent?.trim()) {
            return el.textContent.trim();
          }
        } catch { /* invalid selector */ }
      }
      return "";
    };

    // Helper to get text from element within a parent
    const getTextIn = (parent: Element | null, selectors: string): string => {
      if (!parent) return "";
      const selectorList = selectors.split(', ');
      for (const sel of selectorList) {
        try {
          const el = parent.querySelector(sel.trim());
          if (el?.textContent?.trim()) {
            return el.textContent.trim();
          }
        } catch { /* invalid selector */ }
      }
      return "";
    };

    // Helper to parse money values (handles $50K+, $1M, etc.)
    const parseMoney = (text: string): number | undefined => {
      if (!text) return undefined;
      const match = text.match(/\$?\s*([\d,.]+)\s*([KMB])?/i);
      if (match) {
        let amount = parseFloat(match[1].replace(/,/g, ''));
        const suffix = match[2]?.toUpperCase();
        if (suffix === 'K') amount *= 1000;
        if (suffix === 'M') amount *= 1000000;
        if (suffix === 'B') amount *= 1000000000;
        return amount;
      }
      return undefined;
    };

    // Helper to parse percentage
    const parsePercent = (text: string): number | undefined => {
      const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
      return match ? parseFloat(match[1]) : undefined;
    };

    // Helper to parse integers
    const parseInt2 = (text: string): number | undefined => {
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    };

    // Extract title using verified selectors
    console.log(`[CAS Detail Scraper ${VERSION}] Extracting title...`);
    const title = getText(DETAIL_SELECTORS.title);
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

  // Extract budget using verified selectors
  const budgetText = getText(DETAIL_SELECTORS.budget);

  // Extract client info using verified selectors from Firecrawl analysis
  const clientSection = document.querySelector(DETAIL_SELECTORS.clientSection);

  let clientName = "";
  let clientLocation = "";
  let clientCountry = "";
  let clientMemberSince = "";
  let clientTotalSpent: number | undefined;
  let clientAvgHourly: number | undefined;
  let clientHireRate: number | undefined;
  let clientPaymentVerified = false;
  let clientReviewCount: number | undefined;
  let clientTotalHires: number | undefined;
  let clientActiveJobs: number | undefined;
  let clientTotalHours: number | undefined;
  let clientRating: number | undefined;

  if (clientSection) {
    const clientText = clientSection.textContent || "";

    // Client name (verified selector)
    clientName = getTextIn(clientSection, DETAIL_SELECTORS.clientName);

    // Location (verified selector)
    clientLocation = getTextIn(clientSection, DETAIL_SELECTORS.clientLocation);

    // Extract country from location
    const countries = ["United States", "USA", "US", "United Kingdom", "UK", "Canada", "Australia", "Germany", "India", "Pakistan", "Philippines", "Netherlands", "France", "Spain", "Italy", "Brazil"];
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

    // Member since (NEW - verified selector)
    clientMemberSince = getTextIn(clientSection, DETAIL_SELECTORS.clientMemberSince);

    // Total spent (verified selector)
    const spentText = getTextIn(clientSection, DETAIL_SELECTORS.clientTotalSpent) ||
                      clientText.match(/\$?([\d,]+(?:\.\d+)?[KMB]?)\s*(?:spent|total)/i)?.[0] || "";
    clientTotalSpent = parseMoney(spentText);

    // Total hires (NEW - verified selector)
    const hiresText = getTextIn(clientSection, DETAIL_SELECTORS.clientTotalHires);
    clientTotalHires = parseInt2(hiresText);

    // Active jobs (NEW - verified selector)
    const activeJobsText = getTextIn(clientSection, DETAIL_SELECTORS.clientActiveJobs);
    clientActiveJobs = parseInt2(activeJobsText);

    // Hire rate (verified selector)
    const hireRateText = getTextIn(clientSection, DETAIL_SELECTORS.clientHireRate) ||
                         clientText.match(/(\d+(?:\.\d+)?)\s*%?\s*hire\s*rate/i)?.[0] || "";
    clientHireRate = parsePercent(hireRateText);

    // Avg hourly paid (verified selector)
    const avgHourlyText = getTextIn(clientSection, DETAIL_SELECTORS.clientAvgHourlyPaid) ||
                          clientText.match(/\$?([\d.]+)\s*\/\s*hr/i)?.[0] || "";
    const hourlyMatch = avgHourlyText.match(/\$?([\d.]+)/);
    if (hourlyMatch) {
      clientAvgHourly = parseFloat(hourlyMatch[1]);
    }

    // Total hours (NEW - verified selector)
    const totalHoursText = getTextIn(clientSection, DETAIL_SELECTORS.clientTotalHours);
    clientTotalHours = parseInt2(totalHoursText);

    // Client rating (NEW - verified selector)
    const ratingText = getTextIn(clientSection, DETAIL_SELECTORS.clientRating);
    const ratingMatch = ratingText.match(/([\d.]+)/);
    if (ratingMatch) {
      clientRating = parseFloat(ratingMatch[1]);
    }

    // Payment verified (verified selector)
    clientPaymentVerified = !!clientSection.querySelector(DETAIL_SELECTORS.paymentVerified) ||
                           clientText.toLowerCase().includes("payment verified") ||
                           clientText.toLowerCase().includes("payment method verified");

    // Review count (from text pattern)
    const reviewMatch = clientText.match(/(\d+)\s*(?:reviews?|ratings?)/i);
    if (reviewMatch) {
      clientReviewCount = parseInt(reviewMatch[1], 10);
    }
  }

  // === Job Activity Metrics (NEW from Firecrawl analysis) ===
  const proposalText = getText(DETAIL_SELECTORS.proposals);
  const proposalCount = parseInt2(proposalText);
  const proposalTier = proposalText || undefined;

  const interviewingText = getText(DETAIL_SELECTORS.interviewing);
  const interviewingCount = parseInt2(interviewingText);

  const invitesSentText = getText(DETAIL_SELECTORS.invitesSent);
  const invitesSent = parseInt2(invitesSentText);

  const lastViewedByClient = getText(DETAIL_SELECTORS.lastViewed) || undefined;

  // Extract connects cost using verified selectors
  const connectsText = getText(DETAIL_SELECTORS.connects);
  let connectsCost: number | undefined;
  const connectsMatch = (connectsText || pageText).match(/(\d+)\s*connects/i);
  if (connectsMatch) {
    connectsCost = parseInt(connectsMatch[1], 10);
  }

  // Extract posted time using verified selectors
  const postedAgo = getText(DETAIL_SELECTORS.postedTime).replace(/posted\s*/i, "");

  // Check for external links
  const hasExternalLinks = /https?:\/\/[^\s]+/i.test(description) ||
                          /www\.[^\s]+/i.test(description) ||
                          /\.com|\.io|\.org|\.net/i.test(description);

  // Extract skills using verified selectors
  const skillElements = document.querySelectorAll(DETAIL_SELECTORS.skills);
  const skillsRequired = Array.from(skillElements)
    .map((el) => el.textContent?.trim())
    .filter((s): s is string => !!s && s.length < 50)
    .slice(0, 15);

  // Extract job type, experience level, project length using verified selectors
  const jobType = getText(DETAIL_SELECTORS.jobType);
  const experienceLevel = getText(DETAIL_SELECTORS.experienceLevel);
  const projectLength = getText(DETAIL_SELECTORS.projectLength);
  const hoursPerWeek = getText(DETAIL_SELECTORS.hoursPerWeek);

  console.log(`[CAS Detail Scraper ${VERSION}] Extracted:`, {
    title: title?.slice(0, 50),
    descLen: description?.length,
    clientName,
    clientLocation,
    clientCountry,
    clientTotalSpent,
    clientTotalHires,
    clientHireRate,
    clientPaymentVerified,
    proposalCount,
    interviewingCount,
    invitesSent,
    lastViewedByClient,
    postedAgo,
  });

  return {
    expired: false,
    title: title || undefined,
    description: description || undefined,
    budget: budgetText || undefined,
    // Job details
    jobType: jobType || undefined,
    experienceLevel: experienceLevel || undefined,
    projectLength: projectLength || undefined,
    hoursPerWeek: hoursPerWeek || undefined,
    skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
    // Job activity (NEW)
    proposalCount,
    proposalTier,
    interviewingCount,
    invitesSent,
    lastViewedByClient,
    // Client info (enhanced)
    clientName: clientName || undefined,
    clientLocation: clientLocation || undefined,
    clientCountry: clientCountry || undefined,
    clientMemberSince: clientMemberSince || undefined,
    clientTotalSpent,
    clientTotalHires,
    clientActiveJobs,
    clientAvgHourly,
    clientTotalHours,
    clientHireRate,
    clientRating,
    clientPaymentVerified,
    clientReviewCount,
    // Meta
    connectsCost,
    postedAgo: postedAgo || undefined,
    hasExternalLinks,
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
  // Extended job type with all fields from Firecrawl analysis
  interface ScrapedJob {
    title: string;
    description: string;
    url: string;
    // Job details
    jobType?: string;
    budget?: string;  // Server expects string like "$100" or "$30-$50/hr"
    budgetMin?: number;
    budgetMax?: number;
    experienceLevel?: string;
    projectLength?: string;
    hoursPerWeek?: string;
    skillsRequired?: string[];
    // Job activity
    proposalCount?: number;
    proposalTier?: string;
    // Client data
    clientName?: string;
    clientLocation?: string;
    clientCountry?: string;
    clientTotalSpent?: number;
    clientRating?: number;
    clientPaymentVerified?: boolean;
    // Meta
    connectsCost?: number;
    postedAgo?: string;
    hasExternalLinks?: boolean;
  }

  const jobs: ScrapedJob[] = [];

  // === VERIFIED SELECTORS FROM DOM CAPTURE ANALYSIS (Jan 15, 2026) ===
  // Two different page structures exist on Upwork:
  // Structure 1: /nx/search/jobs uses "JobTile" pattern (PascalCase)
  // Structure 2: /nx/find-work uses "job-tile-list" pattern (kebab-case)
  const SELECTORS = {
    // Job list container (both structures)
    jobList: '[data-test="JobsList"], [data-test="job-tile-list"], section.up-card-list',

    // Job card container (both structures)
    jobCard: '[data-test="JobTile"], [data-test="job-tile"], article.job-tile, .up-card-section',

    // Job title - MUST be actual title elements, NOT description
    // UpCLineClamp with JobTile is for truncated titles, h2/h3/h4 are fallback headers
    title: '[data-test="job-tile-title-link"], [data-test="UpCLineClamp JobTile"], .job-tile-title a, h2 a, h3 a, h4 a',

    // Job description
    description: '[data-test="job-description-text"], [data-test="UpCLineClamp JobDescription"], .job-tile-description',

    // Job type and budget - Structure 1 uses job-type-label, Structure 2 uses job-type
    jobType: '[data-test="job-type-label"], [data-test="job-type"], .job-type-label',
    budget: '[data-test="budget"], [data-test="is-fixed-price"], .budget-amount',
    hourlyRate: '[data-test="job-type-label"], [data-test="job-type"]',

    // Experience level - Structure 1 uses experience-level, Structure 2 uses contractor-tier
    experienceLevel: '[data-test="experience-level"], [data-test="contractor-tier"], .experience-level',

    // Project duration - Structure 1 uses duration-label, Structure 2 uses duration
    projectLength: '[data-test="duration-label"], [data-test="duration"], .duration',
    hoursPerWeek: '[data-test="duration-label"], [data-test="duration"]',

    // Skills - Structure 1 uses TokenClamp JobAttrs, Structure 2 uses attr-item
    skills: '[data-test="attr-item"], [data-test="TokenClamp JobAttrs"] span, [data-test="token"], .skill-badge, .air3-token',

    // Posted time - Structure 1 has typo "pubilshed", Structure 2 uses posted-on
    postedTime: '[data-test="job-pubilshed-date"], [data-test="posted-on"], .posted-time, time, small[data-test]',

    // Proposal count - Structure 1 uses JobInfoClientMore, Structure 2 uses proposals
    proposalCount: '[data-test="JobInfoClientMore"], [data-test="proposals"], [data-test="proposals-section"]',

    // Client info - Structure 2 has dedicated selectors
    clientLocation: '[data-test="client-country"], [data-test="client-location"], .client-location',
    clientSpent: '[data-test="client-spendings"], [data-test="client-spent"], .client-spent',
    clientRating: '[data-test="client-feedback"], [data-test="UpCTooltip"], .client-rating',
    paymentVerified: '[data-test="payment-verification-status"], [data-test="UpCVerifiedBadge"], .payment-verified',

    // Connects - Structure 2 uses connects-section
    connects: '[data-test="connects-section"], [data-test="connects"], .connects-amount',
  };

  // Helper: Get text from first matching selector
  function getText(parent: Element, selectorList: string): string {
    const selectors = selectorList.split(', ');
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      } catch {
        // Invalid selector, continue
      }
    }
    return '';
  }

  // Helper: Get href from first matching selector
  function getHref(parent: Element, selectorList: string): string {
    const selectors = selectorList.split(', ');
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel) as HTMLAnchorElement | null;
        if (el?.href) {
          return el.href;
        }
      } catch {
        // Invalid selector, continue
      }
    }
    return '';
  }

  // Helper: Check if element exists
  function hasElement(parent: Element, selectorList: string): boolean {
    const selectors = selectorList.split(', ');
    for (const sel of selectors) {
      try {
        if (parent.querySelector(sel)) return true;
      } catch {
        // Invalid selector, continue
      }
    }
    return false;
  }

  // Helper: Get all matching elements' text
  function getMultipleText(parent: Element, selectorList: string): string[] {
    const results: string[] = [];
    const selectors = selectorList.split(', ');
    for (const sel of selectors) {
      try {
        const elements = parent.querySelectorAll(sel);
        elements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && !results.includes(text)) {
            results.push(text);
          }
        });
      } catch {
        // Invalid selector, continue
      }
    }
    return results;
  }

  // Helper: Parse budget from text
  function parseBudget(text: string): { type: string; amount?: number; min?: number; max?: number } {
    if (!text) return { type: 'unknown' };

    // Fixed price: "$1,000" or "$500"
    const fixedMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    if (fixedMatch && !text.toLowerCase().includes('hr') && !text.includes('-')) {
      return {
        type: 'fixed',
        amount: parseFloat(fixedMatch[1].replace(/,/g, '')),
      };
    }

    // Hourly range: "$30.00 - $100.00" or "$30-$100/hr"
    const hourlyMatch = text.match(/\$\s*([\d.]+)\s*[-–]\s*\$?\s*([\d.]+)/);
    if (hourlyMatch) {
      return {
        type: 'hourly',
        min: parseFloat(hourlyMatch[1]),
        max: parseFloat(hourlyMatch[2]),
      };
    }

    return { type: 'unknown' };
  }

  // Helper: Parse proposal count
  function parseProposalCount(text: string): { count?: number; tier?: string } {
    if (!text) return {};

    // Exact number: "15 proposals"
    const exactMatch = text.match(/(\d+)\s*proposals?/i);
    if (exactMatch) {
      return { count: parseInt(exactMatch[1], 10), tier: text };
    }

    // Range: "10 to 15" or "Less than 5"
    if (text.toLowerCase().includes('less than')) {
      const match = text.match(/less than (\d+)/i);
      return { count: match ? parseInt(match[1], 10) - 1 : 5, tier: text };
    }

    const rangeMatch = text.match(/(\d+)\s*to\s*(\d+)/i);
    if (rangeMatch) {
      return { count: parseInt(rangeMatch[2], 10), tier: text };
    }

    return { tier: text };
  }

  // Helper: Parse client total spent
  function parseSpent(text: string): number | undefined {
    if (!text) return undefined;

    // "$50K+", "$100K", "$1M+"
    const match = text.match(/\$\s*([\d.]+)\s*([KMB])?/i);
    if (match) {
      let amount = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      if (suffix === 'K') amount *= 1000;
      if (suffix === 'M') amount *= 1000000;
      if (suffix === 'B') amount *= 1000000000;
      return amount;
    }
    return undefined;
  }

  // Find all job cards - two strategies depending on page structure
  let jobCards = document.querySelectorAll(SELECTORS.jobCard);
  console.log(`[CAS Scraper] Strategy 1 (data-test selectors): Found ${jobCards.length} job cards`);

  // Strategy 2: On find-work pages, job cards are plain divs inside job-tile-list
  // Each job has a job-save-button, so we can find cards by locating those buttons
  // and getting their parent containers
  if (jobCards.length === 0) {
    const jobTileList = document.querySelector('[data-test="job-tile-list"]');
    if (jobTileList) {
      console.log(`[CAS Scraper] Strategy 2: Found job-tile-list, looking for job containers...`);

      // Find all job-save-button elements (one per job)
      const saveButtons = jobTileList.querySelectorAll('[data-test="job-save-button"]');
      console.log(`[CAS Scraper] Found ${saveButtons.length} save buttons (one per job)`);

      // Get the parent article/section for each save button
      // The structure is typically: article > ... > button[data-test="job-save-button"]
      const cardSet = new Set<Element>();
      saveButtons.forEach(btn => {
        // Walk up to find the job container - usually an article or a direct child of job-tile-list
        let parent = btn.parentElement;
        while (parent && parent !== jobTileList) {
          // Check if this parent contains the key job elements
          if (parent.querySelector('[data-test="job-description-text"]') ||
              parent.querySelector('[data-test="UpCLineClamp JobDescription"]')) {
            cardSet.add(parent);
            break;
          }
          parent = parent.parentElement;
        }

        // Fallback: if we didn't find a container with description, use the article or first level child
        if (!cardSet.has(parent!) && btn.closest('article')) {
          cardSet.add(btn.closest('article')!);
        }
      });

      jobCards = Array.from(cardSet) as unknown as NodeListOf<Element>;
      console.log(`[CAS Scraper] Strategy 2 found ${jobCards.length} job containers`);
    }
  }

  // Strategy 3: Fallback - look for any element containing job-description-text
  if (jobCards.length === 0) {
    console.log(`[CAS Scraper] Strategy 3: Looking for any job-description-text containers...`);
    const descriptions = document.querySelectorAll('[data-test="job-description-text"]');
    const cardSet = new Set<Element>();
    descriptions.forEach(desc => {
      // Walk up to find a reasonable container (article, section, or div with multiple job elements)
      let parent = desc.parentElement;
      while (parent) {
        if (parent.tagName === 'ARTICLE' ||
            parent.tagName === 'SECTION' ||
            parent.classList.contains('up-card-section')) {
          cardSet.add(parent);
          break;
        }
        // Check if this is a job card by looking for multiple job-related elements
        const hasTitle = parent.querySelector('[data-test="job-description-text"], [data-test="job-tile-title-link"]');
        const hasSaveBtn = parent.querySelector('[data-test="job-save-button"]');
        if (hasTitle && hasSaveBtn) {
          cardSet.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });
    jobCards = Array.from(cardSet) as unknown as NodeListOf<Element>;
    console.log(`[CAS Scraper] Strategy 3 found ${jobCards.length} job containers`);
  }

  const jobCardArray = Array.from(jobCards);
  console.log(`[CAS Scraper] Total job cards to process: ${jobCardArray.length}`);

  jobCardArray.forEach((card, index) => {
    try {
      let title = getText(card, SELECTORS.title);
      const url = getHref(card, SELECTORS.title) || getHref(card, 'a[href*="/jobs/"]');
      const description = getText(card, SELECTORS.description).slice(0, 2000);

      // Validate title - should never be longer than 200 chars (description would be longer)
      // Also reject titles that look like descriptions (contain newlines or start with "About")
      if (title.length > 200 || title.includes('\n') || title.startsWith('About ')) {
        console.log(`[CAS Scraper] Card ${index}: title looks like description, trying URL`);
        // Try to extract title from URL: /jobs/Title-Here_~xxxxx or /jobs/Title-Here~xxxxx
        // Use lazy match to capture title part before _~ or ~ followed by job ID
        const urlMatch = url.match(/\/jobs\/(.+?)(?:_~|~)/);
        if (urlMatch) {
          title = urlMatch[1].replace(/-/g, ' ').replace(/_/g, ' ').trim();
        } else {
          title = title.slice(0, 150); // Last resort: truncate
        }
      }

      if (!title || !url) {
        console.log(`[CAS Scraper] Skipping card ${index}: missing title or url`);
        return;
      }

      // Parse job type and budget
      const jobTypeText = getText(card, SELECTORS.jobType);
      const budgetText = getText(card, SELECTORS.budget) || getText(card, SELECTORS.hourlyRate);
      const budgetParsed = parseBudget(budgetText);

      // Parse proposals
      const proposalText = getText(card, SELECTORS.proposalCount);
      const proposalParsed = parseProposalCount(proposalText);

      // Parse client spent
      const spentText = getText(card, SELECTORS.clientSpent);
      const clientTotalSpent = parseSpent(spentText);

      // Parse client rating
      let clientRating: number | undefined;
      const ratingText = getText(card, SELECTORS.clientRating);
      const ratingMatch = ratingText.match(/([\d.]+)/);
      if (ratingMatch) {
        clientRating = parseFloat(ratingMatch[1]);
      }

      // Parse connects
      let connectsCost = 16; // Default
      const connectsText = getText(card, SELECTORS.connects);
      const connectsMatch = connectsText.match(/(\d+)/);
      if (connectsMatch) {
        connectsCost = parseInt(connectsMatch[1], 10);
      }

      // Get skills
      const skillsRequired = getMultipleText(card, SELECTORS.skills).slice(0, 15);

      // Check for external links in description
      const hasExternalLinks = /https?:\/\/(?!upwork\.com)/i.test(description);

      // Build job object
      const job: ScrapedJob = {
        title,
        description,
        url,
        jobType: budgetParsed.type !== 'unknown' ? budgetParsed.type : (jobTypeText.toLowerCase().includes('hourly') ? 'hourly' : 'fixed'),
        budget: budgetText || (budgetParsed.amount ? `$${budgetParsed.amount}` : undefined),
        budgetMin: budgetParsed.min,
        budgetMax: budgetParsed.max,
        experienceLevel: getText(card, SELECTORS.experienceLevel).toLowerCase() || undefined,
        projectLength: getText(card, SELECTORS.projectLength) || undefined,
        hoursPerWeek: getText(card, SELECTORS.hoursPerWeek) || undefined,
        skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
        proposalCount: proposalParsed.count,
        proposalTier: proposalParsed.tier,
        clientLocation: getText(card, SELECTORS.clientLocation) || undefined,
        clientTotalSpent,
        clientRating,
        clientPaymentVerified: hasElement(card, SELECTORS.paymentVerified),
        connectsCost,
        postedAgo: getText(card, SELECTORS.postedTime) || undefined,
        hasExternalLinks,
      };

      jobs.push(job);
    } catch (err) {
      console.error(`[CAS Scraper] Error processing card ${index}:`, err);
    }
  });

  console.log(`[CAS Scraper] Successfully scraped ${jobs.length} jobs`);

  // Return in ScrapeResult format for compatibility
  return {
    jobs,
    debug: `VERSION:V4-MULTISTRATEGY|cards:${jobs.length}`,
    url: window.location.href,
    cardsFound: jobs.length,
    usedSelector: 'multi-strategy',
  };
}

// Extract profile stats from Upwork page (connects, proposals)
// === VERIFIED SELECTORS FROM DOM CAPTURE (profile-stats page, Jan 15, 2026) ===
function extractProfileStats() {
  const stats: { connects?: number; proposals?: number; earnings?: number; jobSuccess?: string } = {};

  // Try to find connects balance - VERIFIED: stats-connects-info = "Connects: 90"
  const connectsSelectors = [
    '[data-test="stats-connects-info"]',      // "Connects: 90"
    '[data-test="stats-connects-subheading"]', // "Connects: 90"
    '[data-test="stats-bottom-content"]',     // Contains connects info
    '[data-test="available-connects"]',
    '.connects-balance',
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

  // Try to find 12-month earnings - VERIFIED: stats-earnings-amount
  const earningsSelectors = [
    '[data-test="stats-earnings-amount"]',    // "$0" or actual amount
  ];

  for (const sel of earningsSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent) {
        const match = el.textContent.match(/\$?([\d,]+)/);
        if (match) {
          stats.earnings = parseFloat(match[1].replace(/,/g, ''));
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

// =============================================================================
// GRAPHQL INTERCEPTION FUNCTION (Captures API responses for richer data)
// Based on Firecrawl analysis: Upwork uses GraphQL at /api/graphql/v1
// =============================================================================

interface GraphQLCaptureResult {
  operationName: string;
  data: unknown;
  timestamp: string;
}

function setupGraphQLInterceptionInjected(): void {
  // Only set up once
  if ((window as unknown as { __CAS_GRAPHQL_INTERCEPTOR__?: boolean }).__CAS_GRAPHQL_INTERCEPTOR__) {
    console.log("[CAS GraphQL] Interceptor already set up");
    return;
  }
  (window as unknown as { __CAS_GRAPHQL_INTERCEPTOR__?: boolean }).__CAS_GRAPHQL_INTERCEPTOR__ = true;

  const captures: GraphQLCaptureResult[] = [];

  // Store original fetch
  const originalFetch = window.fetch;

  // Override fetch to intercept GraphQL requests
  window.fetch = async function(...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args);

    try {
      // Handle all fetch input types: string, URL, Request
      const url = typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof URL
          ? args[0].href
          : (args[0] as Request)?.url || '';

      // Check if this is a GraphQL request
      if (url.includes('/api/graphql') || url.includes('/graphql')) {
        const clone = response.clone();
        const data = await clone.json();

        // Extract operation name from request body
        let operationName = 'unknown';
        if (args[1]?.body) {
          try {
            const body = JSON.parse(args[1].body as string);
            operationName = body.operationName || body.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] || 'unknown';
          } catch { /* ignore parse errors */ }
        }

        const capture: GraphQLCaptureResult = {
          operationName,
          data,
          timestamp: new Date().toISOString(),
        };

        captures.push(capture);
        console.log(`[CAS GraphQL] Captured: ${operationName}`, data);

        // Store in sessionStorage for access by content script
        try {
          const existing = JSON.parse(sessionStorage.getItem('__CAS_GRAPHQL_CAPTURES__') || '[]');
          existing.push(capture);
          // Keep only last 20 captures
          while (existing.length > 20) existing.shift();
          sessionStorage.setItem('__CAS_GRAPHQL_CAPTURES__', JSON.stringify(existing));
        } catch { /* storage might be full */ }
      }
    } catch (err) {
      console.log("[CAS GraphQL] Error intercepting:", err);
    }

    return response;
  };

  console.log("[CAS GraphQL] Fetch interceptor installed");
}

// Function to retrieve captured GraphQL data (injected into page)
function getGraphQLCapturesInjected(): GraphQLCaptureResult[] {
  try {
    const captures = JSON.parse(sessionStorage.getItem('__CAS_GRAPHQL_CAPTURES__') || '[]');
    console.log(`[CAS GraphQL] Retrieved ${captures.length} captures`);
    return captures;
  } catch {
    return [];
  }
}

// =============================================================================
// INITIAL STATE EXTRACTION (Angular SSR hydration data)
// Angular apps embed initial state in script tags
// =============================================================================

interface InitialStateResult {
  found: boolean;
  stateType: string;
  jobs?: unknown[];
  user?: unknown;
  raw?: unknown;
}

function extractInitialStateInjected(): InitialStateResult {
  console.log("[CAS InitialState] Searching for embedded state...");

  const scripts = document.querySelectorAll('script:not([src])');
  let result: InitialStateResult = { found: false, stateType: 'none' };

  for (const script of scripts) {
    const content = script.textContent || '';

    // Pattern 1: window.__INITIAL_STATE__
    if (content.includes('__INITIAL_STATE__')) {
      try {
        const match = content.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          const state = JSON.parse(match[1]);
          console.log("[CAS InitialState] Found __INITIAL_STATE__:", Object.keys(state));
          result = {
            found: true,
            stateType: '__INITIAL_STATE__',
            raw: state,
            jobs: state.jobs || state.searchResults || state.data?.jobs,
            user: state.user || state.viewer || state.currentUser,
          };
          break;
        }
      } catch (e) {
        console.log("[CAS InitialState] Error parsing __INITIAL_STATE__:", e);
      }
    }

    // Pattern 2: __APOLLO_STATE__ (GraphQL cache)
    if (content.includes('__APOLLO_STATE__')) {
      try {
        const match = content.match(/__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          const state = JSON.parse(match[1]);
          console.log("[CAS InitialState] Found __APOLLO_STATE__:", Object.keys(state).slice(0, 10));
          result = {
            found: true,
            stateType: '__APOLLO_STATE__',
            raw: state,
          };
          break;
        }
      } catch (e) {
        console.log("[CAS InitialState] Error parsing __APOLLO_STATE__:", e);
      }
    }

    // Pattern 3: Angular TransferState
    if (content.includes('TransferState') || content.includes('ngh')) {
      try {
        // Look for JSON in script#transfer-state
        const transferScript = document.getElementById('transfer-state') ||
                              document.querySelector('script[id*="transfer"]');
        if (transferScript?.textContent) {
          const state = JSON.parse(transferScript.textContent);
          console.log("[CAS InitialState] Found TransferState");
          result = {
            found: true,
            stateType: 'TransferState',
            raw: state,
          };
          break;
        }
      } catch (e) {
        console.log("[CAS InitialState] Error parsing TransferState:", e);
      }
    }
  }

  console.log("[CAS InitialState] Result:", result.found ? result.stateType : 'not found');
  return result;
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
  | "best-matches"             // /nx/find-work/best-matches (alternative feed)
  | "job-detail"               // /jobs/~01xxxxx
  | "job-detail-apply"         // /nx/proposals/job/~ID/apply/
  | "profile-stats"            // /nx/my-stats/
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

  // Job Application Page (must check before proposals - /nx/proposals/job/~ID/apply/)
  if (pathname.includes("/proposals/job/") && pathname.includes("/apply")) {
    pageType = "job-detail-apply";
    urlPattern = "/nx/proposals/job/~ID/apply";
  }
  // Job Detail Pages (/jobs/~ID or /jobs/~ID/apply)
  else if (pathname.includes("/jobs/") && pathname.includes("~")) {
    if (pathname.includes("/apply")) {
      pageType = "job-detail-apply";
      urlPattern = "/jobs/~ID/apply";
    } else {
      pageType = "job-detail";
      urlPattern = "/jobs/~ID";
    }
  }
  // Profile Stats Page (/nx/my-stats/)
  else if (pathname.includes("/nx/my-stats") || pathname.includes("/my-stats")) {
    pageType = "profile-stats";
    urlPattern = "/nx/my-stats";
  }
  // Job List Pages - various types
  else if (pathname.includes("/nx/search/jobs") || pathname.includes("/search/jobs")) {
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
  // Best Matches Feed (/nx/find-work/best-matches or /ab/find-work/best-matches)
  else if (pathname.includes("/find-work/best-matches") || pathname.includes("/ab/find-work") || pathname.includes("/nx/find-work")) {
    pageType = "best-matches";
    urlPattern = "/nx/find-work/best-matches";
  }
  // Profile/Settings Pages (legacy URLs)
  else if (pathname.includes("/freelancers/")) {
    if (pathname.includes("/my-stats") || pathname.includes("/stats")) {
      pageType = "profile-stats";
      urlPattern = "/freelancers/settings/my-stats";
    } else if (pathname.includes("/settings")) {
      pageType = "profile-settings";
      urlPattern = "/freelancers/settings/*";
    }
  }
  // Proposals Page (/nx/proposals/ but NOT /nx/proposals/job/~ID/apply)
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

          const scrapeResult = results[0]?.result;
          // Handle both array format (old) and ScrapeResult format (new)
          const jobs = Array.isArray(scrapeResult) ? scrapeResult : (scrapeResult?.jobs || []);
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
