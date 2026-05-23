import { prisma } from "../src/lib/prisma";
import { runBacktest } from "../src/core/lottery/backtest";
import type { Constraints, DrawResult } from "../src/core/lottery/types";

function parseArgs(argv: string[]): { constraints: Constraints; trainingWindow?: number } {
  const options: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      options[key] = value;
      i += 1;
    }
  }

  return {
    constraints: {
      avoidLastN: Number(options["avoid-last-n"] ?? "10"),
      count: Number(options.count ?? "5"),
      drawDay: (options["draw-day"] as Constraints["drawDay"]) ?? "auto",
      evenMax: Number(options["even-max"] ?? "4"),
      evenMin: Number(options["even-min"] ?? "2"),
      game: options.game ?? "leidsa-loto",
      includeMas: options["include-mas"] !== "false",
      includeSuperMas: options["include-super-mas"] !== "false",
      target: (options.target as Constraints["target"]) ?? "balanced",
      seed: options.seed ?? "backtest",
      sumMax: Number(options["sum-max"] ?? "180"),
      sumMin: Number(options["sum-min"] ?? "80")
    },
    trainingWindow: options["training-window"] ? Number(options["training-window"]) : undefined
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const draws = await prisma.drawResult.findMany({
    where: { game: parsed.constraints.game },
    orderBy: { date: "desc" }
  });

  const mapped: DrawResult[] = draws.map((draw) => ({
    date: draw.date,
    game: draw.game,
    numbers: JSON.parse(draw.numbers ?? "[]")
  }));

  const result = runBacktest({
    constraints: parsed.constraints,
    draws: mapped,
    trainingWindow: parsed.trainingWindow
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
