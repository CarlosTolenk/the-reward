# Leidsa Lottery Tracker

A lightweight MVP for generating suggested lottery combinations using configurable constraints and basic stats from historical draws. This app does **not** predict winners.

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- Tailwind CSS
- Zod validation
- Vitest unit tests

## Setup

```bash
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env` and adjust if needed:

```
DATABASE_URL="file:./dev.db"
```

## Tests

```bash
npm run test
```

## Import Leidsa results (last 12 months)

```bash
curl -X POST http://localhost:3000/api/import-leidsa \\
  -H \"Content-Type: application/json\" \\
  -d '{\"gameKey\":\"1_1536\",\"game\":\"leidsa-loto\",\"months\":12}'
```

## Import using select HTML values

Save the `<select>` HTML into a file (e.g. `select.html`), then:

```bash
node scripts/import-leidsa-select.mjs --file select.html --months 12 --game leidsa-loto
```

## Sync available LEIDSA dates with a controlled browser

This uses a real Chromium-based browser profile to get through Cloudflare and only persists dates that are not already present in local SQLite.

```bash
npm run sync:leidsa:browser
```

Useful flags:

```bash
npm run sync:leidsa:browser -- --json-out ./tmp/leidsa-sync.json
npm run sync:leidsa:browser -- --headless true --limit 10
npm run sync:leidsa:browser -- --browser-path "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
```

The script reuses a persistent browser profile in `.cache/leidsa-browser-profile`. If LEIDSA shows a Cloudflare challenge, solve it once in the opened browser window and rerun the command.

## Sync LEIDSA winner history with a controlled browser

This scrapes the paginated winners listing, persists prior winners, links them to existing `DrawResult` rows by draw date when possible, and auto-creates missing draws when the winning numbers are present on the winner card.

```bash
npm run sync:leidsa:winners
```

Useful flags:

```bash
npm run sync:leidsa:winners -- --json-out ./tmp/leidsa-winners.json
npm run sync:leidsa:winners -- --category Loto --max-pages 10 --limit 50
npm run sync:leidsa:winners -- --headless true
npm run sync:leidsa:winners -- --start-page 1 --reset-state true
```

The sync stores progress in `.cache/leidsa-winners-sync-state.json` so it can resume from the next page after a Cloudflare interruption. To force a fresh pass from page 1, run with `--start-page 1 --reset-state true`.

If LEIDSA triggers Cloudflare mid-run, rerun with the same browser profile after solving the challenge in the opened browser window.

If Cloudflare keeps looping after you solve the challenge, use your own browser session and let the script attach to it instead of launching an automated context:

```bash
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --remote-debugging-port=9222
```

Open the winners page manually, solve the challenge, then run:

```bash
npm run sync:leidsa:winners -- --cdp-url http://127.0.0.1:9222 --manual-pagination true --max-pages 1
```

That mode reads the currently open page without forcing a navigation, which is usually more stable against repeated Cloudflare verification.

## Python data analysis baseline

A Python analysis script is available at [scripts/loto_python_analysis.py](/Users/carlostolentino/Projects/Idea/scripts/loto_python_analysis.py) with a walkthrough in [docs/python-loto-analysis.md](/Users/carlostolentino/Projects/Idea/docs/python-loto-analysis.md).

It uses `pandas` and `numpy` to:

- load SQLite draw history
- build per-number feature tables
- generate a diversified ticket portfolio
- run walk-forward backtesting

## Winner data APIs

Winner history:

```bash
curl "http://localhost:3000/api/winners?game=leidsa-loto&limit=50&page=1"
curl "http://localhost:3000/api/winners?game=leidsa-loto&includeDraw=true&linkedOnly=true"
```

Draws enriched with linked winner summaries:

```bash
curl "http://localhost:3000/api/draw-insights?game=leidsa-loto&limit=50&page=1"
curl "http://localhost:3000/api/draw-insights?game=leidsa-loto&winnersOnly=true"
```

## Winner-aware Python strategy

The Python generator now supports an optional winner-aware strategy that blends historical draw frequency with jackpot-winner context from `WinnerRecord`.

Use it explicitly from the suggestions API:

```bash
curl -X POST "http://localhost:3000/api/suggestions?strategy=python-v2w" \
  -H "Content-Type: application/json" \
  -d '{"game":"leidsa-loto","count":5,"evenMin":2,"evenMax":4,"sumMin":80,"sumMax":180,"avoidLastN":2,"includeMas":true,"includeSuperMas":true,"drawDay":"auto","target":"jackpot"}'
```
