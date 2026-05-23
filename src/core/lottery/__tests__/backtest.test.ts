import { describe, expect, it } from "vitest";
import { runBacktest } from "../backtest";
import type { Constraints, DrawResult } from "../types";

const constraints: Constraints = {
  game: "leidsa-loto",
  count: 3,
  evenMin: 1,
  evenMax: 5,
  sumMin: 50,
  sumMax: 200,
  avoidLastN: 3,
  includeMas: false,
  includeSuperMas: false,
  drawDay: "wednesday",
  target: "balanced",
  seed: "fixed"
};

const draws: DrawResult[] = [
  { date: new Date("2025-01-01"), game: "leidsa-loto", numbers: [1, 2, 3, 4, 5, 6] },
  { date: new Date("2025-01-08"), game: "leidsa-loto", numbers: [2, 3, 4, 5, 6, 7] },
  { date: new Date("2025-01-15"), game: "leidsa-loto", numbers: [3, 4, 5, 6, 7, 8] },
  { date: new Date("2025-01-22"), game: "leidsa-loto", numbers: [4, 5, 6, 7, 8, 9] },
  { date: new Date("2025-01-29"), game: "leidsa-loto", numbers: [5, 6, 7, 8, 9, 10] }
];

describe("runBacktest", () => {
  it("returns comparable summary metrics for legacy and improved strategies", () => {
    const result = runBacktest({
      constraints,
      draws,
      trainingWindow: 3
    });

    expect(result.drawsEvaluated).toBe(2);
    expect(result.byDraw).toHaveLength(2);
    expect(result.comparison.legacy.drawCount).toBe(2);
    expect(result.comparison.improved.drawCount).toBe(2);
    expect(result.comparison.legacy.averageBaseHits).toBeTypeOf("number");
    expect(result.comparison.improved.maxBaseHitsAverage).toBeTypeOf("number");
    expect(result.byDraw[0].actual.base).toHaveLength(6);
  });

  it("tracks MAS and Supermas hit metrics separately", () => {
    const masConstraints: Constraints = {
      ...constraints,
      count: 1,
      game: "leidsa-supermas",
      includeMas: true,
      includeSuperMas: true
    };

    const masDraws: DrawResult[] = [
      { date: new Date("2025-01-01"), game: "leidsa-supermas", numbers: [1, 2, 3, 4, 5, 6, 7, 8] },
      { date: new Date("2025-01-08"), game: "leidsa-supermas", numbers: [2, 3, 4, 5, 6, 7, 8, 9] },
      { date: new Date("2025-01-15"), game: "leidsa-supermas", numbers: [3, 4, 5, 6, 7, 8, 9, 10] },
      { date: new Date("2025-01-22"), game: "leidsa-supermas", numbers: [4, 5, 6, 7, 8, 9, 10, 11] },
      { date: new Date("2025-01-29"), game: "leidsa-supermas", numbers: [5, 6, 7, 8, 9, 10, 11, 12] }
    ];

    const result = runBacktest({
      constraints: masConstraints,
      draws: masDraws,
      trainingWindow: 3
    });

    expect(result.comparison.legacy.ticketExact6AndMasCount).toBeTypeOf("number");
    expect(result.comparison.improved.ticketExact6AndSuperMasCount).toBeTypeOf("number");
    expect(result.comparison.improved.ticketExact6AndMasAndSuperMasCount).toBeTypeOf("number");
    expect(result.byDraw[0].actual.mas).toBeTypeOf("number");
    expect(result.byDraw[0].actual.superMas).toBeTypeOf("number");
  });
});
