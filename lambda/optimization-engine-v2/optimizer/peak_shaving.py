from __future__ import annotations

from typing import Any

import numpy as np

from .helpers import compute_usable_capacity, group_consecutive


def calculate_peak_shaving(
    load_forecast: list[float],
    historical_peaks: list[float],
    config: dict[str, Any],
) -> dict[str, Any]:
    moc = float(config["moc_zamowiona_kw"])
    margin = float(config.get("safety_margin_pct", 3.0))
    safe_limit = moc * (1.0 - margin / 100.0)

    mx_d = float(config["max_discharge_kw"])
    cap = float(config["battery_capacity_kwh"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    backup = float(config.get("backup_reserve_pct", 0.0))
    conf = float(config.get("peak_confidence", 0.99))

    usable = compute_usable_capacity(cap, soc_min, soc_max, backup)

    peak_rows: list[dict[str, Any]] = []
    for h in range(len(load_forecast)):
        lf = float(load_forecast[h])
        if lf > safe_limit:
            overshoot = lf - safe_limit
            discharge_needed = min(overshoot, mx_d)
            peak_rows.append(
                {
                    "hour": h,
                    "overshoot_kw": overshoot,
                    "discharge_needed_kw": discharge_needed,
                }
            )

    peak_windows = group_consecutive(peak_rows)
    max_overshoot = max((float(r["overshoot_kw"]) for r in peak_rows), default=0.0)

    reserve = _confidence_reserve(
        historical_peaks,
        safe_limit,
        conf,
        usable,
        cap,
        soc_min,
        soc_max,
        config,
    )

    return {
        "peak_shaving_needed": len(peak_rows) > 0,
        "peak_windows": peak_windows,
        "safe_limit_kw": safe_limit,
        "max_overshoot_kw": max_overshoot,
        "reserve_kwh": reserve["energy_needed_kwh"],
        "reserve_soc": reserve["min_reserve_soc"],
        "P_conf_peak_kw": reserve["P_conf_peak_kw"],
        "confidence_level": conf,
    }


def _confidence_reserve(
    historical_peaks: list[float],
    safe_limit: float,
    confidence: float,
    usable_capacity: float,
    battery_capacity: float,
    soc_min: float,
    soc_max: float,
    config: dict[str, Any],
) -> dict[str, Any]:
    peaks_arr = np.array([float(x) for x in historical_peaks], dtype=float)
    if peaks_arr.size < 7:
        return _fallback_reserve(safe_limit, usable_capacity, battery_capacity, soc_min, soc_max, config)

    pct = float(np.percentile(peaks_arr, confidence * 100.0))
    peak_overshoot = max(0.0, float(pct) - safe_limit)

    if peak_overshoot <= 0:
        energy_needed = usable_capacity * 0.15
        min_reserve_soc = (energy_needed / battery_capacity * 100.0) + soc_min
        return {
            "P_conf_peak_kw": float(pct),
            "peak_overshoot_kw": 0.0,
            "energy_needed_kwh": float(energy_needed),
            "min_reserve_soc": int(round(min(min_reserve_soc, soc_max))),
        }

    duration = _estimate_peak_duration(peaks_arr, safe_limit)
    duration = max(duration, 0.5)
    energy_needed = peak_overshoot * duration * 1.10
    energy_needed = min(energy_needed, usable_capacity)
    min_reserve_soc = (energy_needed / battery_capacity * 100.0) + soc_min
    min_reserve_soc = min(min_reserve_soc, soc_max)

    return {
        "P_conf_peak_kw": float(pct),
        "peak_overshoot_kw": peak_overshoot,
        "energy_needed_kwh": float(energy_needed),
        "min_reserve_soc": int(round(min_reserve_soc)),
    }


def _estimate_peak_duration(peaks_arr: np.ndarray, safe_limit: float) -> float:
    above = peaks_arr[peaks_arr > safe_limit]
    if above.size == 0:
        return 1.5
    ratio = float(above.size) / float(peaks_arr.size)
    return max(0.5, min(3.0, 1.0 + 2.0 * ratio))


def _fallback_reserve(
    safe_limit: float,
    usable_capacity: float,
    battery_capacity: float,
    soc_min: float,
    soc_max: float,
    config: dict[str, Any],
) -> dict[str, Any]:
    moc = float(config["moc_zamowiona_kw"])
    headroom = (moc - safe_limit) / moc if moc > 0 else 0.0
    t = max(0.0, min(1.0, headroom / 0.10))
    reserve_pct = 0.70 - 0.30 * t
    energy_needed = usable_capacity * reserve_pct
    min_reserve_soc = (energy_needed / battery_capacity * 100.0) + soc_min
    return {
        "P_conf_peak_kw": None,
        "peak_overshoot_kw": None,
        "energy_needed_kwh": float(energy_needed),
        "min_reserve_soc": int(round(min(min_reserve_soc, soc_max))),
    }
