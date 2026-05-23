import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { suggestionRequestSchema } from "@/src/core/lottery/schema";
import { generateLegacySuggestions, generateSuggestions } from "@/src/core/lottery/generate";
import { canUsePythonV2, generatePythonSuggestions } from "@/src/core/lottery/python";
import {
  buildRecentHistoryWindow,
  rankTicketsByHistory,
  selectTicketsByHistoricalThreshold
} from "@/src/core/lottery/stats";
import type { Constraints, DrawResult, SuggestionResult } from "@/src/core/lottery/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = suggestionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid constraints", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { minHistoricalScore = null, ...constraints } = parsed.data;

  const recent = await prisma.drawResult.findMany({
    where: { game: constraints.game },
    orderBy: { date: "desc" }
  });

  const recentDraws: DrawResult[] = recent.map((draw) => ({
    date: draw.date,
    game: draw.game,
    numbers: JSON.parse(draw.numbers ?? "[]")
  }));

  const strategy = new URL(request.url).searchParams.get("strategy");
  const historyWindow = buildRecentHistoryWindow(recentDraws, 6);
  const baseSeed = constraints.seed ?? `${Date.now()}`;
  const maxBatches = minHistoricalScore === null ? 1 : 12;
  const seenTickets = new Set<string>();
  const pooledTickets: number[][] = [];
  let candidatesConsidered = 0;
  let batchesSearched = 0;
  let resolvedStrategy: SuggestionResult["metadata"]["strategy"] | null = null;
  const wantsLegacy = strategy === "legacy";
  const wantsImproved = strategy === "improved";
  const wantsPythonWinnerContext = strategy === "python-v2w";
  const shouldTryPython = !wantsLegacy && !wantsImproved && canUsePythonV2(constraints);

  for (let batch = 0; batch < maxBatches; batch += 1) {
    batchesSearched += 1;
    const seededConstraints: Constraints = {
      ...constraints,
      seed: `${baseSeed}-historical-${batch}`
    };
    let batchSuggestions: SuggestionResult;

    if (wantsLegacy) {
      batchSuggestions = generateLegacySuggestions(seededConstraints, recentDraws);
    } else if (wantsImproved) {
      batchSuggestions = generateSuggestions(seededConstraints, recentDraws);
    } else if (shouldTryPython) {
      try {
        batchSuggestions = await generatePythonSuggestions(
          seededConstraints,
          wantsPythonWinnerContext ? "python-v2w" : "python-v2"
        );
        if (batchSuggestions.tickets.length === 0) {
          batchSuggestions = generateSuggestions(seededConstraints, recentDraws);
        }
      } catch (error) {
        batchSuggestions = generateSuggestions(seededConstraints, recentDraws);
      }
    } else {
      batchSuggestions = generateSuggestions(seededConstraints, recentDraws);
    }

    resolvedStrategy = batchSuggestions.metadata.strategy;

    candidatesConsidered += batchSuggestions.metadata.candidatesConsidered;

    for (const ticket of batchSuggestions.tickets) {
      const key = ticket.join(",");
      if (seenTickets.has(key)) {
        continue;
      }
      seenTickets.add(key);
      pooledTickets.push(ticket);
    }

    const rankedPool = rankTicketsByHistory(pooledTickets, historyWindow);
    const qualifiedCount =
      minHistoricalScore === null
        ? rankedPool.length
        : rankedPool.filter((item) => item.history.ranking.score >= minHistoricalScore).length;

    if (qualifiedCount >= constraints.count) {
      break;
    }
  }

  const rankedTickets = rankTicketsByHistory(pooledTickets, historyWindow);
  const selection = selectTicketsByHistoricalThreshold(rankedTickets, constraints.count, minHistoricalScore);
  const sortedTickets = selection.selected.map((item) => item.ticket);
  const ticketHistory = selection.selected.map((item) => item.history);
  const metadata = {
    batchesSearched,
    candidatesConsidered,
    generatedAt: new Date().toISOString(),
    seed: baseSeed,
    strategy:
      resolvedStrategy ??
      (wantsLegacy ? "legacy" : shouldTryPython ? (wantsPythonWinnerContext ? "python-v2w" : "python-v2") : "improved")
  };

  await prisma.suggestionRun.create({
    data: {
      constraints: JSON.stringify(parsed.data),
      suggestions: JSON.stringify(sortedTickets),
      seed: baseSeed
    }
  });

  return NextResponse.json({
    metadata,
    tickets: sortedTickets,
    historyWindow: {
      drawCount: historyWindow.drawCount,
      from: historyWindow.from?.toISOString().slice(0, 10) ?? null,
      months: historyWindow.months,
      to: historyWindow.to?.toISOString().slice(0, 10) ?? null
    },
    historicalThreshold: selection.status,
    ticketHistory
  });
}
