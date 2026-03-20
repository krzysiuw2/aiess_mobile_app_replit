from __future__ import annotations

from typing import Any


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def group_consecutive(hours_data: list[int] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not hours_data:
        return []
    if isinstance(hours_data[0], int):
        indices = sorted(hours_data)
        out: list[dict[str, Any]] = []
        start = indices[0]
        prev = indices[0]
        for x in indices[1:]:
            if x == prev + 1:
                prev = x
            else:
                out.append({"start_hour": start, "end_hour": prev})
                start = prev = x
        out.append({"start_hour": start, "end_hour": prev})
        return out

    rows = sorted(hours_data, key=lambda r: int(r["hour"]))
    out2: list[dict[str, Any]] = []
    block_start = 0
    for i in range(1, len(rows)):
        if int(rows[i]["hour"]) != int(rows[i - 1]["hour"]) + 1:
            out2.append(_merge_hour_block(rows[block_start:i]))
            block_start = i
    out2.append(_merge_hour_block(rows[block_start:]))
    return out2


def _merge_hour_block(block: list[dict[str, Any]]) -> dict[str, Any]:
    hours = [int(r["hour"]) for r in block]
    merged: dict[str, Any] = {"start_hour": min(hours), "end_hour": max(hours)}
    if any("surplus_kw" in r for r in block):
        surpluses = [float(r["surplus_kw"]) for r in block if "surplus_kw" in r]
        if surpluses:
            merged["avg_surplus_kw"] = sum(surpluses) / len(surpluses)
            merged["peak_surplus_kw"] = max(surpluses)
    if any("overshoot_kw" in r for r in block):
        ovs = [float(r["overshoot_kw"]) for r in block if "overshoot_kw" in r]
        if ovs:
            merged["max_overshoot_kw"] = max(ovs)
    return merged


def compute_net_grid(load_forecast: list[float], pv_forecast: list[float]) -> list[float]:
    n = min(len(load_forecast), len(pv_forecast))
    return [float(load_forecast[h]) - float(pv_forecast[h]) for h in range(n)]


def compute_usable_capacity(
    battery_kwh: float,
    soc_min: float,
    soc_max: float,
    backup_reserve_pct: float,
) -> float:
    span = soc_max - soc_min - backup_reserve_pct
    if span <= 0:
        return 0.0
    return max(0.0, span / 100.0 * battery_kwh)
