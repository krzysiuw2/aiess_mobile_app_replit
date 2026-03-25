from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from typing import Any

from .helpers import compute_net_grid, compute_usable_capacity
from .price_windows import optimize_price_windows
from .pv_surplus import calculate_pv_surplus
from .peak_shaving import calculate_peak_shaving
from .tradeoff import resolve_tradeoff
from .strategy_generator import generate_strategies
from .rule_builder import build_rules_for_deployment
from . import decision_log as dlog


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def run_pipeline(
    site_id: str,
    *,
    site_config: dict[str, Any] | None = None,
    mode: str = "daily",
) -> dict[str, Any]:
    from config import load_site_config
    from data.influx_client import (
        fetch_tge_prices,
        fetch_forecasts,
        fetch_current_soc,
        fetch_historical_peaks,
    )
    from holidays import is_holiday, is_pre_holiday
    from limits import compute_effective_limits

    dlog.reset()

    config = load_site_config(site_id)
    config.setdefault("round_trip_efficiency", 0.90)

    limits = compute_effective_limits(config)
    config["effective_import_limit_kw"] = limits["effective_import_limit_kw"]
    config["effective_export_limit_kw"] = limits["effective_export_limit_kw"]

    cap = float(config["battery_capacity_kwh"])
    usable = compute_usable_capacity(
        cap, float(config["safety_soc_min"]),
        float(config["safety_soc_max"]),
        float(config.get("backup_reserve_pct", 0)),
    )
    eff = float(config["round_trip_efficiency"])

    dlog.step("site_config", {
        "battery_kwh": cap,
        "usable_kwh": usable,
        "max_charge_kw": config["max_charge_kw"],
        "max_discharge_kw": config["max_discharge_kw"],
        "moc_zamowiona_kw": config["moc_zamowiona_kw"],
        "grid_capacity_kva": config.get("grid_capacity_kva"),
        "eff_import_kw": limits["effective_import_limit_kw"],
        "eff_export_kw": limits["effective_export_limit_kw"],
        "round_trip_eff": eff,
    })

    # ── Prices ──
    energy_price_model = config.get("energy_price_model", "tge_rdn")
    fixed_price_kwh = config.get("fixed_price_pln_kwh")

    if energy_price_model == "fixed" and fixed_price_kwh is not None:
        flat_mwh = float(fixed_price_kwh) * 1000.0
        prices = [flat_mwh] * 24
        dlog.step("pricing", {
            "model": "fixed",
            "import_price_pln_kwh": fixed_price_kwh,
            "flat_pln_mwh": flat_mwh,
            "arbitrage_possible": False,
            "note": "Flat price → no arbitrage spread → battery cannot profit from price differences",
        })
    else:
        prices_raw = fetch_tge_prices(site_id)
        prices = [0.0] * 24
        for p in prices_raw:
            h = int(p.get("hour", 0))
            if 0 <= h < 24:
                prices[h] = float(p.get("price_pln_mwh", 0.0))
        non_zero = sum(1 for v in prices if v != 0)
        dlog.step("pricing", {
            "model": "tge_rdn",
            "hours_with_data": non_zero,
            "min_pln_mwh": min(prices),
            "max_pln_mwh": max(prices),
            "spread_pln_mwh": max(prices) - min(prices),
        })

    # ── Forecasts ──
    forecasts = fetch_forecasts(site_id)
    pv_forecast: list[float] = forecasts.get("pv_forecast", [0.0] * 24)
    load_forecast: list[float] = forecasts.get("load_forecast", [0.0] * 24)
    if len(pv_forecast) < 24:
        pv_forecast.extend([0.0] * (24 - len(pv_forecast)))
    if len(load_forecast) < 24:
        load_forecast.extend([0.0] * (24 - len(load_forecast)))
    pv_forecast = pv_forecast[:24]
    load_forecast = load_forecast[:24]

    current_soc = fetch_current_soc(site_id)

    pv_total = sum(pv_forecast)
    load_total = sum(load_forecast)
    pv_peak = max(pv_forecast)
    load_peak = max(load_forecast)
    moc = float(config["moc_zamowiona_kw"])

    dlog.step("forecasts", {
        "current_soc_pct": round(current_soc, 1),
        "pv_total_kwh": round(pv_total, 1),
        "pv_peak_kw": round(pv_peak, 1),
        "load_total_kwh": round(load_total, 1),
        "load_peak_kw": round(load_peak, 1),
        "load_peak_vs_moc": f"{load_peak:.1f}/{moc:.0f} kW ({load_peak/moc*100:.0f}%)" if moc > 0 else "N/A",
        "pv_hours": sum(1 for v in pv_forecast if v > 0),
        "load_hours": sum(1 for v in load_forecast if v > 0),
    })

    if load_peak < moc * 0.85:
        dlog.warn(
            f"Load peak ({load_peak:.1f} kW) is well below moc ({moc:.0f} kW) → peak shaving unlikely to trigger today",
            {"headroom_pct": round((1 - load_peak / moc) * 100, 1)},
        )

    # Step 1: Net grid
    net_grid = compute_net_grid(load_forecast, pv_forecast)
    surplus_hours = [h for h in range(24) if net_grid[h] < 0]
    import_hours = [h for h in range(24) if net_grid[h] > 0]

    dlog.step("net_grid", {
        "surplus_hours": len(surplus_hours),
        "import_hours": len(import_hours),
        "peak_import_kw": round(max(net_grid), 1),
        "peak_surplus_kw": round(abs(min(net_grid)), 1) if min(net_grid) < 0 else 0,
        "surplus_total_kwh": round(sum(abs(net_grid[h]) for h in surplus_hours), 1),
    })

    # Step 2: Price windows
    price_result = optimize_price_windows(prices, net_grid, config)
    if price_result.get("profitable"):
        dlog.step("price_windows", {
            "profitable": True,
            "spread_pln_mwh": round(price_result["spread_pln_mwh"], 1),
            "est_profit_pln": round(price_result["estimated_profit_pln"], 2),
            "charge_windows": price_result["charge_windows"],
            "discharge_windows": price_result["discharge_windows"],
        })
    else:
        spread_raw = max(prices) - min(prices) if prices else 0
        eff_needed = min(prices) / max(prices) if max(prices) > 0 and min(prices) > 0 else 0
        dlog.step("price_windows", {
            "profitable": False,
            "reason": "flat price" if spread_raw == 0 else f"spread {spread_raw:.0f} PLN/MWh too small after {eff*100:.0f}% efficiency loss",
            "min_spread_needed_pln_mwh": round(min(prices) * (1/eff - 1), 1) if min(prices) > 0 else 0,
        })

    # Step 3: PV surplus
    pv_result = calculate_pv_surplus(net_grid, config, current_soc)
    dlog.step("pv_surplus", {
        "total_surplus_kwh": round(pv_result["total_surplus_kwh"], 1),
        "capturable_kwh": round(pv_result["capturable_kwh"], 1),
        "peak_surplus_kw": round(pv_result["peak_surplus_kw"], 1),
        "surplus_windows": pv_result["surplus_windows"],
    })

    # Step 4: Peak shaving — use net_grid (load - PV) not raw load,
    # because the utility meter measures grid import which already includes PV offset.
    # Historical peaks from grid_power_mean also reflect PV offset, so both inputs match.
    historical_peaks = fetch_historical_peaks(site_id, days=90)
    peak_result = calculate_peak_shaving(net_grid, historical_peaks, config)

    peak_net_grid = max(net_grid)
    peak_raw_load = max(load_forecast)

    dlog.step("peak_shaving", {
        "historical_peak_count": len(historical_peaks),
        "historical_max_kw": round(max(historical_peaks), 1) if historical_peaks else None,
        "historical_p99_kw": round(sorted(historical_peaks)[min(int(len(historical_peaks)*0.99), len(historical_peaks)-1)], 1) if historical_peaks else None,
        "using_fallback": len(historical_peaks) < 7,
        "P_conf_peak_kw": peak_result.get("P_conf_peak_kw"),
        "safe_limit_kw": round(peak_result["safe_limit_kw"], 1),
        "forecast_peak_net_grid_kw": round(peak_net_grid, 1),
        "forecast_peak_raw_load_kw": round(peak_raw_load, 1),
        "pv_offsets_peak_by_kw": round(peak_raw_load - peak_net_grid, 1),
        "peak_shaving_needed_today": peak_result["peak_shaving_needed"],
        "reserve_kwh": round(peak_result["reserve_kwh"], 1),
        "reserve_soc_pct": peak_result["reserve_soc"],
        "reserve_as_pct_of_usable": round(peak_result["reserve_kwh"] / usable * 100, 1) if usable > 0 else 0,
    })

    if len(historical_peaks) < 7:
        dlog.warn(
            f"Only {len(historical_peaks)} historical peak data points (need 7+) → using conservative fallback reserve",
            {"fallback_reserve_kwh": round(peak_result["reserve_kwh"], 1)},
        )

    if not peak_result["peak_shaving_needed"] and peak_result["reserve_kwh"] > usable * 0.3:
        dlog.warn(
            f"Peak shaving NOT needed today but reserve is {peak_result['reserve_kwh']:.0f} kWh "
            f"({peak_result['reserve_kwh']/usable*100:.0f}% of usable) — may be over-reserving",
        )

    # Step 5: Tradeoff
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    day_of_week = today.weekday()
    holiday = is_holiday(today)
    pre_holiday = is_pre_holiday(today)
    tradeoff = resolve_tradeoff(
        price_result, pv_result, peak_result, config,
        day_of_week, holiday, pre_holiday,
    )
    config["optimization_weekday"] = day_of_week

    night_charge_cost = tradeoff["night_charge_kwh"] * (prices[0] / 1000) if prices else 0
    efficiency_loss = tradeoff["night_charge_kwh"] * (1 - eff) * (prices[0] / 1000) if prices else 0

    dlog.step("tradeoff", {
        "day": DAY_NAMES[day_of_week],
        "is_holiday": holiday,
        "is_pre_holiday": pre_holiday,
        "charge_reason": tradeoff["charge_reason"],
        "night_charge_kwh": round(tradeoff["night_charge_kwh"], 1),
        "night_charge_cost_pln": round(night_charge_cost, 2),
        "efficiency_loss_pln": round(efficiency_loss, 2),
        "room_for_pv_kwh": round(tradeoff["room_for_pv_kwh"], 1),
        "peak_reserve_kwh": round(tradeoff["peak_reserve_kwh"], 1),
        "peak_reserve_soc_pct": tradeoff["peak_reserve_soc"],
        "arbitrage_value_per_kwh": round(tradeoff["arbitrage_value_per_kwh"], 4),
        "pv_value_per_kwh": round(tradeoff["pv_value_per_kwh"], 4),
        "charge_days": tradeoff["charge_days"],
        "pre_weekend_discharge": tradeoff["pre_weekend_discharge"],
    })

    if energy_price_model == "fixed" and tradeoff["night_charge_kwh"] > 0:
        dlog.warn(
            f"Night charging {tradeoff['night_charge_kwh']:.0f} kWh on FLAT tariff costs "
            f"{night_charge_cost:.1f} PLN with {efficiency_loss:.1f} PLN lost to efficiency. "
            f"This only pays off if peak shaving saves > {efficiency_loss:.1f} PLN in demand charges.",
        )

    # valid_until: end of today (23:59 local CE(S)T)
    try:
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo("Europe/Warsaw")
    except ImportError:
        local_tz = timezone(timedelta(hours=1))
    eod_local = datetime.combine(today, datetime.max.time().replace(microsecond=0), tzinfo=local_tz)
    valid_until = int(eod_local.timestamp())

    # Steps 6-9
    strategies = generate_strategies(
        tradeoff, price_result, pv_result, peak_result,
        net_grid, pv_forecast, load_forecast, prices,
        config, current_soc, valid_until,
    )

    for s in strategies:
        tag = s["name"][0].upper()
        summary = s.get("forecast", {}).get("summary", {})
        dlog.step(f"strategy_{tag}", {
            "name": s["name"],
            "rule_count": len(s.get("rules", [])),
            "simulation_valid": s.get("simulation_valid"),
            "risk": s.get("risk"),
            "net_cost_pln": summary.get("total_net_cost_pln"),
            "baseline_cost_pln": summary.get("baseline_cost_pln"),
            "savings_pln": summary.get("estimated_savings_pln"),
            "self_consumption_pct": summary.get("self_consumption_pct"),
            "peak_grid_import_kw": summary.get("peak_grid_import_kw"),
            "soc_range": f"{summary.get('soc_min', '?')}-{summary.get('soc_max', '?')}%",
        })

    price_range = {
        "min": round(min(prices), 1) if prices else 0,
        "max": round(max(prices), 1) if prices else 0,
        "avg": round(sum(prices) / len(prices), 1) if prices else 0,
    }

    return {
        "site_id": site_id,
        "timestamp": now_utc.isoformat(),
        "mode": mode,
        "current_soc": current_soc,
        "strategies": strategies,
        "tradeoff_analysis": {
            "winner": "pv" if tradeoff["charge_reason"] in ("pv_preferred", "weekend_pv", "pre_weekend_pv") else "arbitrage" if tradeoff["charge_reason"] == "arbitrage_preferred" else "peak_reserve",
            "arbitrage_value_per_kwh": tradeoff["arbitrage_value_per_kwh"],
            "pv_value_per_kwh": tradeoff["pv_value_per_kwh"],
            "night_charge_kwh": tradeoff["night_charge_kwh"],
            "room_for_pv_kwh": tradeoff["room_for_pv_kwh"],
        },
        "data_summary": {
            "tge_price_range": price_range,
            "pv_total_kwh": round(sum(pv_forecast), 1),
            "load_total_kwh": round(sum(load_forecast), 1),
            "surplus_total_kwh": round(pv_result.get("total_surplus_kwh", 0), 1),
        },
        "decision_log": dlog.get(),
    }
