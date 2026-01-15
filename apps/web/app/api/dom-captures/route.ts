import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for DOM capture
const DomCaptureSchema = z.object({
  pageUrl: z.string().url(),
  pageType: z.enum(["job-list", "job-detail", "profile", "search", "unknown"]),
  platform: z.string().default("UPWORK"),
  dataAttributes: z.array(z.object({
    attr: z.string().nullable(),
    tag: z.string(),
    classes: z.string(),
    textPreview: z.string().optional(),
  })),
  jobCardSample: z.string().optional(),
  clientSection: z.string().optional(),
  fullStructure: z.any().optional(),
  notes: z.string().optional(),
});

// GET - List DOM captures
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageType = searchParams.get("pageType");
  const limit = parseInt(searchParams.get("limit") || "20");

  const captures = await prisma.domCapture.findMany({
    where: {
      userId,
      ...(pageType ? { pageType } : {}),
    },
    orderBy: { capturedAt: "desc" },
    take: limit,
    select: {
      id: true,
      pageUrl: true,
      pageType: true,
      platform: true,
      capturedAt: true,
      analyzed: true,
      notes: true,
      // Don't return large fields in list view
    },
  });

  return NextResponse.json({ captures });
}

// POST - Create new DOM capture
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = DomCaptureSchema.parse(body);

    const capture = await prisma.domCapture.create({
      data: {
        userId,
        pageUrl: validated.pageUrl,
        pageType: validated.pageType,
        platform: validated.platform,
        dataAttributes: JSON.stringify(validated.dataAttributes),
        jobCardSample: validated.jobCardSample?.slice(0, 50000), // Limit size
        clientSection: validated.clientSection?.slice(0, 30000),
        fullStructure: validated.fullStructure ? JSON.stringify(validated.fullStructure) : null,
        notes: validated.notes,
      },
    });

    console.log(`[DomCapture] Created capture ${capture.id} for page type: ${validated.pageType}`);

    return NextResponse.json({
      success: true,
      capture: {
        id: capture.id,
        pageType: capture.pageType,
        capturedAt: capture.capturedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("[DomCapture] Error:", error);
    return NextResponse.json(
      { error: "Failed to save DOM capture" },
      { status: 500 }
    );
  }
}
