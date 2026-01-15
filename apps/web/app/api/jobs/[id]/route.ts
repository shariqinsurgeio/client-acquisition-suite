import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Helper to get userId from either cookie auth or Bearer token
async function getUserId(request: Request): Promise<string | null> {
    // First try cookie-based auth (dashboard)
    const { userId } = await auth();
    if (userId) return userId;

    // Then try Bearer token auth (extension)
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        try {
            const secretKey = process.env.CLERK_SECRET_KEY;
            if (!secretKey) return null;

            const verified = await verifyToken(token, { secretKey });
            return verified.sub;
        } catch (err) {
            console.warn("Bearer token verification failed:", err);
            return null;
        }
    }

    return null;
}

// Validation schema for job updates
const UpdateJobSchema = z.object({
    status: z.enum(["NEW", "SAVED", "APPLIED", "ARCHIVED", "HIDDEN"]).optional(),
    fitScore: z.number().min(0).max(100).optional(),
});

type RouteParams = {
    params: Promise<{ id: string }>;
};

// GET /api/jobs/[id] - Get single job
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const userId = await getUserId(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const job = await prisma.job.findFirst({
            where: { id, userId },
        });

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json(job);
    } catch (error) {
        console.error("Failed to fetch job:", error);
        return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
    }
}

// PATCH /api/jobs/[id] - Update job status
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const userId = await getUserId(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        // Validate input
        const result = UpdateJobSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid input", details: result.error.flatten() },
                { status: 400 }
            );
        }

        // Verify ownership before update
        const existing = await prisma.job.findFirst({
            where: { id, userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        const job = await prisma.job.update({
            where: { id },
            data: result.data,
        });

        return NextResponse.json(job);
    } catch (error) {
        console.error("Failed to update job:", error);
        return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
    }
}

// DELETE /api/jobs/[id] - Delete job
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const userId = await getUserId(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership before delete
        const existing = await prisma.job.findFirst({
            where: { id, userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        await prisma.job.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete job:", error);
        return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
    }
}
