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
        "financial": financial,
        "grid_connection": grid,
        "power_limits": power_limits,
        "battery": battery,
    }
