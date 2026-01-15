import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { NextRequest, NextResponse } from "next/server";

// Helper to get userId from either cookie auth or Bearer token
async function getUserId(request: NextRequest): Promise<string | null> {
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

// GET /api/selectors?platform=UPWORK
export async function GET(request: NextRequest) {
    try {
        const userId = await getUserId(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const platform = request.nextUrl.searchParams.get("platform");

        const where: Record<string, string> = { userId };
        if (platform) {
            where.platform = platform.toUpperCase();
        }

        const selectors = await prisma.platformSelector.findMany({ where });

        return NextResponse.json(selectors);
    } catch (error) {
        console.error("Failed to fetch selectors:", error);
        return NextResponse.json({ error: "Failed to fetch selectors" }, { status: 500 });
    }
}

// POST /api/selectors
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();

        const { platform, selectors } = body;

        if (!platform || !selectors) {
            return NextResponse.json(
                { error: "platform and selectors are required" },
                { status: 400 }
            );
        }

        // Upsert - update if exists, create if not
        const platformUpper = platform.toUpperCase();
        const existing = await prisma.platformSelector.findUnique({
            where: { userId_platform: { userId, platform: platformUpper } }
        });

        let result;
        if (existing) {
            result = await prisma.platformSelector.update({
                where: { id: existing.id },
                data: { selectors: JSON.stringify(selectors) }
            });
        } else {
            result = await prisma.platformSelector.create({
                data: {
                    userId,
                    platform: platformUpper,
                    selectors: JSON.stringify(selectors)
                }
            });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to save selectors:", error);
        return NextResponse.json({ error: "Failed to save selectors" }, { status: 500 });
    }
}
