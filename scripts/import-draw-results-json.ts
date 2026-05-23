import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";

type ImportedDraw = {
  date: string;
  key?: string;
  label?: string;
  numbers: number[];
  url?: string;
};

async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const game = args[1] ?? "leidsa-loto";

  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-draw-results-json.ts <file> [game]");
    process.exit(1);
  }

  const raw = await readFile(filePath, "utf8");
  const records = JSON.parse(raw) as ImportedDraw[];

  let inserted = 0;
  for (const record of records) {
    if (!record.date || !Array.isArray(record.numbers) || record.numbers.length === 0) {
      continue;
    }

    await prisma.drawResult.upsert({
      where: {
        game_date: {
          game,
          date: new Date(record.date)
        }
      },
      update: {
        numbers: JSON.stringify(record.numbers)
      },
      create: {
        game,
        date: new Date(record.date),
        numbers: JSON.stringify(record.numbers)
      }
    });

    inserted += 1;
  }

  console.log(JSON.stringify({ filePath, game, inserted }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
