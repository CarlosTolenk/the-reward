# Python Loto Analysis

This project now includes a Python analysis script at [scripts/loto_python_analysis.py](/Users/carlostolentino/Projects/Idea/scripts/loto_python_analysis.py).

## What it does

The script is meant as a learning-oriented baseline for data analysis, not as a final prediction engine.

It covers four steps:

1. Load draw history from SQLite with `pandas`.
2. Build per-number features for the next draw.
3. Generate a portfolio of tickets with diversity penalties.
4. Run walk-forward backtesting on the historical series.
5. Compare two Python strategies:
   - `v1`: baseline focused more on base-hit strength
   - `v2`: broader coverage with bucket-aware diversification

The current default `v2` profile is `base_focus_light`, which keeps the diversification logic but gives more weight to short-term base-number strength.

## Features used

For each base number `1..40`, the script calculates:

- `freq_10`: frequency in the last 10 draws
- `freq_20`: frequency in the last 20 draws
- `freq_40`: frequency in the last 40 draws
- `freq_60`: frequency in the last 60 draws
- `weekday_freq`: frequency on the same weekday as the target draw
- `draws_since_seen`: how many draws ago the number last appeared
- `ewm_freq`: exponentially weighted recent frequency

For `MAS` and `SuperMas`, it builds a similar but lighter feature table.

## Portfolio logic

The Python baseline does not only rank a single ticket.
It tries to build a 5-ticket portfolio with:

- high individual ticket score
- lower overlap between tickets
- lower concentration on the same repeated numbers
- bonus rotation across top `MAS` and `SuperMas` candidates

This is useful because the app's current weakness is often portfolio concentration rather than total lack of signal.

## Run it

Use the bundled Python runtime that already has `pandas` and `numpy` available:

```bash
/Users/carlostolentino/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  scripts/loto_python_analysis.py \
  --game leidsa-loto \
  --analyze-date 2026-05-13 \
  --features-out tmp/python-loto-features.csv \
  --backtest-out tmp/python-loto-backtest.csv \
  --json-out tmp/python-loto-analysis.json
```

To evaluate all built-in `v2` profiles and see which one beats `v1` under the current backtest setup:

```bash
/Users/carlostolentino/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  scripts/loto_python_analysis.py \
  --game leidsa-loto \
  --training-window 150 \
  --candidate-count 200 \
  --tune-v2
```

## Output files

- `tmp/python-loto-features.csv`: latest number feature table
- `tmp/python-loto-backtest.csv`: one row per evaluated draw
- `tmp/python-loto-analysis.json`: full summary plus inspected date

## Read the results

Look at these sections first:

- `backtest.v1`
- `backtest.v2`
- `comparison.winner_by_metric`
- `comparison.recent_windows`
- `comparison.monthly_breakdown`
- `latest_feature_leaders`
- `analyze_date.portfolio`

`average_unique_base_numbers` is especially useful for spotting portfolio concentration.

`comparison.recent_windows` is the fastest way to see whether `v2` helps in the last `15`, `30`, or `60` evaluated draws.

`comparison.monthly_breakdown` is useful when you want to see whether a strategy improves only in certain months instead of winning globally.

## Important limitation

Right now the local database has meaningful history for `leidsa-loto`, but almost no history for `leidsa-6-45`.
If a new result lands in `leidsa-6-45`, Python can inspect it, but it cannot learn a stable model from only a couple of rows.

Before modeling that game seriously, import more historical results into the correct game key.
