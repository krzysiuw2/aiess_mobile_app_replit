from __future__ import annotations

from typing import Any


def get_default_intent_map() -> dict[str, int]:
    return {"peak_shaving": 8, "arbitrage": 7, "pv_optimization": 6}


def get_default_p5_rules(effective_import_limit_kw: float = 70.0) -> list[dict[str, Any]]:
    lim = float(effective_import_limit_kw)
    return [
        {
            "id": "fb-zero-export",
            "s": "man",
            "a": {"t": "ch", "pw": 9999.0, "pid": True},
            "c": {"gpo": "lt", "gpv": 0.0},
        },
        {
            "id": "fb-peak-shave",
            "s": "man",
            "a": {"t": "dis", "pw": 9999.0, "pid": True},
            "c": {"gpo": "gt", "gpv": lim},
        },
        {
            "id": "fb-standby",
            "s": "man",
            "a": {"t": "sb", "pw": 0.0},
            "c": {},
        },
    ]
