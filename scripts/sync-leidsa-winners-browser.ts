import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { prisma } from "../src/lib/prisma";
import {
  buildLeidsaWinnersUrl,
  getDefaultLeidsaWinnersUrl,
  resolveBrowserExecutablePath,
  toWinnerCandidateFromFields
} from "../src/core/lottery/leidsa-browser";

type RawWinnerCard = {
  detailUrl: string | null;
  fields: Record<string, string>;
  html: string;
  rawText: string;
};

type ParsedWinner = ReturnType<typeof toWinnerCandidateFromFields> & {
  drawResultId: number | null;
  game: string;
  rawHtml: string;
  signature: string;
  sourceOrder: number;
  sourcePage: number;
};

type SyncOptions = {
  browserPath?: string;
  category: string;
  cleanupInvalid: boolean;
  cdpUrl?: string;
  game: string;
  headless: boolean;
  jsonOut?: string;
  limit: number;
  manualVerify: boolean;
  manualPagination: boolean;
  manualVerifyTimeoutMs: number;
  maxPages: number;
  resetState: boolean;
  resume: boolean;
  startPage?: number;
  startUrl: string;
  stateFile: string;
  timeoutMs: number;
  userDataDir: string;
};

type SyncStateRecord = {
  category: string;
  game: string;
  nextPage: number;
  updatedAt: string;
};

type SyncState = Record<string, SyncStateRecord>;

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
    category: typeof options.category === "string" ? options.category : "Loto",
    cleanupInvalid: options["cleanup-invalid"] !== "false",
    cdpUrl: typeof options["cdp-url"] === "string" ? options["cdp-url"] : undefined,
    game: typeof options.game === "string" ? options.game : "leidsa-loto",
    headless: options.headless === true || options.headless === "true",
    jsonOut: typeof options["json-out"] === "string" ? options["json-out"] : undefined,
    limit: typeof options.limit === "string" ? Number(options.limit) : 50,
    manualVerify: options["manual-verify"] !== "false",
    manualPagination: options["manual-pagination"] === true || options["manual-pagination"] === "true",
    manualVerifyTimeoutMs:
      typeof options["manual-verify-timeout-ms"] === "string"
        ? Number(options["manual-verify-timeout-ms"])
        : 5 * 60 * 1000,
    maxPages: typeof options["max-pages"] === "string" ? Number(options["max-pages"]) : 20,
    resetState: options["reset-state"] === true || options["reset-state"] === "true",
    resume: options.resume !== "false",
    startPage: typeof options["start-page"] === "string" ? Number(options["start-page"]) : undefined,
    startUrl: typeof options.url === "string" ? options.url : getDefaultLeidsaWinnersUrl(),
    stateFile:
      typeof options["state-file"] === "string"
        ? options["state-file"]
        : path.join(process.cwd(), ".cache", "leidsa-winners-sync-state.json"),
    timeoutMs: typeof options["timeout-ms"] === "string" ? Number(options["timeout-ms"]) : 45000,
    userDataDir:
      typeof options["user-data-dir"] === "string"
        ? options["user-data-dir"]
        : path.join(process.cwd(), ".cache", "leidsa-browser-profile")
  };
}

function buildSignature(game: string, category: string, drawDate: string | null, detailUrl: string | null, rawText: string) {
  return createHash("sha1")
    .update([game, category, drawDate ?? "unknown", detailUrl ?? "no-detail", rawText].join("|"))
    .digest("hex");
}

