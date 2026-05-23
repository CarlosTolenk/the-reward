"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddDrawForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [game, setGame] = useState("leidsa-6-45");
  const [numbers, setNumbers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const parsedNumbers = numbers
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));

    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          game,
          numbers: parsedNumbers
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not add draw.");
        return;
      }

      setDate("");
      setNumbers("");
      router.refresh();
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold">Add Draw Result</h3>
        <p className="text-sm text-muted">Enter a new draw (numbers comma-separated).</p>
      </div>
      <label className="space-y-2 block">
        <span className="text-sm font-medium">Date</span>
        <input
          type="date"
          className="w-full rounded-lg border border-black/10 px-3 py-2"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="space-y-2 block">
        <span className="text-sm font-medium">Game</span>
        <input
          className="w-full rounded-lg border border-black/10 px-3 py-2"
          value={game}
          onChange={(event) => setGame(event.target.value)}
        />
      </label>
      <label className="space-y-2 block">
        <span className="text-sm font-medium">Numbers</span>
        <input
          className="w-full rounded-lg border border-black/10 px-3 py-2"
          placeholder="2, 7, 14, 23, 34, 41, 5, 11"
          value={numbers}
          onChange={(event) => setNumbers(event.target.value)}
        />
      </label>
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
        {loading ? "Saving..." : "Add Draw"}
      </button>
    </form>
  );
}
