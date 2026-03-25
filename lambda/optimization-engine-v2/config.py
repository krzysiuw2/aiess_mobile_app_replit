from __future__ import annotations

from typing import Any

from data.dynamo_client import get_site_config_item

ROUND_TRIP_EFFICIENCY = 0.90


def load_site_config(site_id: str) -> dict[str, Any]:
    raw = get_site_config_item(site_id)
    if not raw:
        raise ValueError(f"site_config not found: {site_id!r}")

    battery = raw.get("battery") or {}
    power_limits = raw.get("power_limits") or {}
    grid = raw.get("grid_connection") or {}
    financial = raw.get("financial") or {}
    ai_profile = dict(raw.get("ai_profile") or {})
    safety = raw.get("safety") or {}
    pv_system = raw.get("pv_system") or {}
    automation = raw.get("automation") or {}

    moc_after = financial.get("moc_zamowiona_after_bess_kw")
    moc_before = financial.get("moc_zamowiona_before_bess_kw")
    moc_kw = moc_after if moc_after is not None else moc_before

    peak_confidence = ai_profile.get("peak_confidence")
    if peak_confidence is None:
        peak_confidence = raw.get("peak_confidence")
    if peak_confidence is None:
        peak_confidence = 0.99

    energy_price_model = financial.get("energy_price_model", "tge_rdn")
    fixed_price = financial.get("fixed_price_pln_kwh")
    export_price_model = financial.get("export_price_model", "tge_rdn")

    if energy_price_model == "fixed" and fixed_price is not None:
        avg_tariff = float(fixed_price)
    else:
        avg_tariff = 0.55

    return {
        "site_id": site_id,
        "battery_capacity_kwh": battery.get("capacity_kwh"),
        "max_charge_kw": power_limits.get("max_charge_kw"),
        "max_discharge_kw": power_limits.get("max_discharge_kw"),
        "safety_soc_min": safety.get("soc_min", 5),
        "safety_soc_max": safety.get("soc_max", 100),
        "backup_reserve_pct": ai_profile.get("backup_reserve_percent", 0),
        "moc_zamowiona_kw": moc_kw,
        "grid_capacity_kva": grid.get("capacity_kva"),
        "export_limit_kw": grid.get("export_limit_kw"),
        "import_limit_kw": grid.get("import_limit_kw"),
        "pv_installed_kwp": pv_system.get("total_peak_kw"),
        "export_allowed": grid.get("export_allowed", True),
        "peak_confidence": float(peak_confidence),
        "ai_profile": ai_profile,
        "automation": automation,
        "round_trip_efficiency": ROUND_TRIP_EFFICIENCY,
        "distribution_operator": financial.get("distribution_operator"),
        "distribution_tariff_group": financial.get("distribution_tariff_group"),
        "energy_price_model": energy_price_model,
        "fixed_price_pln_kwh": float(fixed_price) if fixed_price is not None else None,
        "export_price_model": export_price_model,
        "avg_tariff_rate_pln_kwh": avg_tariff,
        "financial": financial,
        "grid_connection": grid,
        "power_limits": power_limits,
        "battery": battery,
    }
