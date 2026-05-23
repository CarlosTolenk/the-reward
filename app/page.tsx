import { prisma } from "@/src/lib/prisma";
import { topNumbers } from "@/src/core/lottery/stats";

export default async function DashboardPage() {
  const draws = await prisma.drawResult.findMany({
    include: {
      winners: {
        select: { id: true }
      }
    },
    where: { game: "leidsa-loto" },
    orderBy: { date: "desc" }
  });

  const mapped = draws.map((draw) => ({
    date: draw.date,
    game: draw.game,
    hasWinner: draw.winners.length > 0,
    numbers: JSON.parse(draw.numbers ?? "[]"),
    winnerCount: draw.winners.length
  }));
  const lastTen = mapped.slice(0, 10);

  const overallTop = topNumbers(mapped, 10);
  const last30Top = topNumbers(mapped.slice(0, 30), 10);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="px-6 py-5 border-b border-black/10">
          <h2 className="text-xl font-semibold">Latest 10 Draws</h2>
          <p className="text-sm text-muted">Recent results for quick reference.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="px-6 py-3">Prize</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Game</th>
                <th className="px-6 py-3">Numbers</th>
              </tr>
            </thead>
            <tbody>
              {lastTen.map((draw) => (
                <tr key={`${draw.game}-${draw.date.toISOString()}`} className="border-t border-black/5">
                  <td className="px-6 py-3">
                    {draw.hasWinner ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                        <svg aria-hidden="true" className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                          <path d="M10 1.5l2.47 5 5.53.8-4 3.9.94 5.5L10 14.1 5.06 16.7 6 11.2l-4-3.9 5.53-.8L10 1.5z" />
                        </svg>
                        {draw.winnerCount > 1 ? `${draw.winnerCount} winners` : "Winner"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No prize data</span>
                    )}
                  </td>
                  <td className="px-6 py-3">{draw.date.toISOString().slice(0, 10)}</td>
                  <td className="px-6 py-3">{draw.game}</td>
                  <td className="px-6 py-3">
                    {draw.numbers.join(" - ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Most Frequent (Overall)</h3>
          <p className="text-sm text-muted">Top 10 base numbers for Leidsa Loto.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {overallTop.map((item) => (
              <span
                key={`overall-${item.number}`}
                className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-sm"
              >
                {item.number} · {item.count}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Most Frequent (Last 30)</h3>
          <p className="text-sm text-muted">Recent momentum for Leidsa Loto base numbers.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {last30Top.map((item) => (
              <span
                key={`last30-${item.number}`}
                className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-sm"
              >
                {item.number} · {item.count}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