function isSecurityVerificationText(bodyText: string) {
  return [
    "Just a moment",
    "Enable JavaScript and cookies to continue",
    "Performing security verification",
    "verifies you are not a bot"
  ].some((snippet) => bodyText.includes(snippet));
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

async function waitForWinnersPage(page: Page, timeoutMs: number) {
  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText ?? "";
      if (
        [
          "Just a moment",
          "Enable JavaScript and cookies to continue",
          "Performing security verification",
          "verifies you are not a bot"
        ].some((snippet) => bodyText.includes(snippet))
      ) {
        return false;
      }

      return Array.from(document.querySelectorAll("main *")).some((element) => {
        const text = (element.textContent ?? "").trim();
        return (
          text.includes("Prize Amount") ||
          text.includes("Winning Numbers") ||
          /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)
        );
      });
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function waitForManualVerification(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  console.log(
    `Cloudflare verification detected. Complete the challenge in the opened browser window within ${Math.round(
      timeoutMs / 1000
    )} seconds.`
  );

  while (Date.now() < deadline) {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    if (!isSecurityVerificationText(bodyText)) {
      return true;
    }
    await page.waitForTimeout(2000);
  }

  return false;
}

function buildStateKey(game: string, category: string) {
  return `${game}:${category.toLowerCase()}`;
}

async function loadSyncState(stateFile: string): Promise<SyncState> {
  try {
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw) as SyncState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSyncState(stateFile: string, state: SyncState) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function openWinnersPage(
  page: Page,
  url: string,
  timeoutMs: number,
  options: Pick<SyncOptions, "headless" | "manualPagination" | "manualVerify" | "manualVerifyTimeoutMs">
) {
  let lastError: unknown = null;

  if (options.manualPagination) {
    if (!options.headless && options.manualVerify && (await isSecurityVerificationPage(page))) {
      const cleared = await waitForManualVerification(page, options.manualVerifyTimeoutMs);
      if (!cleared) {
        throw new Error("Cloudflare verification was not completed before the timeout.");
      }
    }

    await waitForWinnersPage(page, timeoutMs);
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10000) }).catch(() => undefined);

    if (!options.headless && options.manualVerify && (await isSecurityVerificationPage(page))) {
      const cleared = await waitForManualVerification(page, options.manualVerifyTimeoutMs);
      if (!cleared) {
        lastError = new Error("Cloudflare verification was not completed before the timeout.");
        continue;
      }
    }

    try {
      await waitForWinnersPage(page, timeoutMs);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(2000 * attempt);
    }
  }

  throw lastError;
}

