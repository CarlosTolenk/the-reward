import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Constraints, SuggestionResult } from "./types";

const execFileAsync = promisify(execFile);

const BUNDLED_PYTHON =
  "/Users/carlostolentino/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

function resolvePythonBinary(): string {
  if (process.env.PYTHON_BIN && existsSync(process.env.PYTHON_BIN)) {
    return process.env.PYTHON_BIN;
  }
  if (existsSync(BUNDLED_PYTHON)) {
    return BUNDLED_PYTHON;
  }
  return "python3";
}

function resolveTargetWeekday(drawDay: Constraints["drawDay"]): number {
  if (drawDay === "wednesday") {
    return 3;
  }
  if (drawDay === "saturday") {
    return 6;
  }
  const today = new Date().getDay();
  if (today <= 3) {
    return 3;
  }
  if (today <= 6) {
    return 6;
  }
  return 3;
}

function nextDrawDate(drawDay: Constraints["drawDay"]): string {
  const targetWeekday = resolveTargetWeekday(drawDay);
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentWeekday = date.getUTCDay();
  let delta = (targetWeekday - currentWeekday + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function canUsePythonV2(constraints: Constraints): boolean {
  return true;
}

export async function generatePythonSuggestions(
  constraints: Constraints,
  strategy: "python-v2" | "python-v2w" = "python-v2"
): Promise<SuggestionResult> {
  const python = resolvePythonBinary();
  const scriptPath = path.join(process.cwd(), "scripts", "loto_python_analysis.py");
  const dbPath = path.join(process.cwd(), "prisma", "dev.db");
  const predictDate = nextDrawDate(constraints.drawDay);
  const candidateCount = Math.max(400, constraints.count * 80);
  const { stdout } = await execFileAsync(
    python,
    [
      scriptPath,
      "--mode",
      "generate",
      "--db",
      dbPath,
      "--game",
      constraints.game,
      "--target",
      constraints.target,
      "--portfolio-strategy",
      strategy === "python-v2w" ? "v2w" : "v2",
      "--ticket-count",
      String(constraints.count),
      "--candidate-count",
      String(candidateCount),
      "--predict-date",
      predictDate,
      "--constraints-json",
      JSON.stringify(constraints)
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 8
    }
  );

  const parsed = JSON.parse(stdout) as {
    metadata?: {
      batches_searched?: number;
      candidates_considered?: number;
      generated_at?: string;
      seed?: string | null;
      strategy?: string;
    };
    tickets?: number[][];
  };

  return {
    tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
    metadata: {
      generatedAt: parsed.metadata?.generated_at ?? new Date().toISOString(),
      seed: parsed.metadata?.seed ?? constraints.seed ?? null,
      candidatesConsidered: parsed.metadata?.candidates_considered ?? candidateCount,
      strategy: strategy
    }
  };
}
