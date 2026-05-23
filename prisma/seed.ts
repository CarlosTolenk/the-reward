import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sampleDraws = [
  { date: "2024-06-01", game: "leidsa-6-45", numbers: [2, 7, 14, 23, 34, 41] },
  { date: "2024-06-04", game: "leidsa-6-45", numbers: [1, 9, 16, 22, 28, 39] },
  { date: "2024-06-08", game: "leidsa-6-45", numbers: [5, 12, 19, 27, 33, 45] },
  { date: "2024-06-11", game: "leidsa-6-45", numbers: [3, 10, 18, 25, 31, 44] },
  { date: "2024-06-15", game: "leidsa-6-45", numbers: [6, 11, 20, 24, 37, 42] },
  { date: "2024-06-18", game: "leidsa-6-45", numbers: [4, 8, 17, 26, 32, 40] },
  { date: "2024-06-22", game: "leidsa-6-45", numbers: [13, 15, 21, 29, 35, 43] },
  { date: "2024-06-25", game: "leidsa-6-45", numbers: [2, 9, 18, 30, 36, 41] },
  { date: "2024-06-29", game: "leidsa-6-45", numbers: [7, 12, 16, 27, 38, 45] },
  { date: "2024-07-02", game: "leidsa-6-45", numbers: [5, 14, 19, 23, 33, 44] }
];

async function main() {
  for (const draw of sampleDraws) {
    await prisma.drawResult.upsert({
      where: {
        game_date: {
          game: draw.game,
          date: new Date(draw.date)
        }
      },
      update: {
        numbers: JSON.stringify(draw.numbers)
      },
      create: {
        date: new Date(draw.date),
        game: draw.game,
        numbers: JSON.stringify(draw.numbers)
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
