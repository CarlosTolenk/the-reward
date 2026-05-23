import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { parseWinnerPayload } from "@/src/core/lottery/winners";

function parseDate(value?: string | string[]): Date | null {
  if (!value || Array.isArray(value)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePage(value?: string | string[]): number {
  if (!value || Array.isArray(value)) {
    return 1;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

function buildPageHref(page: number, from?: string, to?: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  return `/winners?${params.toString()}`;
}

export default async function WinnersPage({
  searchParams
}: {
  searchParams: { from?: string; page?: string; to?: string };
}) {
  const page = parsePage(searchParams.page);
  const fromDate = parseDate(searchParams.from);
  const toDate = parseDate(searchParams.to);
  const limit = 24;

  const where: {
    drawDate?: { gte?: Date; lte?: Date };
    game: string;
  } = { game: "leidsa-loto" };

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
    where.drawDate = range;
  }

  const [total, winners] = await Promise.all([
    prisma.winnerRecord.count({ where }),
    prisma.winnerRecord.findMany({
      where,
      include: {
        drawResult: {
          include: {
            winners: {
              select: { id: true }
            }
          }
        }
      },
      orderBy: [{ drawDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const mapped = winners.map((winner) => {
    const payload = parseWinnerPayload(winner.rawPayload);
    const numbers = Array.isArray(payload.winningNumbers)
      ? payload.winningNumbers
      : winner.drawResult
        ? JSON.parse(winner.drawResult.numbers ?? "[]")
        : [];

    return {
      id: winner.id,
      address: payload.address ?? null,
      drawDate: winner.drawDate?.toISOString().slice(0, 10) ?? null,
      location: winner.location,
      numbers,
      prizeAmountText: winner.prizeAmountText,
      soldIn: payload.soldIn ?? null,
      winnerCount: winner.drawResult?.winners.length ?? 1,
      winnerName: winner.winnerName
    };
  });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Winner History</h2>
            <p className="text-sm text-muted">
              {total} winner records linked to LEIDSA Loto draws.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Draws with prize context: use this page to cross-check winner names, payout amounts, and winning numbers.
          </div>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-3" method="get">
          <label className="block space-y-2">
            <span className="text-sm font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={searchParams.from ?? ""}
              className="w-full rounded-lg border border-black/10 px-3 py-2"
            />
          </label>
          <label className="block space-y-2">
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

      <section className="grid gap-5 md:grid-cols-2">
        {mapped.map((winner) => (
          <article key={winner.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Draw {winner.drawDate ?? "Unknown"}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{winner.winnerName ?? "Unnamed winner"}</h3>
                <p className="mt-1 text-sm text-muted">
                  {winner.winnerCount > 1 ? `Shared prize with ${winner.winnerCount - 1} more winner(s)` : "Single winner"}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Prize</p>
                <p className="text-sm font-semibold text-amber-900">{winner.prizeAmountText ?? "N/A"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Winning Numbers</p>
              <p className="mt-2 text-sm font-medium">
                {winner.numbers.length > 0 ? winner.numbers.join(" - ") : "No numbers linked"}
              </p>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-ink">Sold In</dt>
                <dd className="text-muted">{winner.soldIn ?? "Unknown"}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Location</dt>
                <dd className="text-muted">{winner.location ?? winner.address ?? "Unknown"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="flex items-center justify-between rounded-2xl border border-black/10 bg-white px-6 py-4 shadow-sm">
        <p className="text-sm text-muted">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-3">
          <Link
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              page <= 1 ? "pointer-events-none border-black/5 text-muted" : "border-black/10 hover:bg-black/[0.03]"
            }`}
            href={buildPageHref(Math.max(1, page - 1), searchParams.from, searchParams.to)}
          >
            Previous
          </Link>
          <Link
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              page >= totalPages ? "pointer-events-none border-black/5 text-muted" : "border-black/10 hover:bg-black/[0.03]"
            }`}
            href={buildPageHref(Math.min(totalPages, page + 1), searchParams.from, searchParams.to)}
          >
            Next
          </Link>
        </div>
      </section>
    </div>
  );
}
