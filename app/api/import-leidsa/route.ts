import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { importLeidsaSchema } from "@/src/core/lottery/schema";
import { parseLeidsaDraws } from "@/src/core/lottery/leidsa";

type ImportSummary = {
  inserted: number;
  skipped: number;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = importLeidsaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const gameKeys = parsed.data.gameKeys ?? (parsed.data.gameKey ? [parsed.data.gameKey] : []);
  const game = parsed.data.game ?? "leidsa-loto";
  const months = parsed.data.months ?? 12;

  if (gameKeys.length === 0) {
    return NextResponse.json({ error: "gameKey or gameKeys is required" }, { status: 400 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const summary: ImportSummary = { inserted: 0, skipped: 0 };
  const perKey: Record<string, ImportSummary> = {};

  for (const key of gameKeys) {
    let response: Response;
    try {
      response = await fetch(`https://www.leidsa.com/api/draw-results/${key}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          Accept: "application/json, text/plain, */*"
        },
        cache: "no-store"
      });
    } catch (error) {
      perKey[key] = { inserted: 0, skipped: 0 };
      continue;
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      perKey[key] = { inserted: 0, skipped: 0 };
      continue;
    }

    const draws = parseLeidsaDraws(payload);
    if (draws.length === 0) {
      perKey[key] = { inserted: 0, skipped: 0 };
      continue;
    }

    const keySummary: ImportSummary = { inserted: 0, skipped: 0 };
    for (const draw of draws) {
      if (draw.date < cutoff) {
        keySummary.skipped += 1;
        continue;
      }
      await prisma.drawResult.upsert({
        where: {
          game_date: {
            game,
            date: draw.date
          }
        },
        update: {
          numbers: JSON.stringify(draw.numbers)
        },
        create: {
          game,
          date: draw.date,
          numbers: JSON.stringify(draw.numbers)
        }
      });
      keySummary.inserted += 1;
    }
    perKey[key] = keySummary;
    summary.inserted += keySummary.inserted;
    summary.skipped += keySummary.skipped;
  }

  return NextResponse.json({ game, months, total: summary, perKey });
}
