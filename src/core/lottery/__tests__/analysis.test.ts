import { describe, expect, it } from "vitest";
import { dedupeDrawHistory, getBaseNumbers } from "../analysis";
import type { DrawResult } from "../types";

describe("dedupeDrawHistory", () => {
  it("removes near-duplicate draws with the same base numbers", () => {
    const draws: DrawResult[] = [
      {
        date: new Date("2026-01-02T00:00:00.000Z"),
        game: "leidsa-loto",
        numbers: [1, 2, 3, 4, 5, 6, 1, 2]
      },
      {
        date: new Date("2026-01-01T12:00:00.000Z"),
        game: "leidsa-loto",
        numbers: [1, 2, 3, 4, 5, 6, 9, 9]
      },
      {
        date: new Date("2025-12-28T00:00:00.000Z"),
        game: "leidsa-loto",
        numbers: [7, 8, 9, 10, 11, 12, 1, 2]
      }
    ];

    const deduped = dedupeDrawHistory(draws);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((draw) => getBaseNumbers(draw))).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12]
    ]);
  });
});
