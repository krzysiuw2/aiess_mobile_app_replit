from __future__ import annotations

from typing import Any

VALID_SOURCES = frozenset({"ai", "man"})
VALID_ACTION_TYPES = frozenset({"ch", "dis", "sb", "sl", "ct", "dt"})
VALID_GRID_OPS = frozenset({"gt", "lt", "eq", "gte", "lte", "bt"})
VALID_STRATEGIES = frozenset({"eq", "agg", "con"})

ACTION_TYPE_VERBOSE_TO_COMPACT = {
    "charge": "ch",
    "discharge": "dis",
    "standby": "sb",
    "site_limit": "sl",
    "charge_to_target": "ct",
    "discharge_to_target": "dt",
}
ACTION_FIELD_VERBOSE_TO_COMPACT = {
    "power_kw": "pw",
    "use_pid": "pid",
    "high_threshold_kw": "hth",
    "low_threshold_kw": "lth",
    "target_soc": "soc",
    "strategy": "str",
    "max_power_kw": "maxp",
    "max_grid_power_kw": "maxg",
    "min_grid_power_kw": "ming",
}
STRATEGY_VERBOSE_TO_COMPACT = {
    "equal_spread": "eq",
    "aggressive": "agg",
    "conservative": "con",
}
GRID_OP_VERBOSE_TO_COMPACT = {
    "greater_than": "gt",
    "less_than": "lt",
    "equal": "eq",
    "greater_than_or_equal": "gte",
    "less_than_or_equal": "lte",
    "between": "bt",
}


def _compact_action_type(t: str) -> str:
    return ACTION_TYPE_VERBOSE_TO_COMPACT.get(t, t)


def _compact_strategy(s: str) -> str:
    return STRATEGY_VERBOSE_TO_COMPACT.get(s, s)


def _compact_grid_op(op: str) -> str:
    return GRID_OP_VERBOSE_TO_COMPACT.get(op, op)


def _time_str_to_hhmm(val: Any) -> int | None:
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        return int(val.replace(":", ""))
    return None


