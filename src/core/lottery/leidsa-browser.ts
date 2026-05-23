import { access } from "node:fs/promises";
import { constants } from "node:fs";

export type LeidsaOption = {
  date: string | null;
  key: string;
  label: string;
  url: string;
};

export type LeidsaWinnerCandidate = {
  address: string | null;
  currency: string | null;
  detailUrl: string | null;
  drawDate: string | null;
  location: string | null;
  prizeAmountText: string | null;
  prizeAmountValue: number | null;
  rawText: string;
  soldIn: string | null;
  winnerReference: string | null;
  winnerName: string | null;
  winningNumbers: number[] | null;
  winningNumbersText: string | null;
};

const DEFAULT_RESULTS_URL = "https://www.leidsa.com/en/results/Leidsa/Loto/1_2058";
const DEFAULT_WINNERS_URL =
  "https://www.leidsa.com/en/winners?category=Loto&limit=50&sort=drawDate%3Adesc&page=1";

const DEFAULT_BROWSER_PATHS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

export function getDefaultLeidsaResultsUrl(): string {
  return DEFAULT_RESULTS_URL;
}

export function getDefaultLeidsaWinnersUrl(): string {
  return DEFAULT_WINNERS_URL;
}

export function buildLeidsaWinnersUrl(category: string, page: number, limit = 50): string {
  const params = new URLSearchParams({
    category,
    limit: String(limit),
    sort: "drawDate:desc",
    page: String(page)
  });
  return `https://www.leidsa.com/en/winners?${params.toString()}`;
}

export function parseLeidsaDateText(label: string): string | null {
  const slashMatch = label.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthMatch = label.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!monthMatch) {
    return null;
  }

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
  const [, monthName, day, year] = monthMatch;
  const monthIndex = monthNames.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) {
    return null;
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseLeidsaDateLabel(label: string): string | null {
  return parseLeidsaDateText(label);
}

export function buildLeidsaResultUrl(key: string): string {
  return `https://www.leidsa.com/en/results/Leidsa/Loto/${key}`;
}

export function toLeidsaOption(value: string, label: string): LeidsaOption {
  return {
    date: parseLeidsaDateLabel(label),
    key: value,
    label,
    url: buildLeidsaResultUrl(value)
  };
}

export function parsePrizeAmountText(text: string): {
  currency: string | null;
  prizeAmountText: string | null;
  prizeAmountValue: number | null;
} {
  const match = text.match(/((RD|US)\$\s?[\d,]+(?:\.\d+)?)/i);
  if (!match) {
    return {
      currency: null,
      prizeAmountText: null,
      prizeAmountValue: null
    };
  }

  const prizeAmountText = match[1].replace(/\s+/g, " ").trim();
  const currency = prizeAmountText.toUpperCase().startsWith("US$") ? "USD" : "DOP";
  const numeric = Number(prizeAmountText.replace(/[^0-9.]/g, ""));

  return {
    currency,
    prizeAmountText,
    prizeAmountValue: Number.isFinite(numeric) ? numeric : null
  };
}

export function parseWinningNumbersText(text: string): number[] | null {
  const numbers = text
    .split(/[^0-9]+/)
    .map((item) => Number(item))
    .filter((item) => !Number.isNaN(item));

  return numbers.length >= 6 ? numbers : null;
}

type WinnerFieldBag = Record<string, string>;

export function toWinnerCandidateFromFields(fields: WinnerFieldBag, detailUrl?: string | null): LeidsaWinnerCandidate {
  const winnerReferenceKey = Object.keys(fields).find((key) => key.startsWith("winner #")) ?? null;
  const winnerReference = winnerReferenceKey ? winnerReferenceKey.replace(/\s+/g, " ").trim() : null;
  const winnerName =
    (winnerReferenceKey ? fields[winnerReferenceKey] : null) ?? fields["winner"] ?? fields["winner name"] ?? null;
  const drawDate = parseLeidsaDateText(fields["draw date"] ?? "");
  const { currency, prizeAmountText, prizeAmountValue } = parsePrizeAmountText(fields["prize amount"] ?? "");
  const winningNumbersText = fields["winning numbers"] ?? null;
  const winningNumbers = winningNumbersText ? parseWinningNumbersText(winningNumbersText) : null;
  const soldIn = fields["sold in"] ?? null;
  const address = fields["address"] ?? null;
  const province = fields["province"] ?? null;
  const location = [soldIn, address, province].filter(Boolean).join(" | ") || null;

  return {
    address,
    currency,
    detailUrl: detailUrl ?? null,
    drawDate,
    location,
    prizeAmountText,
    prizeAmountValue,
    rawText: Object.entries(fields)
      .filter(([, value]) => value.trim().length > 0)
      .map(([label, value]) => `${label}: ${value}`)
      .join(" | "),
    soldIn,
    winnerReference,
    winnerName,
    winningNumbers,
    winningNumbersText
  };
}

export function toWinnerCandidate(rawText: string, detailUrl?: string | null): LeidsaWinnerCandidate {
  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  const drawDate = parseLeidsaDateText(normalizedText);
  const { currency, prizeAmountText, prizeAmountValue } = parsePrizeAmountText(normalizedText);
  const winningNumbersText = normalizedText.match(/Winning Numbers:\s*([^|]+)/i)?.[1]?.trim() ?? null;
  const winningNumbers = winningNumbersText ? parseWinningNumbersText(winningNumbersText) : null;
  const soldIn = normalizedText.match(/Sold In:\s*([^|]+)/i)?.[1]?.trim() ?? null;
  const address = normalizedText.match(/Address:\s*([^|]+)/i)?.[1]?.trim() ?? null;
  const province = normalizedText.match(/Province:\s*([^|]+)/i)?.[1]?.trim() ?? null;
  const location = [soldIn, address, province].filter(Boolean).join(" | ") || null;
  const winnerReference = normalizedText.match(/Winner\s*#\s*:?\s*([^|]+)/i)?.[1]?.trim() ?? null;
  const winnerName =
    normalizedText.match(/Winner(?: Name)?:\s*([^|]+)/i)?.[1]?.trim() ??
    normalizedText
      .split(/\s*[|•·]\s*/)
      .map((part) => part.trim())
      .find(
        (part) =>
          !part.match(
            /(rd\$|us\$|draw|date|winner|location|province|retailer|agencia|sucursal|address|sold in|winning numbers)/i
          ) && !parseLeidsaDateText(part)
      ) ??
    null;

  return {
    address,
    currency,
    detailUrl: detailUrl ?? null,
    drawDate,
    location,
    prizeAmountText,
    prizeAmountValue,
    rawText: normalizedText,
    soldIn,
    winnerReference,
    winnerName,
    winningNumbers,
    winningNumbersText
  };
}

export async function resolveBrowserExecutablePath(preferredPath?: string): Promise<string> {
  const candidates = preferredPath ? [preferredPath] : DEFAULT_BROWSER_PATHS;

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    `No supported Chromium-based browser executable found. Checked: ${candidates.join(", ")}`
  );
}
