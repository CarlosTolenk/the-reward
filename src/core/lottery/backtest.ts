import { BASE_COUNT, overlapCount, splitDrawNumbers } from "./analysis";
import { generateLegacySuggestions, generateSuggestions } from "./generate";
import type { Constraints, DrawResult, SuggestionResult } from "./types";

export type BacktestRequest = {
  constraints: Constraints;
  draws: DrawResult[];
  trainingWindow?: number;
};

type DrawBacktestMetrics = {
  anyMasHit: boolean;
  anySuperMasHit: boolean;
  averageBaseHits: number;
  maxBaseHits: number;
  ticketsWithExact6: number;
  ticketsWithExact6AndMas: number;
  ticketsWithExact6AndMasAndSuperMas: number;
  ticketsWithExact6AndSuperMas: number;
};

type BacktestRun = {
  averageBaseHits: number;
  drawsWithAnyMasHit: number;
  drawsWithAnySuperMasHit: number;
  drawsWithExact6: number;
  drawsWithExact6AndMas: number;
  drawsWithExact6AndMasAndSuperMas: number;
  drawsWithExact6AndSuperMas: number;
  drawCount: number;
  exact6HitRate: number;
  exact6MasHitRate: number;
  exact6MasSuperMasHitRate: number;
  exact6SuperMasHitRate: number;
  hitDistribution: Record<string, number>;
  masHitRate: number;
  maxBaseHitsAverage: number;
  superMasHitRate: number;
  ticketExact6AndMasAndSuperMasCount: number;
  ticketExact6AndMasCount: number;
  ticketExact6AndSuperMasCount: number;
  ticketExact6Count: number;
};

type BacktestComparisonRow = {
  actual: {
    base: number[];
    mas?: number;
    superMas?: number;
  };
  date: string;
  improved: DrawBacktestMetrics;
  legacy: DrawBacktestMetrics;
};

export type BacktestResult = {
  comparison: {
    improved: BacktestRun;
    legacy: BacktestRun;
  };
  drawsEvaluated: number;
  trainingWindow: number;
  byDraw: BacktestComparisonRow[];
};

function scoreSuggestions(actualDraw: DrawResult, suggestions: SuggestionResult): DrawBacktestMetrics {
  if (suggestions.tickets.length === 0) {
    return {
      anyMasHit: false,
      anySuperMasHit: false,
      averageBaseHits: 0,
      maxBaseHits: 0,
      ticketsWithExact6: 0,
      ticketsWithExact6AndMas: 0,
      ticketsWithExact6AndMasAndSuperMas: 0,
      ticketsWithExact6AndSuperMas: 0
    };
  }

  const actual = splitDrawNumbers(actualDraw.numbers);
  let totalBaseHits = 0;
  let maxBaseHits = 0;
  let ticketsWithExact6 = 0;
  let ticketsWithExact6AndMas = 0;
  let ticketsWithExact6AndSuperMas = 0;
  let ticketsWithExact6AndMasAndSuperMas = 0;
  let anyMasHit = false;
  let anySuperMasHit = false;

  for (const ticket of suggestions.tickets) {
    const parsed = splitDrawNumbers(ticket);
    const baseHits = overlapCount(actual.base, parsed.base.slice(0, BASE_COUNT));
    const masHit = actual.mas !== undefined && parsed.mas !== undefined && actual.mas === parsed.mas;
    const superMasHit =
      actual.superMas !== undefined &&
      parsed.superMas !== undefined &&
      actual.superMas === parsed.superMas;

    totalBaseHits += baseHits;
    maxBaseHits = Math.max(maxBaseHits, baseHits);
    anyMasHit = anyMasHit || masHit;
    anySuperMasHit = anySuperMasHit || superMasHit;

    if (baseHits === BASE_COUNT) {
      ticketsWithExact6 += 1;
      if (masHit) {
        ticketsWithExact6AndMas += 1;
      }
      if (superMasHit) {
        ticketsWithExact6AndSuperMas += 1;
      }
      if (masHit && superMasHit) {
        ticketsWithExact6AndMasAndSuperMas += 1;
      }
    }
  }

  return {
    anyMasHit,
    anySuperMasHit,
    averageBaseHits: totalBaseHits / suggestions.tickets.length,
    maxBaseHits,
    ticketsWithExact6,
    ticketsWithExact6AndMas,
    ticketsWithExact6AndMasAndSuperMas,
    ticketsWithExact6AndSuperMas
  };
}

