import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { winnersQuerySchema } from "@/src/core/lottery/schema";
import { serializeWinnerRecord } from "@/src/core/lottery/winners";

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = winnersQuerySchema.safeParse({
    category: searchParams.get("category") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    game: searchParams.get("game") ?? undefined,
    includeDraw: searchParams.get("includeDraw") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    linkedOnly: searchParams.get("linkedOnly") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    to: searchParams.get("to") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const fromDate = parseDate(parsed.data.from);
  const toDate = parseDate(parsed.data.to);
  if (parsed.data.from && !fromDate) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (parsed.data.to && !toDate) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const page = parsePositiveInt(parsed.data.page, 1, 10_000);
  const limit = parsePositiveInt(parsed.data.limit, 50, 200);
  const includeDraw = parsed.data.includeDraw === "true";
  const linkedOnly = parsed.data.linkedOnly === "true";

  const where: {
    category?: string;
    drawDate?: { gte?: Date; lte?: Date };
    drawResultId?: { not: null };
    game?: string;
  } = {};

  if (parsed.data.game) {
    where.game = parsed.data.game;
  }
  if (parsed.data.category) {
    where.category = parsed.data.category;
  }
  if (linkedOnly) {
    where.drawResultId = { not: null };
  }
  if (fromDate || toDate) {
    const range: { gte?: Date; lte?: Date } = {};
    if (fromDate) {
      range.gte = fromDate;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.drawDate = range;
  }

  const [total, winners] = await Promise.all([
    prisma.winnerRecord.count({ where }),
    prisma.winnerRecord.findMany({
      where,
      include: includeDraw ? { drawResult: true } : undefined,
      orderBy: [{ drawDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return NextResponse.json({
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    },
    winners: winners.map((winner) => serializeWinnerRecord(winner, includeDraw))
  });
}
