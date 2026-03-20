from __future__ import annotations

from typing import Any

def simulate_soc_trajectory(
    rules: list[dict[str, Any]],
    net_grid: list[float],
    current_soc: float,
    config: dict[str, Any],
) -> dict[str, Any]:
    cap = float(config["battery_capacity_kwh"])
    soc_min = float(config["safety_soc_min"])
    soc_max = float(config["safety_soc_max"])
    eff = float(config["round_trip_efficiency"])
    eff_imp = _effective_import_kw(config)
    eff_exp = _effective_export_kw(config)
    n = len(net_grid)
    weekday = config.get("optimization_weekday")

    soc = float(current_soc)
    trajectory: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []

    for h in range(n):
        active = _pick_rule(rules, h, soc, float(net_grid[h]), weekday)
        bp = 0.0
        rid: str | None = None
        if active:
            rid = str(active["id"])
            bp = _rule_battery_power(
                active, h, soc, n, cap, eff, float(net_grid[h]), config
            )
            bp = _apply_action_grid_limits(
                active.get("a", {}), float(net_grid[h]), bp
            )

        grid_actual = float(net_grid[h]) - bp
        if eff_imp is not None and grid_actual > eff_imp:
            bp = float(net_grid[h]) - eff_imp
            grid_actual = eff_imp
        if eff_exp is not None and grid_actual < -eff_exp:
            bp = float(net_grid[h]) + eff_exp
            grid_actual = -eff_exp

        energy_delta_kwh = bp
        if bp < 0:
            energy_delta_kwh *= eff
        soc_delta = (energy_delta_kwh / cap) * 100.0
        new_soc = soc - soc_delta

        if new_soc > soc_max:
            violations.append({"hour": h, "type": "soc_overflow", "value": new_soc})
            new_soc = soc_max
        if new_soc < soc_min:
            violations.append({"hour": h, "type": "soc_underflow", "value": new_soc})
            new_soc = soc_min

        trajectory.append(
            {
                "hour": h,
                "soc": new_soc,
                "battery_power": bp,
                "grid_power": grid_actual,
                "active_rule": rid,
            }
        )
        soc = new_soc

    socs = [float(t["soc"]) for t in trajectory]
    return {
        "trajectory": trajectory,
        "valid": len(violations) == 0,
        "violations": violations,
        "min_soc": min(socs) if socs else current_soc,
        "max_soc": max(socs) if socs else current_soc,
        "final_soc": socs[-1] if socs else current_soc,
    }


def _apply_action_grid_limits(
    a: dict[str, Any], net_grid: float, bp: float
) -> float:
    t = a.get("t")
    if t in ("ch", "ct"):
        maxg = a.get("maxg")
        if maxg is not None:
            grid_actual = net_grid - bp
            lim = float(maxg)
            if grid_actual > lim:
                return net_grid - lim
    if t in ("dis", "dt"):
        ming = a.get("ming")
        if ming is not None:
            grid_actual = net_grid - bp
            lim = float(ming)
            if grid_actual < lim:
                return net_grid - lim
    return bp


def _effective_import_kw(config: dict[str, Any]) -> float | None:
    cands = [
        config.get("moc_zamowiona_kw"),
        config.get("grid_capacity_kva"),
        config.get("import_limit_kw"),
    ]
    xs = [float(x) for x in cands if x is not None]
    return min(xs) if xs else None


def _effective_export_kw(config: dict[str, Any]) -> float | None:
    cands = [config.get("grid_capacity_kva"), config.get("export_limit_kw")]
    xs = [float(x) for x in cands if x is not None]
    return min(xs) if xs else None


