import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Default search keywords for new users
const DEFAULT_SEARCH_KEYWORDS = ["AI", "generative AI", "AI automation", "n8n"];

// Validation schema for PATCH request
const UpdateSettingsSchema = z.object({
  searchKeywords: z.array(z.string().min(1).max(100)).max(10).optional(),
  // Shortlist & Scoring Thresholds
  autoShortlistEnabled: z.boolean().optional(),
  autoShortlistThreshold: z.number().min(0).max(100).optional(),
  enrichmentThreshold: z.number().min(0).max(100).optional(),
});

/**
 * GET /api/settings
 * Fetch user settings including search keywords
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        searchKeywords: true,
        defaultSignOff: true,
        minHireRate: true,
        minAvgHourly: true,
        bigFiveOnly: true,
        liveStreamEnabled: true,
        liveStreamIntervalSec: true,
        autoDeclineRateIncrease: true,
        autoShortlistEnabled: true,
        autoShortlistThreshold: true,
        enrichmentThreshold: true,
      },
    });

    // Parse search keywords from JSON string or use defaults
    const searchKeywords = settings?.searchKeywords
      ? JSON.parse(settings.searchKeywords)
      : DEFAULT_SEARCH_KEYWORDS;

    return NextResponse.json({
      searchKeywords,
      defaultSignOff: settings?.defaultSignOff || "Peace",
      minHireRate: settings?.minHireRate || 20,
      minAvgHourly: settings?.minAvgHourly || 30,
      bigFiveOnly: settings?.bigFiveOnly || false,
      liveStreamEnabled: settings?.liveStreamEnabled || false,
      liveStreamIntervalSec: settings?.liveStreamIntervalSec || 60,
      autoDeclineRateIncrease: settings?.autoDeclineRateIncrease ?? true,
      autoShortlistEnabled: settings?.autoShortlistEnabled ?? true,
      autoShortlistThreshold: settings?.autoShortlistThreshold ?? 80,
      enrichmentThreshold: settings?.enrichmentThreshold ?? 70,
    });
  } catch (error) {
    console.error("[API Settings GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Update user settings
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = UpdateSettingsSchema.parse(body);

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (validated.searchKeywords !== undefined) {
      updateData.searchKeywords = JSON.stringify(validated.searchKeywords);
    }
    if (validated.autoShortlistEnabled !== undefined) {
      updateData.autoShortlistEnabled = validated.autoShortlistEnabled;
    }
    if (validated.autoShortlistThreshold !== undefined) {
      updateData.autoShortlistThreshold = validated.autoShortlistThreshold;
    }
    if (validated.enrichmentThreshold !== undefined) {
      updateData.enrichmentThreshold = validated.enrichmentThreshold;
    }

    // Upsert user settings
    await prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[API Settings PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
