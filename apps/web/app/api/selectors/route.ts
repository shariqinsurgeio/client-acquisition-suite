import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/selectors?platform=UPWORK
export async function GET(request: NextRequest) {
    const platform = request.nextUrl.searchParams.get("platform");

    const where = platform ? { platform: platform.toUpperCase() } : {};

    const selectors = await prisma.platformSelector.findMany({ where });

    return NextResponse.json(selectors);
}

// POST /api/selectors
export async function POST(request: NextRequest) {
    const body = await request.json();

    const { platform, selectors } = body;

    if (!platform || !selectors) {
        return NextResponse.json(
            { error: "platform and selectors are required" },
            { status: 400 }
        );
    }

    // Upsert - update if exists, create if not
    const existing = await prisma.platformSelector.findFirst({
        where: { platform: platform.toUpperCase() }
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
                platform: platform.toUpperCase(),
                selectors: JSON.stringify(selectors)
            }
        });
    }

    return NextResponse.json(result);
}
