import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for creating assets
const CreateAssetSchema = z.object({
    type: z.enum(["LOOM", "PORTFOLIO", "GITHUB"]),
    name: z.string().min(1).max(200),
    url: z.string().url(),
    category: z.string().max(100).optional(),
});

// GET /api/assets - Fetch all assets for user
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const assets = await prisma.asset.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(assets);
    } catch (error) {
        console.error("Failed to fetch assets:", error);
        return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
    }
}

// POST /api/assets - Create a new asset
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();

        // Validate input
        const result = CreateAssetSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid input", details: result.error.flatten() },
                { status: 400 }
            );
        }

        const data = result.data;

        const asset = await prisma.asset.create({
            data: {
                userId,
                type: data.type,
                name: data.name,
                url: data.url,
                category: data.category,
            },
        });

        return NextResponse.json(asset, { status: 201 });
    } catch (error) {
        console.error("Failed to create asset:", error);
        return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
    }
}
