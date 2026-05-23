import { access } from "node:fs/promises";
import { constants } from "node:fs";

export type LeidsaOption = {
  date: string | null;
  key: string;
  label: string;
  url: string;
};

const DEFAULT_RESULTS_URL = "https://www.leidsa.com/en/results/Leidsa/Loto/1_2058";

const DEFAULT_BROWSER_PATHS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

export function getDefaultLeidsaResultsUrl(): string {
  return DEFAULT_RESULTS_URL;
}

export function parseLeidsaDateLabel(label: string): string | null {
  const match = label.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}),/);
  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  return `20${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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
