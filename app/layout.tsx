import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Leidsa Lottery Tracker",
  description: "Generate suggested lottery number combinations with constraints and stats."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-black/10 bg-white/70 backdrop-blur">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted">Leidsa Lottery Tracker</p>
              <h1 className="text-2xl font-semibold">Suggested combos, grounded in stats</h1>
            </div>
            <nav className="flex gap-4 text-sm font-medium">
              <Link className="hover:text-accent" href="/">Dashboard</Link>
              <Link className="hover:text-accent" href="/generate">Generate</Link>
              <Link className="hover:text-accent" href="/results">Results</Link>
              <Link className="hover:text-accent" href="/winners">Winners</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
