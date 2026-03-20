from __future__ import annotations

from math import ceil
from typing import Any

from .helpers import compute_usable_capacity, group_consecutive


def optimize_price_windows(
    prices: list[float],
    net_grid: list[float],
    config: dict[str, Any],
) -> dict[str, Any]:
    _ = net_grid
    if not prices:
        return {"profitable": False}

    cap = float(config["battery_capacity_kwh"])
    mx_c = float(config["max_charge_kw"])
    mx_d = float(config["max_discharge_kw"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    backup = float(config.get("backup_reserve_pct", 0.0))
    eff = float(config["round_trip_efficiency"])

    usable = compute_usable_capacity(cap, soc_min, soc_max, backup)
    if usable <= 0 or mx_c <= 0 or mx_d <= 0:
        return {"profitable": False}

    n = len(prices)
    ch_need = min(n, int(ceil(usable / mx_c)))
    dis_need = min(n, int(ceil(usable / mx_d)))
    if ch_need < 1 or dis_need < 1:
        return {"profitable": False}

    order = sorted(range(n), key=lambda h: prices[h])
    cheap_set: set[int] = set()
    i = 0
    while len(cheap_set) < ch_need and i < n:
        cheap_set.add(order[i])
        i += 1
    expensive_set: set[int] = set()
    j = n - 1
    while len(expensive_set) < dis_need and j >= 0:
        h = order[j]
        j -= 1
        if h not in cheap_set:
            expensive_set.add(h)
    if len(cheap_set) < ch_need or len(expensive_set) < dis_need:
        return {"profitable": False}
    cheap = sorted(cheap_set)
    expensive = sorted(expensive_set)

    avg_charge = sum(prices[h] for h in cheap) / max(1, len(cheap))
    avg_discharge = sum(prices[h] for h in expensive) / max(1, len(expensive))
    spread = avg_discharge - (avg_charge / eff)

    if spread <= 0:
        return {"profitable": False}

    def annotate_windows(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for w in windows:
            hrs = list(range(int(w["start_hour"]), int(w["end_hour"]) + 1))
            ap = sum(prices[h] for h in hrs if 0 <= h < len(prices)) / max(1, len(hrs))
            out.append({**w, "avg_price": ap})
        return out

    charge_windows = annotate_windows(group_consecutive(sorted(cheap)))
    discharge_windows = annotate_windows(group_consecutive(sorted(expensive)))
    est_profit = usable * spread / 1000.0

    return {
        "profitable": True,
        "charge_windows": charge_windows,
        "discharge_windows": discharge_windows,
        "spread_pln_mwh": spread,
        "estimated_profit_pln": est_profit,
        "avg_charge_price": avg_charge,
        "avg_discharge_price": avg_discharge,
    }
