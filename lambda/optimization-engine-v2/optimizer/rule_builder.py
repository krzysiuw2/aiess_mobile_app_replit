from __future__ import annotations

from typing import Any


def build_rules_for_deployment(strategy: dict[str, Any], valid_until: int) -> dict[str, Any]:
    out: dict[str, Any] = {"sch": {}}
    for rule in strategy.get("rules", []):
        pr = int(rule.get("priority", 7))
        key = f"p_{pr}"
        out["sch"].setdefault(key, [])
        deployed = {
            "id": rule["id"],
            "s": rule.get("s", "ai"),
            "a": rule["a"],
            "c": rule.get("c", {}),
            "vu": valid_until,
        }
        if "d" in rule:
            deployed["d"] = rule["d"]
        out["sch"][key].append(deployed)
    return out


def build_forecast_energy_flow(
    strategy_name: str,
    trajectory: list[dict[str, Any]],
    net_grid: list[float],
    pv_forecast: list[float],
    load_forecast: list[float],
    prices: list[float],
    config: dict[str, Any],
) -> dict[str, Any]:
    _ = config
    hourly_flow: list[dict[str, Any]] = []
    n = len(trajectory)

    for h in range(n):
        t = trajectory[h]
        pv = float(pv_forecast[h]) if h < len(pv_forecast) else 0.0
        load = float(load_forecast[h]) if h < len(load_forecast) else 0.0
        batt = float(t["battery_power"])
        ng = float(net_grid[h]) if h < len(net_grid) else 0.0
        grid = float(t["grid_power"])

        pv_self = min(pv, load)
        pv_to_battery = 0.0
        if batt < 0 and ng < 0:
            pv_to_battery = min(abs(batt), abs(ng))
        pv_exported = max(0.0, pv - load - pv_to_battery)
        grid_import = max(0.0, grid)
        grid_export = max(0.0, -grid)
        batt_to_load = min(max(0.0, batt), max(0.0, load - pv))
        batt_to_grid = max(0.0, batt) - batt_to_load
        price = float(prices[h]) if h < len(prices) else 0.0
        energy_cost = grid_import * (price / 1000.0)
        energy_revenue = grid_export * (price / 1000.0)
        net_cost = energy_cost - energy_revenue

        hourly_flow.append(
            {
                "hour": h,
                "soc_pct": round(float(t["soc"]), 1),
                "battery_kw": round(batt, 1),
                "grid_kw": round(grid, 1),
                "pv_kw": round(pv, 1),
                "load_kw": round(load, 1),
                "pv_self_consumed_kw": round(pv_self, 1),
                "pv_to_battery_kw": round(pv_to_battery, 1),
                "pv_exported_kw": round(pv_exported, 1),
                "grid_import_kw": round(grid_import, 1),
                "grid_export_kw": round(grid_export, 1),
                "batt_to_load_kw": round(batt_to_load, 1),
                "batt_to_grid_kw": round(batt_to_grid, 1),
                "active_rule": t.get("active_rule"),
                "price_pln_mwh": price,
                "net_cost_pln": round(net_cost, 2),
            }
        )

    total_import = sum(float(f["grid_import_kw"]) for f in hourly_flow)
    total_export = sum(float(f["grid_export_kw"]) for f in hourly_flow)
    total_pv_self = sum(float(f["pv_self_consumed_kw"]) for f in hourly_flow)
    total_pv_batt = sum(float(f["pv_to_battery_kw"]) for f in hourly_flow)
    total_cost = sum(float(f["net_cost_pln"]) for f in hourly_flow)
    pv_sum = sum(float(pv_forecast[h]) for h in range(min(n, len(pv_forecast))))
    sc_pct = (
        (total_pv_self + total_pv_batt) / pv_sum * 100.0 if pv_sum > 0 else 0.0
    )

    return {
        "strategy": strategy_name,
        "horizon_hours": len(hourly_flow),
        "hourly": hourly_flow,
        "summary": {
            "total_grid_import_kwh": round(total_import, 1),
            "total_grid_export_kwh": round(total_export, 1),
            "total_pv_self_consumed_kwh": round(total_pv_self, 1),
            "total_pv_to_battery_kwh": round(total_pv_batt, 1),
            "self_consumption_pct": round(sc_pct, 1),
            "soc_start": round(float(hourly_flow[0]["soc_pct"]), 1) if hourly_flow else 0.0,
            "soc_end": round(float(hourly_flow[-1]["soc_pct"]), 1) if hourly_flow else 0.0,
            "soc_min": round(min(float(f["soc_pct"]) for f in hourly_flow), 1)
            if hourly_flow
            else 0.0,
            "soc_max": round(max(float(f["soc_pct"]) for f in hourly_flow), 1)
            if hourly_flow
            else 0.0,
            "peak_grid_import_kw": round(
                max((float(f["grid_import_kw"]) for f in hourly_flow), default=0.0), 1
            ),
            "peak_grid_export_kw": round(
                max((float(f["grid_export_kw"]) for f in hourly_flow), default=0.0), 1
            ),
            "total_net_cost_pln": round(total_cost, 2),
            "estimated_savings_pln": round(-total_cost, 2),
        },
    }
