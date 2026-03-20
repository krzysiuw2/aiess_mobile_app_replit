from __future__ import annotations

from typing import Any

from .helpers import lerp
from .rule_builder import build_forecast_energy_flow
from .soc_simulator import simulate_soc_trajectory

STRATEGIES: list[dict[str, Any]] = [
    {"name": "aggressive", "aggression": 1.2, "risk": "moderate"},
    {"name": "balanced", "aggression": 1.0, "risk": "low"},
    {"name": "conservative", "aggression": 0.8, "risk": "very_low"},
]


def _effective_import_kw(config: dict[str, Any]) -> float | None:
    cands = [
        config.get("moc_zamowiona_kw"),
        config.get("grid_capacity_kva"),
        config.get("import_limit_kw"),
    ]
    xs = [float(x) for x in cands if x is not None]
    return min(xs) if xs else None


def _window_te(end_hour: int) -> int:
    eh = min(max(end_hour, 0), 23)
    return min(2359, (eh + 1) * 100)


def generate_strategies(
    tradeoff: dict[str, Any],
    price_result: dict[str, Any],
    pv_result: dict[str, Any],
    peak_result: dict[str, Any],
    net_grid: list[float],
    pv_forecast: list[float],
    load_forecast: list[float],
    prices: list[float],
    config: dict[str, Any],
    current_soc: float,
    valid_until: int,
) -> list[dict[str, Any]]:
    _ = pv_result, peak_result
    cap = float(config["battery_capacity_kwh"])
    mx_c = float(config["max_charge_kw"])
    mx_d = float(config["max_discharge_kw"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    moc = float(config["moc_zamowiona_kw"])
    eff_imp = _effective_import_kw(config) or 1e9

    strategies: list[dict[str, Any]] = []

    for strat in STRATEGIES:
        name = str(strat["name"])
        agg = float(strat["aggression"])
        risk = str(strat["risk"])
        tag = name[0]

        t_norm = min(1.0, max(0.0, (agg - 0.8) / 0.4))
        margin_frac = lerp(0.03, 0.10, t_norm)
        ps_threshold = round(moc * (1.0 - margin_frac), 1)

        p6_threshold = round(lerp(-2.0, -10.0, 1.0 - t_norm), 1)
        p6_sx = round(lerp(95.0, 80.0, 1.0 - t_norm))

        p8_rule: dict[str, Any] = {
            "id": f"opt-ps-{tag}",
            "s": "ai",
            "priority": 8,
            "vu": valid_until,
            "a": {
                "t": "dis",
                "pw": round(mx_d * agg, 1),
                "pid": True,
            },
            "c": {
                "gpo": "gt",
                "gpv": ps_threshold,
                "sm": 10,
                "sx": 95,
            },
        }

        p6_rule: dict[str, Any] = {
            "id": f"opt-pv-{tag}",
            "s": "ai",
            "priority": 6,
            "vu": valid_until,
            "a": {"t": "ch", "pw": mx_c, "pid": True},
            "c": {
                "gpo": "lt",
                "gpv": p6_threshold,
                "sm": 5,
                "sx": p6_sx,
            },
        }

        p7_rules: list[dict[str, Any]] = []

        if price_result.get("profitable"):
            cw = price_result["charge_windows"][0]
            dw = price_result["discharge_windows"][0]
            night_target = current_soc + (tradeoff["night_charge_kwh"] / cap * 100.0)
            night_target = min(night_target, soc_max)
            dis_soc = round(lerp(30.0, 50.0, 1.0 - t_norm))

            p7_rules.append(
                {
                    "id": f"opt-arb-c-{tag}",
                    "s": "ai",
                    "priority": 7,
                    "vu": valid_until,
                    "a": {
                        "t": "ct",
                        "soc": round(night_target),
                        "str": "eq",
                        "maxp": round(mx_c * agg, 1),
                        "maxg": round(eff_imp * 0.95, 1),
                    },
                    "c": {
                        "ts": int(cw["start_hour"]) * 100,
                        "te": _window_te(int(cw["end_hour"])),
                    },
                    "d": "wkd",
                }
            )
            p7_rules.append(
                {
                    "id": f"opt-arb-d-{tag}",
                    "s": "ai",
                    "priority": 7,
                    "vu": valid_until,
                    "a": {
                        "t": "dt",
                        "soc": dis_soc,
                        "str": "eq",
                        "maxp": round(mx_d * agg, 1),
                        "ming": round(lerp(5.0, 20.0, 1.0 - t_norm), 1),
                    },
                    "c": {
                        "ts": int(dw["start_hour"]) * 100,
                        "te": _window_te(int(dw["end_hour"])),
                    },
                    "d": "wkd",
                }
            )
        elif tradeoff["charge_reason"] in (
            "peak_shaving_readiness",
            "peak_reserve_plus_pv",
        ):
            reserve_soc = min(
                float(tradeoff["peak_reserve_soc"]) * agg,
                soc_max,
            )
            p7_rules.append(
                {
                    "id": f"opt-reserve-c-{tag}",
                    "s": "ai",
                    "priority": 7,
                    "vu": valid_until,
                    "a": {
                        "t": "ct",
                        "soc": round(reserve_soc),
                        "str": "con",
                        "maxp": round(mx_c * 0.6, 1),
                        "maxg": round(eff_imp * 0.80, 1),
                    },
                    "c": {"ts": 2300, "te": 600},
                    "d": tradeoff.get("charge_days") or [0, 1, 2, 3],
                }
            )
            if tradeoff.get("pre_weekend_discharge"):
                p7_rules.append(
                    {
                        "id": f"opt-fri-empty-{tag}",
                        "s": "ai",
                        "priority": 7,
                        "vu": valid_until,
                        "a": {
                            "t": "dt",
                            "soc": round(soc_min + 5.0),
                            "str": "eq",
                            "maxp": round(mx_d * agg, 1),
                            "ming": round(lerp(5.0, 15.0, 1.0 - t_norm), 1),
                        },
                        "c": {"ts": 1400, "te": 2100},
                        "d": [4],
                    }
                )
        elif float(tradeoff["night_charge_kwh"]) > 0:
            night_target = current_soc + (
                float(tradeoff["night_charge_kwh"]) / cap * 100.0
            )
            night_target = min(night_target, soc_max)
            p7_rules.append(
                {
                    "id": f"opt-night-c-{tag}",
                    "s": "ai",
                    "priority": 7,
                    "vu": valid_until,
                    "a": {
                        "t": "ct",
                        "soc": round(night_target),
                        "str": "con",
                        "maxp": round(mx_c * agg, 1),
                        "maxg": round(eff_imp * 0.90, 1),
                    },
                    "c": {"ts": 2300, "te": 600},
                    "d": "wkd",
                }
            )

        # P8 first (highest priority wins in simulation)
        rules = [p8_rule, *p7_rules, p6_rule]
        sim = simulate_soc_trajectory(rules, net_grid, current_soc, config)
        forecast = build_forecast_energy_flow(
            name,
            sim["trajectory"],
            net_grid,
            pv_forecast,
            load_forecast,
            prices,
            config,
        )
        strategies.append(
            {
                "name": name,
                "rules": rules,
                "forecast": forecast,
                "simulation_valid": sim["valid"],
                "risk": risk,
            }
        )

    return strategies
