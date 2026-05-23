"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResultRow = {
  id: number;
  date: string;
  game: string;
  hasWinner: boolean;
  numbers: number[];
  winnerCount: number;
};

export default function ResultsTable({ results }: { results: ResultRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    const confirmed = window.confirm("Delete this draw result?");
    if (!confirmed) {
      return;
    }
    setLoadingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/results?id=${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not delete result.");
        return;
      }
      router.refresh();
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="px-6 py-5 border-b border-black/10">
        <h3 className="text-lg font-semibold">Draw Results</h3>
        <p className="text-sm text-muted">{results.length} draws found.</p>
      </div>
      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-black/5">
            <tr>
              <th className="px-6 py-3">Prize</th>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Game</th>
              <th className="px-6 py-3">Numbers</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((draw) => (
              <tr key={draw.id} className="border-t border-black/5">
                <td className="px-6 py-3">
                  {draw.hasWinner ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      <svg
                        aria-hidden="true"
                        className="h-3.5 w-3.5 fill-current"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 1.5l2.47 5 5.53.8-4 3.9.94 5.5L10 14.1 5.06 16.7 6 11.2l-4-3.9 5.53-.8L10 1.5z" />
                      </svg>
                      {draw.winnerCount > 1 ? `${draw.winnerCount} winners` : "Winner"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">No prize data</span>
                  )}
                </td>
                <td className="px-6 py-3">{draw.date}</td>
                <td className="px-6 py-3">{draw.game}</td>
                <td className="px-6 py-3">{draw.numbers.join(" - ")}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={loadingId === draw.id}
                    onClick={() => handleDelete(draw.id)}
                  >
                    {loadingId === draw.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
