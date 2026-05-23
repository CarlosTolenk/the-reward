import { getBaseNumbers, pairKey, splitDrawNumbers } from "./analysis";
import type { DrawResult, Frequency, PairFrequency } from "./types";

export type HistoryWindow = {
  drawCount: number;
  draws: DrawResult[];
  from: Date | null;
  months: number;
  to: Date | null;
};

export type NumberHistoryInsight = {
  count: number;
  drawCount: number;
  frequency: number;
  kind: "base" | "mas" | "superMas";
  number: number;
};

export type TicketHistorySnapshot = {
  base: NumberHistoryInsight[];
  mas?: NumberHistoryInsight;
  ranking: {
    baseAverageFrequency: number;
    baseMinimumFrequency: number;
    bonusAverageFrequency: number;
    pairAverageFrequency: number;
    score: number;
  };
  superMas?: NumberHistoryInsight;
};

export type RankedTicketHistory = {
  history: TicketHistorySnapshot;
  ticket: number[];
};

export type HistoricalThresholdStatus = {
  bestScore: number;
  satisfiedAll: boolean;
  satisfiedCount: number;
  target: number | null;
};

export function calculateFrequencies(draws: DrawResult[]): Frequency[] {
  const counts = new Map<number, number>();
  for (const draw of draws) {
    for (const value of getBaseNumbers(draw)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number);
}

export function calculatePairFrequencies(draws: DrawResult[]): PairFrequency[] {
  const counts = new Map<string, { pair: [number, number]; count: number }>();
  for (const draw of draws) {
    const numbers = [...getBaseNumbers(draw)].sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        const pair: [number, number] = [numbers[i], numbers[j]];
        const key = pairKey(pair[0], pair[1]);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { pair, count: 1 });
        }
      }
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.pair[0] - b.pair[0])
    .slice(0, 10);
}

export function topNumbers(draws: DrawResult[], limit: number): Frequency[] {
  return calculateFrequencies(draws).slice(0, limit);
}

export function buildRecentHistoryWindow(draws: DrawResult[], months: number): HistoryWindow {
  if (draws.length === 0) {
    return {
      drawCount: 0,
      draws: [],
      from: null,
      months,
      to: null
    };
  }

  const sorted = [...draws].sort((a, b) => b.date.getTime() - a.date.getTime());
  const to = sorted[0].date;
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  const filtered = sorted.filter((draw) => draw.date >= from && draw.date <= to);

  return {
    drawCount: filtered.length,
    draws: filtered,
    from,
    months,
    to
  };
}

function buildNumberHistoryInsight(
  draws: DrawResult[],
  number: number,
  kind: "base" | "mas" | "superMas"
): NumberHistoryInsight {
  const count = draws.reduce((acc, draw) => {
    const parsed = splitDrawNumbers(draw.numbers);
    if (kind === "base") {
      return acc + (parsed.base.includes(number) ? 1 : 0);
    }
    return acc + (parsed[kind] === number ? 1 : 0);
  }, 0);

  return {
    count,
    drawCount: draws.length,
    frequency: draws.length === 0 ? 0 : count / draws.length,
    kind,
    number
  };
}

function buildPairFrequency(draws: DrawResult[], pair: [number, number]): number {
  const count = draws.reduce((acc, draw) => {
    const base = splitDrawNumbers(draw.numbers).base;
    return acc + (base.includes(pair[0]) && base.includes(pair[1]) ? 1 : 0);
  }, 0);

  return draws.length === 0 ? 0 : count / draws.length;
}

