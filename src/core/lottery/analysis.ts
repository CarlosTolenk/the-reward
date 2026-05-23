import type { DrawResult } from "./types";

export const BASE_MIN = 1;
export const BASE_MAX = 40;
export const MAS_MIN = 1;
export const MAS_MAX = 12;
export const SUPER_MIN = 1;
export const SUPER_MAX = 15;
export const BASE_COUNT = 6;

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function evenCount(values: number[]): number {
  return values.filter((value) => value % 2 === 0).length;
}

export function gapVariance(values: number[], min: number, max: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const gaps: number[] = [];
  let prev = min;
  for (const value of sorted) {
    gaps.push(value - prev);
    prev = value;
  }
  gaps.push(max - prev);
  const avg = gaps.reduce((acc, value) => acc + value, 0) / gaps.length;
  return gaps.reduce((acc, value) => acc + (value - avg) ** 2, 0) / gaps.length;
}

export function splitDrawNumbers(numbers: number[]): { base: number[]; mas?: number; superMas?: number } {
  if (numbers.length >= 8) {
    return { base: numbers.slice(0, 6), mas: numbers[6], superMas: numbers[7] };
  }
  if (numbers.length === 7) {
    return { base: numbers.slice(0, 6), mas: numbers[6] };
  }
  return { base: numbers.slice(0, 6) };
}

export function getBaseNumbers(draw: DrawResult): number[] {
  return splitDrawNumbers(draw.numbers).base;
}

export function dedupeDrawHistory(draws: DrawResult[]): DrawResult[] {
  const sorted = [...draws].sort((a, b) => b.date.getTime() - a.date.getTime());
  const deduped: DrawResult[] = [];

  for (const draw of sorted) {
    const baseKey = getBaseNumbers(draw).join(",");
    const duplicate = deduped.find((existing) => {
      if (existing.game !== draw.game) {
        return false;
      }
      if (getBaseNumbers(existing).join(",") !== baseKey) {
        return false;
      }
      const diff = Math.abs(existing.date.getTime() - draw.date.getTime());
      return diff <= 36 * 60 * 60 * 1000;
    });

    if (!duplicate) {
      deduped.push(draw);
    }
  }

  return deduped;
}

export function overlapCount(a: number[], b: number[]): number {
  const set = new Set(a);
  return b.reduce((acc, value) => acc + (set.has(value) ? 1 : 0), 0);
}

export function toRecentSet(draws: DrawResult[], count: number): Set<number> {
  const recent = draws.slice(0, count);
  const set = new Set<number>();
  for (const draw of recent) {
    const { base } = splitDrawNumbers(draw.numbers);
    for (const number of base) {
      set.add(number);
    }
  }
  return set;
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return sum(values) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 1;
  }
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

export function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let bestValue = 0;
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
}
