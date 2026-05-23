import { describe, expect, it } from "vitest";
import {
  buildLeidsaResultUrl,
  parseLeidsaDateLabel,
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
