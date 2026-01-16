import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { verifyToken } from "@clerk/backend";

// =============================================================================
// CONFIGURATION
// =============================================================================

const dev = process.env.NODE_ENV !== "production";
const hostname = dev ? "localhost" : "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// Allowed origins for CORS - restrict to known sources
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // Production URL (set via env var)
  process.env.NEXT_PUBLIC_APP_URL,
  // Chrome extension origins use chrome-extension:// protocol
  // The extension ID will be validated separately via Socket auth
].filter(Boolean) as string[];

// =============================================================================
// VALIDATION SCHEMAS (Zod)
// =============================================================================

const PlatformEnum = z.enum(["UPWORK", "LINKEDIN", "FIVERR", "FREELANCER", "UNKNOWN"]);

const ExtensionConnectSchema = z.object({
  extensionId: z.string().min(1),
});

const DataIngestSchema = z.object({
  platform: PlatformEnum.default("UNKNOWN"),
  title: z.string().min(1).default("No Title"), // No max - scraped titles can be long
  description: z.string().default(""), // No max - descriptions can be very long
  url: z.string().url(),
  budget: z.string().optional(),
  skills: z.array(z.string()).optional(),
  // Sherlock Fields (Client Intelligence)
  clientName: z.string().max(200).optional().nullable(),
  clientLocation: z.string().max(200).optional().nullable(),
  clientCountry: z.string().max(100).optional().nullable(),
  clientTotalSpent: z.number().optional().nullable(),
  clientAvgHourly: z.number().optional().nullable(),
  clientHireRate: z.number().optional().nullable(),
  clientPaymentVerified: z.boolean().optional(),
  clientReviewCount: z.number().optional().nullable(),
  // Job Metadata
  connectsCost: z.number().optional().nullable(),
  postedAgo: z.string().max(100).optional().nullable(),
  hasExternalLinks: z.boolean().optional(),
  skillsRequired: z.array(z.string()).optional().nullable(),
  jobType: z.string().max(50).optional().nullable(),
  experienceLevel: z.string().max(100).optional().nullable(),
  projectLength: z.string().max(100).optional().nullable(),
  // Refresh flag - indicates this is a refresh of existing job data
  isRefresh: z.boolean().optional(),
});

const CmdExecuteSchema = z.object({
  action: z.enum(["SCRAPE", "SCRAPE_ALL", "APPLY", "REFRESH_JOBS", "ENRICH_JOBS"]),
  platform: PlatformEnum,
  targetUrl: z.string().url().optional(),
  jobUrls: z.array(z.string().url()).optional(), // For REFRESH_JOBS and ENRICH_JOBS
  data: z.record(z.string(), z.unknown()).optional(),
  // Multi-source scraping options
  scrapeMode: z.enum(["all", "best-matches", "most-recent", "search"]).optional(),
  searchKeywords: z.array(z.string()).optional(), // For SCRAPE_ALL - array of keywords
});

// Discovery Complete - jobs found from multi-source scraping
const DiscoveryCompleteSchema = z.object({
  jobs: z.array(z.object({
    url: z.string().url(),
    title: z.string().default("No Title"), // No max - some scraped "titles" include extra text
    description: z.string().default(""), // No max - descriptions can be very long
    platform: PlatformEnum.default("UPWORK"),
    // Sherlock Fields from list page
    clientName: z.string().max(200).optional().nullable(),
    clientLocation: z.string().max(200).optional().nullable(),
    clientCountry: z.string().max(100).optional().nullable(),
    clientTotalSpent: z.number().optional().nullable(),
    clientAvgHourly: z.number().optional().nullable(),
    clientHireRate: z.number().optional().nullable(),
    clientPaymentVerified: z.boolean().optional(),
    clientReviewCount: z.number().optional().nullable(),
    connectsCost: z.number().optional().nullable(),
    postedAgo: z.string().max(100).optional().nullable(),
    hasExternalLinks: z.boolean().optional(),
    skillsRequired: z.array(z.string()).optional().nullable(),
  })),
  sourceCount: z.number(),
});

// Contract schema for client work history
const ClientContractSchema = z.object({
  title: z.string().max(500),
  freelancerName: z.string().max(100).optional().nullable(),
  dateRange: z.string().max(100).optional().nullable(),
  hours: z.number().optional().nullable(),
  hourlyRate: z.number().optional().nullable(),
  billedAmount: z.number().optional().nullable(),
  rating: z.number().min(0).max(5).optional().nullable(),
  feedbackText: z.string().max(500).optional().nullable(),
});

// Other open jobs by the same client
const ClientOtherJobSchema = z.object({
  title: z.string().max(500),
  type: z.string().max(50).optional().nullable(),
  url: z.string().max(500), // Not requiring strict URL - Upwork URLs can be relative
});

// Enrichment Complete - jobs enriched with full descriptions
const EnrichmentCompleteSchema = z.object({
  enrichedJobs: z.array(z.object({
    url: z.string().url(),
    fullDescription: z.string().max(100000), // Increased from 20000 - some descriptions are very long
    // Additional data from detail page
    skillsRequired: z.array(z.string()).optional().nullable(),
    hasExternalLinks: z.boolean().optional(),
    jobType: z.string().max(50).optional().nullable(),
    experienceLevel: z.string().max(100).optional().nullable(),
    projectLength: z.string().max(100).optional().nullable(),
    // Client data from detail page (all fields from About the Client section)
    clientName: z.string().max(200).optional().nullable(),
    clientLocation: z.string().max(200).optional().nullable(),
    clientCity: z.string().max(100).optional().nullable(),
    clientCountry: z.string().max(100).optional().nullable(),
    clientLocalTime: z.string().max(50).optional().nullable(),
    clientMemberSince: z.string().max(100).optional().nullable(),
    clientTotalSpent: z.number().optional().nullable(),
    clientJobsPosted: z.number().optional().nullable(),
    clientTotalHires: z.number().optional().nullable(),
    clientActiveFreelancers: z.number().optional().nullable(),
    clientActiveJobs: z.number().optional().nullable(),
    clientAvgHourly: z.number().optional().nullable(),
    clientTotalHours: z.number().optional().nullable(),
    clientHireRate: z.number().optional().nullable(),
    clientRating: z.number().optional().nullable(),
    clientPaymentVerified: z.boolean().optional(),
    clientPhoneVerified: z.boolean().optional(),
    clientReviewCount: z.number().optional().nullable(),
    // Job activity metrics (NEW)
    proposalCount: z.number().optional().nullable(),
    proposalTier: z.string().max(50).optional().nullable(),
    interviewingCount: z.number().optional().nullable(),
    invitesSent: z.number().optional().nullable(),
    lastViewedByClient: z.string().max(100).optional().nullable(),
    connectsCost: z.number().optional().nullable(),
    postedAgo: z.string().max(100).optional().nullable(),
    // NEW: Job specifications
    projectType: z.string().max(50).optional().nullable(),
    toolsRequired: z.array(z.string()).optional().nullable(),
    unansweredInvites: z.number().optional().nullable(),
    budget: z.number().optional().nullable(),
    budgetMin: z.number().optional().nullable(),
    budgetMax: z.number().optional().nullable(),
    hoursPerWeek: z.string().max(100).optional().nullable(),
    // NEW: Client history & other jobs
    clientHistoryCount: z.number().optional().nullable(),
    clientRecentContracts: z.array(ClientContractSchema).max(100).optional().nullable(),
    clientOtherJobsCount: z.number().optional().nullable(),
    clientOtherJobs: z.array(ClientOtherJobSchema).max(20).optional().nullable(),
  })),
  totalRequested: z.number(),
});

const TaskUpdateSchema = z.object({
  jobId: z.string().optional(),
  jobUrl: z.string().optional(), // For JOB_EXPIRED status
  status: z.enum(["COMPLETED", "ERROR", "IN_PROGRESS", "JOB_EXPIRED"]),
  error: z.string().optional(),
  scraped: z.number().optional(),
  expired: z.number().optional(), // Count of expired jobs
  failed: z.number().optional(), // Count of failed jobs
  message: z.string().optional(),
});

const ScrapeProgressSchema = z.object({
  current: z.number(),
  status: z.string(),
});

