from __future__ import annotations

from typing import Any


def _finite_positive(x: Any) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    return v


def compute_effective_limits(site_config: dict[str, Any]) -> dict[str, Any]:
    mz = _finite_positive(site_config.get("moc_zamowiona_kw"))
    gc = _finite_positive(site_config.get("grid_capacity_kva"))
    ex = _finite_positive(site_config.get("export_limit_kw"))
    im = _finite_positive(site_config.get("import_limit_kw"))

    import_candidates = [x for x in (mz, gc, im) if x is not None]
    export_candidates = [x for x in (gc, ex) if x is not None]

    return {
        "effective_import_limit_kw": min(import_candidates) if import_candidates else None,
        "effective_export_limit_kw": min(export_candidates) if export_candidates else None,
    }
