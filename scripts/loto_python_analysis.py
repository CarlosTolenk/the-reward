#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sqlite3
from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

BASE_COUNT = 6
BASE_MIN = 1
BASE_MAX = 40
MAS_MAX = 12
SUPER_MAS_MAX = 15
BUCKET_COUNT = 4


def seed_to_int(seed: str | None) -> int:
    value = seed or "python-default"
    total = 0
    for char in value:
        total = (total * 31 + ord(char)) & 0xFFFFFFFF
    return total


def number_bucket(number: int) -> int:
    return min(BUCKET_COUNT - 1, max(0, (number - 1) // 10))


def bucket_numbers(bucket: int) -> list[int]:
    start = bucket * 10 + 1
    end = start + 9
    return list(range(start, end + 1))


@dataclass
class PortfolioTicket:
    base: list[int]
    bonus_mas: int
    bonus_supermas: int
    score: float

    def numbers(self) -> list[int]:
        return [*self.base, self.bonus_mas, self.bonus_supermas]


@dataclass(frozen=True)
class TargetConfig:
    base_weight: float
    mas_weight: float
    super_weight: float
    bonus_pair_weight: float
    repeat_mas_penalty: float
    repeat_super_penalty: float
    repeat_bonus_pair_penalty: float


@dataclass(frozen=True)
class V2Profile:
    name: str
    signal_weights: dict[str, float]
    quality_weights: dict[str, float]
    overlap_penalty: float
    concentration_penalty: float
    pair_penalty: float
    score_gap: float
    bonus_weight: float
    anchor_top_count: int


V2_PROFILES: dict[str, V2Profile] = {
    "current": V2Profile(
        name="current",
        signal_weights={
            "freq_5": 0.18,
            "freq_10": 0.20,
            "freq_20": 0.18,
            "freq_40": 0.12,
            "freq_60": 0.08,
            "freq_90": 0.05,
            "weekday_freq": 0.08,
            "ewm_freq": 0.07,
            "bucket_recent_share": 0.02,
            "overdue_score": 0.02,
        },
        quality_weights={
            "mean": 0.35,
            "min": 0.15,
            "pair": 0.15,
            "range": 0.10,
            "bucket": 0.20,
            "repeat_last": 0.05,
        },
        overlap_penalty=0.12,
        concentration_penalty=0.05,
        pair_penalty=0.03,
        score_gap=0.18,
        bonus_weight=0.08,
        anchor_top_count=0,
    ),
    "base_focus_light": V2Profile(
        name="base_focus_light",
        signal_weights={
            "freq_5": 0.20,
            "freq_10": 0.24,
            "freq_20": 0.22,
            "freq_40": 0.12,
            "freq_60": 0.06,
            "freq_90": 0.03,
            "weekday_freq": 0.05,
            "ewm_freq": 0.06,
            "bucket_recent_share": 0.01,
            "overdue_score": 0.01,
        },
        quality_weights={
            "mean": 0.46,
            "min": 0.18,
            "pair": 0.16,
            "range": 0.05,
            "bucket": 0.10,
            "repeat_last": 0.05,
        },
        overlap_penalty=0.09,
        concentration_penalty=0.035,
        pair_penalty=0.015,
        score_gap=0.14,
        bonus_weight=0.06,
        anchor_top_count=2,
    ),
    "base_focus_medium": V2Profile(
        name="base_focus_medium",
        signal_weights={
            "freq_5": 0.18,
            "freq_10": 0.25,
            "freq_20": 0.23,
            "freq_40": 0.12,
            "freq_60": 0.06,
            "freq_90": 0.03,
            "weekday_freq": 0.05,
            "ewm_freq": 0.06,
            "bucket_recent_share": 0.01,
            "overdue_score": 0.01,
        },
        quality_weights={
            "mean": 0.44,
            "min": 0.18,
            "pair": 0.16,
            "range": 0.06,
            "bucket": 0.12,
            "repeat_last": 0.04,
        },
        overlap_penalty=0.10,
        concentration_penalty=0.04,
        pair_penalty=0.02,
        score_gap=0.15,
        bonus_weight=0.06,
        anchor_top_count=2,
    ),
    "hybrid_anchor": V2Profile(
        name="hybrid_anchor",
        signal_weights={
            "freq_5": 0.16,
            "freq_10": 0.24,
            "freq_20": 0.22,
            "freq_40": 0.13,
            "freq_60": 0.07,
            "freq_90": 0.04,
            "weekday_freq": 0.05,
            "ewm_freq": 0.07,
            "bucket_recent_share": 0.01,
            "overdue_score": 0.01,
        },
        quality_weights={
            "mean": 0.42,
            "min": 0.17,
            "pair": 0.16,
            "range": 0.07,
            "bucket": 0.14,
            "repeat_last": 0.04,
        },
        overlap_penalty=0.10,
        concentration_penalty=0.04,
        pair_penalty=0.02,
        score_gap=0.15,
        bonus_weight=0.07,
        anchor_top_count=1,
    ),
    "recency_anchor_light": V2Profile(
        name="recency_anchor_light",
        signal_weights={
            "freq_5": 0.22,
            "freq_10": 0.24,
            "freq_20": 0.20,
            "freq_40": 0.10,
            "freq_60": 0.05,
            "freq_90": 0.02,
            "weekday_freq": 0.05,
            "ewm_freq": 0.08,
            "bucket_recent_share": 0.02,
            "overdue_score": 0.02,
        },
        quality_weights={
            "mean": 0.45,
            "min": 0.18,
            "pair": 0.14,
            "range": 0.06,
            "bucket": 0.12,
            "repeat_last": 0.05,
        },
        overlap_penalty=0.09,
        concentration_penalty=0.03,
        pair_penalty=0.01,
        score_gap=0.14,
        bonus_weight=0.06,
        anchor_top_count=2,
    ),
    "winner_context": V2Profile(
        name="winner_context",
        signal_weights={
            "freq_5": 0.14,
            "freq_10": 0.20,
            "freq_20": 0.18,
            "freq_40": 0.10,
            "freq_60": 0.05,
            "freq_90": 0.03,
            "weekday_freq": 0.05,
            "ewm_freq": 0.05,
            "bucket_recent_share": 0.01,
            "overdue_score": 0.01,
            "jackpot_freq_20": 0.08,
            "jackpot_freq_40": 0.05,
            "solo_jackpot_freq_40": 0.03,
            "shared_jackpot_freq_40": 0.02,
            "prize_weighted_freq": 0.05,
        },
        quality_weights={
            "mean": 0.42,
            "min": 0.17,
            "pair": 0.15,
            "range": 0.07,
            "bucket": 0.13,
            "repeat_last": 0.04,
        },
        overlap_penalty=0.09,
        concentration_penalty=0.03,
        pair_penalty=0.015,
        score_gap=0.14,
        bonus_weight=0.08,
        anchor_top_count=2,
    ),
}

DEFAULT_V2_PROFILE = "base_focus_light"
DEFAULT_WINNER_PROFILE = "winner_context"
TARGET_V2_PROFILE_MAP = {
    "balanced": f"v2:{DEFAULT_V2_PROFILE}",
    "base": f"v2:{DEFAULT_V2_PROFILE}",
    "mas": "v2:current",
    "supermas": "v2:hybrid_anchor",
    "jackpot": "v2:hybrid_anchor",
}
TARGET_WINNER_PROFILE_MAP = {
    "balanced": f"v2w:{DEFAULT_WINNER_PROFILE}",
    "base": f"v2w:{DEFAULT_WINNER_PROFILE}",
    "mas": f"v2w:{DEFAULT_WINNER_PROFILE}",
    "supermas": f"v2w:{DEFAULT_WINNER_PROFILE}",
    "jackpot": f"v2w:{DEFAULT_WINNER_PROFILE}",
}


def resolve_target_config(target: str, include_mas: bool, include_super: bool) -> TargetConfig:
    mas_on = include_mas
    super_on = include_super
    if target == "base":
        return TargetConfig(
            base_weight=1.12,
            mas_weight=0.12 if mas_on else 0.0,
            super_weight=0.12 if super_on else 0.0,
            bonus_pair_weight=0.04 if mas_on and super_on else 0.0,
            repeat_mas_penalty=0.02,
            repeat_super_penalty=0.02,
            repeat_bonus_pair_penalty=0.01,
        )
    if target == "mas":
        return TargetConfig(
            base_weight=0.92,
            mas_weight=1.10 if mas_on else 0.0,
            super_weight=0.12 if super_on else 0.0,
            bonus_pair_weight=0.18 if mas_on and super_on else 0.0,
            repeat_mas_penalty=0.06,
            repeat_super_penalty=0.02,
            repeat_bonus_pair_penalty=0.03,
        )
    if target == "supermas":
        return TargetConfig(
            base_weight=0.92,
            mas_weight=0.12 if mas_on else 0.0,
            super_weight=1.10 if super_on else 0.0,
            bonus_pair_weight=0.18 if mas_on and super_on else 0.0,
            repeat_mas_penalty=0.02,
            repeat_super_penalty=0.06,
            repeat_bonus_pair_penalty=0.03,
        )
    if target == "jackpot":
        return TargetConfig(
            base_weight=1.02,
            mas_weight=0.72 if mas_on else 0.0,
            super_weight=0.72 if super_on else 0.0,
            bonus_pair_weight=0.40 if mas_on and super_on else 0.0,
            repeat_mas_penalty=0.04,
            repeat_super_penalty=0.04,
            repeat_bonus_pair_penalty=0.05,
        )
    return TargetConfig(
        base_weight=1.0,
        mas_weight=0.30 if mas_on else 0.0,
        super_weight=0.30 if super_on else 0.0,
        bonus_pair_weight=0.10 if mas_on and super_on else 0.0,
        repeat_mas_penalty=0.03,
        repeat_super_penalty=0.03,
        repeat_bonus_pair_penalty=0.02,
    )


def resolve_strategy_for_target(strategy: str, target: str) -> str:
    if strategy == "v2":
        return TARGET_V2_PROFILE_MAP.get(target, f"v2:{DEFAULT_V2_PROFILE}")
    if strategy == "v2w":
        return TARGET_WINNER_PROFILE_MAP.get(target, f"v2w:{DEFAULT_WINNER_PROFILE}")
    return strategy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze LEIDSA Loto history with Python.")
    parser.add_argument("--mode", choices=["analysis", "generate"], default="analysis", help="Run full analysis or live generation.")
    parser.add_argument("--db", default="prisma/dev.db", help="SQLite database path.")
    parser.add_argument("--game", default="leidsa-loto", help="Game key to analyze.")
    parser.add_argument(
        "--target",
        choices=["balanced", "base", "mas", "supermas", "jackpot"],
        default="balanced",
        help="Optimization target for analysis and generation.",
    )
    parser.add_argument("--training-window", type=int, default=60, help="Backtest warmup size.")
    parser.add_argument("--ticket-count", type=int, default=5, help="Tickets per portfolio.")
    parser.add_argument("--candidate-count", type=int, default=800, help="Candidate base tickets per draw.")
    parser.add_argument("--top-pool", type=int, default=18, help="Top numbers pool for weighted sampling.")
    parser.add_argument("--analyze-date", help="Specific draw date to inspect, YYYY-MM-DD.")
    parser.add_argument("--predict-date", help="Target date for live ticket generation, YYYY-MM-DD.")
    parser.add_argument(
        "--portfolio-strategy",
        choices=["v2", "v2w"],
        default="v2",
        help="Strategy to use for live generation mode.",
    )
    parser.add_argument("--constraints-json", help="JSON string with live constraints for generation mode.")
    parser.add_argument("--features-out", help="Optional CSV path for latest number feature table.")
    parser.add_argument("--backtest-out", help="Optional CSV path for per-draw backtest output.")
    parser.add_argument("--json-out", help="Optional JSON path for the full output.")
    parser.add_argument("--tune-v2", action="store_true", help="Evaluate all built-in v2 profiles and report the best one.")
    return parser.parse_args()


def load_draws(db_path: str, game: str) -> pd.DataFrame:
    conn = sqlite3.connect(db_path)
    try:
        query = "SELECT date, game, numbers FROM DrawResult WHERE game = ? ORDER BY date ASC"
        frame = pd.read_sql_query(query, conn, params=[game])
        winner_query = """
        SELECT
          drawDate,
          COUNT(*) AS winner_count,
          SUM(COALESCE(prizeAmountValue, 0)) AS total_prize_amount,
          MAX(prizeAmountValue) AS max_prize_amount
        FROM WinnerRecord
        WHERE game = ? AND drawDate IS NOT NULL
        GROUP BY drawDate
        ORDER BY drawDate ASC
        """
        winner_frame = pd.read_sql_query(winner_query, conn, params=[game])
    finally:
        conn.close()

    if frame.empty:
        return frame

    frame["date"] = pd.to_datetime(frame["date"], unit="ms", utc=True).dt.tz_localize(None)

    if not winner_frame.empty:
        winner_frame["drawDate"] = pd.to_datetime(winner_frame["drawDate"], unit="ms", utc=True).dt.tz_localize(None)
        winner_frame = winner_frame.rename(columns={"drawDate": "date"})
        frame = frame.merge(winner_frame, on="date", how="left")
    else:
        frame["winner_count"] = 0.0
        frame["total_prize_amount"] = 0.0
        frame["max_prize_amount"] = 0.0

    frame["winner_count"] = frame["winner_count"].fillna(0).astype(int)
    frame["total_prize_amount"] = frame["total_prize_amount"].fillna(0.0).astype(float)
    frame["max_prize_amount"] = frame["max_prize_amount"].fillna(0.0).astype(float)
    frame["has_jackpot_winner"] = frame["winner_count"] > 0
    frame["shared_jackpot"] = frame["winner_count"] > 1

    parsed = frame["numbers"].apply(json.loads)
    frame["base"] = parsed.apply(lambda values: values[:BASE_COUNT])
    frame["mas"] = parsed.apply(lambda values: values[6] if len(values) > 6 else np.nan)
    frame["super_mas"] = parsed.apply(lambda values: values[7] if len(values) > 7 else np.nan)
    frame["weekday"] = frame["date"].dt.weekday
    return frame


def normalize(values: Iterable[float]) -> np.ndarray:
    array = np.asarray(list(values), dtype=float)
    if array.size == 0:
        return array
    minimum = float(array.min())
    maximum = float(array.max())
    if math.isclose(minimum, maximum):
        return np.full_like(array, 0.5, dtype=float)
    return (array - minimum) / (maximum - minimum)


def calibrate_probabilities(raw_scores: Iterable[float], target_total: float) -> np.ndarray:
    scores = np.asarray(list(raw_scores), dtype=float)
    if scores.size == 0:
        return scores
    shifted = scores - scores.max()
    weights = np.exp(shifted)
    probabilities = weights / weights.sum()
    return probabilities * target_total


def compute_bucket_profile(training: pd.DataFrame) -> dict[int, float]:
    recent_desc = training.sort_values("date", ascending=False).reset_index(drop=True).head(60)
    if recent_desc.empty:
        return {bucket: BASE_COUNT / BUCKET_COUNT for bucket in range(BUCKET_COUNT)}

    counts = Counter()
    for base in recent_desc["base"]:
        for number in base:
            counts[number_bucket(number)] += 1

    total_draws = max(len(recent_desc), 1)
    return {bucket: counts[bucket] / total_draws for bucket in range(BUCKET_COUNT)}


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def compute_regime_state(training: pd.DataFrame) -> dict[str, float]:
    recent_desc = training.sort_values("date", ascending=False).reset_index(drop=True)
    if recent_desc.empty:
        return {
            "rollover_pressure": 0.0,
            "shared_pressure": 0.0,
            "solo_pressure": 0.0,
            "prize_pressure": 0.0,
            "winner_rate_20": 0.0,
            "shared_rate_20": 0.0,
            "draws_since_last_winner": 0.0,
            "draws_since_last_shared": 0.0,
        }

    has_winner = recent_desc["winner_count"] > 0
    shared_winner = recent_desc["winner_count"] > 1
    winner_indexes = np.flatnonzero(has_winner.to_numpy())
    shared_indexes = np.flatnonzero(shared_winner.to_numpy())
    draws_since_last_winner = int(winner_indexes[0]) if len(winner_indexes) > 0 else len(recent_desc)
    draws_since_last_shared = int(shared_indexes[0]) if len(shared_indexes) > 0 else len(recent_desc)

    winner_rate_10 = float(has_winner.head(10).mean()) if not recent_desc.empty else 0.0
    winner_rate_20 = float(has_winner.head(20).mean()) if not recent_desc.empty else 0.0
    shared_rate_20 = float(shared_winner.head(20).mean()) if not recent_desc.empty else 0.0
    avg_prize_10 = float(recent_desc["max_prize_amount"].head(10).mean()) if not recent_desc.empty else 0.0
    historical_positive = recent_desc.loc[recent_desc["max_prize_amount"] > 0, "max_prize_amount"]
    baseline_prize = float(historical_positive.mean()) if not historical_positive.empty else 1.0
    prize_pressure = clamp01((avg_prize_10 / max(baseline_prize, 1.0)) / 1.8)
    no_winner_pressure = clamp01(draws_since_last_winner / 12.0)
    no_shared_pressure = clamp01(draws_since_last_shared / 18.0)
    rollover_pressure = clamp01((no_winner_pressure + (1.0 - winner_rate_20) + prize_pressure) / 3.0)
    shared_pressure = clamp01((shared_rate_20 + (1.0 - no_shared_pressure)) / 2.0)
    solo_pressure = clamp01((winner_rate_10 - shared_rate_20 + prize_pressure) / 2.0)

    return {
        "rollover_pressure": rollover_pressure,
        "shared_pressure": shared_pressure,
        "solo_pressure": solo_pressure,
        "prize_pressure": prize_pressure,
        "winner_rate_20": winner_rate_20,
        "shared_rate_20": shared_rate_20,
        "draws_since_last_winner": float(draws_since_last_winner),
        "draws_since_last_shared": float(draws_since_last_shared),
    }


def compute_bucket_templates(training: pd.DataFrame) -> list[tuple[list[int], float]]:
    recent_desc = training.sort_values("date", ascending=False).reset_index(drop=True).head(80)
    weighted_templates: Counter[tuple[int, int, int, int]] = Counter()

    for index, base in enumerate(recent_desc["base"]):
        template = [0, 0, 0, 0]
        for number in base:
            template[number_bucket(number)] += 1
        weighted_templates[tuple(template)] += 1 / (1 + index * 0.15)

    if not weighted_templates:
        return [([2, 2, 1, 1], 1.0)]

    return [(list(template), weight) for template, weight in weighted_templates.most_common(8)]


def trim_template_to_remaining(template: list[int], remaining_slots: int) -> list[int]:
    trimmed = template[:]
    while sum(trimmed) > remaining_slots:
        largest_bucket = max(range(len(trimmed)), key=lambda bucket: trimmed[bucket])
        if trimmed[largest_bucket] == 0:
            break
        trimmed[largest_bucket] -= 1
    return trimmed


def passes_base_constraints(base: list[int], constraints: dict[str, object]) -> bool:
    base_sum = sum(base)
    even_total = sum(1 for number in base if number % 2 == 0)
    if base_sum < int(constraints.get("sumMin", 21)) or base_sum > int(constraints.get("sumMax", 225)):
        return False
    if even_total < int(constraints.get("evenMin", 0)) or even_total > int(constraints.get("evenMax", 6)):
        return False
    return len(set(base)) == len(base)


def normalize_ticket_output(ticket: PortfolioTicket, constraints: dict[str, object]) -> list[int]:
    values = ticket.base[:BASE_COUNT]
    if bool(constraints.get("includeMas", True)):
        values.append(ticket.bonus_mas)
    if bool(constraints.get("includeSuperMas", True)):
        values.append(ticket.bonus_supermas)
    return values


def get_v2_profile(strategy: str) -> V2Profile:
    if strategy == "v2":
        return V2_PROFILES[DEFAULT_V2_PROFILE]
    if strategy == "v2w":
        return V2_PROFILES[DEFAULT_WINNER_PROFILE]
    if strategy.startswith("v2:"):
        profile_name = strategy.split(":", 1)[1]
        return V2_PROFILES[profile_name]
    if strategy.startswith("v2w:"):
        profile_name = strategy.split(":", 1)[1]
        return V2_PROFILES[profile_name]
    raise ValueError(f"Unsupported v2 strategy: {strategy}")


def is_v2_strategy(strategy: str) -> bool:
    return strategy in {"v2", "v2w"} or strategy.startswith("v2:") or strategy.startswith("v2w:")


def compute_recent_subset_frequency(slice_frame: pd.DataFrame, extractor) -> float:
    if slice_frame.empty:
        return 0.0
    return float(slice_frame.apply(extractor, axis=1).mean())


def compute_prize_weighted_frequency(slice_frame: pd.DataFrame, extractor) -> float:
    if slice_frame.empty:
        return 0.0

    prize_weights = np.log1p(slice_frame["max_prize_amount"].clip(lower=0).to_numpy(dtype=float))
    if np.allclose(prize_weights.sum(), 0.0):
        prize_weights = np.ones(len(slice_frame), dtype=float)
    hits = slice_frame.apply(extractor, axis=1).to_numpy(dtype=float)
    return float((hits * prize_weights).sum() / prize_weights.sum())


def compute_number_feature_table(training: pd.DataFrame, target_date: pd.Timestamp, strategy: str) -> pd.DataFrame:
    recent_desc = training.sort_values("date", ascending=False).reset_index(drop=True)
    target_weekday = target_date.weekday()
    bucket_profile = compute_bucket_profile(training)
    regime_state = compute_regime_state(training)
    v2_profile = get_v2_profile(strategy) if is_v2_strategy(strategy) else None
    recent_jackpots = recent_desc.loc[recent_desc["winner_count"] > 0].reset_index(drop=True)
    recent_solo_jackpots = recent_desc.loc[recent_desc["winner_count"] == 1].reset_index(drop=True)
    recent_shared_jackpots = recent_desc.loc[recent_desc["winner_count"] > 1].reset_index(drop=True)
    rows: list[dict[str, float | int]] = []

    for number in range(BASE_MIN, BASE_MAX + 1):
        seen_mask = recent_desc["base"].apply(lambda values: number in values)
        last_seen_indexes = np.flatnonzero(seen_mask.to_numpy())
        draws_since_seen = int(last_seen_indexes[0]) if len(last_seen_indexes) > 0 else len(recent_desc)
        row: dict[str, float | int] = {
            "number": number,
            "freq_10": float(seen_mask.head(10).mean()),
            "freq_20": float(seen_mask.head(20).mean()),
            "freq_40": float(seen_mask.head(40).mean()),
            "freq_60": float(seen_mask.head(60).mean()),
            "freq_90": float(seen_mask.head(90).mean()),
            "weekday_freq": float(
                recent_desc.loc[recent_desc["weekday"] == target_weekday, "base"]
                .apply(lambda values: number in values)
                .mean()
                if not recent_desc.loc[recent_desc["weekday"] == target_weekday].empty
                else 0
            ),
            "draws_since_seen": draws_since_seen,
            "bucket": number_bucket(number),
            "bucket_recent_share": bucket_profile[number_bucket(number)] / BASE_COUNT,
            "jackpot_freq_20": compute_recent_subset_frequency(
                recent_jackpots.head(20), lambda row: number in row["base"]
            ),
            "jackpot_freq_40": compute_recent_subset_frequency(
                recent_jackpots.head(40), lambda row: number in row["base"]
            ),
            "solo_jackpot_freq_40": compute_recent_subset_frequency(
                recent_solo_jackpots.head(40), lambda row: number in row["base"]
            ),
            "shared_jackpot_freq_40": compute_recent_subset_frequency(
                recent_shared_jackpots.head(40), lambda row: number in row["base"]
            ),
            "prize_weighted_freq": compute_prize_weighted_frequency(
                recent_jackpots.head(40), lambda row: number in row["base"]
            ),
        }

        decay_weights = np.power(0.92, np.arange(len(recent_desc)))
        hits = seen_mask.to_numpy(dtype=float)
        row["ewm_freq"] = float((hits * decay_weights).sum() / decay_weights.sum()) if len(decay_weights) else 0.0
        row["freq_5"] = float(seen_mask.head(5).mean())
        rows.append(row)

    frame = pd.DataFrame(rows)
    frame["overdue_score"] = normalize(frame["draws_since_seen"])
    if v2_profile is not None:
        frame["raw_signal"] = sum(frame[column] * weight for column, weight in v2_profile.signal_weights.items())
        if strategy == "v2w" or strategy.startswith("v2w:"):
            frame["regime_boost"] = (
                frame["overdue_score"] * (0.10 * regime_state["rollover_pressure"])
                + frame["jackpot_freq_20"] * (0.06 * regime_state["rollover_pressure"])
                + frame["shared_jackpot_freq_40"] * (0.05 * regime_state["shared_pressure"])
                + frame["solo_jackpot_freq_40"] * (0.04 * regime_state["solo_pressure"])
                + frame["prize_weighted_freq"] * (0.06 * regime_state["prize_pressure"])
            )
            frame["raw_signal"] = frame["raw_signal"] + frame["regime_boost"]
            frame["regime_rollover_pressure"] = regime_state["rollover_pressure"]
            frame["regime_shared_pressure"] = regime_state["shared_pressure"]
            frame["regime_solo_pressure"] = regime_state["solo_pressure"]
        else:
            frame["regime_boost"] = 0.0
        frame["marginal_probability"] = calibrate_probabilities(frame["raw_signal"], BASE_COUNT)
        frame["score"] = frame["marginal_probability"]
    else:
        frame["score"] = (
            frame["freq_10"] * 0.28
            + frame["freq_20"] * 0.22
            + frame["freq_40"] * 0.18
            + frame["freq_60"] * 0.08
            + frame["weekday_freq"] * 0.10
            + frame["ewm_freq"] * 0.10
            + frame["overdue_score"] * 0.04
        )
        frame["marginal_probability"] = calibrate_probabilities(frame["score"], BASE_COUNT)
    return frame.sort_values(["score", "freq_20", "freq_10", "number"], ascending=[False, False, False, True]).reset_index(
        drop=True
    )


def compute_bonus_feature_table(
    training: pd.DataFrame, column: str, max_value: int, target_date: pd.Timestamp, strategy: str
) -> pd.DataFrame:
    recent_desc = training.sort_values("date", ascending=False).reset_index(drop=True)
    target_weekday = target_date.weekday()
    regime_state = compute_regime_state(training)
    v2_profile = get_v2_profile(strategy) if is_v2_strategy(strategy) else None
    recent_jackpots = recent_desc.loc[recent_desc["winner_count"] > 0].reset_index(drop=True)
    recent_solo_jackpots = recent_desc.loc[recent_desc["winner_count"] == 1].reset_index(drop=True)
    recent_shared_jackpots = recent_desc.loc[recent_desc["winner_count"] > 1].reset_index(drop=True)
    rows: list[dict[str, float | int]] = []

    for number in range(1, max_value + 1):
        seen_mask = recent_desc[column].fillna(-1).astype(int) == number
        last_seen_indexes = np.flatnonzero(seen_mask.to_numpy())
        draws_since_seen = int(last_seen_indexes[0]) if len(last_seen_indexes) > 0 else len(recent_desc)
        weekday_slice = recent_desc.loc[recent_desc["weekday"] == target_weekday, column].fillna(-1).astype(int)
        rows.append(
            {
                "number": number,
                "freq_10": float(seen_mask.head(10).mean()),
                "freq_20": float(seen_mask.head(20).mean()),
                "freq_40": float(seen_mask.head(40).mean()),
                "weekday_freq": float((weekday_slice == number).mean()) if not weekday_slice.empty else 0,
                "draws_since_seen": draws_since_seen,
                "jackpot_freq_20": compute_recent_subset_frequency(
                    recent_jackpots.head(20),
                    lambda row: not pd.isna(row[column]) and int(row[column]) == number,
                ),
                "jackpot_freq_40": compute_recent_subset_frequency(
                    recent_jackpots.head(40),
                    lambda row: not pd.isna(row[column]) and int(row[column]) == number,
                ),
                "solo_jackpot_freq_40": compute_recent_subset_frequency(
                    recent_solo_jackpots.head(40),
                    lambda row: not pd.isna(row[column]) and int(row[column]) == number,
                ),
                "shared_jackpot_freq_40": compute_recent_subset_frequency(
                    recent_shared_jackpots.head(40),
                    lambda row: not pd.isna(row[column]) and int(row[column]) == number,
                ),
                "prize_weighted_freq": compute_prize_weighted_frequency(
                    recent_jackpots.head(40),
                    lambda row: not pd.isna(row[column]) and int(row[column]) == number,
                ),
            }
        )

    frame = pd.DataFrame(rows)
    frame["overdue_score"] = normalize(frame["draws_since_seen"])
    frame["score"] = (
        frame["freq_10"] * 0.35
        + frame["freq_20"] * 0.30
        + frame["freq_40"] * 0.15
        + frame["weekday_freq"] * 0.10
        + frame["overdue_score"] * 0.10
    )
    if v2_profile is not None:
        base_bonus_score = (
            frame["freq_10"] * 0.30
            + frame["freq_20"] * 0.28
            + frame["freq_40"] * 0.18
            + frame["weekday_freq"] * 0.12
            + frame["overdue_score"] * 0.12
        )
        if strategy in {"v2w"} or strategy.startswith("v2w:"):
            frame["score"] = (
                base_bonus_score
                + frame["jackpot_freq_20"] * (0.10 + 0.04 * regime_state["rollover_pressure"])
                + frame["jackpot_freq_40"] * (0.08 + 0.03 * regime_state["shared_pressure"])
                + frame["prize_weighted_freq"] * (0.06 + 0.04 * regime_state["prize_pressure"])
            )
        else:
            frame["score"] = base_bonus_score
    frame["marginal_probability"] = calibrate_probabilities(frame["score"], 1.0)
    return frame.sort_values(["score", "freq_20", "number"], ascending=[False, False, True]).reset_index(drop=True)


def compute_pair_scores(training: pd.DataFrame, window: int = 80) -> dict[tuple[int, int], float]:
    slice_frame = training.tail(window)
    pair_counts: Counter[tuple[int, int]] = Counter()
    for base in slice_frame["base"]:
        for pair in combinations(sorted(base), 2):
            pair_counts[pair] += 1

    total_draws = max(len(slice_frame), 1)
    return {pair: count / total_draws for pair, count in pair_counts.items()}


def compute_bonus_pair_scores(training: pd.DataFrame, window: int = 80) -> dict[tuple[int, int], float]:
    slice_frame = training.tail(window)
    pair_counts: Counter[tuple[int, int]] = Counter()
    for _, row in slice_frame.iterrows():
        if pd.isna(row["mas"]) or pd.isna(row["super_mas"]):
            continue
        pair_counts[(int(row["mas"]), int(row["super_mas"]))] += 1

    total_draws = max(len(slice_frame), 1)
    return {pair: count / total_draws for pair, count in pair_counts.items()}


def weighted_sample_without_replacement(
    pool: list[int], weights: np.ndarray, pick_count: int, rng: np.random.Generator
) -> list[int]:
    selected: list[int] = []
    remaining_pool = pool[:]
    remaining_weights = weights.astype(float).copy()

    while len(selected) < pick_count and remaining_pool:
        probabilities = remaining_weights / remaining_weights.sum()
        index = int(rng.choice(len(remaining_pool), p=probabilities))
        selected.append(remaining_pool.pop(index))
        remaining_weights = np.delete(remaining_weights, index)

    return selected


def ticket_quality(
    base: list[int],
    score_map: dict[int, float],
    pair_scores: dict[tuple[int, int], float],
    last_draw_base: list[int],
    bucket_profile: dict[int, float],
    strategy: str,
    regime_state: dict[str, float] | None = None,
) -> float:
    v2_profile = get_v2_profile(strategy) if is_v2_strategy(strategy) else None
    base_scores = [score_map[number] for number in base]
    pair_average = float(np.mean([pair_scores.get(tuple(sorted(pair)), 0.0) for pair in combinations(base, 2)]))
    range_coverage = len({(number - 1) // 10 for number in base}) / 4
    repeat_last = len(set(base) & set(last_draw_base))
    bucket_counts = Counter(number_bucket(number) for number in base)
    bucket_fit = 1.0 - (
        sum(abs(bucket_counts.get(bucket, 0) - bucket_profile.get(bucket, BASE_COUNT / BUCKET_COUNT)) for bucket in range(BUCKET_COUNT))
        / BASE_COUNT
    )
    rollover_pressure = regime_state["rollover_pressure"] if regime_state is not None else 0.0
    shared_pressure = regime_state["shared_pressure"] if regime_state is not None else 0.0
    if v2_profile is not None:
        return (
            np.mean(base_scores) * v2_profile.quality_weights["mean"]
            + np.min(base_scores) * v2_profile.quality_weights["min"]
            + pair_average * v2_profile.quality_weights["pair"]
            + range_coverage * v2_profile.quality_weights["range"] * (1.0 + 0.35 * shared_pressure)
            + bucket_fit * v2_profile.quality_weights["bucket"] * (1.0 + 0.25 * shared_pressure)
            - repeat_last * v2_profile.quality_weights["repeat_last"] * (1.0 - 0.2 * rollover_pressure)
        )
    return (
        np.mean(base_scores) * 0.50
        + np.min(base_scores) * 0.15
        + pair_average * 0.20
        + range_coverage * 0.10
        - repeat_last * 0.05
    )


def generate_candidate_bases(
    feature_table: pd.DataFrame,
    pair_scores: dict[tuple[int, int], float],
    last_draw_base: list[int],
    bucket_profile: dict[int, float],
    templates: list[tuple[list[int], float]],
    candidate_count: int,
    top_pool: int,
    rng: np.random.Generator,
    strategy: str,
    regime_state: dict[str, float] | None = None,
) -> list[tuple[list[int], float]]:
    score_map = dict(zip(feature_table["number"], feature_table["score"]))
    v2_profile = get_v2_profile(strategy) if is_v2_strategy(strategy) else None
    broad_pool = feature_table["number"].head(max(top_pool + 10, 28)).tolist()
    weight_column = "marginal_probability" if v2_profile is not None else "score"
    broad_weights = feature_table.set_index("number").loc[broad_pool, weight_column].to_numpy(dtype=float) + 1e-6
    top_numbers = feature_table["number"].head(top_pool).tolist()
    top_weights = feature_table.set_index("number").loc[top_numbers, weight_column].to_numpy(dtype=float) + 1e-6

    candidates: dict[tuple[int, ...], float] = {}
    for _ in range(candidate_count):
        if v2_profile is not None:
            template_values, template_weights = zip(*templates)
            template_index = int(rng.choice(len(template_values), p=np.array(template_weights, dtype=float) / np.sum(template_weights)))
            template = template_values[template_index][:]
            base: list[int] = []
            if v2_profile.anchor_top_count > 0:
                anchors = weighted_sample_without_replacement(top_numbers, top_weights, v2_profile.anchor_top_count, rng)
                base.extend(anchors)
                anchor_bucket_counts = Counter(number_bucket(anchor) for anchor in anchors)
                for bucket, count in anchor_bucket_counts.items():
                    template[bucket] = max(0, template[bucket] - count)
                template = trim_template_to_remaining(template, BASE_COUNT - len(base))
            for bucket, bucket_pick_count in enumerate(template):
                if bucket_pick_count == 0:
                    continue
                bucket_pool = [number for number in broad_pool if number_bucket(number) == bucket and number not in base]
                if len(bucket_pool) < bucket_pick_count:
                    continue
                bucket_weights = feature_table.set_index("number").loc[bucket_pool, weight_column].to_numpy(dtype=float) + 1e-6
                base.extend(weighted_sample_without_replacement(bucket_pool, bucket_weights, bucket_pick_count, rng))
            if len(base) > BASE_COUNT:
                base = sorted(base, key=lambda number: score_map[number], reverse=True)[:BASE_COUNT]
            if len(base) < BASE_COUNT:
                remainder_pool = [value for value in broad_pool if value not in base]
                remainder_weights = feature_table.set_index("number").loc[remainder_pool, weight_column].to_numpy(dtype=float) + 1e-6
                base.extend(weighted_sample_without_replacement(remainder_pool, remainder_weights, BASE_COUNT - len(base), rng))
        else:
            base = weighted_sample_without_replacement(top_numbers, top_weights, 4, rng)
            remainder_pool = [value for value in broad_pool if value not in base]
            remainder_weights = np.array([score_map[value] for value in remainder_pool], dtype=float) + 1e-6
            base.extend(weighted_sample_without_replacement(remainder_pool, remainder_weights, 2, rng))
        base = sorted(base)
        key = tuple(base)
        score = ticket_quality(base, score_map, pair_scores, last_draw_base, bucket_profile, strategy, regime_state)
        candidates[key] = max(candidates.get(key, -1.0), score)

    return sorted(((list(key), score) for key, score in candidates.items()), key=lambda item: item[1], reverse=True)


def select_portfolio(
    candidate_bases: list[tuple[list[int], float]],
    mas_table: pd.DataFrame,
    super_mas_table: pd.DataFrame,
    bonus_pair_scores: dict[tuple[int, int], float],
    ticket_count: int,
    strategy: str,
    target: str,
    include_mas: bool,
    include_super: bool,
    regime_state: dict[str, float] | None = None,
) -> list[PortfolioTicket]:
    v2_profile = get_v2_profile(strategy) if is_v2_strategy(strategy) else None
    target_config = resolve_target_config(target, include_mas, include_super)
    selected: list[PortfolioTicket] = []
    repeated_numbers: Counter[int] = Counter()
    repeated_pairs: Counter[tuple[int, int]] = Counter()
    repeated_mas: Counter[int] = Counter()
    repeated_super: Counter[int] = Counter()
    repeated_bonus_pairs: Counter[tuple[int, int]] = Counter()
    used_bases: set[tuple[int, ...]] = set()
    bonus_weight_column = "marginal_probability" if v2_profile is not None else "score"
    mas_scores = dict(zip(mas_table["number"], mas_table[bonus_weight_column]))
    super_scores = dict(zip(super_mas_table["number"], super_mas_table[bonus_weight_column]))
    mas_values = mas_table["number"].head(max(ticket_count * 2, 8)).tolist()
    super_values = super_mas_table["number"].head(max(ticket_count * 2, 8)).tolist()

    bonus_candidates: list[tuple[int, int, float]] = []
    if include_mas or include_super:
        mas_pool = mas_values if include_mas else [1]
        super_pool = super_values if include_super else [1]
        for mas_value in mas_pool:
            for super_value in super_pool:
                score = (
                    mas_scores.get(mas_value, 0.0) * target_config.mas_weight
                    + super_scores.get(super_value, 0.0) * target_config.super_weight
                    + bonus_pair_scores.get((mas_value, super_value), 0.0) * target_config.bonus_pair_weight
                )
                bonus_candidates.append((mas_value, super_value, score))
        bonus_candidates.sort(key=lambda item: item[2], reverse=True)
    else:
        bonus_candidates.append((1, 1, 0.0))

    for base, score in candidate_bases:
        rollover_pressure = regime_state["rollover_pressure"] if regime_state is not None else 0.0
        shared_pressure = regime_state["shared_pressure"] if regime_state is not None else 0.0
        dynamic_overlap_penalty = (v2_profile.overlap_penalty if v2_profile is not None else 0.08) * (1.0 - 0.2 * rollover_pressure)
        dynamic_concentration_penalty = (v2_profile.concentration_penalty if v2_profile is not None else 0.03) * (1.0 - 0.15 * rollover_pressure)
        dynamic_pair_penalty = (v2_profile.pair_penalty if v2_profile is not None else 0.0) * (1.0 + 0.25 * shared_pressure)
        overlap_penalty = sum(len(set(base) & set(ticket.base)) for ticket in selected) * (
            dynamic_overlap_penalty
        )
        concentration_penalty = sum(repeated_numbers[number] for number in base) * (
            dynamic_concentration_penalty
        )
        pair_penalty = sum(repeated_pairs[pair] for pair in combinations(base, 2)) * (
            dynamic_pair_penalty
        )
        adjusted = score - overlap_penalty - concentration_penalty
        adjusted -= pair_penalty
        if selected and adjusted < selected[-1].score - (v2_profile.score_gap if v2_profile is not None else 0.12):
            continue

        base_key = tuple(base)
        if base_key in used_bases:
            continue

        best_bonus_mas = 1
        best_bonus_super = 1
        best_bonus_score = -1e9
        for bonus_mas, bonus_super, raw_bonus_score in bonus_candidates[:16]:
            penalty = (
                repeated_mas[bonus_mas] * target_config.repeat_mas_penalty
                + repeated_super[bonus_super] * target_config.repeat_super_penalty
                + repeated_bonus_pairs[(bonus_mas, bonus_super)] * target_config.repeat_bonus_pair_penalty
            )
            candidate_bonus_score = raw_bonus_score - penalty
            if candidate_bonus_score > best_bonus_score:
                best_bonus_score = candidate_bonus_score
                best_bonus_mas = bonus_mas
                best_bonus_super = bonus_super

        total_score = adjusted * target_config.base_weight + best_bonus_score
        ticket = PortfolioTicket(base=base, bonus_mas=best_bonus_mas, bonus_supermas=best_bonus_super, score=total_score)
        selected.append(ticket)
        used_bases.add(base_key)
        repeated_numbers.update(base)
        repeated_pairs.update(tuple(sorted(pair)) for pair in combinations(base, 2))
        repeated_mas.update([best_bonus_mas])
        repeated_super.update([best_bonus_super])
        repeated_bonus_pairs.update([(best_bonus_mas, best_bonus_super)])

        if len(selected) == ticket_count:
            break

    if len(selected) < ticket_count:
        for base, score in candidate_bases:
            base_key = tuple(base)
            if base_key in used_bases:
                continue
            bonus_mas, bonus_super, bonus_score = bonus_candidates[len(selected) % len(bonus_candidates)]
            total_score = score * target_config.base_weight + bonus_score
            selected.append(PortfolioTicket(base=base, bonus_mas=bonus_mas, bonus_supermas=bonus_super, score=total_score))
            used_bases.add(base_key)
            if len(selected) == ticket_count:
                break

    return selected


def generate_portfolio(
    training: pd.DataFrame,
    target_date: pd.Timestamp,
    ticket_count: int,
    candidate_count: int,
    top_pool: int,
    seed: int,
    strategy: str,
    target: str = "balanced",
    include_mas: bool = True,
    include_super: bool = True,
) -> tuple[list[PortfolioTicket], pd.DataFrame]:
    effective_strategy = resolve_strategy_for_target(strategy, target)
    regime_state = compute_regime_state(training)
    feature_table = compute_number_feature_table(training, target_date, effective_strategy)
    mas_table = compute_bonus_feature_table(training, "mas", MAS_MAX, target_date, effective_strategy)
    super_table = compute_bonus_feature_table(training, "super_mas", SUPER_MAS_MAX, target_date, effective_strategy)
    pair_scores = compute_pair_scores(training)
    bonus_pair_scores = compute_bonus_pair_scores(training)
    bucket_profile = compute_bucket_profile(training)
    templates = compute_bucket_templates(training)
    last_draw_base = training.iloc[-1]["base"] if not training.empty else []
    rng = np.random.default_rng(seed)
    candidates = generate_candidate_bases(
        feature_table,
        pair_scores,
        last_draw_base,
        bucket_profile,
        templates,
        candidate_count,
        top_pool,
        rng,
        effective_strategy,
        regime_state,
    )
    portfolio = select_portfolio(
        candidates,
        mas_table,
        super_table,
        bonus_pair_scores,
        ticket_count,
        effective_strategy,
        target,
        include_mas,
        include_super,
        regime_state,
    )
    return portfolio, feature_table


def generate_live_tickets(
    draws: pd.DataFrame,
    predict_date: str,
    constraints: dict[str, object],
    candidate_count: int,
    top_pool: int,
    portfolio_strategy: str = "v2",
) -> dict[str, object]:
    target_date = pd.Timestamp(predict_date)
    seed = str(constraints.get("seed") or f"python-v2-{predict_date}")
    required_count = int(constraints.get("count", 5))
    target = str(constraints.get("target", "balanced"))
    include_mas = bool(constraints.get("includeMas", True))
    include_super = bool(constraints.get("includeSuperMas", True))
    collected: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()
    attempts = 0

    while len(collected) < required_count and attempts < 8:
        portfolio, _ = generate_portfolio(
            training=draws.copy(),
            target_date=target_date,
            ticket_count=required_count,
            candidate_count=candidate_count,
            top_pool=top_pool,
            seed=seed_to_int(f"{seed}-{attempts}"),
            strategy=portfolio_strategy,
            target=target,
            include_mas=include_mas,
            include_super=include_super,
        )
        attempts += 1
        for ticket in portfolio:
            if not passes_base_constraints(ticket.base[:BASE_COUNT], constraints):
                continue
            normalized = normalize_ticket_output(ticket, constraints)
            key = tuple(normalized)
            if key in seen:
                continue
            seen.add(key)
            collected.append(normalized)
            if len(collected) == required_count:
                break

    return {
        "tickets": collected,
        "metadata": {
            "generated_at": pd.Timestamp.utcnow().isoformat(),
            "seed": seed,
            "candidates_considered": attempts * candidate_count,
            "strategy": "python-v2w" if portfolio_strategy == "v2w" else "python-v2",
            "batches_searched": attempts,
        },
    }


def score_portfolio(actual_row: pd.Series, portfolio: list[PortfolioTicket]) -> dict[str, float]:
    actual_base = set(actual_row["base"])
    actual_mas = int(actual_row["mas"]) if not pd.isna(actual_row["mas"]) else None
    actual_super = int(actual_row["super_mas"]) if not pd.isna(actual_row["super_mas"]) else None
    base_hits = [len(actual_base & set(ticket.base)) for ticket in portfolio]
    mas_hit = any(ticket.bonus_mas == actual_mas for ticket in portfolio if actual_mas is not None)
    super_hit = any(ticket.bonus_supermas == actual_super for ticket in portfolio if actual_super is not None)
    bonus_pair_hit = any(
        ticket.bonus_mas == actual_mas and ticket.bonus_supermas == actual_super
        for ticket in portfolio
        if actual_mas is not None and actual_super is not None
    )
    unique_numbers = len({number for ticket in portfolio for number in ticket.base})

    return {
        "average_base_hits": float(np.mean(base_hits)) if base_hits else 0.0,
        "max_base_hits": float(np.max(base_hits)) if base_hits else 0.0,
        "any_mas_hit": float(mas_hit),
        "any_super_mas_hit": float(super_hit),
        "any_bonus_pair_hit": float(bonus_pair_hit),
        "unique_base_numbers": float(unique_numbers),
    }


def run_backtest(
    draws: pd.DataFrame,
    training_window: int,
    ticket_count: int,
    candidate_count: int,
    top_pool: int,
    strategy: str,
    target: str = "balanced",
) -> pd.DataFrame:
    rows: list[dict[str, float | str]] = []

    for index in range(training_window, len(draws)):
        training = draws.iloc[:index].copy()
        actual = draws.iloc[index]
        portfolio, _ = generate_portfolio(
            training=training,
            target_date=actual["date"],
            ticket_count=ticket_count,
            candidate_count=candidate_count,
            top_pool=top_pool,
            seed=index,
            strategy=strategy,
            target=target,
        )
        metrics = score_portfolio(actual, portfolio)
        rows.append(
            {
                "date": actual["date"].strftime("%Y-%m-%d"),
                "actual_base": " - ".join(map(str, actual["base"])),
                "actual_mas": int(actual["mas"]) if not pd.isna(actual["mas"]) else None,
                "actual_super_mas": int(actual["super_mas"]) if not pd.isna(actual["super_mas"]) else None,
                "portfolio_best_score": max((ticket.score for ticket in portfolio), default=0.0),
                **metrics,
            }
        )

    return pd.DataFrame(rows)


def summarize_backtest(backtest: pd.DataFrame) -> dict[str, float]:
    return {
        "draws_evaluated": int(len(backtest)),
        "average_base_hits": float(backtest["average_base_hits"].mean()) if not backtest.empty else 0.0,
        "max_base_hits_average": float(backtest["max_base_hits"].mean()) if not backtest.empty else 0.0,
        "mas_hit_rate": float(backtest["any_mas_hit"].mean()) if not backtest.empty else 0.0,
        "super_mas_hit_rate": float(backtest["any_super_mas_hit"].mean()) if not backtest.empty else 0.0,
        "bonus_pair_hit_rate": float(backtest["any_bonus_pair_hit"].mean()) if not backtest.empty else 0.0,
        "average_unique_base_numbers": float(backtest["unique_base_numbers"].mean()) if not backtest.empty else 0.0,
    }


def build_compare_frame(
    backtest_left: pd.DataFrame,
    backtest_right: pd.DataFrame,
    left_label: str = "v1",
    right_label: str = "v2",
) -> pd.DataFrame:
    compare_frame = backtest_left.copy()
    compare_frame = compare_frame.rename(
        columns={
            "average_base_hits": f"{left_label}_average_base_hits",
            "max_base_hits": f"{left_label}_max_base_hits",
            "any_mas_hit": f"{left_label}_any_mas_hit",
            "any_super_mas_hit": f"{left_label}_any_super_mas_hit",
            "any_bonus_pair_hit": f"{left_label}_any_bonus_pair_hit",
            "unique_base_numbers": f"{left_label}_unique_base_numbers",
            "portfolio_best_score": f"{left_label}_portfolio_best_score",
        }
    )
    compare_frame = compare_frame.merge(
        backtest_right.rename(
            columns={
                "average_base_hits": f"{right_label}_average_base_hits",
                "max_base_hits": f"{right_label}_max_base_hits",
                "any_mas_hit": f"{right_label}_any_mas_hit",
                "any_super_mas_hit": f"{right_label}_any_super_mas_hit",
                "any_bonus_pair_hit": f"{right_label}_any_bonus_pair_hit",
                "unique_base_numbers": f"{right_label}_unique_base_numbers",
                "portfolio_best_score": f"{right_label}_portfolio_best_score",
            }
        ),
        on=["date", "actual_base", "actual_mas", "actual_super_mas"],
        how="inner",
    )
    compare_frame["date"] = pd.to_datetime(compare_frame["date"])
    return compare_frame


def summarize_windows(
    compare_frame: pd.DataFrame,
    left_label: str = "v1",
    right_label: str = "v2",
    windows: list[int] | None = None,
) -> dict[str, dict[str, object]]:
    if windows is None:
        windows = [15, 30, 60]

    summaries: dict[str, dict[str, object]] = {}
    sorted_frame = compare_frame.sort_values("date").reset_index(drop=True)

    for window in windows:
        slice_frame = sorted_frame.tail(window)
        if slice_frame.empty:
            continue
        base_delta = float((slice_frame[f"{right_label}_average_base_hits"] - slice_frame[f"{left_label}_average_base_hits"]).mean())
        max_delta = float((slice_frame[f"{right_label}_max_base_hits"] - slice_frame[f"{left_label}_max_base_hits"]).mean())
        mas_delta = float((slice_frame[f"{right_label}_any_mas_hit"] - slice_frame[f"{left_label}_any_mas_hit"]).mean())
        super_delta = float((slice_frame[f"{right_label}_any_super_mas_hit"] - slice_frame[f"{left_label}_any_super_mas_hit"]).mean())
        bonus_pair_delta = float((slice_frame[f"{right_label}_any_bonus_pair_hit"] - slice_frame[f"{left_label}_any_bonus_pair_hit"]).mean())
        diversity_delta = float((slice_frame[f"{right_label}_unique_base_numbers"] - slice_frame[f"{left_label}_unique_base_numbers"]).mean())
        summaries[f"last_{window}_draws"] = {
            "draw_count": int(len(slice_frame)),
            "date_range": {
                "from": slice_frame.iloc[0]["date"].strftime("%Y-%m-%d"),
                "to": slice_frame.iloc[-1]["date"].strftime("%Y-%m-%d"),
            },
            "winner": {
                "average_base_hits": right_label if base_delta > 0 else left_label,
                "max_base_hits": right_label if max_delta > 0 else left_label,
                "mas_hit_rate": right_label if mas_delta > 0 else left_label,
                "super_mas_hit_rate": right_label if super_delta > 0 else left_label,
                "bonus_pair_hit_rate": right_label if bonus_pair_delta > 0 else left_label,
                "portfolio_diversity": right_label if diversity_delta > 0 else left_label,
            },
            "v2_minus_v1": {
                "average_base_hits": base_delta,
                "max_base_hits": max_delta,
                "mas_hit_rate": mas_delta,
                "super_mas_hit_rate": super_delta,
                "bonus_pair_hit_rate": bonus_pair_delta,
                "portfolio_diversity": diversity_delta,
            },
        }

    return summaries


def summarize_by_month(compare_frame: pd.DataFrame, left_label: str = "v1", right_label: str = "v2") -> list[dict[str, object]]:
    if compare_frame.empty:
        return []

    month_frame = compare_frame.copy()
    month_frame["month"] = month_frame["date"].dt.strftime("%Y-%m")
    rows: list[dict[str, object]] = []

    for month, group in month_frame.groupby("month", sort=True):
        base_delta = float((group[f"{right_label}_average_base_hits"] - group[f"{left_label}_average_base_hits"]).mean())
        max_delta = float((group[f"{right_label}_max_base_hits"] - group[f"{left_label}_max_base_hits"]).mean())
        mas_delta = float((group[f"{right_label}_any_mas_hit"] - group[f"{left_label}_any_mas_hit"]).mean())
        super_delta = float((group[f"{right_label}_any_super_mas_hit"] - group[f"{left_label}_any_super_mas_hit"]).mean())
        bonus_pair_delta = float((group[f"{right_label}_any_bonus_pair_hit"] - group[f"{left_label}_any_bonus_pair_hit"]).mean())
        diversity_delta = float((group[f"{right_label}_unique_base_numbers"] - group[f"{left_label}_unique_base_numbers"]).mean())

        rows.append(
            {
                "month": month,
                "draw_count": int(len(group)),
                "winner": {
                    "average_base_hits": right_label if base_delta > 0 else left_label,
                    "max_base_hits": right_label if max_delta > 0 else left_label,
                    "mas_hit_rate": right_label if mas_delta > 0 else left_label,
                    "super_mas_hit_rate": right_label if super_delta > 0 else left_label,
                    "bonus_pair_hit_rate": right_label if bonus_pair_delta > 0 else left_label,
                    "portfolio_diversity": right_label if diversity_delta > 0 else left_label,
                },
                "v2_minus_v1": {
                    "average_base_hits": base_delta,
                    "max_base_hits": max_delta,
                    "mas_hit_rate": mas_delta,
                    "super_mas_hit_rate": super_delta,
                    "bonus_pair_hit_rate": bonus_pair_delta,
                    "portfolio_diversity": diversity_delta,
                },
            }
        )

    return rows


def tune_v2_profiles(
    draws: pd.DataFrame,
    training_window: int,
    ticket_count: int,
    candidate_count: int,
    top_pool: int,
    target: str,
) -> dict[str, object]:
    baseline = summarize_backtest(
        run_backtest(
            draws=draws,
            training_window=training_window,
            ticket_count=ticket_count,
            candidate_count=candidate_count,
            top_pool=top_pool,
            strategy="v1",
            target=target,
        )
    )
    candidates: list[dict[str, object]] = []
    for profile_name in V2_PROFILES:
        strategy = f"v2:{profile_name}"
        summary = summarize_backtest(
            run_backtest(
                draws=draws,
                training_window=training_window,
                ticket_count=ticket_count,
                candidate_count=candidate_count,
                top_pool=top_pool,
                strategy=strategy,
                target=target,
            )
        )
        candidates.append(
            {
                "profile": profile_name,
                "summary": summary,
                "delta_vs_v1": {
                    key: summary[key] - baseline[key] for key in summary.keys() if key != "draws_evaluated"
                },
            }
        )

    ranking_key = {
        "mas": lambda item: (
            item["summary"]["mas_hit_rate"],
            item["summary"]["bonus_pair_hit_rate"],
            item["summary"]["average_base_hits"],
            item["summary"]["max_base_hits_average"],
        ),
        "supermas": lambda item: (
            item["summary"]["super_mas_hit_rate"],
            item["summary"]["bonus_pair_hit_rate"],
            item["summary"]["average_base_hits"],
            item["summary"]["max_base_hits_average"],
        ),
        "jackpot": lambda item: (
            item["summary"]["bonus_pair_hit_rate"],
            item["summary"]["max_base_hits_average"],
            item["summary"]["average_base_hits"],
            item["summary"]["mas_hit_rate"] + item["summary"]["super_mas_hit_rate"],
        ),
    }.get(
        target,
        lambda item: (
            item["summary"]["average_base_hits"],
            item["summary"]["max_base_hits_average"],
            item["summary"]["mas_hit_rate"],
            item["summary"]["average_unique_base_numbers"],
        ),
    )

    ranked = sorted(
        candidates,
        key=ranking_key,
        reverse=True,
    )
    best = ranked[0] if ranked else None
    primary_metric = {
        "mas": "mas_hit_rate",
        "supermas": "super_mas_hit_rate",
        "jackpot": "bonus_pair_hit_rate",
    }.get(target, "average_base_hits")
    return {
        "baseline_v1": baseline,
        "best_profile": best,
        "profiles": ranked,
        "target": target,
        "primary_metric": primary_metric,
        "beats_v1_on_primary_metric": bool(best and best["summary"][primary_metric] > baseline[primary_metric]),
    }


def analyze_specific_date(
    draws: pd.DataFrame,
    analyze_date: str,
    ticket_count: int,
    candidate_count: int,
    top_pool: int,
    strategy: str,
    target: str = "balanced",
) -> dict[str, object]:
    target_date = pd.Timestamp(analyze_date)
    matching = draws.loc[draws["date"] == target_date]
    if matching.empty:
        raise ValueError(f"No draw found for {analyze_date}")

    target_index = int(matching.index[0])
    training = draws.iloc[:target_index].copy()
    actual = draws.iloc[target_index]
    portfolio, features = generate_portfolio(
        training=training,
        target_date=actual["date"],
        ticket_count=ticket_count,
        candidate_count=candidate_count,
        top_pool=top_pool,
        seed=target_index,
        strategy=strategy,
        target=target,
    )

    return {
        "actual": {
            "base": actual["base"],
            "mas": None if pd.isna(actual["mas"]) else int(actual["mas"]),
            "super_mas": None if pd.isna(actual["super_mas"]) else int(actual["super_mas"]),
        },
        "top_number_features": features.head(12).to_dict(orient="records"),
        "portfolio": [
            {
                "base": ticket.base,
                "mas": ticket.bonus_mas,
                "super_mas": ticket.bonus_supermas,
                "score": round(ticket.score, 4),
                "base_hits": len(set(ticket.base) & set(actual["base"])),
                "mas_hit": bool(ticket.bonus_mas == actual["mas"]) if not pd.isna(actual["mas"]) else False,
                "super_mas_hit": bool(ticket.bonus_supermas == actual["super_mas"])
                if not pd.isna(actual["super_mas"])
                else False,
            }
            for ticket in portfolio
        ],
    }


def to_builtin(value: object) -> object:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, list):
        return [to_builtin(item) for item in value]
    if isinstance(value, dict):
        return {key: to_builtin(item) for key, item in value.items()}
    return value


def main() -> None:
    args = parse_args()
    draws = load_draws(args.db, args.game)
    if draws.empty:
        raise SystemExit(f"No draws found for game {args.game}")
    if args.mode == "generate":
        if not args.predict_date:
            raise SystemExit("--predict-date is required in generate mode")
        constraints = json.loads(args.constraints_json) if args.constraints_json else {}
        generated = generate_live_tickets(
            draws=draws,
            predict_date=args.predict_date,
            constraints=constraints,
            candidate_count=args.candidate_count,
            top_pool=args.top_pool,
            portfolio_strategy=args.portfolio_strategy,
        )
        output = json.dumps(to_builtin(generated), indent=2)
        if args.json_out:
            output_path = Path(args.json_out)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding="utf-8")
        print(output)
        return
    if args.tune_v2:
        tuning_result = tune_v2_profiles(
            draws=draws,
            training_window=args.training_window,
            ticket_count=args.ticket_count,
            candidate_count=args.candidate_count,
            top_pool=args.top_pool,
            target=args.target,
        )
        print(json.dumps(to_builtin(tuning_result), indent=2))
        return
    strategies = ["v1", "v2", "v2w"]
    backtests: dict[str, pd.DataFrame] = {}
    latest_features_by_strategy: dict[str, pd.DataFrame] = {}
    latest_portfolio_by_strategy: dict[str, list[PortfolioTicket]] = {}

    for strategy in strategies:
        backtests[strategy] = run_backtest(
            draws=draws,
            training_window=args.training_window,
            ticket_count=args.ticket_count,
            candidate_count=args.candidate_count,
            top_pool=args.top_pool,
            strategy=strategy,
            target=args.target,
        )
        latest_portfolio, latest_features = generate_portfolio(
            training=draws.iloc[:-1].copy(),
            target_date=draws.iloc[-1]["date"],
            ticket_count=args.ticket_count,
            candidate_count=args.candidate_count,
            top_pool=args.top_pool,
            seed=len(draws),
            strategy=strategy,
            target=args.target,
        )
        latest_portfolio_by_strategy[strategy] = latest_portfolio
        latest_features_by_strategy[strategy] = latest_features

    backtest_summaries = {strategy: summarize_backtest(backtests[strategy]) for strategy in strategies}
    compare_frames = {
        "v2_vs_v1": build_compare_frame(backtests["v1"], backtests["v2"], "v1", "v2"),
        "v2w_vs_v1": build_compare_frame(backtests["v1"], backtests["v2w"], "v1", "v2w"),
        "v2w_vs_v2": build_compare_frame(backtests["v2"], backtests["v2w"], "v2", "v2w"),
    }
    comparison: dict[str, object] = {}
    for label, (left_strategy, right_strategy) in {
        "v2_vs_v1": ("v1", "v2"),
        "v2w_vs_v1": ("v1", "v2w"),
        "v2w_vs_v2": ("v2", "v2w"),
    }.items():
        left_summary = backtest_summaries[left_strategy]
        right_summary = backtest_summaries[right_strategy]
        compare_frame = compare_frames[label]
        comparison[label] = {
            "delta": {
                key: right_summary[key] - left_summary[key]
                for key in left_summary.keys()
                if key != "draws_evaluated"
            },
            "winner_by_metric": {
                key: (right_strategy if right_summary[key] > left_summary[key] else left_strategy)
                for key in left_summary.keys()
                if key != "draws_evaluated"
            },
            "recent_windows": summarize_windows(compare_frame, left_strategy, right_strategy),
            "monthly_breakdown": summarize_by_month(compare_frame, left_strategy, right_strategy),
        }

    summary = {
        "game": args.game,
        "target": args.target,
        "draw_count": int(len(draws)),
        "winner_context": {
            "draws_with_jackpot_winner": int(draws["has_jackpot_winner"].sum()),
            "shared_jackpot_draws": int(draws["shared_jackpot"].sum()),
            "average_winner_count_when_won": float(draws.loc[draws["winner_count"] > 0, "winner_count"].mean())
            if (draws["winner_count"] > 0).any()
            else 0.0,
        },
        "date_range": {
            "from": draws.iloc[0]["date"].strftime("%Y-%m-%d"),
            "to": draws.iloc[-1]["date"].strftime("%Y-%m-%d"),
        },
        "backtest": {
            strategy: backtest_summaries[strategy] for strategy in strategies
        },
        "comparison": comparison,
        "latest_feature_leaders": {
            strategy: latest_features_by_strategy[strategy].head(10).to_dict(orient="records") for strategy in strategies
        },
        "latest_portfolio": {
            strategy: [
                {
                    "base": ticket.base,
                    "mas": ticket.bonus_mas,
                    "super_mas": ticket.bonus_supermas,
                    "score": round(ticket.score, 4),
                }
                for ticket in latest_portfolio_by_strategy[strategy]
            ]
            for strategy in strategies
        },
    }

    if args.features_out:
        Path(args.features_out).parent.mkdir(parents=True, exist_ok=True)
        latest_features_by_strategy["v2w"].to_csv(args.features_out, index=False)

    if args.backtest_out:
        Path(args.backtest_out).parent.mkdir(parents=True, exist_ok=True)
        compare_frames["v2w_vs_v1"].to_csv(args.backtest_out, index=False)

    if args.analyze_date:
        summary["analyze_date"] = {
            strategy: analyze_specific_date(
                draws=draws,
                analyze_date=args.analyze_date,
                ticket_count=args.ticket_count,
                candidate_count=args.candidate_count,
                top_pool=args.top_pool,
                strategy=strategy,
                target=args.target,
            )
            for strategy in strategies
        }

    if args.json_out:
        output_path = Path(args.json_out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(to_builtin(summary), indent=2), encoding="utf-8")

    print(json.dumps(to_builtin(summary), indent=2))


if __name__ == "__main__":
    main()