def normalize_rule(rule: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    out["id"] = rule.get("id") or rule.get("rule_id") or ""

    s = rule.get("s") or rule.get("source")
    if s:
        out["s"] = s

    raw_action = rule.get("a") or rule.get("action") or {}
    if isinstance(raw_action, dict):
        a: dict[str, Any] = {}
        t = raw_action.get("t") or raw_action.get("type") or ""
        a["t"] = _compact_action_type(str(t))

        for verbose_key, compact_key in ACTION_FIELD_VERBOSE_TO_COMPACT.items():
            val = (
                raw_action.get(compact_key)
                if compact_key in raw_action
                else raw_action.get(verbose_key)
            )
            if val is not None:
                a[compact_key] = val

        if "str" in a:
            a["str"] = _compact_strategy(str(a["str"]))

        out["a"] = a

    raw_cond = rule.get("c") or rule.get("conditions") or {}
    if isinstance(raw_cond, dict):
        c: dict[str, Any] = {}

        if "ts" in raw_cond or "te" in raw_cond:
            if "ts" in raw_cond:
                ts = _time_str_to_hhmm(raw_cond["ts"])
                if ts is not None:
                    c["ts"] = ts
            if "te" in raw_cond:
                te = _time_str_to_hhmm(raw_cond["te"])
                if te is not None:
                    c["te"] = te
        elif "time" in raw_cond:
            tobj = raw_cond["time"]
            if isinstance(tobj, dict):
                if "start" in tobj:
                    ts = _time_str_to_hhmm(tobj["start"])
                    if ts is not None:
                        c["ts"] = ts
                if "end" in tobj:
                    te = _time_str_to_hhmm(tobj["end"])
                    if te is not None:
                        c["te"] = te
        if "time_start" in raw_cond:
            ts = _time_str_to_hhmm(raw_cond["time_start"])
            if ts is not None:
                c["ts"] = ts
        if "time_end" in raw_cond:
            te = _time_str_to_hhmm(raw_cond["time_end"])
            if te is not None:
                c["te"] = te

        if "sm" in raw_cond or "sx" in raw_cond:
            if "sm" in raw_cond:
                c["sm"] = raw_cond["sm"]
            if "sx" in raw_cond:
                c["sx"] = raw_cond["sx"]
        elif "soc" in raw_cond and isinstance(raw_cond["soc"], dict):
            sobj = raw_cond["soc"]
            if "min" in sobj:
                c["sm"] = sobj["min"]
            if "max" in sobj:
                c["sx"] = sobj["max"]
        if "soc_min" in raw_cond:
            c["sm"] = raw_cond["soc_min"]
        if "soc_max" in raw_cond:
            c["sx"] = raw_cond["soc_max"]

        if "gpo" in raw_cond or "gpv" in raw_cond:
            if "gpo" in raw_cond:
                c["gpo"] = _compact_grid_op(str(raw_cond["gpo"]))
            if "gpv" in raw_cond:
                c["gpv"] = raw_cond["gpv"]
            if "gpx" in raw_cond:
                c["gpx"] = raw_cond["gpx"]
        elif "grid_power" in raw_cond and isinstance(raw_cond["grid_power"], dict):
            gobj = raw_cond["grid_power"]
            if "operator" in gobj:
                c["gpo"] = _compact_grid_op(str(gobj["operator"]))
            if "value" in gobj:
                c["gpv"] = gobj["value"]
            if "value_max" in gobj:
                c["gpx"] = gobj["value_max"]

        out["c"] = c
    else:
        out["c"] = {}

    d = rule.get("d") or rule.get("weekdays")
    if d is not None:
        out["d"] = d

    act = rule.get("act") if "act" in rule else rule.get("active")
    if act is not None and act is False:
        out["act"] = False

    vf = rule.get("vf") if "vf" in rule else rule.get("valid_from")
    if vf is not None and vf != 0:
        out["vf"] = int(vf)

    vu = rule.get("vu") if "vu" in rule else rule.get("valid_until")
    if vu is not None and vu != 0:
        out["vu"] = int(vu)

    ua = rule.get("ua") if "ua" in rule else rule.get("uploaded_at")
    if ua is not None and ua != 0:
        out["ua"] = int(ua)

    return out


def validate_rule(rule: dict[str, Any]) -> tuple[bool, str]:
    rid = rule.get("id", "")
    if not rid or not isinstance(rid, str):
        return False, "missing required field: id"
    if len(rid) > 63:
        return False, "id exceeds 63 characters"

    action = rule.get("a")
    if not action or not isinstance(action, dict):
        return False, "missing required field: a (action)"
    t = action.get("t", "")
    if t not in VALID_ACTION_TYPES:
        return False, f"invalid action type: {t!r}"

    s = rule.get("s")
    if s is not None and s not in VALID_SOURCES:
        return False, f"invalid source: {s!r}"
    if s == "ai" and not rule.get("vu"):
        return False, 'AI-generated rules (s:"ai") must have vu (valid_until)'

    if t in ("ct", "dt"):
        if "soc" not in action:
            return False, f"goal-based action ({t}) requires soc (target_soc)"
        soc = action["soc"]
        if not isinstance(soc, (int, float)) or soc < 0 or soc > 100:
            return False, f"soc must be 0-100, got {soc}"
        if "str" in action and action["str"] not in VALID_STRATEGIES:
            return False, f"invalid strategy: {action['str']!r}"

    if t == "sl":
        if "hth" not in action or "lth" not in action:
            return False, "site_limit action requires hth and lth"

    if t in ("ch", "dis"):
        if "pw" not in action:
            return False, f"{t} action requires pw (power_kw)"

    cond = rule.get("c", {})
    if isinstance(cond, dict):
        if "ts" in cond:
            ts = cond["ts"]
            if not isinstance(ts, (int, float)) or ts < 0 or ts > 2359:
                return False, f"ts (time start) must be 0-2359, got {ts}"
        if "te" in cond:
            te = cond["te"]
            if not isinstance(te, (int, float)) or te < 0 or te > 2359:
                return False, f"te (time end) must be 0-2359, got {te}"
        if "sm" in cond:
            sm = cond["sm"]
            if not isinstance(sm, (int, float)) or sm < 0 or sm > 100:
                return False, f"sm (soc min) must be 0-100, got {sm}"
        if "sx" in cond:
            sx = cond["sx"]
            if not isinstance(sx, (int, float)) or sx < 0 or sx > 100:
                return False, f"sx (soc max) must be 0-100, got {sx}"
        if "gpo" in cond:
            if cond["gpo"] not in VALID_GRID_OPS:
                return False, f"invalid grid operator: {cond['gpo']!r}"
            if "gpv" not in cond:
                return False, "gpo requires gpv (grid power value)"
            if cond["gpo"] == "bt" and "gpx" not in cond:
                return False, "between operator requires gpx (grid power value max)"

    if rule.get("read_only"):
        return False, "contains read_only flag (not allowed from cloud)"

    return True, ""
