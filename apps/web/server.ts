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
  title: z.string().min(1).max(500).default("No Title"),
  description: z.string().max(10000).default(""),
  url: z.string().url(),
  budget: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

const CmdExecuteSchema = z.object({
  action: z.enum(["SCRAPE", "APPLY"]),
  platform: PlatformEnum,
  targetUrl: z.string().url(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const TaskUpdateSchema = z.object({
  jobId: z.string().optional(),
  status: z.enum(["COMPLETED", "ERROR", "IN_PROGRESS"]),
  error: z.string().optional(),
  scraped: z.number().optional(),
  message: z.string().optional(),
});

const ScrapeProgressSchema = z.object({
  current: z.number(),
  status: z.string(),
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
  SCRAPE_PROGRESS: (data: { current: number; status: string }) => void;
}

interface ClientToServerEvents {
  EXTENSION_CONNECT: (data: { extensionId: string }) => void;
  DATA_INGEST: (data: DataIngestPayload) => void;
  CMD_EXECUTE: (data: CmdExecutePayload) => void;
  TASK_UPDATE: (data: TaskUpdatePayload) => void;
  SCRAPE_PROGRESS: (data: { current: number; status: string }) => void;
  PING: (data: { from: string; time: number }) => void;
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
}

interface CmdExecutePayload {
  action: "SCRAPE" | "APPLY";
  platform: Platform;
  targetUrl: string;
  data?: Record<string, unknown>;
}

interface TaskUpdatePayload {
  jobId?: string;
  status: "COMPLETED" | "ERROR" | "IN_PROGRESS";
  error?: string;
  scraped?: number;
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
// FIT SCORING
// =============================================================================

interface ScoringRules {
  positiveKeywords: string[];
  negativeKeywords: string[];
  minBudget?: number;
}

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
  rules: ScoringRules = DEFAULT_SCORING_RULES
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

  // Clamp between 0-100
  return Math.max(0, Math.min(100, score));
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

        // Allow localhost origins and tunnel URLs
        if (origin && (
          ALLOWED_ORIGINS.includes(origin) ||
          origin.startsWith("chrome-extension://") ||
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          origin.endsWith(".trycloudflare.com") // Cloudflare tunnel for dev
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

        // Calculate fit score
        const fitScore = calculateFitScore(
          validData.title,
          validData.description,
          validData.budget
        );

        if (existing) {
          // Update existing job
          job = await prisma.job.update({
            where: { id: existing.id },
            data: {
              title: validData.title,
              description: validData.description,
              fitScore,
            },
          });
          console.log(`[DB] Updated job: ${job.id} (fitScore: ${fitScore})`);
        } else {
          // Create new job
          job = await prisma.job.create({
            data: {
              userId,
              platform: validData.platform,
              title: validData.title,
              description: validData.description,
              url: validData.url,
              status: "NEW",
              fitScore,
            },
          });
          isNew = true;
          console.log(`[DB] Created job: ${job.id} for user ${userId} (fitScore: ${fitScore})`);
        }

        // Only broadcast new jobs to user's dashboard
        if (isNew) {
          io.to(`user:${userId}`).emit("JOB_UPDATE", job);
        }

        // Acknowledge to extension
        socket.emit("DATA_ACK", { url: validData.url, isNew, jobId: job.id });
      } catch (err) {
        console.error("[DB] Failed to save job:", err);
        socket.emit("ERROR", { message: "Failed to save job", url: validData.url });
      }
    });

    // -------------------------------------------------------------------------
    // CMD_EXECUTE - Forward commands from dashboard to extension
    // -------------------------------------------------------------------------
    socket.on("CMD_EXECUTE", (data) => {
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
      console.log(`[Socket] Task update (user: ${userId}): ${validData.status}`);

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

      // Broadcast to user's dashboard only
      if (userId) {
        io.to(`user:${userId}`).emit("TASK_UPDATE", validData);
      }
    });

    // -------------------------------------------------------------------------
    // SCRAPE_PROGRESS - Real-time scraping progress from extension
    // -------------------------------------------------------------------------
    socket.on("SCRAPE_PROGRESS", (data) => {
      const result = ScrapeProgressSchema.safeParse(data);

      if (!result.success) {
        return; // Silently ignore invalid progress updates
      }

      // Broadcast to user's dashboard only
      if (userId) {
        io.to(`user:${userId}`).emit("SCRAPE_PROGRESS", result.data);
      }
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
