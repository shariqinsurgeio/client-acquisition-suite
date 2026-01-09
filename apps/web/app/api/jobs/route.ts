import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for creating jobs
const CreateJobSchema = z.object({
    platform: z.enum(["UPWORK", "LINKEDIN", "FIVERR", "FREELANCER", "UNKNOWN"]),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).default(""),
    url: z.string().url(),
    fitScore: z.number().min(0).max(100).optional(),
});

// GET /api/jobs - Fetch all jobs with optional filters
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const platform = searchParams.get("platform");
        const limit = parseInt(searchParams.get("limit") || "100", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);

        const where: Record<string, unknown> = {};
        if (status && status !== "ALL") {
            where.status = status;
        }
        if (platform) {
            where.platform = platform;
        }

        const jobs = await prisma.job.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 500), // Cap at 500
            skip: offset,
        });

        return NextResponse.json(jobs);
    } catch (error) {
        console.error("Failed to fetch jobs:", error);
        return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
    }
}

// POST /api/jobs - Create a new job
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Validate input
        const result = CreateJobSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid input", details: result.error.flatten() },
                { status: 400 }
            );
        }

        const data = result.data;

        // Check for duplicate URL
        const existing = await prisma.job.findUnique({
            where: { url: data.url },
        });

        if (existing) {
            return NextResponse.json(
                { error: "Job with this URL already exists", jobId: existing.id },
                { status: 409 }
            );
        }

        const job = await prisma.job.create({
            data: {
                platform: data.platform,
                title: data.title,
                description: data.description,
                url: data.url,
                status: "NEW",
                fitScore: data.fitScore ?? 0,
            },
        });

        return NextResponse.json(job, { status: 201 });
    } catch (error) {
        console.error("Failed to create job:", error);
        return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }
}
