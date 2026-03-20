from __future__ import annotations

from typing import Any

from .helpers import compute_usable_capacity


def resolve_tradeoff(
    price_result: dict[str, Any],
    pv_result: dict[str, Any],
    peak_result: dict[str, Any],
    config: dict[str, Any],
    day_of_week: int,
    is_holiday: bool = False,
    is_pre_holiday: bool = False,
) -> dict[str, Any]:
    """day_of_week: Monday=0 .. Sunday=6 (datetime.weekday() convention)."""
    is_pre_weekend = (day_of_week == 4) or is_pre_holiday
    is_weekend = (day_of_week in (5, 6)) or is_holiday

    cap = float(config["battery_capacity_kwh"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    backup = float(config.get("backup_reserve_pct", 0.0))
    usable = compute_usable_capacity(cap, soc_min, soc_max, backup)

    peak_reserve_kwh = float(peak_result["reserve_kwh"])
    peak_reserve_soc = int(peak_result["reserve_soc"])

    eff = float(config.get("round_trip_efficiency", 0.9))
    avg_tariff = float(config.get("avg_tariff_rate_pln_kwh", 0.55))

    if price_result.get("profitable"):
        night_cost = float(price_result["avg_charge_price"]) / 1000.0
        evening_val = float(price_result["avg_discharge_price"]) / 1000.0
        arbitrage_value = evening_val - (night_cost / eff)
    else:
        arbitrage_value = 0.0

    pv_value_per_kwh = avg_tariff
    potential_pv_kwh = float(pv_result["capturable_kwh"])

    charge_days: list[int] = []
    pre_weekend_discharge = False

    if is_pre_weekend and potential_pv_kwh > usable * 0.3:
        night_charge_kwh = 0.0
        room_for_pv = usable
        charge_reason = "pre_weekend_pv"
    elif is_weekend:
        night_charge_kwh = 0.0
        room_for_pv = usable
        charge_reason = "weekend_pv"
    elif not price_result.get("profitable") and potential_pv_kwh == 0:
        night_charge_kwh = peak_reserve_kwh
        room_for_pv = usable - night_charge_kwh
        charge_reason = "peak_shaving_readiness"
        charge_days = [0, 1, 2, 3]
        pre_weekend_discharge = not is_weekend
    elif not price_result.get("profitable") and potential_pv_kwh > 0:
        night_charge_kwh = max(0.0, peak_reserve_kwh - potential_pv_kwh)
        room_for_pv = usable - night_charge_kwh
        charge_reason = "peak_reserve_plus_pv"
        charge_days = [0, 1, 2, 3]
        pre_weekend_discharge = not is_weekend
    elif pv_value_per_kwh > arbitrage_value:
        room_for_pv = min(potential_pv_kwh, usable * 0.6)
        night_charge_kwh = max(usable - room_for_pv, peak_reserve_kwh)
        charge_reason = "pv_preferred"
    else:
        room_for_pv = min(potential_pv_kwh * 0.3, usable * 0.2)
        night_charge_kwh = max(usable - room_for_pv, peak_reserve_kwh)
        charge_reason = "arbitrage_preferred"

    room_for_pv_kwh = max(0.0, room_for_pv)
    night_charge_kwh = max(0.0, min(night_charge_kwh, usable))

    return {
        "night_charge_kwh": night_charge_kwh,
        "room_for_pv_kwh": room_for_pv_kwh,
        "peak_reserve_kwh": peak_reserve_kwh,
        "peak_reserve_soc": peak_reserve_soc,
        "arbitrage_value_per_kwh": arbitrage_value,
        "pv_value_per_kwh": pv_value_per_kwh,
        "charge_reason": charge_reason,
        "charge_days": charge_days,
        "pre_weekend_discharge": pre_weekend_discharge,
    }
