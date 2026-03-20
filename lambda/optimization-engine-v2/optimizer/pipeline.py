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

    config = site_config or load_site_config(site_id)
    config.setdefault("round_trip_efficiency", 0.90)

    limits = compute_effective_limits(config)
    config["effective_import_limit_kw"] = limits["effective_import_limit_kw"]
    config["effective_export_limit_kw"] = limits["effective_export_limit_kw"]

    prices_raw = fetch_tge_prices(site_id)
    prices = [p.get("price_pln_mwh", 0.0) for p in prices_raw]
    if len(prices) < 24:
        prices.extend([0.0] * (24 - len(prices)))
    prices = prices[:24]

    forecasts = fetch_forecasts(site_id)
    pv_forecast = forecasts.get("pv_forecast", [0.0] * 24)[:24]
    load_forecast = forecasts.get("load_forecast", [0.0] * 24)[:24]
    if len(pv_forecast) < 24:
        pv_forecast.extend([0.0] * (24 - len(pv_forecast)))
    if len(load_forecast) < 24:
        load_forecast.extend([0.0] * (24 - len(load_forecast)))

    current_soc = fetch_current_soc(site_id)

    # Step 1
    net_grid = compute_net_grid(load_forecast, pv_forecast)

    # Step 2
    price_result = optimize_price_windows(prices, net_grid, config)

    # Step 3
    pv_result = calculate_pv_surplus(net_grid, config, current_soc)

    # Step 4
    historical_peaks = fetch_historical_peaks(site_id, days=90)
    peak_result = calculate_peak_shaving(load_forecast, historical_peaks, config)

    # Step 5
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
    }
