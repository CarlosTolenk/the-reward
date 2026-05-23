import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { drawInsightsQuerySchema } from "@/src/core/lottery/schema";
import { serializeDrawWithWinners } from "@/src/core/lottery/winners";

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
  const parsed = drawInsightsQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    game: searchParams.get("game") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    winnersOnly: searchParams.get("winnersOnly") ?? undefined
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
  const winnersOnly = parsed.data.winnersOnly === "true";
  const game = parsed.data.game ?? "leidsa-loto";

  const where: {
    date?: { gte?: Date; lte?: Date };
    game: string;
    winners?: { some: {} };
  } = { game };

  if (winnersOnly) {
    where.winners = { some: {} };
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
    where.date = range;
  }

  const [total, draws] = await Promise.all([
    prisma.drawResult.count({ where }),
    prisma.drawResult.findMany({
      where,
      include: {
        winners: {
          orderBy: [{ drawDate: "desc" }, { id: "desc" }]
        }
      },
      orderBy: { date: "desc" },
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
    draws: draws.map((draw) => serializeDrawWithWinners(draw))
  });
}