function summarizeRun(rows: DrawBacktestMetrics[]): BacktestRun {
  const hitDistribution: Record<string, number> = {};
  let totalAverageBaseHits = 0;
  let totalMaxBaseHits = 0;
  let totalDrawsWithAnyMasHit = 0;
  let totalDrawsWithAnySuperMasHit = 0;
  let totalDrawsWithExact6 = 0;
  let totalDrawsWithExact6AndMas = 0;
  let totalDrawsWithExact6AndSuperMas = 0;
  let totalDrawsWithExact6AndMasAndSuperMas = 0;
  let totalTicketExact6 = 0;
  let totalTicketExact6AndMas = 0;
  let totalTicketExact6AndSuperMas = 0;
  let totalTicketExact6AndMasAndSuperMas = 0;

  for (const row of rows) {
    totalAverageBaseHits += row.averageBaseHits;
    totalMaxBaseHits += row.maxBaseHits;
    totalDrawsWithAnyMasHit += row.anyMasHit ? 1 : 0;
    totalDrawsWithAnySuperMasHit += row.anySuperMasHit ? 1 : 0;
    totalDrawsWithExact6 += row.ticketsWithExact6 > 0 ? 1 : 0;
    totalDrawsWithExact6AndMas += row.ticketsWithExact6AndMas > 0 ? 1 : 0;
    totalDrawsWithExact6AndSuperMas += row.ticketsWithExact6AndSuperMas > 0 ? 1 : 0;
    totalDrawsWithExact6AndMasAndSuperMas += row.ticketsWithExact6AndMasAndSuperMas > 0 ? 1 : 0;
    totalTicketExact6 += row.ticketsWithExact6;
    totalTicketExact6AndMas += row.ticketsWithExact6AndMas;
    totalTicketExact6AndSuperMas += row.ticketsWithExact6AndSuperMas;
    totalTicketExact6AndMasAndSuperMas += row.ticketsWithExact6AndMasAndSuperMas;
    const key = `${row.maxBaseHits}`;
    hitDistribution[key] = (hitDistribution[key] ?? 0) + 1;
  }

  const drawCount = rows.length;
  return {
    averageBaseHits: drawCount === 0 ? 0 : totalAverageBaseHits / drawCount,
    drawsWithAnyMasHit: totalDrawsWithAnyMasHit,
    drawsWithAnySuperMasHit: totalDrawsWithAnySuperMasHit,
    drawsWithExact6: totalDrawsWithExact6,
    drawsWithExact6AndMas: totalDrawsWithExact6AndMas,
    drawsWithExact6AndMasAndSuperMas: totalDrawsWithExact6AndMasAndSuperMas,
    drawsWithExact6AndSuperMas: totalDrawsWithExact6AndSuperMas,
    drawCount,
    exact6HitRate: drawCount === 0 ? 0 : totalDrawsWithExact6 / drawCount,
    exact6MasHitRate: drawCount === 0 ? 0 : totalDrawsWithExact6AndMas / drawCount,
    exact6MasSuperMasHitRate:
      drawCount === 0 ? 0 : totalDrawsWithExact6AndMasAndSuperMas / drawCount,
    exact6SuperMasHitRate: drawCount === 0 ? 0 : totalDrawsWithExact6AndSuperMas / drawCount,
    hitDistribution,
    masHitRate: drawCount === 0 ? 0 : totalDrawsWithAnyMasHit / drawCount,
    maxBaseHitsAverage: drawCount === 0 ? 0 : totalMaxBaseHits / drawCount,
    superMasHitRate: drawCount === 0 ? 0 : totalDrawsWithAnySuperMasHit / drawCount,
    ticketExact6AndMasAndSuperMasCount: totalTicketExact6AndMasAndSuperMas,
    ticketExact6AndMasCount: totalTicketExact6AndMas,
    ticketExact6AndSuperMasCount: totalTicketExact6AndSuperMas,
    ticketExact6Count: totalTicketExact6
  };
}

export function runBacktest(request: BacktestRequest): BacktestResult {
  const drawsAsc = [...request.draws].sort((a, b) => a.date.getTime() - b.date.getTime());
  const trainingWindow = request.trainingWindow ?? Math.min(60, Math.max(20, Math.floor(drawsAsc.length * 0.5)));
  const byDraw: BacktestComparisonRow[] = [];
  const improvedRows: DrawBacktestMetrics[] = [];
  const legacyRows: DrawBacktestMetrics[] = [];

  for (let index = trainingWindow; index < drawsAsc.length; index += 1) {
    const trainingAsc = drawsAsc.slice(0, index);
    const trainingDesc = [...trainingAsc].sort((a, b) => b.date.getTime() - a.date.getTime());
    const testDraw = drawsAsc[index];
    const seededConstraints: Constraints = {
      ...request.constraints,
      seed: `${testDraw.date.toISOString()}-${index}`
    };

    const legacy = generateLegacySuggestions(seededConstraints, trainingDesc);
    const improved = generateSuggestions(seededConstraints, trainingDesc);
    const actual = splitDrawNumbers(testDraw.numbers);
    const legacyMetrics = scoreSuggestions(testDraw, legacy);
    const improvedMetrics = scoreSuggestions(testDraw, improved);

    legacyRows.push(legacyMetrics);
    improvedRows.push(improvedMetrics);
    byDraw.push({
      actual,
      date: testDraw.date.toISOString().slice(0, 10),
      improved: improvedMetrics,
      legacy: legacyMetrics
    });
  }

  return {
    comparison: {
      improved: summarizeRun(improvedRows),
      legacy: summarizeRun(legacyRows)
    },
    drawsEvaluated: byDraw.length,
    trainingWindow,
    byDraw
  };
}
