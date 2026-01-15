import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  generateProposal,
  improveProposal,
  generateVariations,
  estimateProposalQuality,
  type AIModel,
  type GeneratorConfig,
} from "@/lib/ai/proposal-generator";
import { type PlaybookType, recommendPlaybook } from "@/lib/ai/prompts";
import { prisma } from "@/lib/prisma";

// Request validation schemas
const PersonaSchema = z.object({
  name: z.string(),
  bio: z.string(),
  tone: z.string(),
  defaultSignOff: z.string(),
  hourlyRate: z.number(),
  expertise: z.array(z.string()),
});

const AssetSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
  category: z.string(),
});

const JobSchema = z.object({
  title: z.string(),
  description: z.string(),
  budget: z.string().optional(),
  clientName: z.string().optional(),
  clientLocation: z.string().optional(),
  clientCountry: z.string().optional(),
  clientTotalSpent: z.number().optional(),
  clientHireRate: z.number().optional(),
  hasExternalLinks: z.boolean().default(false),
  externalLinks: z.array(z.string()).optional(),
  skillsRequired: z.array(z.string()).optional(),
  jobType: z.string().optional(),
  experienceLevel: z.string().optional(),
});

const GenerateRequestSchema = z.object({
  jobId: z.string().optional(),
  job: JobSchema.optional(),
  persona: PersonaSchema.optional(),
  playbook: z.enum(["AUDIT_PITCH", "CONTEXT_TRAP", "DIRECT_APPLY"]).optional(),
  assets: z.array(AssetSchema).optional(),
  model: z.enum(["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"]).optional(),
  maxLength: z.number().optional(),
  includePS: z.boolean().optional(),
});

const ImproveRequestSchema = z.object({
  currentProposal: z.string(),
  feedback: z.string(),
  model: z.enum(["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"]).optional(),
});

const VariationsRequestSchema = z.object({
  jobId: z.string().optional(),
  job: JobSchema.optional(),
  persona: PersonaSchema.optional(),
  playbook: z.enum(["AUDIT_PITCH", "CONTEXT_TRAP", "DIRECT_APPLY"]).optional(),
  assets: z.array(AssetSchema).optional(),
  count: z.number().min(1).max(5).default(3),
});

// POST /api/ai/generate - Generate a proposal
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action || "generate";

    switch (action) {
      case "generate":
        return handleGenerate(userId, body);
      case "improve":
        return handleImprove(body);
      case "variations":
        return handleVariations(userId, body);
      case "recommend":
        return handleRecommend(body);
      case "quality":
        return handleQuality(body);
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: generate, improve, variations, recommend, quality" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("AI API error:", error);

    // Handle specific errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: "AI service not configured. Please set ANTHROPIC_API_KEY." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate proposal" },
      { status: 500 }
    );
  }
}

// Handle proposal generation
async function handleGenerate(userId: string, body: unknown) {
  const data = GenerateRequestSchema.parse(body);

  // If jobId provided, fetch job from database
  let jobData = data.job;
  if (data.jobId && !jobData) {
    const dbJob = await prisma.job.findUnique({
      where: { id: data.jobId, userId },
    });
    if (!dbJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    // Parse keywordsFound from JSON if available
    let skillsRequired: string[] | undefined;
    if (dbJob.keywordsFound) {
      try {
        skillsRequired = JSON.parse(dbJob.keywordsFound);
      } catch {
        skillsRequired = undefined;
      }
    }
    jobData = {
      title: dbJob.title,
      description: dbJob.description,
      clientName: dbJob.clientName || undefined,
      clientLocation: dbJob.clientLocation || undefined,
      clientCountry: dbJob.clientCountry || undefined,
      clientTotalSpent: dbJob.clientTotalSpent || undefined,
      clientHireRate: dbJob.clientHireRate || undefined,
      hasExternalLinks: dbJob.hasExternalLinks,
      skillsRequired,
    };
  }

  if (!jobData) {
    return NextResponse.json(
      { error: "Either jobId or job data must be provided" },
      { status: 400 }
    );
  }

  // Fetch user's default persona if not provided
  let personaData = data.persona;
  if (!personaData) {
    // Get persona and settings separately
    const [userPersona, userSettings] = await Promise.all([
      prisma.userPersona.findFirst({
        where: { userId, isDefault: true },
      }),
      prisma.userSettings.findUnique({
        where: { userId },
      }),
    ]);

    if (userPersona) {
      // Parse expertiseTags from JSON
      let expertise: string[] = [];
      if (userPersona.expertiseTags) {
        try {
          expertise = JSON.parse(userPersona.expertiseTags);
        } catch {
          expertise = [];
        }
      }
      personaData = {
        name: userPersona.name,
        bio: userPersona.bio || "",
        tone: userPersona.tone || "confident, friendly, and direct",
        defaultSignOff: userSettings?.defaultSignOff || "Looking forward to chatting!",
        hourlyRate: userSettings?.minAvgHourly || 75,
        expertise,
      };
    }
  }

  // Fetch user's assets if not provided
  let assetsData = data.assets || [];
  if (assetsData.length === 0) {
    const userAssets = await prisma.asset.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: "desc" },
    });
    assetsData = userAssets.map((a) => ({
      title: a.name,
      url: a.url,
      category: a.category || "general",
    }));
  }

  const config: GeneratorConfig = {
    model: data.model as AIModel | undefined,
    persona: personaData || {
      name: "Shariq",
      bio: "GenAI specialist helping businesses automate with AI",
      tone: "confident, friendly, and direct",
      defaultSignOff: "Looking forward to chatting!",
      hourlyRate: 75,
      expertise: ["AI/ML", "Automation", "Web Development"],
    },
    job: jobData,
    playbook: data.playbook as PlaybookType | undefined,
    assets: assetsData,
    maxLength: data.maxLength,
    includePS: data.includePS,
  };

  const proposal = await generateProposal(config);

  // Optionally save the draft
  if (data.jobId) {
    await prisma.proposalDraft.create({
      data: {
        userId,
        jobId: data.jobId,
        playbook: proposal.playbook,
        content: proposal.content,
        psLine: proposal.psLine,
        status: "draft",
      },
    });
  }

  return NextResponse.json({
    success: true,
    proposal: {
      content: proposal.content,
      psLine: proposal.psLine,
      playbook: proposal.playbook,
      playbookReason: proposal.playbookReason,
    },
    usage: {
      tokensUsed: proposal.tokensUsed,
      model: proposal.model,
    },
  });
}