async function extractWinnerCards(page: Page): Promise<RawWinnerCard[]> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("main ul[role='list']"))
      .map((list) => {
        const fields: Record<string, string> = {};
        for (const item of Array.from(list.querySelectorAll(":scope > li"))) {
          const texts = Array.from(item.querySelectorAll("p, span, div"))
            .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
            .filter(Boolean);
          if (texts.length < 2) {
            continue;
          }

          const label = texts[0].replace(/:\s*$/, "").toLowerCase();
          const value = texts.slice(1).join(" ").replace(/\s+/g, " ").trim();
          if (!label || !value || fields[label]) {
            continue;
          }
          fields[label] = value;
        }

        const container = list.parentElement?.parentElement ?? list.parentElement ?? list;
        const detailAnchor = container.querySelector("a[href]") as HTMLAnchorElement | null;
        return {
          fields,
          detailUrl: detailAnchor?.href ?? null,
          html: container.innerHTML,
          rawText: Object.entries(fields)
            .map(([label, value]) => `${label}: ${value}`)
            .join(" | ")
        };
      })
      .filter((item) => item.rawText.length > 20)
      .filter((item) => item.fields["prize amount"] && item.fields["draw date"] && item.fields["winning numbers"]);

    const seen = new Set<string>();
    return candidates.filter((item) => {
      const key = `${item.detailUrl ?? "no-detail"}|${item.rawText}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });
}

async function lookupDrawResultId(game: string, drawDate: string | null): Promise<number | null> {
  if (!drawDate) {
    return null;
  }

  const draw = await prisma.drawResult.findUnique({
    where: {
      game_date: {
        game,
        date: new Date(drawDate)
      }
    },
    select: { id: true }
  });

  return draw?.id ?? null;
}

async function ensureDrawResultId(game: string, winner: Pick<ParsedWinner, "drawDate" | "winningNumbers">) {
  const existingId = await lookupDrawResultId(game, winner.drawDate);
  if (existingId) {
    return { created: false, drawResultId: existingId };
  }
  if (!winner.drawDate || !winner.winningNumbers || winner.winningNumbers.length < 6) {
    return { created: false, drawResultId: null };
  }

  try {
    const created = await prisma.drawResult.create({
      data: {
        date: new Date(winner.drawDate),
        game,
        numbers: JSON.stringify(winner.winningNumbers)
      },
      select: { id: true }
    });

    return { created: true, drawResultId: created.id };
  } catch {
    return {
      created: false,
      drawResultId: await lookupDrawResultId(game, winner.drawDate)
    };
  }
}

async function deleteInvalidWinnerRecords() {
  const result = await prisma.winnerRecord.deleteMany({
    where: {
      drawDate: null,
      drawResultId: null,
      winnerName: null,
      prizeAmountText: { not: null }
    }
  });

  return result.count;
}

async function upsertWinnerRecord(game: string, category: string, winner: ParsedWinner) {
  await prisma.winnerRecord.upsert({
    where: { signature: winner.signature },
    update: {
      category,
      currency: winner.currency,
      detailUrl: winner.detailUrl,
      drawDate: winner.drawDate ? new Date(winner.drawDate) : null,
      drawResultId: winner.drawResultId,
      game,
      location: winner.location,
      prizeAmountText: winner.prizeAmountText,
      prizeAmountValue: winner.prizeAmountValue,
      rawPayload: JSON.stringify({
        address: winner.address,
        detailUrl: winner.detailUrl,
        drawDate: winner.drawDate,
        location: winner.location,
        soldIn: winner.soldIn,
        winnerReference: winner.winnerReference,
        winningNumbers: winner.winningNumbers,
        winningNumbersText: winner.winningNumbersText,
        rawHtml: winner.rawHtml,
        rawText: winner.rawText,
        sourceOrder: winner.sourceOrder,
        sourcePage: winner.sourcePage
      }),
      rawText: winner.rawText,
      sourceOrder: winner.sourceOrder,
      sourcePage: winner.sourcePage,
      winnerName: winner.winnerName
    },
    create: {
      category,
      currency: winner.currency,
      detailUrl: winner.detailUrl,
      drawDate: winner.drawDate ? new Date(winner.drawDate) : null,
      drawResultId: winner.drawResultId,
      game,
      location: winner.location,
      prizeAmountText: winner.prizeAmountText,
      prizeAmountValue: winner.prizeAmountValue,
      rawPayload: JSON.stringify({
        address: winner.address,
        detailUrl: winner.detailUrl,
        drawDate: winner.drawDate,
        location: winner.location,
        soldIn: winner.soldIn,
        winnerReference: winner.winnerReference,
        winningNumbers: winner.winningNumbers,
        winningNumbersText: winner.winningNumbersText,
        rawHtml: winner.rawHtml,
        rawText: winner.rawText,
        sourceOrder: winner.sourceOrder,
        sourcePage: winner.sourcePage
      }),
      rawText: winner.rawText,
      signature: winner.signature,
      sourceOrder: winner.sourceOrder,
      sourcePage: winner.sourcePage,
      winnerName: winner.winnerName
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stateKey = buildStateKey(options.game, options.category);

  let browserPath: string | null = null;
  if (!options.cdpUrl) {
    browserPath = await resolveBrowserExecutablePath(options.browserPath);
    await mkdir(options.userDataDir, { recursive: true });
  }
  if (options.jsonOut) {
    await mkdir(path.dirname(options.jsonOut), { recursive: true });
  }

  const syncState = options.resetState ? {} : await loadSyncState(options.stateFile);
  const resumedStartPage =
    options.startPage ?? (options.resume ? syncState[stateKey]?.nextPage ?? 1 : 1);
  const startPage = Math.max(1, resumedStartPage);
  const deletedInvalidRecords = options.cleanupInvalid ? await deleteInvalidWinnerRecords() : 0;

  const browser = options.cdpUrl ? await chromium.connectOverCDP(options.cdpUrl) : null;
  const context =
    browser?.contexts()[0] ??
    (!browser
      ? await chromium.launchPersistentContext(options.userDataDir, {
        args: ["--disable-blink-features=AutomationControlled"],
        executablePath: browserPath ?? undefined,
        headless: options.headless,
        locale: "en-US",
        timezoneId: "America/Santo_Domingo",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 900 }
      })
      : null);

  if (!context) {
    throw new Error("Could not resolve a browser context from the provided CDP session.");
  }

  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "es-DO", "es"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    const page = context.pages()[0] ?? (await context.newPage());
    const allWinners: ParsedWinner[] = [];
    const missingDrawDates = new Set<string>();
    let createdMissingDraws = 0;
    let pagesProcessed = 0;
    let skippedIncompleteCards = 0;
    let insertedOrUpdated = 0;
    let linkedToExistingDraws = 0;
    let unresolvedDateEntries = 0;

    for (let currentPage = startPage; currentPage < startPage + options.maxPages; currentPage += 1) {
      const url = buildLeidsaWinnersUrl(options.category, currentPage, options.limit);
      const targetUrl =
        options.manualPagination && currentPage === startPage ? page.url() : currentPage === 1 ? options.startUrl : url;

      try {
        await openWinnersPage(page, targetUrl, options.timeoutMs, options);
      } catch {
        throw new Error(
          "LEIDSA winners page did not become available. If Cloudflare is shown, complete the challenge in the opened browser window and rerun the command."
        );
      }

      const cards = await extractWinnerCards(page);
      if (cards.length === 0) {
        break;
      }

      pagesProcessed += 1;

      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const parsed = toWinnerCandidateFromFields(card.fields, card.detailUrl);
        if (!parsed.drawDate || !parsed.winningNumbers) {
          skippedIncompleteCards += 1;
          continue;
        }
        const ensured = await ensureDrawResultId(options.game, parsed);
        const winner: ParsedWinner = {
          ...parsed,
          drawResultId: ensured.drawResultId,
          game: options.game,
          rawHtml: card.html,
          signature: buildSignature(options.game, options.category, parsed.drawDate, parsed.detailUrl, parsed.rawText),
          sourceOrder: index,
          sourcePage: currentPage
        };

        if (!winner.drawDate) {
          unresolvedDateEntries += 1;
        } else if (!winner.drawResultId) {
          missingDrawDates.add(winner.drawDate);
        } else {
          linkedToExistingDraws += 1;
          if (ensured.created) {
            createdMissingDraws += 1;
          }
        }

        await upsertWinnerRecord(options.game, options.category, winner);
        insertedOrUpdated += 1;
        allWinners.push(winner);
      }

      syncState[stateKey] = {
        category: options.category,
        game: options.game,
        nextPage: currentPage + 1,
        updatedAt: new Date().toISOString()
      };
      await saveSyncState(options.stateFile, syncState);
    }

    if (options.jsonOut) {
      await writeFile(options.jsonOut, JSON.stringify(allWinners, null, 2));
    }

    console.log(
      JSON.stringify(
        {
          browserPath,
          category: options.category,
          cdpUrl: options.cdpUrl ?? null,
          deletedInvalidRecords,
          createdMissingDraws,
          game: options.game,
          insertedOrUpdated,
          jsonOut: options.jsonOut ?? null,
          linkedToExistingDraws,
          missingDrawDates: [...missingDrawDates].sort(),
          pagesProcessed,
          resumedFromPage: startPage,
          skippedIncompleteCards,
          stateFile: options.stateFile,
          unresolvedDateEntries,
          winnersFound: allWinners.length
        },
        null,
        2
      )
    );
  } finally {
    if (browser) {
      await browser.close();
    } else {
      await context.close();
    }
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