// Anti-detection - SCRAPE_BLOCKED event from extension
const ScrapeBlockedSchema = z.object({
  signal: z.string(), // Detection signal type (cloudflareChallenge, captchaPresent, etc.)
  timestamp: z.string(), // ISO timestamp
  action: z.enum(["STOPPED", "COOLDOWN_STARTED"]),
  cooldownMinutes: z.number().optional(),
  dailyCounters: z.object({
    date: z.string(),
    jobsScraped: z.number(),
    detailPagesVisited: z.number(),
    sourcesScraped: z.number(),
    blocksDetected: z.number(),
  }).optional(),
});

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type Platform = z.infer<typeof PlatformEnum>;

interface ServerToClientEvents {
  STATUS_UPDATE: (data: { status: string }) => void;
  JOB_UPDATE: (job: JobPayload) => void;
  TASK_UPDATE: (data: TaskUpdatePayload) => void;
  CMD_EXECUTE: (data: CmdExecutePayload) => void;
  DATA_ACK: (data: { url: string; isNew: boolean; jobId: string }) => void;
  ERROR: (data: { message: string; url?: string }) => void;
  SCRAPE_PROGRESS: (data: { current: number; status: string; stage?: string; jobCount?: number; enrichCount?: number }) => void;
  JOBS_DISCOVERED: (data: { total: number; qualifying: number }) => void;
  JOB_ENRICHED: (data: { jobId: string; url: string; score: MultiScore; isShortlisted: boolean }) => void;
  JOB_SHORTLISTED: (data: { jobId: string; title: string; score: MultiScore; message: string }) => void;
  SCRAPE_BLOCKED: (data: { signal: string; timestamp: string; action: string; cooldownMinutes?: number; message?: string; dailyCounters?: { jobsScraped: number; detailPagesVisited: number; blocksDetected: number } }) => void;
  DOM_CAPTURED: (data: { id: string; pageType: string; dataAttributeCount: number; capturedAt: Date }) => void;
}

interface ClientToServerEvents {
  EXTENSION_CONNECT: (data: { extensionId: string }) => void;
  DATA_INGEST: (data: DataIngestPayload) => void;
  CMD_EXECUTE: (data: CmdExecutePayload) => void;
  TASK_UPDATE: (data: TaskUpdatePayload) => void;
  SCRAPE_PROGRESS: (data: { current: number; status: string; stage?: string; jobCount?: number; enrichCount?: number }) => void;
  PING: (data: { from: string; time: number }) => void;
  DISCOVERY_COMPLETE: (data: z.infer<typeof DiscoveryCompleteSchema>) => void;
  ENRICHMENT_COMPLETE: (data: z.infer<typeof EnrichmentCompleteSchema>) => void;
  CHECK_JOB_URLS: (data: { urls: string[] }, callback: (response: { newUrls: string[]; existingUrls: string[] }) => void) => void;
  SCRAPE_BLOCKED: (data: { signal: string; dailyCounters?: { jobsScraped: number; detailPagesVisited: number; blocksDetected: number } }) => void;
  DOM_CAPTURE: (data: { pageUrl: string; pageType: string; dataAttributes: Array<{ selector: string; attributes: Record<string, string>; innerText?: string }>; urlPattern?: string; platform?: string; jobCardSample?: string; clientSection?: string; fullStructure?: unknown }) => void;
}

interface JobPayload {
  id: string;
  platform: string;
  title: string;
  description: string;
  url: string;
  status: string;
  fitScore: number | null;
  createdAt: Date;
}

interface DataIngestPayload {
  platform: Platform;
  title: string;
  description: string;
  url: string;
  budget?: string;
  skills?: string[];
  // Sherlock Fields
  clientName?: string | null;
  clientLocation?: string | null;
  clientCountry?: string | null;
  clientTotalSpent?: number | null;
  clientAvgHourly?: number | null;
  clientHireRate?: number | null;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number | null;
  // Job Metadata
  connectsCost?: number | null;
  postedAgo?: string | null;
  hasExternalLinks?: boolean;
  skillsRequired?: string[] | null;
  jobType?: string | null;
  experienceLevel?: string | null;
  projectLength?: string | null;
}

interface CmdExecutePayload {
  action: "SCRAPE" | "SCRAPE_ALL" | "APPLY" | "REFRESH_JOBS" | "ENRICH_JOBS";
  platform: Platform;
  targetUrl?: string;
  jobUrls?: string[];
  searchKeywords?: string[];
  data?: Record<string, unknown>;
}

interface TaskUpdatePayload {
  jobId?: string;
  jobUrl?: string;
  status: "COMPLETED" | "ERROR" | "IN_PROGRESS" | "JOB_EXPIRED" | "BLOCKED";
  error?: string;
  scraped?: number;
  expired?: number;
  failed?: number;
  message?: string;
}

// Socket data interface
interface SocketData {
  userId?: string;
  isExtension?: boolean;
  extensionId?: string;
}

// Track authenticated extension sockets
const authenticatedExtensions = new Set<string>();

// =============================================================================
// FIT SCORING (Enhanced with Sherlock Intelligence)
// =============================================================================

interface ScoringRules {
  positiveKeywords: string[];
  negativeKeywords: string[];
  minBudget?: number;
}

interface SherlockData {
  clientTotalSpent?: number | null;
  clientHireRate?: number | null;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number | null;
  connectsCost?: number | null;
  hasExternalLinks?: boolean;
  clientCountry?: string | null;
  postedAgo?: string | null;  // For competition scoring based on job freshness
}

// Big Five high-value countries
const BIG_FIVE_COUNTRIES = [
  "united states", "usa", "us",
  "united kingdom", "uk",
  "canada",
  "australia",
  "germany"
];

// Default scoring rules - can be made configurable later
const DEFAULT_SCORING_RULES: ScoringRules = {
  positiveKeywords: [
    "ai", "artificial intelligence", "machine learning", "ml", "llm",
    "gpt", "chatgpt", "claude", "automation", "genai", "generative ai",
    "python", "typescript", "react", "next.js", "node",
    "api", "integration", "saas", "startup", "mvp",
    "long-term", "ongoing", "retainer"
  ],
  negativeKeywords: [
    "unpaid", "volunteer", "intern", "internship", "free",
    "equity only", "exposure", "for experience",
    "data entry", "copy paste", "simple task"
  ],
  minBudget: 500,
};

function calculateFitScore(
  title: string,
  description: string,
  budget?: string,
  rules: ScoringRules = DEFAULT_SCORING_RULES,
  sherlock?: SherlockData
): number {
  let score = 50; // Base score
  const text = `${title} ${description}`.toLowerCase();

  // Positive keyword matching
  for (const keyword of rules.positiveKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      score += 8;
    }
  }

  // Negative keyword matching (heavier penalty)
  for (const keyword of rules.negativeKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      score -= 20;
    }
  }

  // Budget parsing and scoring
  if (budget) {
    const budgetMatch = budget.match(/\$?([\d,]+)/);
    if (budgetMatch) {
      const budgetNum = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
      if (rules.minBudget && budgetNum < rules.minBudget) {
        score -= 15;
      } else if (budgetNum >= 1000) {
        score += 15;
      } else if (budgetNum >= 500) {
        score += 5;
      }
    }
  }

  // === SHERLOCK INTELLIGENCE SCORING ===
  if (sherlock) {
    // Client Quality Score (Payment Verified = Trust Signal)
    if (sherlock.clientPaymentVerified) {
      score += 10;
    }

    // Client Total Spent (Higher = More Serious)
    if (sherlock.clientTotalSpent !== null && sherlock.clientTotalSpent !== undefined) {
      if (sherlock.clientTotalSpent >= 10000) {
        score += 15; // High spender
      } else if (sherlock.clientTotalSpent >= 1000) {
        score += 8; // Moderate spender
      } else if (sherlock.clientTotalSpent >= 100) {
        score += 3; // New-ish client
      } else {
        score -= 5; // Brand new, higher risk
      }
    }

    // Client Hire Rate (Higher = Better Conversion)
    if (sherlock.clientHireRate !== null && sherlock.clientHireRate !== undefined) {
      if (sherlock.clientHireRate >= 50) {
        score += 10; // Great hire rate
      } else if (sherlock.clientHireRate >= 25) {
        score += 5; // Decent hire rate
      } else if (sherlock.clientHireRate < 10) {
        score -= 5; // Low hire rate (tire kicker?)
      }
    }

    // Client Review Count (More = Established)
    if (sherlock.clientReviewCount !== null && sherlock.clientReviewCount !== undefined) {
      if (sherlock.clientReviewCount >= 10) {
        score += 5;
      } else if (sherlock.clientReviewCount >= 5) {
        score += 2;
      }
    }

    // Big Five Country Bonus
    if (sherlock.clientCountry) {
      const countryLower = sherlock.clientCountry.toLowerCase();
      if (BIG_FIVE_COUNTRIES.includes(countryLower)) {
        score += 8;
      }
    }

    // External Links = Audit Opportunity
    if (sherlock.hasExternalLinks) {
      score += 5; // Can offer free audit
    }

    // Connects Cost ROI (Lower cost = Better ROI)
    if (sherlock.connectsCost !== null && sherlock.connectsCost !== undefined) {
      if (sherlock.connectsCost <= 4) {
        score += 5; // Low competition
      } else if (sherlock.connectsCost >= 16) {
        score -= 5; // High competition / expensive
      }
    }
  }

  // Clamp between 0-100
  return Math.max(0, Math.min(100, score));
}

