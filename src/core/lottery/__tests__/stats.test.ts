import { describe, expect, it } from "vitest";
import {
  buildRecentHistoryWindow,
  buildTicketHistorySnapshot,
  rankTicketsByHistory,
  selectTicketsByHistoricalThreshold
} from "../stats";
import type { DrawResult } from "../types";

const draws: DrawResult[] = [
  { date: new Date("2026-05-13"), game: "leidsa-loto", numbers: [2, 4, 15, 21, 31, 40, 4, 1] },
  { date: new Date("2026-05-10"), game: "leidsa-loto", numbers: [2, 7, 11, 21, 30, 39, 4, 3] },
  { date: new Date("2026-03-01"), game: "leidsa-loto", numbers: [4, 9, 15, 18, 31, 40, 8, 1] },
  { date: new Date("2025-10-01"), game: "leidsa-loto", numbers: [1, 5, 12, 19, 27, 33, 6, 9] }
];

describe("ticket history snapshots", () => {
  it("counts base and bonus appearances inside the requested window", () => {
    const window = buildRecentHistoryWindow(draws, 6);
    const snapshot = buildTicketHistorySnapshot([2, 4, 15, 21, 31, 40, 4, 1], window);

    expect(window.drawCount).toBe(3);
    expect(snapshot.base.map((item) => item.count)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(snapshot.mas?.count).toBe(2);
    expect(snapshot.superMas?.count).toBe(2);
    expect(snapshot.base[0].frequency).toBeCloseTo(2 / 3);
    expect(snapshot.ranking.score).toBeGreaterThan(0);
    expect(snapshot.ranking.baseAverageFrequency).toBeCloseTo(2 / 3);
  });

  it("gives a higher score to tickets with stronger recent frequency", () => {
    const window = buildRecentHistoryWindow(draws, 6);
    const stronger = buildTicketHistorySnapshot([2, 4, 15, 21, 31, 40, 4, 1], window);
    const weaker = buildTicketHistorySnapshot([7, 11, 18, 30, 39, 40, 8, 3], window);

    expect(stronger.ranking.score).toBeGreaterThan(weaker.ranking.score);
  });

  it("can select tickets against a requested historical threshold", () => {
    const window = buildRecentHistoryWindow(draws, 6);
    const ranked = rankTicketsByHistory(
      [
        [7, 11, 18, 30, 39, 40, 8, 3],
        [2, 4, 15, 21, 31, 40, 4, 1]
      ],
      window
    );
    const selection = selectTicketsByHistoricalThreshold(ranked, 1, 40);

    expect(selection.selected).toHaveLength(1);
    expect(selection.selected[0].ticket).toEqual([2, 4, 15, 21, 31, 40, 4, 1]);
    expect(selection.status.satisfiedAll).toBe(true);
  });
});
