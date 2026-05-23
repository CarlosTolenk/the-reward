import { describe, expect, it } from "vitest";
import { generateSuggestions, passesHardFilters } from "../generate";
import type { Constraints, DrawResult } from "../types";

const constraints: Constraints = {
  game: "leidsa-loto",
  count: 3,
  evenMin: 2,
  evenMax: 4,
  sumMin: 80,
  sumMax: 200,
  avoidLastN: 5,
  includeMas: true,
  includeSuperMas: true,
  drawDay: "auto",
  target: "balanced",
  seed: "fixed-seed"
};

const recentDraws: DrawResult[] = [
  { date: new Date("2024-07-01"), game: "leidsa-6-45", numbers: [1, 2, 3, 4, 5, 6] },
  { date: new Date("2024-06-28"), game: "leidsa-6-45", numbers: [7, 8, 9, 10, 11, 12] }
];

describe("generateSuggestions", () => {
  it("is deterministic when seed is provided", () => {
    const first = generateSuggestions(constraints, recentDraws);
    const second = generateSuggestions(constraints, recentDraws);
    expect(first.tickets).toEqual(second.tickets);
  });

  it("respects hard filters", () => {
    const result = generateSuggestions(constraints, recentDraws);
    for (const ticket of result.tickets) {
      expect(passesHardFilters(ticket.slice(0, 6), constraints)).toBe(true);
      expect(ticket.length).toBe(8);
    }
  });

  it("changes ranking when the optimization target changes", () => {
    const bonusHeavyDraws: DrawResult[] = Array.from({ length: 24 }, (_, index) => ({
      date: new Date(Date.UTC(2025, 0, 24 - index)),
      game: "leidsa-loto",
      numbers: [
        1 + (index % 12),
        5 + (index % 12),
        9 + (index % 12),
        13 + (index % 12),
        17 + (index % 12),
        21 + (index % 12),
        index < 12 ? 7 : 3,
        index < 12 ? 11 : 4
      ]
    }));

    const baseTarget = generateSuggestions(
      {
        ...constraints,
        evenMin: 0,
        evenMax: 6,
        sumMin: 21,
        sumMax: 225,
        target: "base"
      },
      bonusHeavyDraws
    );
    const masTarget = generateSuggestions(
      {
        ...constraints,
        evenMin: 0,
        evenMax: 6,
        sumMin: 21,
        sumMax: 225,
        target: "mas"
      },
      bonusHeavyDraws
    );

    expect(baseTarget.tickets).not.toEqual(masTarget.tickets);
  });
});
