import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/scrape-history/[id] - Get a specific scrape operation with its jobs
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const operation = await prisma.scrapeOperation.findFirst({
      where: { id, userId },
    });

    if (!operation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get the jobs that were created in this operation
    const jobIds = operation.jobIds ? JSON.parse(operation.jobIds) : [];
    let jobs: unknown[] = [];

    if (jobIds.length > 0) {
      jobs = await prisma.job.findMany({
        where: {
          id: { in: jobIds },
          userId,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({
      ...operation,
      logs: operation.logs ? JSON.parse(operation.logs) : [],
      jobIds,
      jobs,
    });
  } catch (error) {
    console.error("[API] Get scrape operation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/scrape-history/[id] - Update a scrape operation
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status, jobsFound, jobsNew, jobsUpdated, errorMessage, log, jobId } = body;

    // First get the existing operation
    const existing = await prisma.scrapeOperation.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      if (status === "COMPLETED" || status === "FAILED") {
        updateData.completedAt = new Date();
        updateData.durationMs = Date.now() - existing.startedAt.getTime();
      }
    }

    if (typeof jobsFound === "number") updateData.jobsFound = jobsFound;
    if (typeof jobsNew === "number") updateData.jobsNew = jobsNew;
    if (typeof jobsUpdated === "number") updateData.jobsUpdated = jobsUpdated;
    if (errorMessage) updateData.errorMessage = errorMessage;

    // Append to logs if a new log entry is provided
    if (log) {
      const existingLogs = existing.logs ? JSON.parse(existing.logs) : [];
      existingLogs.push({
        timestamp: new Date().toISOString(),
        message: log,
      });
      updateData.logs = JSON.stringify(existingLogs);
    }

    // Append job ID if provided
    if (jobId) {
      const existingJobIds = existing.jobIds ? JSON.parse(existing.jobIds) : [];
      if (!existingJobIds.includes(jobId)) {
        existingJobIds.push(jobId);
        updateData.jobIds = JSON.stringify(existingJobIds);
      }
    }

    const updated = await prisma.scrapeOperation.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      logs: updated.logs ? JSON.parse(updated.logs) : [],
      jobIds: updated.jobIds ? JSON.parse(updated.jobIds) : [],
    });
  } catch (error) {
    console.error("[API] Update scrape operation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
