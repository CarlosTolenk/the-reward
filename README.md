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

## Python data analysis baseline

A Python analysis script is available at [scripts/loto_python_analysis.py](/Users/carlostolentino/Projects/Idea/scripts/loto_python_analysis.py) with a walkthrough in [docs/python-loto-analysis.md](/Users/carlostolentino/Projects/Idea/docs/python-loto-analysis.md).

It uses `pandas` and `numpy` to:

- load SQLite draw history
- build per-number feature tables
- generate a diversified ticket portfolio
- run walk-forward backtesting
