from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from influxdb_client import InfluxDBClient

from data.dynamo_client import get_tariff_data as dynamo_get_tariff_data

_INFLUX_URL = os.environ.get("INFLUX_URL", "https://eu-central-1-1.aws.cloud2.influxdata.com")
_INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "")
_INFLUX_ORG = os.environ.get("INFLUX_ORG", "aiess")

_PRICE_BUCKETS = ("aiess_v1", "aiess_v1_1h")


def _client() -> InfluxDBClient:
    return InfluxDBClient(url=_INFLUX_URL, token=_INFLUX_TOKEN, org=_INFLUX_ORG)


def _flux_rows(flux: str) -> list[dict[str, Any]]:
    with _client() as client:
        tables = client.query_api().query(flux)
    rows: list[dict[str, Any]] = []
    for table in tables:
        for record in table.records:
            r = record.values.copy()
            r["_time"] = record.get_time()
            rows.append(r)
    return rows


def fetch_tge_prices(site_id: str, hours_ahead: int = 48) -> list[dict[str, Any]]:
    del site_id
    last_err: Exception | None = None
    for bucket in _PRICE_BUCKETS:
        flux = f'''
from(bucket: "{bucket}")
  |> range(start: -1h, stop: {hours_ahead}h)
  |> filter(fn: (r) => r._measurement == "tge_rdn_prices")
  |> filter(fn: (r) => r._field == "price_pln_mwh")
  |> sort(columns: ["_time"])
'''
        try:
            raw = _flux_rows(flux)
        except Exception as e:
            last_err = e
            continue
        out: list[dict[str, Any]] = []
        for r in raw:
            t = r.get("_time")
            if t is None:
                continue
            if hasattr(t, "timestamp"):
                ts = datetime.fromtimestamp(t.timestamp(), tz=timezone.utc)
            else:
                ts = t
            v = float(r.get("_value", 0) or 0)
            out.append(
                {
                    "time": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                    "hour": ts.hour if hasattr(ts, "hour") else 0,
                    "price_pln_mwh": v,
                    "price_pln_kwh": v / 1000.0,
                }
            )
        if out:
            return out
    if last_err:
        raise last_err
    return []


def fetch_forecasts(site_id: str, hours_ahead: int = 48) -> dict[str, Any]:
    flux = f'''
from(bucket: "aiess_v1")
  |> range(start: -1h, stop: {hours_ahead}h)
  |> filter(fn: (r) => r.site_id == "{site_id}" and r._measurement == "energy_forecast")
  |> filter(fn: (r) => r._field == "pv_forecast_kw" or r._field == "load_forecast_kw")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
'''
    try:
        raw = _flux_rows(flux)
    except Exception:
        return {"pv_forecast": [], "load_forecast": []}

    pv: list[dict[str, Any]] = []
    ld: list[dict[str, Any]] = []
    for r in raw:
        t = r.get("_time")
        if t is None:
            continue
        if hasattr(t, "timestamp"):
            ts = datetime.fromtimestamp(t.timestamp(), tz=timezone.utc)
        else:
            ts = t
        iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        pvv = r.get("pv_forecast_kw")
        lv = r.get("load_forecast_kw")
        if pvv is not None:
            pv.append({"time": iso, "kw": float(pvv)})
        if lv is not None:
            ld.append({"time": iso, "kw": float(lv)})
    return {"pv_forecast": pv, "load_forecast": ld}


def fetch_current_soc(site_id: str) -> float:
    flux = f'''
from(bucket: "aiess_v1")
  |> range(start: -5m)
  |> filter(fn: (r) => r.site_id == "{site_id}" and r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r._field == "soc" or r._field == "battery_soc_percent")
  |> last()
'''
    try:
        rows = _flux_rows(flux)
    except Exception:
        return 50.0
    if not rows:
        return 50.0
    return float(rows[0].get("_value", 50) or 50)


def fetch_historical_peaks(site_id: str, days: int = 90) -> list[float]:
    flux = f'''
from(bucket: "aiess_v1")
  |> range(start: -{int(days)}d)
  |> filter(fn: (r) => r.site_id == "{site_id}" and r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r._field == "grid_power")
  |> aggregateWindow(every: 1d, fn: max, createEmpty: false)
  |> keep(columns: ["_value"])
'''
    try:
        rows = _flux_rows(flux)
    except Exception:
        return []
    peaks: list[float] = []
    for r in rows:
        v = r.get("_value")
        if v is not None:
            peaks.append(float(v))
    return peaks


def fetch_tariff_data(operator: str, tariff_group: str) -> dict[str, Any]:
    row = dynamo_get_tariff_data(operator, tariff_group)
    return dict(row) if row else {}
