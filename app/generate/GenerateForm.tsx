"use client";

import { useState } from "react";

type SuggestionResponse = {
  historicalThreshold: {
    bestScore: number;
    satisfiedAll: boolean;
    satisfiedCount: number;
    target: number | null;
  };
  historyWindow: {
    drawCount: number;
    from: string | null;
    months: number;
    to: string | null;
  };
  tickets: number[][];
  ticketHistory: Array<{
    base: Array<{
      count: number;
      drawCount: number;
      frequency: number;
      kind: "base" | "mas" | "superMas";
      number: number;
    }>;
    mas?: {
      count: number;
      drawCount: number;
      frequency: number;
      kind: "base" | "mas" | "superMas";
      number: number;
    };
    ranking: {
      baseAverageFrequency: number;
      baseMinimumFrequency: number;
      bonusAverageFrequency: number;
      pairAverageFrequency: number;
      score: number;
    };
    superMas?: {
      count: number;
      drawCount: number;
      frequency: number;
      kind: "base" | "mas" | "superMas";
      number: number;
    };
  }>;
  metadata: {
    batchesSearched: number;
    generatedAt: string;
    seed: string | null;
    candidatesConsidered: number;
    strategy: "legacy" | "improved" | "python-v2";
  };
};

type FormState = {
  game: string;
  count: number;
  evenMin: number;
  evenMax: number;
  sumMin: number;
  sumMax: number;
  avoidLastN: number;
  includeMas: boolean;
  includeSuperMas: boolean;
  drawDay: "auto" | "wednesday" | "saturday";
  target: "balanced" | "base" | "mas" | "supermas" | "jackpot";
  minHistoricalScore: string;
  useAdvanced: boolean;
  seed: string;
};

const initialState: FormState = {
  game: "leidsa-loto",
  count: 5,
  evenMin: 2,
  evenMax: 4,
  sumMin: 80,
  sumMax: 180,
  avoidLastN: 10,
  includeMas: true,
  includeSuperMas: true,
  drawDay: "auto",
  target: "balanced",
  minHistoricalScore: "",
  useAdvanced: false,
  seed: ""
};

