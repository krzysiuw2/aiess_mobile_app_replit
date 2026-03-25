"""Decision logging for the optimization pipeline.

Captures detailed reasoning at each step so we can trace exactly
WHY the engine made each decision.  Stored as a structured dict
attached to the pipeline output under `decision_log`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

_log: dict[str, Any] = {}


def reset() -> None:
    global _log
    _log = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "steps": [],
        "warnings": [],
        "rule_reasoning": [],
    }


def step(name: str, detail: dict[str, Any]) -> None:
    _log.setdefault("steps", []).append({"step": name, **detail})
    _print(name, detail)


def warn(msg: str, detail: dict[str, Any] | None = None) -> None:
    entry = {"message": msg}
    if detail:
        entry.update(detail)
    _log.setdefault("warnings", []).append(entry)
    print(f"  ⚠ WARNING: {msg}")


def rule_reason(rule_id: str, why_created: str, params: dict[str, Any] | None = None) -> None:
    entry = {"rule_id": rule_id, "reason": why_created}
    if params:
        entry["params"] = params
    _log.setdefault("rule_reasoning", []).append(entry)
    print(f"  → RULE {rule_id}: {why_created}")


def rule_skipped(what: str, why: str) -> None:
    entry = {"skipped": what, "reason": why}
    _log.setdefault("rule_reasoning", []).append(entry)
    print(f"  ✗ SKIP {what}: {why}")


def get() -> dict[str, Any]:
    return dict(_log)


def _print(name: str, detail: dict[str, Any]) -> None:
    safe = {k: _safe_val(v) for k, v in detail.items()}
    parts = [f"{k}={v}" for k, v in safe.items()]
    print(f"[DecisionLog] {name}: {', '.join(parts)}")


def _safe_val(v: Any) -> str:
    if isinstance(v, float):
        return f"{v:.2f}"
    if isinstance(v, dict):
        return json.dumps(v, default=str)
    if isinstance(v, list) and len(v) > 6:
        return f"[{len(v)} items]"
    return str(v)
