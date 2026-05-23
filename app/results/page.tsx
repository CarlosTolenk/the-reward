import AddDrawForm from "./AddDrawForm";
import ResultsTable from "./ResultsTable";
import { prisma } from "@/src/lib/prisma";

function parseDate(value?: string | string[]): Date | null {
  if (!value || Array.isArray(value)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function ResultsPage({
  searchParams
}: {
  searchParams: { from?: string; to?: string };
}) {
  const fromDate = parseDate(searchParams.from);
  const toDate = parseDate(searchParams.to);

  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (fromDate || toDate) {
    const range: { gte?: Date; lte?: Date } = {};
    if (fromDate) {
      range.gte = fromDate;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.date = range;
  }

  const results = await prisma.drawResult.findMany({
    include: {
      winners: {
        select: { id: true }
      }
    },
    where,
    orderBy: { date: "desc" }
  });

  const mapped = results.map((draw) => ({
    id: draw.id,
    date: draw.date.toISOString().slice(0, 10),
    game: draw.game,
    hasWinner: draw.winners.length > 0,
    numbers: JSON.parse(draw.numbers ?? "[]"),
    winnerCount: draw.winners.length
  }));

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Results Archive</h2>
        <p className="text-sm text-muted">Filter by date to review past draws.</p>
        <form className="mt-4 grid gap-4 md:grid-cols-3" method="get">
          <label className="space-y-2 block">
            <span className="text-sm font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={searchParams.from ?? ""}
              className="w-full rounded-lg border border-black/10 px-3 py-2"
            />
          </label>
          <label className="space-y-2 block">
            <span className="text-sm font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={searchParams.to ?? ""}
              className="w-full rounded-lg border border-black/10 px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Apply Filter
            </button>
          </div>
        </form>
      </section>

      <ResultsTable results={mapped} />

      <AddDrawForm />
    </div>
  );
}
