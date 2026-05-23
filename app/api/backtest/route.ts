import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { runBacktest } from "@/src/core/lottery/backtest";
import { backtestSchema } from "@/src/core/lottery/schema";
import type { DrawResult } from "@/src/core/lottery/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = backtestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid backtest payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const draws = await prisma.drawResult.findMany({
    where: { game: parsed.data.constraints.game },
    orderBy: { date: "desc" }
  });

  const mapped: DrawResult[] = draws.map((draw) => ({
    date: draw.date,
    game: draw.game,
    numbers: JSON.parse(draw.numbers ?? "[]")
  }));

  const result = runBacktest({
    constraints: parsed.data.constraints,
    draws: mapped,
    trainingWindow: parsed.data.trainingWindow
  });

  return NextResponse.json(result);
}
