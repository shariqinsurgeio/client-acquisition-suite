import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET - Get single DOM capture with full data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const capture = await prisma.domCapture.findFirst({
    where: { id, userId },
  });

  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse JSON fields
  return NextResponse.json({
    capture: {
      ...capture,
      dataAttributes: JSON.parse(capture.dataAttributes || "[]"),
      fullStructure: capture.fullStructure ? JSON.parse(capture.fullStructure) : null,
      suggestedSelectors: capture.suggestedSelectors ? JSON.parse(capture.suggestedSelectors) : null,
    },
  });
}

// DELETE - Delete a DOM capture
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const capture = await prisma.domCapture.findFirst({
    where: { id, userId },
  });

  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.domCapture.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// PATCH - Update capture (notes, analyzed status, suggested selectors)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const capture = await prisma.domCapture.findFirst({
    where: { id, userId },
  });

  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.domCapture.update({
    where: { id },
    data: {
      notes: body.notes ?? capture.notes,
      analyzed: body.analyzed ?? capture.analyzed,
      suggestedSelectors: body.suggestedSelectors
        ? JSON.stringify(body.suggestedSelectors)
        : capture.suggestedSelectors,
    },
  });

  return NextResponse.json({ success: true, capture: updated });
}
