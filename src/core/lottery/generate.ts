import {
  BASE_COUNT,
  BASE_MAX,
  BASE_MIN,
  MAS_MAX,
  MAS_MIN,
  SUPER_MAX,
  SUPER_MIN,
  evenCount,
  gapVariance,
  getBaseNumbers,
  mean,
  mode,
  overlapCount,
  pairKey,
  splitDrawNumbers,
  standardDeviation,
  sum,
  toRecentSet
} from "./analysis";
import { mulberry32, seedToInt } from "./random";
import type { Constraints, DrawResult, SuggestionResult } from "./types";

const LEGACY_ATTEMPTS = 4000;
const IMPROVED_ATTEMPTS = 12000;

type HistoricalProfile = {
  evenMode: number;
  frequencyBoost: Map<number, number>;
  gapStd: number;
  gapVarianceMean: number;
  lastDrawBase: number[];
  lastDrawMas?: number;
  lastDrawSuperMas?: number;
  masWeights: Map<number, number>;
  overdueBoost: Map<number, number>;
  pairBoost: Map<string, number>;
  recentNumbers: Set<number>;
  superMasWeights: Map<number, number>;
  sumMean: number;
  sumStd: number;
  targetWeekday: number;
  weights: Map<number, number>;
};

function range(min: number, max: number): number[] {
  const values: number[] = [];
  for (let i = min; i <= max; i += 1) {
    values.push(i);
  }
  return values;
}

function pickUnique(count: number, min: number, max: number, rand: () => number): number[] {
  const pool = range(min, max);
  const selection: number[] = [];
  while (selection.length < count && pool.length > 0) {
    const index = Math.floor(rand() * pool.length);
    selection.push(pool.splice(index, 1)[0]);
  }
  return selection.sort((a, b) => a - b);
}

function pickWeightedUnique(count: number, weights: Map<number, number>, rand: () => number): number[] {
  const pool = range(BASE_MIN, BASE_MAX);
  const selection: number[] = [];

  while (selection.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((acc, value) => acc + (weights.get(value) ?? 0.1), 0);
    let threshold = rand() * totalWeight;
    let chosenIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      threshold -= weights.get(pool[index]) ?? 0.1;
      if (threshold <= 0) {
        chosenIndex = index;
        break;
      }
    }

    selection.push(pool.splice(chosenIndex, 1)[0]);
  }

  return selection.sort((a, b) => a - b);
}

