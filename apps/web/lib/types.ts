/**
 * Grandmaster Edition - Type Definitions
 *
 * These types represent the enriched "Sherlock" data model
 * for the Client Acquisition Suite.
 */

// =============================================================================
// CLIENT HISTORY TYPES (From Work History Section)
// =============================================================================

export interface ClientContract {
  title: string;
  freelancerName?: string;
  dateRange?: string;
  hours?: number;
  hourlyRate?: number;
  billedAmount?: number;
  rating?: number;
  feedbackText?: string;
}

export interface ClientOtherJob {
  title: string;
  type?: string;  // "Hourly" | "Fixed Price"
  url: string;
}

// =============================================================================
// JOB TYPES (The "Sherlock" Enriched Model)
// =============================================================================

export interface JobClient {
  name?: string;              // The "Masood" - found in reviews
  location: string;           // For P.S. banter (e.g., "Dubai")
  country?: string;           // For Big Five filtering
  city?: string;              // City only (e.g., "Bonn")
  localTime?: string;         // Client's local time (e.g., "12:45 AM")
  totalSpent: number;         // Client's total spend on platform
  avgHourlyPaid: number;      // Critical metric for quality
  hireRate: number;           // 0-100, Critical metric
  isPaymentVerified: boolean; // Blue checkmark
  isPhoneVerified: boolean;   // Phone number verified
  reviewCount?: number;       // Number of reviews (source for name finding)
  jobsPosted?: number;        // Total jobs posted by client
  totalHires?: number;        // Total freelancers hired
  activeFreelancers?: number; // Currently active freelancers
  // NEW: Client history & other jobs
  historyCount?: number;        // Total contracts in history (e.g., 38)
  recentContracts?: ClientContract[];  // Work history contracts
  otherJobsCount?: number;      // Number of other open jobs
  otherJobs?: ClientOtherJob[]; // Other open jobs by this client
}

export interface JobMeta {
  fitScore: number;           // 0-100, auto-calculated (legacy)
  connectsCost: number;       // Cost to apply
  hasExternalLinks: boolean;  // Triggers "Audit" playbook
  keywordsFound: string[];    // For highlighting (e.g., ["n8n", "scraping"])
  dealBreakers: string[];     // Red flags (e.g., ["Low Pay", "Unverified"])
  postedAgo?: string;         // "2 hours ago"

  // NEW: Job specifications
  projectType?: string;         // "Ongoing project" | "One-time project"
  toolsRequired?: string[];     // Separate from skills (e.g., ["Asana", "Linear"])
  unansweredInvites?: number;   // Count of unanswered invites
  budget?: number;              // Fixed price amount
  budgetMin?: number;           // Hourly min rate
  budgetMax?: number;           // Hourly max rate
  hoursPerWeek?: string;        // "Less than 30 hrs/week", etc.

  // Multi-score breakdown (Phase 2)
  scoreRelevance?: number;      // 0-100, keyword/skill match
  scoreClientQuality?: number;  // 0-100, client reliability
  scoreCompetition?: number;    // 0-100, inverse of difficulty
  scoreWinLikelihood?: number;  // 0-100, primary score (replaces fitScore)

  // Shortlist (Phase 3)
  isShortlisted?: boolean;
  shortlistedAt?: Date;
}

export interface Job {
  id: string;
  userId: string;
  platform: Platform;
  title: string;
  description: string;
  url: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;

  // The "Sherlock" enriched data
  client: JobClient;
  meta: JobMeta;
}

// =============================================================================
// ENUMS
// =============================================================================

export type Platform = "UPWORK" | "LINKEDIN" | "FIVERR" | "FREELANCER" | "UNKNOWN";

export type JobStatus = "NEW" | "SAVED" | "QUEUED" | "APPLIED" | "INTERVIEWING" | "HIRED" | "ARCHIVED" | "HIDDEN" | "EXPIRED";

export type PlaybookType = "AUDIT_PITCH" | "CONTEXT_TRAP" | "DIRECT_APPLY";

// =============================================================================
// PERSONA TYPES
// =============================================================================

export interface UserPersona {
  id: string;
  name: string;               // e.g., "GenAI Expert"
  bio: string;                // The "foremost expert" hook
  tone: "Direct" | "Consultative" | "Technical";
  expertiseTags: string[];    // Skills to highlight
  relevantAssets: string[];   // IDs of Looms/PDFs
}

// =============================================================================
// ASSET TYPES
// =============================================================================

export type AssetType = "LOOM" | "PORTFOLIO" | "GITHUB";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;               // e.g., "StubHub Scraper Demo"
  url: string;
  category?: string;          // e.g., "Scraping", "Automation"
}

// =============================================================================
// PLAYBOOK TYPES
// =============================================================================

export interface Playbook {
  id: string;
  type: PlaybookType;
  name: string;
  hookTemplate: string;       // The opening line
  bodyTemplate: string;       // The main pitch
  signOff: string;            // Default: "Peace ✌️"
}

