import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/scrape-history - Get scrape history for the user
export async function GET(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status"); // Filter by status

    const where: Record<string, unknown> = { userId };
    if (status) {
      where.status = status;
    }

    const [operations, total] = await Promise.all([
      prisma.scrapeOperation.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.scrapeOperation.count({ where }),
    ]);

    // Parse logs JSON for each operation
    const operationsWithParsedLogs = operations.map((op) => ({
      ...op,
      logs: op.logs ? JSON.parse(op.logs) : [],
      jobIds: op.jobIds ? JSON.parse(op.jobIds) : [],
    }));

    return NextResponse.json({
      operations: operationsWithParsedLogs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API] Scrape history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/scrape-history - Create a new scrape operation (called by server.ts)
export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { platform, targetUrl } = body;

    const operation = await prisma.scrapeOperation.create({
      data: {
        userId,
        platform: platform || "UPWORK",
        targetUrl,
        status: "RUNNING",
        logs: JSON.stringify([{
          timestamp: new Date().toISOString(),
          message: "Scrape operation started",
        }]),
      },
    });

    return NextResponse.json(operation);
  } catch (error) {
    console.error("[API] Create scrape operation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