function formatFrequency(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function GenerateForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [result, setResult] = useState<SuggestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]:
        field === "game" || field === "seed" || field === "drawDay" || field === "target"
          || field === "minHistoricalScore"
          ? value
          : Number(value)
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const payload = {
      ...form,
      evenMin: form.useAdvanced ? form.evenMin : 0,
      evenMax: form.useAdvanced ? form.evenMax : 6,
      sumMin: form.useAdvanced ? form.sumMin : 21,
      sumMax: form.useAdvanced ? form.sumMax : 225,
      minHistoricalScore:
        form.minHistoricalScore.trim() === "" ? null : Number(form.minHistoricalScore),
      seed: form.seed.trim() === "" ? null : form.seed.trim()
    };

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not generate suggestions.");
        return;
      }
      setResult(data as SuggestionResponse);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Constraints</h2>
          <p className="text-sm text-muted">
            Adjust the filters and scoring inputs to shape the suggested tickets.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Game</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.game}
              onChange={(event) => handleChange("game", event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Tickets</span>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.count}
              onChange={(event) => handleChange("count", event.target.value)}
            />
          </label>
          <div className="space-y-2">
            <span className="text-sm font-medium">Ticket rules</span>
            <div className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm">
              Base: 6 numbers (1-40). Mas: 1-12. SuperMas: 1-15.
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Advanced filters</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.useAdvanced}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, useAdvanced: event.target.checked }))
                }
              />
              Enable even/sum constraints
            </label>
          </div>
          {form.useAdvanced && (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium">Even min</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  className="w-full rounded-lg border border-black/10 px-3 py-2"
                  value={form.evenMin}
                  onChange={(event) => handleChange("evenMin", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Even max</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  className="w-full rounded-lg border border-black/10 px-3 py-2"
                  value={form.evenMax}
                  onChange={(event) => handleChange("evenMax", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Sum min</span>
                <input
                  type="number"
                  min={21}
                  className="w-full rounded-lg border border-black/10 px-3 py-2"
                  value={form.sumMin}
                  onChange={(event) => handleChange("sumMin", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Sum max</span>
                <input
                  type="number"
                  min={21}
                  className="w-full rounded-lg border border-black/10 px-3 py-2"
                  value={form.sumMax}
                  onChange={(event) => handleChange("sumMax", event.target.value)}
                />
              </label>
            </>
          )}
          <label className="space-y-2">
            <span className="text-sm font-medium">Avoid last N draws</span>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.avoidLastN}
              onChange={(event) => handleChange("avoidLastN", event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Draw day</span>
            <select
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.drawDay}
              onChange={(event) => handleChange("drawDay", event.target.value)}
            >
              <option value="auto">Auto (next draw)</option>
              <option value="wednesday">Wednesday</option>
              <option value="saturday">Saturday</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Optimization target</span>
            <select
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.target}
              onChange={(event) => handleChange("target", event.target.value)}
            >
              <option value="balanced">Balanced</option>
              <option value="base">Base 6 hits</option>
              <option value="mas">Base + MAS</option>
              <option value="supermas">Base + Supermas</option>
              <option value="jackpot">Jackpot focus</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Minimum historical score</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="Optional, e.g. 14"
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.minHistoricalScore}
              onChange={(event) => handleChange("minHistoricalScore", event.target.value)}
            />
          </label>
          <div className="space-y-2">
            <span className="text-sm font-medium">Extras</span>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.includeMas}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, includeMas: event.target.checked }))
                  }
                />
                Include Mas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.includeSuperMas}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, includeSuperMas: event.target.checked }))
                  }
                />
                Include SuperMas
              </label>
            </div>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">Seed (optional)</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2"
              value={form.seed}
              onChange={(event) => handleChange("seed", event.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Suggestions"}
        </button>
      </form>

      <div className="space-y-6">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Suggested Tickets</h2>
          <p className="text-sm text-muted">Generated combinations based on your constraints.</p>
          {!result && (
            <p className="mt-4 text-sm text-muted">Run the generator to see results.</p>
          )}
          {result && (
            <div className="mt-4 space-y-3">
              <div className="text-xs text-muted">
                {result.metadata.candidatesConsidered} candidates · {result.metadata.batchesSearched} batches · seed{" "}
                {result.metadata.seed}
              </div>
              {result.historicalThreshold.target !== null && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    result.historicalThreshold.satisfiedAll
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {result.historicalThreshold.satisfiedAll
                    ? `Reached the requested historical score of ${result.historicalThreshold.target.toFixed(1)} for all suggested tickets.`
                    : `Could not find ${form.count} tickets at ${result.historicalThreshold.target.toFixed(1)} or higher. Showing the best available results. Best score found: ${result.historicalThreshold.bestScore.toFixed(1)}.`}
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-black/5">
                  <tr>
                    <th className="px-3 py-2 text-left">Ticket</th>
                    <th className="px-3 py-2 text-left">Historical score</th>
                    <th className="px-3 py-2 text-left">Base</th>
                    <th className="px-3 py-2 text-left">Mas</th>
                    <th className="px-3 py-2 text-left">SuperMas</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tickets.map((ticket, index) => {
                    const base = ticket.slice(0, 6);
                    const mas = ticket[6];
                    const superMas = ticket[7];
                    const ranking = result.ticketHistory[index]?.ranking;
                    return (
                      <tr key={`ticket-${index}`} className="border-t border-black/5">
                        <td className="px-3 py-2 font-medium">#{index + 1}</td>
                        <td className="px-3 py-2 font-medium">{ranking ? `${ranking.score.toFixed(1)}/100` : "-"}</td>
                        <td className="px-3 py-2">{base.join(" - ")}</td>
                        <td className="px-3 py-2">{mas ?? "-"}</td>
                        <td className="px-3 py-2">{superMas ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="space-y-4 pt-2">
                {result.ticketHistory.map((history, index) => (
                  <div key={`history-${index}`} className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold">Ticket #{index + 1} Historical Frequency</h3>
                        <p className="text-xs text-muted">
                          Last {result.historyWindow.months} months · {result.historyWindow.drawCount} draws
                        </p>
                      </div>
                      <div className="text-xs text-muted">
                        {result.historyWindow.from && result.historyWindow.to
                          ? `${result.historyWindow.from} to ${result.historyWindow.to}`
                          : "No history window available"}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-black/10 bg-white px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Historical score</div>
                        <div className="text-base font-semibold">{history.ranking.score.toFixed(1)}/100</div>
                      </div>
                      <div className="rounded-lg border border-black/10 bg-white px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Base average</div>
                        <div className="text-base font-semibold">
                          {formatFrequency(history.ranking.baseAverageFrequency)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-black/10 bg-white px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Weakest base</div>
                        <div className="text-base font-semibold">
                          {formatFrequency(history.ranking.baseMinimumFrequency)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-black/10 bg-white px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Pair average</div>
                        <div className="text-base font-semibold">
                          {formatFrequency(history.ranking.pairAverageFrequency)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {history.base.map((item) => (
                        <div
                          key={`ticket-${index}-base-${item.number}`}
                          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{item.number}</span> appeared {item.count} times in the last{" "}
                          {result.historyWindow.months} months ({formatFrequency(item.frequency)} of{" "}
                          {item.drawCount} draws).
                        </div>
                      ))}
                      {history.mas && (
                        <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                          <span className="font-medium">MAS {history.mas.number}</span> appeared {history.mas.count}{" "}
                          times in the last {result.historyWindow.months} months (
                          {formatFrequency(history.mas.frequency)} of {history.mas.drawCount} draws).
                        </div>
                      )}
                      {history.superMas && (
                        <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                          <span className="font-medium">SuperMas {history.superMas.number}</span> appeared{" "}
                          {history.superMas.count} times in the last {result.historyWindow.months} months (
                          {formatFrequency(history.superMas.frequency)} of {history.superMas.drawCount} draws).
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