// =============================================================================
// PIPELINE / CRM TYPES
// =============================================================================

export type PipelineStage = "DRAFTS" | "APPLIED" | "INTERVIEWING" | "HIRED" | "LOST";

export interface PipelineJob extends Job {
  stage: PipelineStage;
  appliedAt?: Date;
  lastContactAt?: Date;
  isStale: boolean;           // > 3 days no reply in Interviewing
  connectsSpent: number;
  connectsRefunded: boolean;  // Got a reply = refund
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

export type ViewMode = "BATCH" | "LIVE_STREAM";

export interface FeedFilters {
  status: JobStatus | "ALL";
  platform: Platform | "ALL";
  minFitScore: number;
  minHireRate: number;
  minAvgHourly: number;
  bigFiveOnly: boolean;       // US, UK, CA, AU, Dubai/Europe
  hasContextOnly: boolean;    // Only jobs with external links
}

// =============================================================================
// SCRAPER PAYLOAD (Extension → Server)
// =============================================================================

export interface ScrapedJobPayload {
  platform: Platform;
  title: string;
  description: string;
  url: string;
  budget?: string;
  skills?: string[];

  // Sherlock data (extracted by scraper)
  clientName?: string;
  clientLocation?: string;
  clientCountry?: string;
  clientTotalSpent?: number;
  clientAvgHourly?: number;
  clientHireRate?: number;
  clientPaymentVerified?: boolean;
  clientReviewCount?: number;

  // Meta (detected by scraper)
  connectsCost?: number;
  hasExternalLinks?: boolean;
  postedAgo?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const BIG_FIVE_COUNTRIES = ["United States", "United Kingdom", "Canada", "Australia", "United Arab Emirates"];

export const POSITIVE_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "ml", "llm",
  "gpt", "chatgpt", "claude", "automation", "genai", "generative ai",
  "python", "typescript", "react", "next.js", "node", "n8n",
  "api", "integration", "saas", "startup", "mvp", "scraping", "bot",
  "long-term", "ongoing", "retainer"
];

export const NEGATIVE_KEYWORDS = [
  "unpaid", "volunteer", "intern", "internship", "free",
  "equity only", "exposure", "for experience",
  "data entry", "copy paste", "simple task", "salesforce", "agency"
];

// =============================================================================
// USER PROFILE TYPES (Connects, Stats, Profile Health)
// =============================================================================

export interface UserProfile {
  id: string;
  userId: string;

  // Upwork Profile
  upworkUsername?: string;
  upworkProfileUrl?: string;
  profileBio?: string;

  // Connects & Budget
  connectsBalance: number;
  connectsSpentTotal: number;
  connectsRefundedTotal: number;

  // Stats
  proposalsSentTotal: number;
  proposalsActiveCount: number;
  interviewsTotal: number;
  hiresTotal: number;

  // Profile Health
  profileCompletionPct: number;
  availabilityStatus: string;

  // Sync
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// PROPOSAL DRAFT TYPES
// =============================================================================

export interface ProposalDraft {
  id: string;
  userId: string;
  jobId: string;

  // Content
  playbook: PlaybookType;
  content: string;
  psLine?: string;

  // Assets Used
  assetsUsed?: string[]; // IDs of assets

  // Status
  status: "draft" | "ready" | "sent";
  sentAt?: Date;

  // Versioning
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// ANALYTICS TYPES (ROI Tracking)
// =============================================================================

export interface DailyAnalytics {
  id: string;
  userId: string;
  date: Date;

  // Activity
  jobsScraped: number;
  proposalsSent: number;
  connectsSpent: number;

  // Outcomes
  responsesReceived: number;
  interviewsScheduled: number;
  jobsWon: number;

  // Financials
  revenueEarned: number;

  createdAt: Date;
}

export interface ROIDashboard {
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

// =============================================================================
// CLIENT PROFILE TYPES (Repeat Client Tracking)
// =============================================================================

export interface ClientProfile {
  id: string;
  userId: string;

  // Identity
  clientName: string;
  upworkClientId?: string;

  // Stats (aggregated from jobs)
  totalJobsPosted: number;
  avgBudget?: number;
  avgHourlyRate?: number;
  totalSpent?: number;
  hireRate?: number;

  // Relationship
  previousWorkCount: number;
  lastContactAt?: Date;
  notes?: string;
  isVIP: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// ENHANCED FIT SCORE TYPES
// =============================================================================

export interface EnhancedFitScore {
  overall: number;

  // Component Scores
  keywordMatch: number;
  clientQuality: number;
  budgetFit: number;
  competitionLevel: number;
  freshness: number;

  // Flags
  hasContext: boolean;
  isBigFive: boolean;
  isPaymentVerified: boolean;

  // Recommendation
  recommendedPlaybook: PlaybookType;
  playbookReason: string;
  playbookConfidence: number;
  priority: "high" | "medium" | "low";
}
