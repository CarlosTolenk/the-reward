import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { calculatePairFrequencies, topNumbers } from "@/src/core/lottery/stats";
import type { DrawResult } from "@/src/core/lottery/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get("game") ?? undefined;
  const draws = await prisma.drawResult.findMany({
    where: game ? { game } : undefined,
    orderBy: { date: "desc" }
  });

  const mapped: DrawResult[] = draws.map((draw) => ({
    date: draw.date,
    game: draw.game,
    numbers: JSON.parse(draw.numbers ?? "[]")
  }));

  const overall = topNumbers(mapped, 10);
  const last30 = topNumbers(mapped.slice(0, 30), 10);
  const pairs = calculatePairFrequencies(mapped);

  return NextResponse.json({ game: game ?? null, overall, last30, pairs });
}
