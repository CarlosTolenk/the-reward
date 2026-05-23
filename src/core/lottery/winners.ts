import type { DrawResult as PrismaDrawResult, WinnerRecord as PrismaWinnerRecord } from "@prisma/client";

type WinnerPayload = {
  address?: string | null;
  detailUrl?: string | null;
  drawDate?: string | null;
  location?: string | null;
  soldIn?: string | null;
  winnerReference?: string | null;
  winningNumbers?: number[] | null;
  winningNumbersText?: string | null;
};

type WinnerWithDraw = PrismaWinnerRecord & {
  drawResult?: PrismaDrawResult | null;
};

type DrawWithWinners = PrismaDrawResult & {
  winners?: PrismaWinnerRecord[];
};

export function parseWinnerPayload(rawPayload: string): WinnerPayload {
  try {
    const parsed = JSON.parse(rawPayload) as WinnerPayload;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeWinnerRecord(record: WinnerWithDraw, includeDraw = false) {
  const payload = parseWinnerPayload(record.rawPayload);

  return {
    id: record.id,
    signature: record.signature,
    game: record.game,
    category: record.category,
    drawDate: record.drawDate?.toISOString().slice(0, 10) ?? null,
    winnerName: record.winnerName,
    prizeAmountText: record.prizeAmountText,
    prizeAmountValue: record.prizeAmountValue,
    currency: record.currency,
    location: record.location,
    detailUrl: record.detailUrl ?? payload.detailUrl ?? null,
    soldIn: payload.soldIn ?? null,
    address: payload.address ?? null,
    winnerReference: payload.winnerReference ?? null,
    winningNumbers: Array.isArray(payload.winningNumbers) ? payload.winningNumbers : null,
    winningNumbersText: payload.winningNumbersText ?? null,
    sourcePage: record.sourcePage,
    sourceOrder: record.sourceOrder,
    drawResultId: record.drawResultId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    drawResult:
      includeDraw && record.drawResult
        ? {
            id: record.drawResult.id,
            date: record.drawResult.date.toISOString().slice(0, 10),
            game: record.drawResult.game,
            numbers: JSON.parse(record.drawResult.numbers ?? "[]")
          }
        : undefined
  };
}

export function serializeDrawWithWinners(draw: DrawWithWinners) {
  const winners = draw.winners ?? [];
  const prizeValues = winners
    .map((winner) => winner.prizeAmountValue)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    id: draw.id,
    date: draw.date.toISOString().slice(0, 10),
    game: draw.game,
    numbers: JSON.parse(draw.numbers ?? "[]"),
    winnerSummary: {
      winnerCount: winners.length,
      hasWinners: winners.length > 0,
      sharedJackpot: winners.length > 1,
      totalPrizeAmount: prizeValues.reduce((sum, value) => sum + value, 0),
      maxPrizeAmount: prizeValues.length > 0 ? Math.max(...prizeValues) : null,
      winnerNames: winners.map((winner) => winner.winnerName).filter((value): value is string => Boolean(value))
    },
    winners: winners.map((winner) => serializeWinnerRecord(winner))
  };
}
