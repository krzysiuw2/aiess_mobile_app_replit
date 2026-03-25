from __future__ import annotations

from typing import Any

from .helpers import lerp
from .rule_builder import build_forecast_energy_flow
from .soc_simulator import simulate_soc_trajectory
from . import decision_log as dlog

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
    charge_reason = tradeoff["charge_reason"]

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
        dlog.rule_reason(
            f"opt-ps-{tag}",
            f"Peak shaving: discharge up to {round(mx_d * agg, 1)} kW when grid > {ps_threshold} kW "
            f"(moc={moc} kW minus {margin_frac*100:.0f}% margin)",
            {"threshold_kw": ps_threshold, "power_kw": round(mx_d * agg, 1), "soc_range": "10-95%"},
        )

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
        dlog.rule_reason(
            f"opt-pv-{tag}",
            f"PV surplus capture: charge at {mx_c} kW when grid < {p6_threshold} kW (exporting), SoC cap {p6_sx}%",
            {"threshold_kw": p6_threshold, "max_soc": p6_sx},
        )

        p7_rules: list[dict[str, Any]] = []

        if price_result.get("profitable"):
            cw = price_result["charge_windows"][0]
            dw = price_result["discharge_windows"][0]
            night_target = current_soc + (tradeoff["night_charge_kwh"] / cap * 100.0)
            night_target = min(night_target, soc_max)
            dis_soc = round(lerp(30.0, 50.0, 1.0 - t_norm))

            dlog.rule_reason(
                f"opt-arb-c-{tag}",
                f"Arbitrage charge: buy cheap ({cw['start_hour']:02d}:00-{cw['end_hour']+1:02d}:00) to SoC {round(night_target)}%",
                {"window": f"{cw['start_hour']:02d}-{cw['end_hour']+1:02d}", "target_soc": round(night_target)},
            )
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
            dlog.rule_reason(
                f"opt-arb-d-{tag}",
                f"Arbitrage discharge: sell expensive ({dw['start_hour']:02d}:00-{dw['end_hour']+1:02d}:00) down to SoC {dis_soc}%",
                {"window": f"{dw['start_hour']:02d}-{dw['end_hour']+1:02d}", "target_soc": dis_soc},
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
        elif charge_reason in (
            "peak_shaving_readiness",
            "peak_reserve_plus_pv",
        ):
            reserve_soc = min(
                float(tradeoff["peak_reserve_soc"]) * agg,
                soc_max,
            )

            already_above = current_soc >= reserve_soc
            if already_above:
                dlog.rule_reason(
                    f"opt-reserve-c-{tag}",
                    f"Night reserve charge to SoC {round(reserve_soc)}% — WILL NOT TRIGGER: current SoC "
                    f"{current_soc:.0f}% already above target. Rule exists as safety net for overnight drain.",
                    {"target_soc": round(reserve_soc), "current_soc": round(current_soc, 1)},
                )
            else:
                charge_kwh_needed = (reserve_soc - current_soc) / 100 * cap
                dlog.rule_reason(
                    f"opt-reserve-c-{tag}",
                    f"Night reserve charge to SoC {round(reserve_soc)}% (need +{charge_kwh_needed:.0f} kWh from {current_soc:.0f}%). "
                    f"Reason: {charge_reason} — build reserve for potential peak shaving events.",
                    {"target_soc": round(reserve_soc), "charge_kwh": round(charge_kwh_needed, 1)},
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
                dlog.rule_reason(
                    f"opt-fri-empty-{tag}",
                    f"Friday discharge to SoC {round(soc_min + 5.0)}% (14:00-21:00). "
                    f"Purpose: empty battery before weekend to make room for PV surplus capture Saturday/Sunday.",
                    {"target_soc": round(soc_min + 5.0)},
                )
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
            else:
                dlog.rule_skipped(
                    f"opt-fri-empty-{tag}",
                    "pre_weekend_discharge is False (weekend or holiday)",
                )
        elif float(tradeoff["night_charge_kwh"]) > 0:
            night_target = current_soc + (
                float(tradeoff["night_charge_kwh"]) / cap * 100.0
            )
            night_target = min(night_target, soc_max)
            dlog.rule_reason(
                f"opt-night-c-{tag}",
                f"Generic night charge to SoC {round(night_target)}%. Reason: {charge_reason}",
                {"target_soc": round(night_target), "charge_kwh": round(tradeoff["night_charge_kwh"], 1)},
            )
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
        else:
            dlog.rule_skipped(
                f"P7 rules for {tag}",
                f"No arbitrage, no PV reserve, no night charge needed (charge_reason={charge_reason}, night_charge_kwh=0)",
            )

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
