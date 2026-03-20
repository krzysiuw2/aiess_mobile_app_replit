from __future__ import annotations

from typing import Any

from .helpers import group_consecutive


def calculate_pv_surplus(
    net_grid: list[float],
    config: dict[str, Any],
    current_soc: float,
) -> dict[str, Any]:
    cap = float(config["battery_capacity_kwh"])
    mx_c = float(config["max_charge_kw"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    eff = float(config["round_trip_efficiency"])

    n = len(net_grid)
    surplus_shape: list[dict[str, Any]] = []
    surplus_hours: list[dict[str, Any]] = []
    total_surplus_kwh = 0.0
    simulated_soc = float(current_soc)
    capturable_kwh = 0.0

    for h in range(n):
        ng = float(net_grid[h])
        if ng >= 0:
            surplus_shape.append({"hour": h, "surplus_kw": 0.0})
            continue
        surplus_kw = abs(ng)
        surplus_shape.append({"hour": h, "surplus_kw": surplus_kw})
        surplus_hours.append({"hour": h, "surplus_kw": surplus_kw})
        total_surplus_kwh += surplus_kw

        charge_kw = min(surplus_kw, mx_c)
        charge_kwh = charge_kw * eff
        room_kwh = max(0.0, (soc_max / 100.0 * cap) - (simulated_soc / 100.0 * cap))
        actual_kwh = min(charge_kwh, room_kwh)
        capturable_kwh += actual_kwh
        simulated_soc += (actual_kwh / cap) * 100.0
        simulated_soc = min(simulated_soc, soc_max)
        simulated_soc = max(simulated_soc, soc_min)

    peak = max((float(s["surplus_kw"]) for s in surplus_hours), default=0.0)
    avg_surplus = (
        total_surplus_kwh / len(surplus_hours) if surplus_hours else 0.0
    )

    return {
        "surplus_windows": group_consecutive(surplus_hours),
        "surplus_shape": surplus_shape,
        "total_surplus_kwh": total_surplus_kwh,
        "capturable_kwh": capturable_kwh,
        "peak_surplus_kw": peak,
        "avg_surplus_kw": avg_surplus,
    }
