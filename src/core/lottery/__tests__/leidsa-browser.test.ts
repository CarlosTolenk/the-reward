import { describe, expect, it } from "vitest";
import {
  buildLeidsaResultUrl,
  buildLeidsaWinnersUrl,
  parseLeidsaDateLabel,
  parseLeidsaDateText,
  parsePrizeAmountText,
  parseWinningNumbersText,
  toWinnerCandidateFromFields,
  toLeidsaOption
} from "../leidsa-browser";

describe("parseLeidsaDateLabel", () => {
  it("parses LEIDSA option labels into ISO dates", () => {
    expect(parseLeidsaDateLabel("Draw: 5/13/26, 9:00 PM")).toBe("2026-05-13");
  });

  it("returns null for unknown labels", () => {
    expect(parseLeidsaDateLabel("invalid")).toBeNull();
  });
});

describe("parseLeidsaDateText", () => {
  it("parses dates from generic winner text", () => {
    expect(parseLeidsaDateText("Winner draw date 5/16/2026")).toBe("2026-05-16");
  });

  it("parses dates written with month names", () => {
    expect(parseLeidsaDateText("Draw Date: March 21, 2026")).toBe("2026-03-21");
  });
});

describe("toLeidsaOption", () => {
  it("builds the normalized option payload", () => {
    expect(toLeidsaOption("1_2058", "Draw: 5/13/26, 9:00 PM")).toEqual({
      date: "2026-05-13",
      key: "1_2058",
      label: "Draw: 5/13/26, 9:00 PM",
      url: buildLeidsaResultUrl("1_2058")
    });
  });
});

describe("buildLeidsaWinnersUrl", () => {
  it("builds the paginated winners url", () => {
    expect(buildLeidsaWinnersUrl("Loto", 3, 50)).toBe(
      "https://www.leidsa.com/en/winners?category=Loto&limit=50&sort=drawDate%3Adesc&page=3"
    );
  });
});

describe("parsePrizeAmountText", () => {
  it("extracts the currency and numeric value", () => {
    expect(parsePrizeAmountText("Prize RD$12,500,000 paid")).toEqual({
      currency: "DOP",
      prizeAmountText: "RD$12,500,000",
      prizeAmountValue: 12500000
    });
  });
});

describe("parseWinningNumbersText", () => {
  it("parses base and bonus numbers from winner cards", () => {
    expect(parseWinningNumbersText("12-14-20-22-28-31 + 2")).toEqual([12, 14, 20, 22, 28, 31, 2]);
  });
});

describe("toWinnerCandidateFromFields", () => {
  it("normalizes a structured LEIDSA winner card", () => {
    expect(
      toWinnerCandidateFromFields({
        "winner #499": "Sr. Manuel Antonio Feliz Pineda",
        "prize amount": "RD$30,000,000.00",
        "draw date": "March 21, 2026",
        "winning numbers": "07-08-16-17-21-39",
        "sold in": "Heladería Los Cachorros",
        address: "Calle Duarte No. 31, Tamayo",
        province: "Provincia Bahoruco"
      })
    ).toMatchObject({
      currency: "DOP",
      drawDate: "2026-03-21",
      prizeAmountValue: 30000000,
      soldIn: "Heladería Los Cachorros",
      winnerName: "Sr. Manuel Antonio Feliz Pineda",
      winningNumbers: [7, 8, 16, 17, 21, 39]
    });
  });
});