def _pick_rule(
    rules: list[dict[str, Any]],
    hour: int,
    soc: float,
    net_grid: float,
    weekday: Any,
) -> dict[str, Any] | None:
    for r in rules:
        if not _day_matches(r, weekday):
            continue
        if not _time_matches(hour, r.get("c", {})):
            continue
        if not _soc_matches(soc, r.get("c", {})):
            continue
        if not _grid_matches(net_grid, r.get("c", {})):
            continue
        a = r.get("a", {})
        t = a.get("t")
        if t == "ct":
            target = float(a["soc"])
            if soc >= target - 1e-6:
                continue
        if t == "dt":
            target = float(a["soc"])
            if soc <= target + 1e-6:
                continue
        if t == "sb":
            continue
        return r
    return None


def _day_matches(rule: dict[str, Any], weekday: Any) -> bool:
    if weekday is None:
        return True
    d = rule.get("d")
    if d is None:
        return True
    wd = int(weekday)
    if isinstance(d, str):
        s = d.lower().strip()
        if s in ("wkd", "weekdays"):
            return 0 <= wd <= 4
        if s in ("we", "weekend"):
            return wd in (5, 6)
        if s in ("ed", "everyday", "all"):
            return True
        return True
    if isinstance(d, list):
        return wd in [int(x) for x in d]
    return True


def _time_matches(hour: int, c: dict[str, Any]) -> bool:
    if "ts" not in c and "te" not in c:
        return True
    ts = int(c.get("ts", 0))
    te = int(c.get("te", 2359))
    return _hour_in_hhmm_window(hour, ts, te)


def _hour_in_hhmm_window(hour: int, ts: int, te: int) -> bool:
    S = hour * 60
    E = S + 60
    a = (ts // 100) * 60 + (ts % 100)
    b = (te // 100) * 60 + (te % 100)
    day = 24 * 60

    def intersect(x1: int, x2: int, y1: int, y2: int) -> bool:
        return max(x1, y1) < min(x2, y2)

    if ts <= te:
        return intersect(S, E, a, b)
    return intersect(S, E, a, day) or intersect(S, E, 0, b)


def _soc_matches(soc: float, c: dict[str, Any]) -> bool:
    if "sm" in c and soc < float(c["sm"]):
        return False
    if "sx" in c and soc > float(c["sx"]):
        return False
    return True


def _grid_matches(grid: float, c: dict[str, Any]) -> bool:
    if "gpo" not in c:
        return True
    op = str(c["gpo"])
    val = float(c.get("gpv", 0.0))
    gpx = c.get("gpx")
    if op == "gt":
        return grid > val
    if op == "gte":
        return grid >= val
    if op == "lt":
        return grid < val
    if op == "lte":
        return grid <= val
    if op == "bt" and gpx is not None:
        return val <= grid <= float(gpx)
    return True


def _rule_battery_power(
    rule: dict[str, Any],
    hour: int,
    soc: float,
    n: int,
    cap: float,
    eff: float,
    net_grid: float,
    config: dict[str, Any],
) -> float:
    _ = net_grid
    a = rule["a"]
    t = a.get("t")
    mx_c = float(config.get("max_charge_kw", 1e9))
    mx_d = float(config.get("max_discharge_kw", 1e9))
    if t == "ch":
        return -min(float(a.get("pw", 0.0)), mx_c)
    if t == "dis":
        return min(float(a.get("pw", 0.0)), mx_d)
    if t == "ct":
        target = float(a["soc"])
        maxp = min(float(a.get("maxp", 1e9)), mx_c)
        need_kwh = max(0.0, (target - soc) / 100.0 * cap)
        hrs = max(1, _count_hours_remaining(rule, hour, n))
        p = min(maxp, need_kwh / hrs / eff)
        return -p
    if t == "dt":
        target = float(a["soc"])
        maxp = min(float(a.get("maxp", 1e9)), mx_d)
        need_kwh = max(0.0, (soc - target) / 100.0 * cap)
        hrs = max(1, _count_hours_remaining(rule, hour, n))
        p = min(maxp, need_kwh / hrs)
        return p
    return 0.0


def _count_hours_remaining(rule: dict[str, Any], hour: int, n: int) -> int:
    c = rule.get("c", {})
    cnt = 0
    for hh in range(hour, n):
        if _time_matches(hh, c):
            cnt += 1
    return max(1, cnt)