// Handle proposal improvement
async function handleImprove(body: unknown) {
  const data = ImproveRequestSchema.parse(body);

  const result = await improveProposal(
    data.currentProposal,
    data.feedback,
    data.model as AIModel | undefined
  );

  return NextResponse.json({
    success: true,
    improvedProposal: result.content,
    usage: {
      tokensUsed: result.tokensUsed,
    },
  });
}

// Handle variations generation
async function handleVariations(userId: string, body: unknown) {
  const data = VariationsRequestSchema.parse(body);

  // Similar to handleGenerate, fetch job if jobId provided
  let jobData = data.job;
  if (data.jobId && !jobData) {
    const dbJob = await prisma.job.findUnique({
      where: { id: data.jobId, userId },
    });
    if (!dbJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    jobData = {
      title: dbJob.title,
      description: dbJob.description,
      clientName: dbJob.clientName || undefined,
      clientLocation: dbJob.clientLocation || undefined,
      hasExternalLinks: dbJob.hasExternalLinks,
    };
  }

  if (!jobData) {
    return NextResponse.json(
      { error: "Either jobId or job data must be provided" },
      { status: 400 }
    );
  }

  const config: GeneratorConfig = {
    persona: data.persona || {
      name: "Shariq",
      bio: "GenAI specialist helping businesses automate with AI",
      tone: "confident, friendly, and direct",
      defaultSignOff: "Looking forward to chatting!",
      hourlyRate: 75,
      expertise: ["AI/ML", "Automation", "Web Development"],
    },
    job: jobData,
    playbook: data.playbook as PlaybookType | undefined,
    assets: data.assets || [],
  };

  const variations = await generateVariations(config, data.count);

  return NextResponse.json({
    success: true,
    variations: variations.map((v, i) => ({
      id: i + 1,
      content: v.content,
      psLine: v.psLine,
      playbook: v.playbook,
    })),
    totalTokensUsed: variations.reduce((sum, v) => sum + v.tokensUsed, 0),
  });
}

// Handle playbook recommendation
async function handleRecommend(body: unknown) {
  const schema = z.object({
    job: z.object({
      title: z.string(),
      description: z.string(),
      hasExternalLinks: z.boolean().default(false),
      externalLinks: z.array(z.string()).optional(),
    }),
  });

  const data = schema.parse(body);
  const recommendation = recommendPlaybook(data.job);

  return NextResponse.json({
    success: true,
    recommendation: {
      playbook: recommendation.type,
      reason: recommendation.reason,
      confidence: recommendation.confidence,
    },
  });
}

// Handle quality estimation
async function handleQuality(body: unknown) {
  const schema = z.object({
    proposal: z.string(),
  });

  const data = schema.parse(body);
  const quality = estimateProposalQuality(data.proposal);

  return NextResponse.json({
    success: true,
    quality: {
      score: quality.score,
      issues: quality.issues,
      suggestions: quality.suggestions,
    },
  });
}
