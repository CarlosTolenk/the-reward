import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { prisma } from "../src/lib/prisma";
import {
  getDefaultLeidsaResultsUrl,
  resolveBrowserExecutablePath,
  toLeidsaOption,
  type LeidsaOption
} from "../src/core/lottery/leidsa-browser";

type ScrapedDraw = LeidsaOption & {
  numbers: number[];
};

type SyncOptions = {
  browserPath?: string;
  game: string;
  headless: boolean;
  jsonOut?: string;
  limit?: number;
  manualVerify: boolean;
  manualVerifyTimeoutMs: number;
  startUrl: string;
  timeoutMs: number;
  userDataDir: string;
};

function parseArgs(argv: string[]): SyncOptions {
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return {
    browserPath: typeof options["browser-path"] === "string" ? options["browser-path"] : undefined,
    game: typeof options.game === "string" ? options.game : "leidsa-loto",
    headless: options.headless === true || options.headless === "true",
    jsonOut: typeof options["json-out"] === "string" ? options["json-out"] : undefined,
    limit: typeof options.limit === "string" ? Number(options.limit) : undefined,
    manualVerify: options["manual-verify"] !== "false",
    manualVerifyTimeoutMs:
      typeof options["manual-verify-timeout-ms"] === "string"
        ? Number(options["manual-verify-timeout-ms"])
        : 5 * 60 * 1000,
    startUrl: typeof options.url === "string" ? options.url : getDefaultLeidsaResultsUrl(),
    timeoutMs: typeof options["timeout-ms"] === "string" ? Number(options["timeout-ms"]) : 45000,
    userDataDir:
      typeof options["user-data-dir"] === "string"
        ? options["user-data-dir"]
        : path.join(process.cwd(), ".cache", "leidsa-browser-profile")
  };
}

async function isSecurityVerificationPage(page: Page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText ?? "";
    return [
      "Just a moment",
      "Enable JavaScript and cookies to continue",
      "Performing security verification",
      "verifies you are not a bot"
    ].some((snippet) => bodyText.includes(snippet));
  });
}

async function waitForManualVerification(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  console.log(
    `Cloudflare verification detected. Complete the challenge in the opened browser window within ${Math.round(
      timeoutMs / 1000
    )} seconds.`
  );

  while (Date.now() < deadline) {
    if (!(await isSecurityVerificationPage(page))) {
      return true;
    }
    await page.waitForTimeout(2000);
  }

  return false;
}

async function waitForResultsPage(page: Page, timeoutMs: number) {
  await page.waitForFunction(
    () => {
      const drawSelect = Array.from(document.querySelectorAll("select"))[1];
      return Boolean(drawSelect && drawSelect.querySelectorAll("option").length > 0);
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function extractAvailableOptions(page: Page): Promise<LeidsaOption[]> {
  const rawOptions = await page.evaluate(() => {
    const drawSelect = Array.from(document.querySelectorAll("select"))[1];
    return Array.from(drawSelect?.querySelectorAll("option") ?? [])
      .map((option) => ({
        value: option.getAttribute("value") ?? "",
        label: (option.textContent ?? "").trim()
      }))
      .filter((option) => /^\d+_\d+$/.test(option.value));
  });

  return rawOptions.map((option: { label: string; value: string }) =>
    toLeidsaOption(option.value, option.label)
  );
}

async function extractDrawNumbers(page: Page, timeoutMs: number): Promise<number[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
    const numbers = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main *"))
        .map((element) => ({
          childCount: element.children.length,
          text: (element.textContent ?? "").trim()
        }))
        .filter((item) => /^\d+$/.test(item.text) && item.childCount === 0)
        .map((item) => Number(item.text))
    );

    if (numbers.length > 0) {
      return numbers;
    }
  }

  return [];
}

async function loadExistingDates(game: string): Promise<Set<string>> {
  const existing = await prisma.drawResult.findMany({
    where: { game },
    select: { date: true }
  });

  return new Set(existing.map((row) => row.date.toISOString().slice(0, 10)));
}

async function upsertDraw(game: string, draw: ScrapedDraw) {
  if (!draw.date || draw.numbers.length === 0) {
    return false;
  }

  await prisma.drawResult.upsert({
    where: {
      game_date: {
        game,
        date: new Date(draw.date)
      }
    },
    update: {
      numbers: JSON.stringify(draw.numbers)
    },
    create: {
      game,
      date: new Date(draw.date),
      numbers: JSON.stringify(draw.numbers)
    }
  });

  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserPath = await resolveBrowserExecutablePath(options.browserPath);

  await mkdir(options.userDataDir, { recursive: true });
  if (options.jsonOut) {
    await mkdir(path.dirname(options.jsonOut), { recursive: true });
  }

  const context = await chromium.launchPersistentContext(options.userDataDir, {
    args: ["--disable-blink-features=AutomationControlled"],
    executablePath: browserPath,
    headless: options.headless,
    locale: "en-US",
    timezoneId: "America/Santo_Domingo",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 }
  });

  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "es-DO", "es"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.startUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });

    if (!options.headless && options.manualVerify && (await isSecurityVerificationPage(page))) {
      const cleared = await waitForManualVerification(page, options.manualVerifyTimeoutMs);
      if (!cleared) {
        throw new Error("Cloudflare verification was not completed before the timeout.");
      }
    }

    try {
      await waitForResultsPage(page, options.timeoutMs);
    } catch (error) {
      throw new Error(
        "LEIDSA results page did not become available. If Cloudflare is shown, complete the challenge in the opened browser window and rerun the command."
      );
    }

    const availableOptions = await extractAvailableOptions(page);
    const existingDates = await loadExistingDates(options.game);
    const missingOptions = availableOptions
      .filter((option) => option.date && !existingDates.has(option.date))
      .slice(0, options.limit);

    const scraped: ScrapedDraw[] = [];
    let inserted = 0;

    for (const option of missingOptions) {
      await page.goto(option.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      const numbers = await extractDrawNumbers(page, options.timeoutMs);
      const draw: ScrapedDraw = { ...option, numbers };
      scraped.push(draw);

      const saved = await upsertDraw(options.game, draw);
      if (saved) {
        inserted += 1;
      }
    }

    if (options.jsonOut) {
      await writeFile(options.jsonOut, JSON.stringify(scraped, null, 2));
    }

    console.log(
      JSON.stringify(
        {
          availableDates: availableOptions.length,
          browserPath,
          game: options.game,
          inserted,
          jsonOut: options.jsonOut ?? null,
          missingDates: missingOptions.length,
          startUrl: options.startUrl,
          userDataDir: options.userDataDir
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