// =============================================================================
// MULTI-FACTOR SCORING (Phase 2)
// =============================================================================

interface MultiScore {
  overall: number;         // 0-100, primary score (same as winLikelihood)
  relevance: number;       // 0-100, keyword/skill match
  clientQuality: number;   // 0-100, client reliability
  competition: number;     // 0-100, inverse of difficulty (higher = easier)
  winLikelihood: number;   // 0-100, predicted success rate
}

/**
 * Calculate multi-factor score breakdown for a job.
 * This provides more granular insights than the single fitScore.
 */
function calculateMultiScore(
  title: string,
  description: string,
  budget?: string,
  sherlock?: SherlockData
): MultiScore {
  const text = `${title} ${description}`.toLowerCase();

  // ==========================================================================
  // 1. RELEVANCE SCORE (0-100) - How well does this job match user's expertise?
  // ==========================================================================
  let relevance = 50; // Base

  const positiveKeywords = [
    "ai", "artificial intelligence", "machine learning", "ml", "llm",
    "gpt", "chatgpt", "claude", "automation", "genai", "generative ai",
    "python", "typescript", "react", "next.js", "node", "n8n",
    "api", "integration", "saas", "startup", "mvp", "scraping", "bot",
    "long-term", "ongoing", "retainer"
  ];

  const negativeKeywords = [
    "unpaid", "volunteer", "intern", "internship", "free",
    "equity only", "exposure", "for experience",
    "data entry", "copy paste", "simple task"
  ];

  // Positive keyword matching
  let positiveMatches = 0;
  for (const keyword of positiveKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      positiveMatches++;
      relevance += 5;
    }
  }

  // Negative keyword matching
  for (const keyword of negativeKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      relevance -= 15;
    }
  }

  relevance = Math.max(0, Math.min(100, relevance));

  // ==========================================================================
  // 2. CLIENT QUALITY SCORE (0-100) - How reliable is this client?
  // ==========================================================================
  let clientQuality = 50; // Base - unknown client

  if (sherlock) {
    // Payment Verified = Trust Signal (+15)
    if (sherlock.clientPaymentVerified) {
      clientQuality += 15;
    } else {
      clientQuality -= 10; // Unverified is a red flag
    }

    // Total Spent (Higher = More Serious)
    if (sherlock.clientTotalSpent !== null && sherlock.clientTotalSpent !== undefined) {
      if (sherlock.clientTotalSpent >= 50000) {
        clientQuality += 25; // Enterprise client
      } else if (sherlock.clientTotalSpent >= 10000) {
        clientQuality += 18; // High spender
      } else if (sherlock.clientTotalSpent >= 1000) {
        clientQuality += 10; // Moderate spender
      } else if (sherlock.clientTotalSpent >= 100) {
        clientQuality += 2; // New-ish client
      } else {
        clientQuality -= 10; // Brand new, higher risk
      }
    }

    // Hire Rate (Higher = Better Conversion)
    if (sherlock.clientHireRate !== null && sherlock.clientHireRate !== undefined) {
      if (sherlock.clientHireRate >= 70) {
        clientQuality += 15; // Excellent hire rate
      } else if (sherlock.clientHireRate >= 50) {
        clientQuality += 10; // Great hire rate
      } else if (sherlock.clientHireRate >= 25) {
        clientQuality += 5; // Decent hire rate
      } else if (sherlock.clientHireRate < 10) {
        clientQuality -= 10; // Low hire rate (tire kicker)
      }
    }

    // Big Five Country Bonus
    if (sherlock.clientCountry) {
      const countryLower = sherlock.clientCountry.toLowerCase();
      if (BIG_FIVE_COUNTRIES.includes(countryLower)) {
        clientQuality += 8;
      }
    }

    // Review Count (Established = Better)
    if (sherlock.clientReviewCount !== null && sherlock.clientReviewCount !== undefined) {
      if (sherlock.clientReviewCount >= 20) {
        clientQuality += 8;
      } else if (sherlock.clientReviewCount >= 10) {
        clientQuality += 5;
      } else if (sherlock.clientReviewCount >= 3) {
        clientQuality += 2;
      }
    }
  }

  clientQuality = Math.max(0, Math.min(100, clientQuality));

  // ==========================================================================
  // 3. COMPETITION SCORE (0-100) - Lower competition = higher score
  // ==========================================================================
  let competition = 70; // Base - assume moderate competition

  if (sherlock) {
    // Connects Cost (Lower = Less Competition)
    if (sherlock.connectsCost !== null && sherlock.connectsCost !== undefined) {
      if (sherlock.connectsCost <= 4) {
        competition = 90; // Very low competition
      } else if (sherlock.connectsCost <= 6) {
        competition = 80; // Low competition
      } else if (sherlock.connectsCost <= 10) {
        competition = 65; // Moderate competition
      } else if (sherlock.connectsCost <= 16) {
        competition = 45; // High competition
      } else {
        competition = 25; // Very high competition
      }
    }

    // Recent posting = less competition
    if (sherlock.postedAgo) {
      const ago = sherlock.postedAgo.toLowerCase();
      if (ago.includes("minute") || ago.includes("just now")) {
        competition += 15; // Brand new job
      } else if (ago.includes("hour") && !ago.includes("hours")) {
        competition += 10; // Within an hour
      } else if (ago.includes("hours")) {
        const hours = parseInt(ago, 10);
        if (hours <= 3) competition += 5;
      }
    }
  }

  competition = Math.max(0, Math.min(100, competition));

  // ==========================================================================
  // 4. WIN LIKELIHOOD (Weighted Combination)
  // ==========================================================================
  // Weights: ClientQuality (40%) + Relevance (35%) + Competition (25%)
  const winLikelihood = Math.round(
    clientQuality * 0.4 +
    relevance * 0.35 +
    competition * 0.25
  );

  return {
    overall: winLikelihood,
    relevance,
    clientQuality,
    competition,
    winLikelihood,
  };
}

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", req.url, err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  // Initialize Socket.io with typed events and restricted CORS
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.) in dev
        if (!origin && dev) {
          return callback(null, true);
        }

        // Allow localhost origins
        if (origin && (
          ALLOWED_ORIGINS.includes(origin) ||
          origin.startsWith("chrome-extension://") ||
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1")
        )) {
          return callback(null, true);
        }

        console.warn(`Blocked CORS request from: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // =============================================================================
  // SOCKET.IO AUTH MIDDLEWARE
  // =============================================================================

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;

    // In development, allow connections without token for testing
    if (dev && !token) {
      console.log(`[Socket] Dev mode: allowing unauthenticated connection`);
      socket.data.userId = "dev-user"; // Fallback for dev
      return next();
    }

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (!secretKey) {
        console.error("[Socket] CLERK_SECRET_KEY not configured");
        return next(new Error("Server configuration error"));
      }

      const verified = await verifyToken(token, { secretKey });
      socket.data.userId = verified.sub;
      console.log(`[Socket] Authenticated user: ${verified.sub}`);
      next();
    } catch (err) {
      console.warn(`[Socket] Token verification failed:`, err);
      next(new Error("Invalid token"));
    }
  });

  // =============================================================================
  // GLOBAL SCRAPE OPERATION TRACKING (per user)
  // =============================================================================
  interface UserScrapeState {
    operationId: string | null;
    jobsNewCount: number;
    jobsUpdatedCount: number;
    jobIds: string[]; // Track job IDs for History view
  }
  const userScrapeStates = new Map<string, UserScrapeState>();

  function getUserScrapeState(userId: string): UserScrapeState {
    if (!userScrapeStates.has(userId)) {
      userScrapeStates.set(userId, { operationId: null, jobsNewCount: 0, jobsUpdatedCount: 0, jobIds: [] });
    }
    return userScrapeStates.get(userId)!;
  }

  // =============================================================================
  // SOCKET.IO CONNECTION HANDLER
  // =============================================================================

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
    const userId = socket.data.userId;
    console.log(`[Socket] Client connected: ${socket.id} (userId: ${userId})`);

    // Join user-specific room for targeted broadcasts
    if (userId) {
      socket.join(`user:${userId}`);
    }

    let isExtension = false;
    let extensionId = "";

    // -------------------------------------------------------------------------
    // EXTENSION_CONNECT - Authentication
    // -------------------------------------------------------------------------
    socket.on("EXTENSION_CONNECT", (data) => {
      const result = ExtensionConnectSchema.safeParse(data);

      if (!result.success) {
        console.warn(`[Socket] Invalid EXTENSION_CONNECT payload:`, result.error.flatten());
        socket.emit("ERROR", { message: "Invalid extension connect payload" });
        return;
      }

      extensionId = result.data.extensionId;
      isExtension = true;
      authenticatedExtensions.add(socket.id);

      console.log(`[Socket] Extension authenticated: ${extensionId}`);
      socket.emit("STATUS_UPDATE", { status: "CONNECTED" });

      // Broadcast to dashboard that extension is online
      socket.broadcast.emit("STATUS_UPDATE", { status: "EXTENSION_ONLINE" });
    });

    // -------------------------------------------------------------------------
    // DATA_INGEST - Receive scraped jobs from extension
    // -------------------------------------------------------------------------
    socket.on("DATA_INGEST", async (data) => {
      // Require authenticated user
      if (!userId) {
        socket.emit("ERROR", { message: "Authentication required", url: data?.url });
        return;
      }

      // Validate payload
      const result = DataIngestSchema.safeParse(data);

      if (!result.success) {
        console.warn(`[Socket] Invalid DATA_INGEST payload:`, result.error.flatten());
        socket.emit("ERROR", { message: "Invalid job data", url: data?.url });
        return;
      }

      const validData = result.data;
      console.log(`[Socket] Data ingest (user: ${userId}): ${validData.title.substring(0, 50)}...`);

      try {
        // Check for existing job by URL for this user
        const existing = await prisma.job.findUnique({
          where: { userId_url: { userId, url: validData.url } },
        });

        let job;
        let isNew = false;

        // Calculate fit score with Sherlock intelligence
        const sherlockData: SherlockData = {
          clientTotalSpent: validData.clientTotalSpent,
          clientHireRate: validData.clientHireRate,
          clientPaymentVerified: validData.clientPaymentVerified,
          clientReviewCount: validData.clientReviewCount,
          connectsCost: validData.connectsCost,
          hasExternalLinks: validData.hasExternalLinks,
          clientCountry: validData.clientCountry,
          postedAgo: validData.postedAgo, // For competition scoring
        };

        // Calculate legacy fit score for backwards compatibility
        const fitScore = calculateFitScore(
          validData.title,
          validData.description,
          validData.budget,
          DEFAULT_SCORING_RULES,
          sherlockData
        );

        // Calculate multi-score breakdown (Phase 2)
        const multiScore = calculateMultiScore(
          validData.title,
          validData.description,
          validData.budget,
          sherlockData
        );

        // Fetch user settings for auto-shortlist threshold (Phase 3)
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId },
          select: { autoShortlistEnabled: true, autoShortlistThreshold: true },
        });
        const autoShortlistEnabled = userSettings?.autoShortlistEnabled ?? true;
        const AUTO_SHORTLIST_THRESHOLD = userSettings?.autoShortlistThreshold ?? 80;
        const shouldAutoShortlist = autoShortlistEnabled && multiScore.winLikelihood >= AUTO_SHORTLIST_THRESHOLD;

        // Prepare job data with all Sherlock fields + multi-score
        const jobData = {
          title: validData.title,
          description: validData.description,
          fitScore,
          // Multi-score breakdown (Phase 2)
          scoreRelevance: multiScore.relevance,
          scoreClientQuality: multiScore.clientQuality,
          scoreCompetition: multiScore.competition,
          scoreWinLikelihood: multiScore.winLikelihood,
          // Sherlock Fields (Client Intelligence)
          clientName: validData.clientName ?? null,
          clientLocation: validData.clientLocation ?? null,
          clientCountry: validData.clientCountry ?? null,
          clientTotalSpent: validData.clientTotalSpent ?? null,
          clientAvgHourly: validData.clientAvgHourly ?? null,
          clientHireRate: validData.clientHireRate ?? null,
          clientPaymentVerified: validData.clientPaymentVerified ?? false,
          clientReviewCount: validData.clientReviewCount ?? null,
          // Job Metadata
          connectsCost: validData.connectsCost ?? null,
          postedAgo: validData.postedAgo ?? null,
          hasExternalLinks: validData.hasExternalLinks ?? false,
          keywordsFound: validData.skillsRequired ? JSON.stringify(validData.skillsRequired) : null,
        };

        if (existing) {
          // Update existing job with all fields + lastRefreshedAt
          // Don't override shortlist if it was manually set
          const shortlistData = shouldAutoShortlist && !existing.isShortlisted
            ? { isShortlisted: true, shortlistedAt: new Date() }
            : {};

          job = await prisma.job.update({
            where: { id: existing.id },
            data: {
              ...jobData,
              ...shortlistData,
              lastRefreshedAt: new Date(), // Track when job data was last refreshed
            },
          });
          console.log(`[DB] Updated/refreshed job: ${job.id} (winLikelihood: ${multiScore.winLikelihood}, shortlisted: ${job.isShortlisted})`);
        } else {
          // Create new job with all fields + auto-shortlist
          job = await prisma.job.create({
            data: {
              userId,
              platform: validData.platform,
              url: validData.url,
              status: "NEW",
              ...jobData,
              // Auto-shortlist (Phase 3)
              isShortlisted: shouldAutoShortlist,
              shortlistedAt: shouldAutoShortlist ? new Date() : null,
            },
          });
          isNew = true;
          console.log(`[DB] Created job: ${job.id} for user ${userId} (winLikelihood: ${multiScore.winLikelihood}, shortlisted: ${job.isShortlisted})`);
        }

        // Track job counts and IDs for scrape operation (using global per-user state)
        if (userId) {
          const scrapeState = getUserScrapeState(userId);
          if (scrapeState.operationId) {
            if (isNew) {
              scrapeState.jobsNewCount++;
            } else {
              scrapeState.jobsUpdatedCount++;
            }
            // Always track the job ID (both new and updated jobs)
            scrapeState.jobIds.push(job.id);
          }
        }

        // Only broadcast new jobs to user's dashboard
        if (isNew) {
          io.to(`user:${userId}`).emit("JOB_UPDATE", job);
          console.log(`[Socket] Emitted JOB_UPDATE for ${job.id} to user:${userId}`);

          // Notify about auto-shortlisted high-potential jobs (Phase 3)
          if (shouldAutoShortlist) {
            io.to(`user:${userId}`).emit("JOB_SHORTLISTED", {
              jobId: job.id,
              title: job.title,
              score: multiScore,
              message: `High-potential job auto-shortlisted (${multiScore.winLikelihood}% match)`,
            });
            console.log(`[Socket] Emitted JOB_SHORTLISTED for ${job.id} (score: ${multiScore.winLikelihood})`);
          }
        }

        // Acknowledge to extension
        socket.emit("DATA_ACK", { url: validData.url, isNew, jobId: job.id });
      } catch (err) {
        console.error("[DB] Failed to save job:", err);
        socket.emit("ERROR", { message: "Failed to save job", url: validData.url });
      }
    });

    // -------------------------------------------------------------------------
    // CHECK_JOB_URLS - Check which job URLs are new vs existing for enrichment
    // -------------------------------------------------------------------------
    socket.on("CHECK_JOB_URLS", async (data: { urls: string[] }, callback: (response: { newUrls: string[]; existingUrls: string[] }) => void) => {
      if (!userId) {
        callback({ newUrls: [], existingUrls: data?.urls || [] });
        return;
      }

      const urls = data?.urls || [];
      if (urls.length === 0) {
        callback({ newUrls: [], existingUrls: [] });
        return;
      }

      try {
        // Query DB for existing jobs by URL for this user
        const existingJobs = await prisma.job.findMany({
          where: {
            userId,
            url: { in: urls },
          },
          select: { url: true },
        });

        const existingUrlSet = new Set(existingJobs.map((j) => j.url));
        const newUrls = urls.filter((url) => !existingUrlSet.has(url));
        const existingUrls = urls.filter((url) => existingUrlSet.has(url));

        console.log(`[Socket] CHECK_JOB_URLS: ${newUrls.length} new, ${existingUrls.length} existing`);
        callback({ newUrls, existingUrls });
      } catch (err) {
        console.error("[Socket] CHECK_JOB_URLS error:", err);
        callback({ newUrls: [], existingUrls: urls });
      }
    });

    // -------------------------------------------------------------------------
    // CMD_EXECUTE - Forward commands from dashboard to extension
    // -------------------------------------------------------------------------
    socket.on("CMD_EXECUTE", async (data) => {
      if (!userId) {
        socket.emit("ERROR", { message: "Authentication required" });
        return;
      }

      const result = CmdExecuteSchema.safeParse(data);

      if (!result.success) {
        console.warn(`[Socket] Invalid CMD_EXECUTE payload:`, result.error.flatten());
        socket.emit("ERROR", { message: "Invalid command payload" });
        return;
      }

      console.log(`[Socket] CMD_EXECUTE (user: ${userId}): ${result.data.action} on ${result.data.platform}`);

      // Handle REFRESH_JOBS action - refresh existing jobs with fresh data
      if (result.data.action === "REFRESH_JOBS" && userId) {
        try {
          // Get all jobs that need refreshing (older than 1 hour or never refreshed)
          const staleThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
          const jobsToRefresh = await prisma.job.findMany({
            where: {
              userId,
              status: { in: ["NEW", "APPLIED", "INTERVIEWING"] }, // Only active jobs
              OR: [
                { lastRefreshedAt: null },
                { lastRefreshedAt: { lt: staleThreshold } },
              ],
            },
            select: { url: true },
            take: 50, // Limit to 50 jobs per refresh
          });

          const jobUrls = jobsToRefresh.map((j) => j.url);
          console.log(`[Socket] REFRESH_JOBS: Found ${jobUrls.length} jobs to refresh`);

          if (jobUrls.length > 0) {
            // Send refresh command to extension with job URLs
            io.to(`user:${userId}`).emit("CMD_EXECUTE", {
              ...result.data,
              jobUrls,
            });
          } else {
            socket.emit("TASK_UPDATE", {
              status: "COMPLETED",
              message: "All jobs are up to date",
              scraped: 0,
            });
          }
        } catch (err) {
          console.error("[Socket] REFRESH_JOBS error:", err);
          socket.emit("ERROR", { message: "Failed to get jobs for refresh" });
        }
        return;
      }

      // Handle SCRAPE_ALL - fetch user's search keywords and forward to extension
      if (result.data.action === "SCRAPE_ALL" && userId) {
        try {
          // Fetch user's search keywords from settings
          const settings = await prisma.userSettings.findUnique({
            where: { userId },
            select: { searchKeywords: true },
          });

          const keywords = settings?.searchKeywords
            ? JSON.parse(settings.searchKeywords)
            : ["AI", "generative AI", "AI automation", "n8n"]; // defaults

          console.log(`[Socket] SCRAPE_ALL: Using keywords: ${keywords.join(", ")}`);

          // Reset scrape state for tracking
          const scrapeState = getUserScrapeState(userId);
          scrapeState.jobsNewCount = 0;
          scrapeState.jobsUpdatedCount = 0;
          scrapeState.jobIds = [];

          // Create scrape operation record
          const scrapeOp = await prisma.scrapeOperation.create({
            data: {
              userId,
              platform: result.data.platform || "UPWORK",
              status: "RUNNING",
              logs: JSON.stringify([{
                timestamp: new Date().toISOString(),
                message: `Discovery scrape initiated with keywords: ${keywords.join(", ")}`,
              }]),
            },
          });
          scrapeState.operationId = scrapeOp.id;
          console.log(`[DB] Created scrape operation: ${scrapeOp.id}`);

          // Forward to extension with keywords
          io.to(`user:${userId}`).emit("CMD_EXECUTE", {
            ...result.data,
            searchKeywords: keywords,
          });
        } catch (err) {
          console.error("[Socket] SCRAPE_ALL error:", err);
          socket.emit("ERROR", { message: "Failed to fetch search keywords" });
        }
        return;
      }

      // Create scrape operation record when scrape starts
      if (result.data.action === "SCRAPE" && userId) {
        // Reset counters and job IDs using global per-user state
        const scrapeState = getUserScrapeState(userId);
        scrapeState.jobsNewCount = 0;
        scrapeState.jobsUpdatedCount = 0;
        scrapeState.jobIds = [];

        try {
          const scrapeOp = await prisma.scrapeOperation.create({
            data: {
              userId,
              platform: result.data.platform || "UPWORK",
              targetUrl: result.data.targetUrl,
              status: "RUNNING",
              logs: JSON.stringify([{
                timestamp: new Date().toISOString(),
                message: `Scrape initiated for ${result.data.platform}`,
              }]),
            },
          });
          scrapeState.operationId = scrapeOp.id;
          console.log(`[DB] Created scrape operation: ${scrapeOp.id}`);
        } catch (err) {
          console.error("[DB] Failed to create scrape operation:", err);
        }
      }

      // Send command only to user's devices (dashboard + extension)
      io.to(`user:${userId}`).emit("CMD_EXECUTE", result.data);
    });

    // -------------------------------------------------------------------------
    // TASK_UPDATE - Receive task status from extension
    // -------------------------------------------------------------------------
    socket.on("TASK_UPDATE", async (data) => {
      const result = TaskUpdateSchema.safeParse(data);

      if (!result.success) {
        console.warn(`[Socket] Invalid TASK_UPDATE payload:`, result.error.flatten());
        return;
      }

      const validData = result.data;
      console.log(`[Socket] Task update (user: ${userId}): ${validData.status}`, validData);

      // Update job status if jobId provided and user is authenticated
      if (validData.jobId && validData.status && userId) {
        try {
          // Verify ownership before update
          const job = await prisma.job.findFirst({
            where: { id: validData.jobId, userId },
          });
          if (job) {
            await prisma.job.update({
              where: { id: validData.jobId },
              data: { status: validData.status },
            });
          }
        } catch (err) {
          console.error("[DB] Failed to update job status:", err);
        }
      }

      // Handle JOB_EXPIRED status - mark job as expired/removed from platform
      if (validData.status === "JOB_EXPIRED" && validData.jobUrl && userId) {
        try {
          const expiredJob = await prisma.job.findUnique({
            where: { userId_url: { userId, url: validData.jobUrl } },
          });
          if (expiredJob) {
            await prisma.job.update({
              where: { id: expiredJob.id },
              data: {
                status: "EXPIRED",
                lastRefreshedAt: new Date(),
              },
            });
            console.log(`[DB] Marked job as EXPIRED: ${expiredJob.id}`);

            // Broadcast to clients that this job is expired
            io.to(`user:${userId}`).emit("JOB_UPDATE", {
              ...expiredJob,
              status: "EXPIRED",
            });
          }
        } catch (err) {
          console.error("[DB] Failed to mark job as expired:", err);
        }
      }

      // Complete/fail scrape operation when task finishes (using global per-user state)
      if (userId) {
        const scrapeState = getUserScrapeState(userId);

        if (scrapeState.operationId) {
          const isComplete = validData.status === "COMPLETED";
          const isError = validData.status === "ERROR";

          if (isComplete || isError) {
            try {
              const existing = await prisma.scrapeOperation.findUnique({
                where: { id: scrapeState.operationId },
              });

              if (existing) {
                const existingLogs = existing.logs ? JSON.parse(existing.logs) : [];
                existingLogs.push({
                  timestamp: new Date().toISOString(),
                  message: isComplete
                    ? `Scrape completed: ${validData.scraped || 0} jobs found`
                    : `Scrape failed: ${validData.error || "Unknown error"}`,
                });

                await prisma.scrapeOperation.update({
                  where: { id: scrapeState.operationId },
                  data: {
                    status: isComplete ? "COMPLETED" : "FAILED",
                    jobsFound: validData.scraped || scrapeState.jobsNewCount + scrapeState.jobsUpdatedCount,
                    jobsNew: scrapeState.jobsNewCount,
                    jobsUpdated: scrapeState.jobsUpdatedCount,
                    completedAt: new Date(),
                    durationMs: Date.now() - existing.startedAt.getTime(),
                    errorMessage: isError ? validData.error : null,
                    logs: JSON.stringify(existingLogs),
                    jobIds: JSON.stringify(scrapeState.jobIds), // Store collected job IDs for History view
                  },
                });

                console.log(`[DB] Updated scrape operation ${scrapeState.operationId}: ${isComplete ? "COMPLETED" : "FAILED"} (${scrapeState.jobIds.length} jobs)`);
              }

              // Reset state
              scrapeState.operationId = null;
              scrapeState.jobsNewCount = 0;
              scrapeState.jobsUpdatedCount = 0;
              scrapeState.jobIds = [];
            } catch (err) {
              console.error("[DB] Failed to update scrape operation:", err);
            }
          }
        }
      }

      // Broadcast to user's dashboard only
      if (userId) {
        io.to(`user:${userId}`).emit("TASK_UPDATE", validData);
      }
    });

    // -------------------------------------------------------------------------
    // SCRAPE_PROGRESS - Real-time scraping progress from extension
    // -------------------------------------------------------------------------
    socket.on("SCRAPE_PROGRESS", (data) => {
      console.log(`[Socket] SCRAPE_PROGRESS from extension:`, data);
      const result = ScrapeProgressSchema.safeParse(data);

      if (!result.success) {
        console.log(`[Socket] SCRAPE_PROGRESS validation failed:`, result.error.flatten());
        return; // Silently ignore invalid progress updates
      }

      // Broadcast to user's dashboard only
      if (userId) {
        io.to(`user:${userId}`).emit("SCRAPE_PROGRESS", result.data);
      }
    });

    // -------------------------------------------------------------------------
    // SCRAPE_BLOCKED - Anti-detection alert from extension
    // -------------------------------------------------------------------------
    socket.on("SCRAPE_BLOCKED", async (data) => {
      console.warn(`[Socket] ⚠️ SCRAPE_BLOCKED from extension:`, data);
      const result = ScrapeBlockedSchema.safeParse(data);

      if (!result.success) {
        console.log(`[Socket] SCRAPE_BLOCKED validation failed:`, result.error.flatten());
        return;
      }

      const { signal, timestamp, action, cooldownMinutes, dailyCounters } = result.data;

      // Log the detection event
      console.warn(`[Socket] DETECTION ALERT: ${signal} at ${timestamp}`);
      console.warn(`[Socket] Action: ${action}, Cooldown: ${cooldownMinutes || 0} minutes`);

      if (dailyCounters) {
        console.warn(`[Socket] Daily stats before block: ${dailyCounters.jobsScraped} jobs, ${dailyCounters.detailPagesVisited} detail pages, ${dailyCounters.blocksDetected} blocks`);
      }

      // Broadcast to user's dashboard so they see the alert
      if (userId) {
        io.to(`user:${userId}`).emit("SCRAPE_BLOCKED", {
          signal,
          timestamp,
          action,
          cooldownMinutes,
          dailyCounters,
          message: action === "COOLDOWN_STARTED"
            ? `⚠️ Bot detection triggered (${signal}). Scraping paused for ${cooldownMinutes} minutes.`
            : `⚠️ Bot detection triggered (${signal}). Scraping stopped.`,
        });
      }

      // TODO: Store in DailyUsage table when implemented (Phase 0.5)
    });

    // -------------------------------------------------------------------------
    // DOM_CAPTURE - Receive DOM structure captures for selector development
    // -------------------------------------------------------------------------
    socket.on("DOM_CAPTURE", async (data) => {
      if (!userId) {
        socket.emit("ERROR", { message: "Authentication required" });
        return;
      }

      console.log(`[Socket] DOM_CAPTURE from extension: ${data.pageType}`);

      try {
        // Validate basic fields
        if (!data.pageUrl || !data.pageType || !data.dataAttributes) {
          console.warn("[Socket] Invalid DOM_CAPTURE payload - missing required fields");
          socket.emit("ERROR", { message: "Invalid DOM capture data" });
          return;
        }

        // Store in database
        const capture = await prisma.domCapture.create({
          data: {
            userId,
            pageUrl: data.pageUrl,
            pageType: data.pageType,
            urlPattern: data.urlPattern || null,
            platform: data.platform || "UPWORK",
            dataAttributes: JSON.stringify(data.dataAttributes),
            jobCardSample: data.jobCardSample?.slice(0, 50000), // Limit size
            clientSection: data.clientSection?.slice(0, 30000),
            fullStructure: data.fullStructure ? JSON.stringify(data.fullStructure) : null,
          },
        });

        console.log(`[DB] Created DOM capture ${capture.id} for page type: ${data.pageType}`);
        console.log(`[DB] Data attributes count: ${data.dataAttributes.length}`);

        // Notify the dashboard
        io.to(`user:${userId}`).emit("DOM_CAPTURED", {
          id: capture.id,
          pageType: data.pageType,
          dataAttributeCount: data.dataAttributes.length,
          capturedAt: capture.capturedAt,
        });
      } catch (err) {
        console.error("[Socket] Failed to store DOM capture:", err);
        socket.emit("ERROR", { message: "Failed to save DOM capture" });
      }
    });

    // -------------------------------------------------------------------------
    // DISCOVERY_COMPLETE - Process jobs from multi-source discovery
    // -------------------------------------------------------------------------
    socket.on("DISCOVERY_COMPLETE", async (data) => {
      if (!userId) {
        socket.emit("ERROR", { message: "Authentication required" });
        return;
      }

      const result = DiscoveryCompleteSchema.safeParse(data);
      if (!result.success) {
        console.warn(`[Socket] Invalid DISCOVERY_COMPLETE payload:`, result.error.flatten());
        socket.emit("ERROR", { message: "Invalid discovery data" });
        return;
      }

      const { jobs, sourceCount } = result.data;
      console.log(`[Socket] DISCOVERY_COMPLETE: ${jobs.length} jobs from ${sourceCount} sources`);

      // Fetch user settings for thresholds
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { enrichmentThreshold: true, autoShortlistEnabled: true, autoShortlistThreshold: true },
      });
      const PRE_SHORTLIST_THRESHOLD = userSettings?.enrichmentThreshold ?? 70;
      console.log(`[Socket] Using enrichment threshold: ${PRE_SHORTLIST_THRESHOLD}% for user ${userId}`);

      const qualifyingJobs: { url: string; jobId: string }[] = [];
      let newCount = 0;
      let existingCount = 0;

      // Process each discovered job
      for (const job of jobs) {
        try {
          // Check if job exists
          const existing = await prisma.job.findUnique({
            where: { userId_url: { userId, url: job.url } },
          });

          // Calculate initial score with limited info (Pass 1)
          const sherlockData: SherlockData = {
            clientTotalSpent: job.clientTotalSpent,
            clientHireRate: job.clientHireRate,
            clientPaymentVerified: job.clientPaymentVerified,
            clientReviewCount: job.clientReviewCount,
            connectsCost: job.connectsCost,
            hasExternalLinks: job.hasExternalLinks,
            clientCountry: job.clientCountry,
            postedAgo: job.postedAgo,
          };

          const multiScore = calculateMultiScore(
            job.title,
            job.description,
            undefined, // No budget from list page
            sherlockData
          );

          const qualifies = multiScore.winLikelihood >= PRE_SHORTLIST_THRESHOLD;

          // Job data to save
          const jobData = {
            title: job.title,
            description: job.description,
            fitScore: multiScore.winLikelihood, // Legacy score
            scoreRelevance: multiScore.relevance,
            scoreClientQuality: multiScore.clientQuality,
            scoreCompetition: multiScore.competition,
            scoreWinLikelihood: multiScore.winLikelihood,
            clientName: job.clientName ?? null,
            clientLocation: job.clientLocation ?? null,
            clientCountry: job.clientCountry ?? null,
            clientTotalSpent: job.clientTotalSpent ?? null,
            clientAvgHourly: job.clientAvgHourly ?? null,
            clientHireRate: job.clientHireRate ?? null,
            clientPaymentVerified: job.clientPaymentVerified ?? false,
            clientReviewCount: job.clientReviewCount ?? null,
            connectsCost: job.connectsCost ?? null,
            postedAgo: job.postedAgo ?? null,
            hasExternalLinks: job.hasExternalLinks ?? false,
            keywordsFound: job.skillsRequired ? JSON.stringify(job.skillsRequired) : null,
            needsEnrichment: qualifies, // Mark for enrichment
          };

          let savedJob;
          if (existing) {
            // Update existing - preserve shortlist status
            savedJob = await prisma.job.update({
              where: { id: existing.id },
              data: {
                ...jobData,
                needsEnrichment: qualifies && !existing.enrichedAt, // Don't re-enrich if already enriched
              },
            });
            existingCount++;
          } else {
            // Create new job
            savedJob = await prisma.job.create({
              data: {
                userId,
                platform: job.platform || "UPWORK",
                url: job.url,
                status: "NEW",
                ...jobData,
              },
            });
            newCount++;

            // Emit JOB_UPDATE for new jobs
            io.to(`user:${userId}`).emit("JOB_UPDATE", savedJob);
          }

          // Track qualifying jobs for enrichment
          if (qualifies && savedJob.needsEnrichment) {
            qualifyingJobs.push({ url: job.url, jobId: savedJob.id });
          }

          // Track in scrape state
          const scrapeState = getUserScrapeState(userId);
          if (scrapeState.operationId) {
            scrapeState.jobIds.push(savedJob.id);
            if (existing) {
              scrapeState.jobsUpdatedCount++;
            } else {
              scrapeState.jobsNewCount++;
            }
          }
        } catch (err) {
          console.error(`[DB] Failed to save discovered job ${job.url}:`, err);
        }
      }

      console.log(`[Socket] Discovery processed: ${newCount} new, ${existingCount} existing, ${qualifyingJobs.length} qualifying for enrichment`);

      // Broadcast discovery complete to UI
      io.to(`user:${userId}`).emit("JOBS_DISCOVERED", {
        total: jobs.length,
        qualifying: qualifyingJobs.length,
      });

      // Queue enrichment for qualifying jobs (respect daily limit)
      const MAX_ENRICHMENT_PER_RUN = 100;  // Increased from 30
      const toEnrich = qualifyingJobs.slice(0, MAX_ENRICHMENT_PER_RUN).map(j => j.url);

      if (toEnrich.length > 0) {
        console.log(`[Socket] Queueing ${toEnrich.length} jobs for enrichment`);

        // Emit command to extension to enrich these jobs
        io.to(`user:${userId}`).emit("CMD_EXECUTE", {
          action: "ENRICH_JOBS",
          platform: "UPWORK",
          jobUrls: toEnrich,
        });
      } else {
        // No enrichment needed, complete the operation
        // Update ScrapeOperation directly (not via TASK_UPDATE which doesn't loop back)
        const scrapeState = getUserScrapeState(userId);
        if (scrapeState.operationId) {
          try {
            const existing = await prisma.scrapeOperation.findUnique({
              where: { id: scrapeState.operationId },
            });

            if (existing) {
              const existingLogs = existing.logs ? JSON.parse(existing.logs) : [];
              existingLogs.push({
                timestamp: new Date().toISOString(),
                message: `Discovery completed: ${jobs.length} jobs found (${newCount} new, ${existingCount} updated)`,
              });

              await prisma.scrapeOperation.update({
                where: { id: scrapeState.operationId },
                data: {
                  status: "COMPLETED",
                  jobsFound: jobs.length,
                  jobsNew: newCount,
                  jobsUpdated: existingCount,
                  completedAt: new Date(),
                  durationMs: Date.now() - existing.startedAt.getTime(),
                  logs: JSON.stringify(existingLogs),
                  jobIds: JSON.stringify(scrapeState.jobIds),
                },
              });

              console.log(`[DB] Completed scrape operation ${scrapeState.operationId}: ${jobs.length} jobs (${newCount} new, ${existingCount} updated)`);
            }

            // Reset state
            scrapeState.operationId = null;
            scrapeState.jobsNewCount = 0;
            scrapeState.jobsUpdatedCount = 0;
            scrapeState.jobIds = [];
          } catch (err) {
            console.error("[DB] Failed to complete scrape operation:", err);
          }
        }

        io.to(`user:${userId}`).emit("TASK_UPDATE", {
          status: "COMPLETED",
          message: `Discovered ${jobs.length} jobs (${qualifyingJobs.length} qualify, none need enrichment)`,
          scraped: jobs.length,
        });
      }
    });

    // -------------------------------------------------------------------------
    // ENRICHMENT_COMPLETE - Process enriched job data
    // -------------------------------------------------------------------------
    socket.on("ENRICHMENT_COMPLETE", async (data) => {
      if (!userId) {
        socket.emit("ERROR", { message: "Authentication required" });
        return;
      }

      const result = EnrichmentCompleteSchema.safeParse(data);
      if (!result.success) {
        console.warn(`[Socket] Invalid ENRICHMENT_COMPLETE payload:`, result.error.flatten());
        socket.emit("ERROR", { message: "Invalid enrichment data" });
        return;
      }

      const { enrichedJobs, totalRequested } = result.data;
      console.log(`[Socket] ENRICHMENT_COMPLETE: ${enrichedJobs.length}/${totalRequested} jobs enriched`);

      // Fetch user settings for auto-shortlist
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { autoShortlistEnabled: true, autoShortlistThreshold: true },
      });
      const autoShortlistEnabled = userSettings?.autoShortlistEnabled ?? true;
      const FINAL_SHORTLIST_THRESHOLD = userSettings?.autoShortlistThreshold ?? 80;
      console.log(`[Socket] Using shortlist threshold: ${FINAL_SHORTLIST_THRESHOLD}%, enabled: ${autoShortlistEnabled}`);

      let shortlistedCount = 0;

      // Process each enriched job
      for (const job of enrichedJobs) {
        try {
          // Find the existing job
          const existing = await prisma.job.findUnique({
            where: { userId_url: { userId, url: job.url } },
          });

          if (!existing) {
            console.warn(`[DB] Enriched job not found: ${job.url}`);
            continue;
          }

          // Re-calculate score with full description (Pass 2)
          // Use enrichment data where available, fall back to existing data
          const sherlockData: SherlockData = {
            clientTotalSpent: job.clientTotalSpent ?? existing.clientTotalSpent,
            clientHireRate: job.clientHireRate ?? existing.clientHireRate,
            clientPaymentVerified: job.clientPaymentVerified ?? existing.clientPaymentVerified,
            clientReviewCount: job.clientReviewCount ?? existing.clientReviewCount,
            connectsCost: job.connectsCost ?? existing.connectsCost,
            hasExternalLinks: job.hasExternalLinks ?? existing.hasExternalLinks,
            clientCountry: job.clientCountry ?? existing.clientCountry,
            postedAgo: job.postedAgo ?? existing.postedAgo,
          };

          const multiScore = calculateMultiScore(
            existing.title,
            job.fullDescription, // Use full description for scoring
            undefined,
            sherlockData
          );

          // Only auto-shortlist if enabled and score meets threshold
          // Don't override if already manually shortlisted
          const shouldShortlist = autoShortlistEnabled && multiScore.winLikelihood >= FINAL_SHORTLIST_THRESHOLD;
          const isShortlisted = shouldShortlist || existing.isShortlisted;
          if (shouldShortlist && !existing.isShortlisted) shortlistedCount++;

          // === VALIDATION: Don't overwrite good descriptions with garbage ===
          const garbageIndicators = [
            "waiting for www.upwork.com to respond",
            "enable javascript and cookies to continue",
            "please enable javascript",
            "loading...",
            "checking your browser",
            "just a moment",
            "verifying you are human",
            "access denied",
            "403 forbidden",
            "404 not found",
          ];
          const newDescLower = job.fullDescription.toLowerCase();
          const isGarbageDescription = garbageIndicators.some(ind => newDescLower.includes(ind));
          const shouldUpdateDescription =
            job.fullDescription.length > 100 && // Minimum meaningful length
            !isGarbageDescription && // Not garbage/error content
            (job.fullDescription.length >= (existing.description?.length || 0) * 0.5); // At least 50% of existing length

          if (!shouldUpdateDescription && job.fullDescription.length > 0) {
            console.warn(`[DB] Skipping description update - new desc appears to be garbage or too short`);
            console.warn(`[DB] New desc (${job.fullDescription.length} chars): "${job.fullDescription.slice(0, 100)}..."`);
          }

          // Update job with enriched data including all client info
          const updatedJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              description: shouldUpdateDescription ? job.fullDescription : existing.description,
              needsEnrichment: false,
              enrichedAt: new Date(),
              // Scores
              scoreRelevance: multiScore.relevance,
              scoreClientQuality: multiScore.clientQuality,
              scoreCompetition: multiScore.competition,
              scoreWinLikelihood: multiScore.winLikelihood,
              fitScore: multiScore.winLikelihood, // Keep legacy score updated
              isShortlisted,
              shortlistedAt: (shouldShortlist && !existing.isShortlisted) ? new Date() : existing.shortlistedAt,
              // Client data from detail page (all fields from About the Client section)
              clientName: job.clientName ?? existing.clientName,
              clientLocation: job.clientLocation ?? existing.clientLocation,
              clientCity: job.clientCity ?? existing.clientCity,
              clientCountry: job.clientCountry ?? existing.clientCountry,
              clientLocalTime: job.clientLocalTime ?? existing.clientLocalTime,
              clientMemberSince: job.clientMemberSince ?? existing.clientMemberSince,
              clientTotalSpent: job.clientTotalSpent ?? existing.clientTotalSpent,
              clientJobsPosted: job.clientJobsPosted ?? existing.clientJobsPosted,
              clientTotalHires: job.clientTotalHires ?? existing.clientTotalHires,
              clientActiveFreelancers: job.clientActiveFreelancers ?? existing.clientActiveFreelancers,
              clientActiveJobs: job.clientActiveJobs ?? existing.clientActiveJobs,
              clientAvgHourly: job.clientAvgHourly ?? existing.clientAvgHourly,
              clientTotalHours: job.clientTotalHours ?? existing.clientTotalHours,
              clientHireRate: job.clientHireRate ?? existing.clientHireRate,
              clientRating: job.clientRating ?? existing.clientRating,
              clientPaymentVerified: job.clientPaymentVerified ?? existing.clientPaymentVerified,
              clientPhoneVerified: job.clientPhoneVerified ?? existing.clientPhoneVerified,
              clientReviewCount: job.clientReviewCount ?? existing.clientReviewCount,
              // Job metadata from detail page
              connectsCost: job.connectsCost ?? existing.connectsCost,
              postedAgo: job.postedAgo ?? existing.postedAgo,
              hasExternalLinks: job.hasExternalLinks ?? existing.hasExternalLinks,
              keywordsFound: job.skillsRequired ? JSON.stringify(job.skillsRequired) : existing.keywordsFound,
              // NEW: Job specifications
              projectType: job.projectType ?? existing.projectType,
              toolsRequired: job.toolsRequired?.length ? JSON.stringify(job.toolsRequired) : existing.toolsRequired,
              unansweredInvites: job.unansweredInvites ?? existing.unansweredInvites,
              budget: job.budget ?? existing.budget,
              budgetMin: job.budgetMin ?? existing.budgetMin,
              budgetMax: job.budgetMax ?? existing.budgetMax,
              hoursPerWeek: job.hoursPerWeek ?? existing.hoursPerWeek,
              // NEW: Client history & other open jobs
              clientHistoryCount: job.clientHistoryCount ?? existing.clientHistoryCount,
              clientRecentContracts: job.clientRecentContracts?.length ? JSON.stringify(job.clientRecentContracts) : existing.clientRecentContracts,
              clientOtherJobsCount: job.clientOtherJobsCount ?? existing.clientOtherJobsCount,
              clientOtherJobs: job.clientOtherJobs?.length ? JSON.stringify(job.clientOtherJobs) : existing.clientOtherJobs,
            },
          });

          console.log(`[DB] Enriched job ${existing.id}: score ${multiScore.winLikelihood}, shortlisted: ${isShortlisted}, hireRate: ${job.clientHireRate ?? 'N/A'}, avgHourly: ${job.clientAvgHourly ?? 'N/A'}, historyCount: ${job.clientHistoryCount ?? 'N/A'}`);

          // Emit individual enrichment update
          io.to(`user:${userId}`).emit("JOB_ENRICHED", {
            jobId: existing.id,
            url: job.url,
            score: multiScore,
            isShortlisted,
          });

          // Also emit JOB_UPDATE to refresh the job in the feed
          io.to(`user:${userId}`).emit("JOB_UPDATE", updatedJob);
        } catch (err) {
          console.error(`[DB] Failed to enrich job ${job.url}:`, err);
        }
      }

      console.log(`[Socket] Enrichment processed: ${enrichedJobs.length} jobs, ${shortlistedCount} shortlisted`);

      // Complete the scrape operation
      const scrapeState = getUserScrapeState(userId);
      if (scrapeState.operationId) {
        try {
          const existing = await prisma.scrapeOperation.findUnique({
            where: { id: scrapeState.operationId },
          });

          if (existing) {
            const existingLogs = existing.logs ? JSON.parse(existing.logs) : [];
            existingLogs.push({
              timestamp: new Date().toISOString(),
              message: `Enrichment complete: ${enrichedJobs.length} jobs enriched, ${shortlistedCount} shortlisted`,
            });

            await prisma.scrapeOperation.update({
              where: { id: scrapeState.operationId },
              data: {
                status: "COMPLETED",
                jobsFound: scrapeState.jobsNewCount + scrapeState.jobsUpdatedCount,
                jobsNew: scrapeState.jobsNewCount,
                jobsUpdated: scrapeState.jobsUpdatedCount,
                completedAt: new Date(),
                durationMs: Date.now() - existing.startedAt.getTime(),
                logs: JSON.stringify(existingLogs),
                jobIds: JSON.stringify(scrapeState.jobIds),
              },
            });

            console.log(`[DB] Completed scrape operation ${scrapeState.operationId} after enrichment: ${scrapeState.jobIds.length} jobs`);
          }
        } catch (err) {
          console.error("[DB] Failed to complete scrape operation:", err);
        }

        // Reset state
        scrapeState.operationId = null;
        scrapeState.jobsNewCount = 0;
        scrapeState.jobsUpdatedCount = 0;
        scrapeState.jobIds = [];
      }

      // Emit final task complete
      io.to(`user:${userId}`).emit("TASK_UPDATE", {
        status: "COMPLETED",
        message: `Enriched ${enrichedJobs.length} jobs, ${shortlistedCount} shortlisted`,
        scraped: enrichedJobs.length,
      });
    });

    // -------------------------------------------------------------------------
    // PING - Keepalive
    // -------------------------------------------------------------------------
    socket.on("PING", (data) => {
      console.log(`[Socket] PING from ${data.from} at ${new Date(data.time).toISOString()}`);
    });

    // -------------------------------------------------------------------------
    // DISCONNECT
    // -------------------------------------------------------------------------
    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);

      if (isExtension) {
        authenticatedExtensions.delete(socket.id);
        // Notify dashboard that extension went offline
        socket.broadcast.emit("STATUS_UPDATE", { status: "EXTENSION_OFFLINE" });
      }
    });
  });

  // =============================================================================
  // STUCK OPERATION CLEANUP
  // =============================================================================

  /**
   * Mark stuck ScrapeOperations as TIMEOUT
   * Operations stuck in RUNNING state for > 10 minutes are considered failed
   */
  let isCleanupRunning = false;

  async function cleanupStuckOperations() {
    // Prevent concurrent cleanup runs (can cause connection pool exhaustion)
    if (isCleanupRunning) {
      console.log("[Cleanup] Skipping - previous cleanup still running");
      return;
    }

    isCleanupRunning = true;
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const cutoffTime = new Date(Date.now() - TIMEOUT_MS);

    try {
      const stuckOps = await prisma.scrapeOperation.findMany({
        where: {
          status: "RUNNING",
          startedAt: { lt: cutoffTime },
        },
        take: 10, // Limit to prevent large queries
      });

      if (stuckOps.length > 0) {
        console.log(`[Cleanup] Found ${stuckOps.length} stuck operations, marking as TIMEOUT`);

        for (const op of stuckOps) {
          try {
            await prisma.scrapeOperation.update({
              where: { id: op.id },
              data: {
                status: "TIMEOUT",
                completedAt: new Date(),
                errorMessage: `Operation timed out after ${TIMEOUT_MS / 60000} minutes`,
                durationMs: Date.now() - op.startedAt.getTime(),
              },
            });
            console.log(`[Cleanup] Marked operation ${op.id} as TIMEOUT (started ${op.startedAt.toISOString()})`);
          } catch (updateErr) {
            console.error(`[Cleanup] Failed to update operation ${op.id}:`, updateErr instanceof Error ? updateErr.message : updateErr);
          }
        }
      }
    } catch (err) {
      // Log error but don't crash - connection pool issues are recoverable
      console.error("[Cleanup] Failed to cleanup stuck operations:", err instanceof Error ? err.message : err);
    } finally {
      isCleanupRunning = false;
    }
  }

  // Run cleanup on server startup (delayed to let connections warm up)
  setTimeout(cleanupStuckOperations, 5000);

  // Run cleanup every 5 minutes
  setInterval(cleanupStuckOperations, 5 * 60 * 1000);

  // =============================================================================
  // START SERVER
  // =============================================================================

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});