function pickOne(min: number, max: number, rand: () => number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pickWeightedOne(min: number, max: number, weights: Map<number, number>, rand: () => number): number {
  const pool = range(min, max);
  const totalWeight = pool.reduce((acc, value) => acc + (weights.get(value) ?? 0.1), 0);
  let threshold = rand() * totalWeight;

  for (const value of pool) {
    threshold -= weights.get(value) ?? 0.1;
    if (threshold <= 0) {
      return value;
    }
  }

  return pool[pool.length - 1];
}

function resolveTargetWeekday(drawDay: Constraints["drawDay"]): number {
  if (drawDay === "wednesday") {
    return 3;
  }
  if (drawDay === "saturday") {
    return 6;
  }
  const today = new Date();
  const day = today.getDay();
  if (day <= 3) {
    return 3;
  }
  if (day <= 6) {
    return 6;
  }
  return 3;
}

function buildFrequencyBoost(draws: DrawResult[], targetWeekday: number): Map<number, number> {
  const overall = new Map<number, number>();
  const weekday = new Map<number, number>();

  for (const draw of draws) {
    const base = getBaseNumbers(draw);
    for (const value of base) {
      overall.set(value, (overall.get(value) ?? 0) + 1);
    }
    if (draw.date.getDay() === targetWeekday) {
      for (const value of base) {
        weekday.set(value, (weekday.get(value) ?? 0) + 1);
      }
    }
  }

  const boost = new Map<number, number>();
  for (const [value, count] of overall.entries()) {
    const weekdayCount = weekday.get(value) ?? 0;
    boost.set(value, count * 0.2 + weekdayCount * 0.6);
  }
  return boost;
}

function buildBonusWeights(
  draws: DrawResult[],
  targetWeekday: number,
  bonusKey: "mas" | "superMas",
  min: number,
  max: number
): Map<number, number> {
  const overallCounts = new Map<number, number>();
  const recentCounts = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();
  const lastSeenIndex = new Map<number, number>();
  const recentWindow = draws.slice(0, 20);

  draws.forEach((draw, drawIndex) => {
    const bonus = splitDrawNumbers(draw.numbers)[bonusKey];
    if (bonus === undefined) {
      return;
    }

    overallCounts.set(bonus, (overallCounts.get(bonus) ?? 0) + 1);
    if (drawIndex < recentWindow.length) {
      recentCounts.set(bonus, (recentCounts.get(bonus) ?? 0) + 1);
    }
    if (draw.date.getDay() === targetWeekday) {
      weekdayCounts.set(bonus, (weekdayCounts.get(bonus) ?? 0) + 1);
    }
    if (!lastSeenIndex.has(bonus)) {
      lastSeenIndex.set(bonus, drawIndex);
    }
  });

  const drawCount = Math.max(1, draws.length);
  const weights = new Map<number, number>();

  for (const value of range(min, max)) {
    const overall = (overallCounts.get(value) ?? 0) / drawCount;
    const recent = (recentCounts.get(value) ?? 0) / Math.max(1, recentWindow.length);
    const weekday = (weekdayCounts.get(value) ?? 0) / drawCount;
    const overdue = (lastSeenIndex.get(value) ?? drawCount) / drawCount;

    weights.set(value, Math.max(0.08, 0.2 + overall * 1.1 + recent * 0.45 + weekday * 0.35 + overdue * 0.2));
  }

  return weights;
}

function ticketScoreLegacy(
  ticket: number[],
  recentNumbers: Set<number>,
  frequencyBoost: Map<number, number>
): number {
  const recentPenalty = ticket.reduce((acc, value) => acc + (recentNumbers.has(value) ? 1 : 0), 0);
  const variance = gapVariance(ticket, BASE_MIN, BASE_MAX);
  const frequencyScore = ticket.reduce((acc, value) => acc + (frequencyBoost.get(value) ?? 0), 0);
  return frequencyScore - recentPenalty - variance * 0.1;
}

function buildHistoricalProfile(draws: DrawResult[], constraints: Constraints): HistoricalProfile {
  const targetWeekday = resolveTargetWeekday(constraints.drawDay);
  const frequencyBoost = buildFrequencyBoost(draws, targetWeekday);
  const recentNumbers = toRecentSet(draws, constraints.avoidLastN);
  const recent30 = draws.slice(0, 30);
  const recent12 = draws.slice(0, 12);
  const overallCounts = new Map<number, number>();
  const recentCounts = new Map<number, number>();
  const veryRecentCounts = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();
  const pairCounts = new Map<string, number>();
  const lastSeenIndex = new Map<number, number>();
  const sums: number[] = [];
  const evens: number[] = [];
  const variances: number[] = [];

  draws.forEach((draw, drawIndex) => {
    const base = getBaseNumbers(draw);
    sums.push(sum(base));
    evens.push(evenCount(base));
    variances.push(gapVariance(base, BASE_MIN, BASE_MAX));

    base.forEach((value) => {
      overallCounts.set(value, (overallCounts.get(value) ?? 0) + 1);
      if (drawIndex < 30) {
        recentCounts.set(value, (recentCounts.get(value) ?? 0) + 1);
      }
      if (drawIndex < 12) {
        veryRecentCounts.set(value, (veryRecentCounts.get(value) ?? 0) + 1);
      }
      if (draw.date.getDay() === targetWeekday) {
        weekdayCounts.set(value, (weekdayCounts.get(value) ?? 0) + 1);
      }
      if (!lastSeenIndex.has(value)) {
        lastSeenIndex.set(value, drawIndex);
      }
    });

    for (let i = 0; i < base.length; i += 1) {
      for (let j = i + 1; j < base.length; j += 1) {
        const key = pairKey(base[i], base[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  });

  const drawCount = Math.max(1, draws.length);
  const pairMax = Math.max(1, ...pairCounts.values(), 1);
  const weights = new Map<number, number>();
  const overdueBoost = new Map<number, number>();
  const masWeights = buildBonusWeights(draws, targetWeekday, "mas", MAS_MIN, MAS_MAX);
  const superMasWeights = buildBonusWeights(draws, targetWeekday, "superMas", SUPER_MIN, SUPER_MAX);
  const lastDrawSplit = draws[0] ? splitDrawNumbers(draws[0].numbers) : undefined;

  for (const value of range(BASE_MIN, BASE_MAX)) {
    const overall = (overallCounts.get(value) ?? 0) / drawCount;
    const recent = (recentCounts.get(value) ?? 0) / Math.max(1, recent30.length);
    const veryRecent = (veryRecentCounts.get(value) ?? 0) / Math.max(1, recent12.length);
    const weekday = (weekdayCounts.get(value) ?? 0) / drawCount;
    const overdue = (lastSeenIndex.get(value) ?? drawCount) / drawCount;
    const recentPenalty = recentNumbers.has(value) ? 0.12 : 0;

    const weight = Math.max(
      0.05,
      0.35 + overall * 0.9 + recent * 0.35 + weekday * 0.35 + overdue * 0.15 - veryRecent * 0.08 - recentPenalty
    );
    weights.set(value, weight);
    overdueBoost.set(value, overdue);
  }

  const pairBoost = new Map<string, number>();
  for (const [key, count] of pairCounts.entries()) {
    pairBoost.set(key, count / pairMax);
  }

  return {
    evenMode: evens.length === 0 ? 3 : mode(evens),
    frequencyBoost,
    gapStd: standardDeviation(variances),
    gapVarianceMean: mean(variances),
    lastDrawBase: draws[0] ? getBaseNumbers(draws[0]) : [],
    lastDrawMas: lastDrawSplit?.mas,
    lastDrawSuperMas: lastDrawSplit?.superMas,
    masWeights,
    overdueBoost,
    pairBoost,
    recentNumbers,
    superMasWeights,
    sumMean: mean(sums),
    sumStd: standardDeviation(sums),
    targetWeekday,
    weights
  };
}

function resolveObjectiveWeights(constraints: Constraints): {
  base: number;
  mas: number;
  repeatBasePenalty: number;
  repeatMasPenalty: number;
  repeatSuperMasPenalty: number;
  superMas: number;
} {
  switch (constraints.target) {
    case "base":
      return {
        base: 1.15,
        mas: 0.1,
        repeatBasePenalty: 0.18,
        repeatMasPenalty: 0.05,
        repeatSuperMasPenalty: 0.05,
        superMas: 0.1
      };
    case "mas":
      return {
        base: 0.95,
        mas: constraints.includeMas ? 0.85 : 0,
        repeatBasePenalty: 0.12,
        repeatMasPenalty: 0.1,
        repeatSuperMasPenalty: 0.04,
        superMas: 0.08
      };
    case "supermas":
      return {
        base: 0.95,
        mas: 0.15,
        repeatBasePenalty: 0.12,
        repeatMasPenalty: 0.05,
        repeatSuperMasPenalty: 0.1,
        superMas: constraints.includeSuperMas ? 0.85 : 0
      };
    case "jackpot":
      return {
        base: 1.1,
        mas: constraints.includeMas ? 0.65 : 0,
        repeatBasePenalty: 0.14,
        repeatMasPenalty: 0.08,
        repeatSuperMasPenalty: 0.08,
        superMas: constraints.includeSuperMas ? 0.7 : 0
      };
    case "balanced":
    default:
      return {
        base: 1,
        mas: constraints.includeMas ? 0.3 : 0,
        repeatBasePenalty: 0.15,
        repeatMasPenalty: 0.06,
        repeatSuperMasPenalty: 0.06,
        superMas: constraints.includeSuperMas ? 0.3 : 0
      };
  }
}

function ticketScoreImproved(ticket: number[], profile: HistoricalProfile, constraints: Constraints): number {
  const parsed = splitDrawNumbers(ticket);
  const base = parsed.base.slice(0, BASE_COUNT);
  const objective = resolveObjectiveWeights(constraints);
  const legacyAnchor = ticketScoreLegacy(base, profile.recentNumbers, profile.frequencyBoost);
  const frequencyScore = base.reduce((acc, value) => acc + (profile.weights.get(value) ?? 0), 0);
  const overdueScore = base.reduce((acc, value) => acc + (profile.overdueBoost.get(value) ?? 0), 0);
  const pairScore = base.reduce((acc, value, index) => {
    let total = acc;
    for (let next = index + 1; next < base.length; next += 1) {
      total += profile.pairBoost.get(pairKey(value, base[next])) ?? 0;
    }
    return total;
  }, 0);
  const repeatLastPenalty = overlapCount(base, profile.lastDrawBase);
  const sumPenalty = Math.abs(sum(base) - profile.sumMean) / Math.max(1, profile.sumStd);
  const evenPenalty = Math.abs(evenCount(base) - profile.evenMode);
  const variancePenalty =
    Math.abs(gapVariance(base, BASE_MIN, BASE_MAX) - profile.gapVarianceMean) / Math.max(1, profile.gapStd);
  const masScore =
    parsed.mas === undefined
      ? 0
      : (profile.masWeights.get(parsed.mas) ?? 0.1) * 1.8 -
        (profile.lastDrawMas === parsed.mas ? objective.repeatMasPenalty : 0);
  const superMasScore =
    parsed.superMas === undefined
      ? 0
      : (profile.superMasWeights.get(parsed.superMas) ?? 0.1) * 1.8 -
        (profile.lastDrawSuperMas === parsed.superMas ? objective.repeatSuperMasPenalty : 0);
  const baseScore =
    legacyAnchor +
    frequencyScore * 0.08 +
    overdueScore * 0.25 +
    pairScore * 0.35 -
    repeatLastPenalty * objective.repeatBasePenalty -
    sumPenalty * 0.12 -
    evenPenalty * 0.08 -
    variancePenalty * 0.05;

  return (
    baseScore * objective.base +
    masScore * objective.mas +
    superMasScore * objective.superMas
  );
}

export function passesHardFilters(ticket: number[], constraints: Constraints): boolean {
  const total = sum(ticket);
  if (total < constraints.sumMin || total > constraints.sumMax) {
    return false;
  }
  const evens = evenCount(ticket);
  if (evens < constraints.evenMin || evens > constraints.evenMax) {
    return false;
  }
  const unique = new Set(ticket);
  if (unique.size !== ticket.length) {
    return false;
  }
  return true;
}

function buildExtras(constraints: Constraints, rand: () => number): number[] {
  const extras: number[] = [];
  if (constraints.includeMas) {
    extras.push(pickOne(MAS_MIN, MAS_MAX, rand));
  }
  if (constraints.includeSuperMas) {
    extras.push(pickOne(SUPER_MIN, SUPER_MAX, rand));
  }
  return extras;
}

function buildImprovedExtras(
  constraints: Constraints,
  profile: HistoricalProfile,
  rand: () => number,
  useWeighted: boolean
): number[] {
  const extras: number[] = [];
  if (constraints.includeMas) {
    extras.push(
      useWeighted ? pickWeightedOne(MAS_MIN, MAS_MAX, profile.masWeights, rand) : pickOne(MAS_MIN, MAS_MAX, rand)
    );
  }
  if (constraints.includeSuperMas) {
    extras.push(
      useWeighted
        ? pickWeightedOne(SUPER_MIN, SUPER_MAX, profile.superMasWeights, rand)
        : pickOne(SUPER_MIN, SUPER_MAX, rand)
    );
  }
  return extras;
}

function finalizeSuggestions(
  scored: Array<{ score: number; ticket: number[] }>,
  constraints: Constraints,
  strategy: "legacy" | "improved",
  seed: string
): SuggestionResult {
  const selected: number[][] = [];
  const remaining = [...scored];

  while (selected.length < constraints.count && remaining.length > 0) {
    remaining.sort((a, b) => b.score - a.score);
    const next = remaining.shift();
    if (!next) {
      break;
    }
    const diversityPenalty = selected.reduce(
      (acc, ticket) => acc + overlapCount(ticket.slice(0, BASE_COUNT), next.ticket.slice(0, BASE_COUNT)),
      0
    );
    const score = next.score - diversityPenalty * 0.4;
    if (score > -10 || selected.length === 0) {
      selected.push(next.ticket);
    }
  }

  return {
    tickets: selected,
    metadata: {
      generatedAt: new Date().toISOString(),
      seed,
      candidatesConsidered: scored.length,
      strategy
    }
  };
}

export function generateLegacySuggestions(
  constraints: Constraints,
  recentDraws: DrawResult[]
): SuggestionResult {
  const seed = constraints.seed ?? `${Date.now()}`;
  const rand = mulberry32(seedToInt(seed));
  const targetWeekday = resolveTargetWeekday(constraints.drawDay);
  const frequencyBoost = buildFrequencyBoost(recentDraws, targetWeekday);
  const recentNumbers = toRecentSet(recentDraws, constraints.avoidLastN);
  const candidates: number[][] = [];
  let attempts = 0;

  while (candidates.length < constraints.count * 6 && attempts < LEGACY_ATTEMPTS) {
    const base = pickUnique(BASE_COUNT, BASE_MIN, BASE_MAX, rand);
    const ticket = [...base, ...buildExtras(constraints, rand)];
    attempts += 1;
    if (passesHardFilters(base, constraints)) {
      candidates.push(ticket);
    }
  }

  const scored = candidates.map((ticket) => ({
    score: ticketScoreLegacy(ticket.slice(0, BASE_COUNT), recentNumbers, frequencyBoost),
    ticket
  }));

  return finalizeSuggestions(scored, constraints, "legacy", seed);
}

export function generateSuggestions(
  constraints: Constraints,
  recentDraws: DrawResult[]
): SuggestionResult {
  const seed = constraints.seed ?? `${Date.now()}`;
  const rand = mulberry32(seedToInt(seed));
  const profile = buildHistoricalProfile(recentDraws, constraints);
  const candidates: number[][] = [];
  let attempts = 0;

  while (candidates.length < constraints.count * 14 && attempts < IMPROVED_ATTEMPTS) {
    const base =
      attempts % 3 === 0
        ? pickUnique(BASE_COUNT, BASE_MIN, BASE_MAX, rand)
        : pickWeightedUnique(BASE_COUNT, profile.weights, rand);
    const ticket = [...base, ...buildImprovedExtras(constraints, profile, rand, attempts % 4 !== 0)];
    attempts += 1;
    if (passesHardFilters(base, constraints)) {
      candidates.push(ticket);
    }
  }

  const scored = candidates.map((ticket) => ({
    score: ticketScoreImproved(ticket, profile, constraints),
    ticket
  }));

  return finalizeSuggestions(scored, constraints, "improved", seed);
}