export function buildTicketHistorySnapshot(ticket: number[], window: HistoryWindow): TicketHistorySnapshot {
  const parsed = splitDrawNumbers(ticket);
  const base = parsed.base.map((number) => buildNumberHistoryInsight(window.draws, number, "base"));
  const mas = parsed.mas === undefined ? undefined : buildNumberHistoryInsight(window.draws, parsed.mas, "mas");
  const superMas =
    parsed.superMas === undefined
      ? undefined
      : buildNumberHistoryInsight(window.draws, parsed.superMas, "superMas");
  const pairFrequencies: number[] = [];

  for (let i = 0; i < parsed.base.length; i += 1) {
    for (let j = i + 1; j < parsed.base.length; j += 1) {
      pairFrequencies.push(buildPairFrequency(window.draws, [parsed.base[i], parsed.base[j]]));
    }
  }

  const baseAverageFrequency = base.reduce((acc, item) => acc + item.frequency, 0) / Math.max(1, base.length);
  const baseMinimumFrequency = base.reduce((lowest, item) => Math.min(lowest, item.frequency), 1);
  const pairAverageFrequency =
    pairFrequencies.reduce((acc, value) => acc + value, 0) / Math.max(1, pairFrequencies.length);
  const bonusItems = [mas, superMas].filter((item): item is NumberHistoryInsight => item !== undefined);
  const bonusAverageFrequency =
    bonusItems.reduce((acc, item) => acc + item.frequency, 0) / Math.max(1, bonusItems.length);
  const bonusWeight = bonusItems.length > 0 ? 0.1 : 0;
  const baseAverageWeight = 0.5;
  const baseMinimumWeight = 0.15;
  const pairAverageWeight = 0.25;
  const totalWeight = baseAverageWeight + baseMinimumWeight + pairAverageWeight + bonusWeight;
  const score =
    ((baseAverageFrequency * baseAverageWeight +
      baseMinimumFrequency * baseMinimumWeight +
      pairAverageFrequency * pairAverageWeight +
      bonusAverageFrequency * bonusWeight) /
      totalWeight) *
    100;

  return {
    base,
    mas,
    ranking: {
      baseAverageFrequency,
      baseMinimumFrequency,
      bonusAverageFrequency,
      pairAverageFrequency,
      score
    },
    superMas
  };
}

export function compareTicketHistory(left: TicketHistorySnapshot, right: TicketHistorySnapshot): number {
  if (right.ranking.score !== left.ranking.score) {
    return right.ranking.score - left.ranking.score;
  }
  if (right.ranking.baseAverageFrequency !== left.ranking.baseAverageFrequency) {
    return right.ranking.baseAverageFrequency - left.ranking.baseAverageFrequency;
  }
  if (right.ranking.baseMinimumFrequency !== left.ranking.baseMinimumFrequency) {
    return right.ranking.baseMinimumFrequency - left.ranking.baseMinimumFrequency;
  }
  return right.ranking.pairAverageFrequency - left.ranking.pairAverageFrequency;
}

export function rankTicketsByHistory(tickets: number[], window: HistoryWindow): RankedTicketHistory[];
export function rankTicketsByHistory(tickets: number[][], window: HistoryWindow): RankedTicketHistory[];
export function rankTicketsByHistory(tickets: number[] | number[][], window: HistoryWindow): RankedTicketHistory[] {
  const normalized = Array.isArray(tickets[0]) ? (tickets as number[][]) : [tickets as number[]];

  return normalized
    .map((ticket) => ({
      history: buildTicketHistorySnapshot(ticket, window),
      ticket
    }))
    .sort((left, right) => compareTicketHistory(left.history, right.history));
}

export function selectTicketsByHistoricalThreshold(
  rankedTickets: RankedTicketHistory[],
  count: number,
  target: number | null
): { selected: RankedTicketHistory[]; status: HistoricalThresholdStatus } {
  const qualified =
    target === null ? rankedTickets : rankedTickets.filter((item) => item.history.ranking.score >= target);
  const selected = (qualified.length >= count ? qualified : rankedTickets).slice(0, count);

  return {
    selected,
    status: {
      bestScore: rankedTickets[0]?.history.ranking.score ?? 0,
      satisfiedAll: target === null ? true : qualified.length >= count,
      satisfiedCount: qualified.length,
      target
    }
  };
}
