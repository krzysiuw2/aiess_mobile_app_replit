from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from typing import Any

from influxdb_client import InfluxDBClient

from data.dynamo_client import get_tariff_data as dynamo_get_tariff_data

_INFLUX_URL = os.environ.get("INFLUX_URL", "https://eu-central-1-1.aws.cloud2.influxdata.com")
_INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "")
_INFLUX_ORG = os.environ.get("INFLUX_ORG", "aiess")

_TGE_BUCKET = "tge_energy_prices"
_FORECAST_BUCKET = "aiess_v1_1h"
_PEAKS_BUCKET = "aiess_v1_15m"


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
    flux = f'''
from(bucket: "{_TGE_BUCKET}")
  |> range(start: -1h, stop: {hours_ahead}h)
  |> filter(fn: (r) => r._measurement == "energy_prices" and r._field == "price")
  |> sort(columns: ["_time"])
'''
    try:
        raw = _flux_rows(flux)
    except Exception as e:
        print(f"[InfluxClient] TGE price fetch error: {e}")
        return []

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
    return out


def fetch_forecasts(site_id: str, hours_ahead: int = 48) -> dict[str, list[float]]:
    """Fetch PV and load forecasts from InfluxDB.

    Returns two lists of 24 hourly kW floats keyed by hour of day (0-23).
    """
    flux = f'''
from(bucket: "{_FORECAST_BUCKET}")
  |> range(start: -1h, stop: {hours_ahead}h)
  |> filter(fn: (r) => r.site_id == "{site_id}" and r._measurement == "energy_simulation")
  |> filter(fn: (r) => r.source == "forecast")
  |> filter(fn: (r) => r._field == "pv_forecast" or r._field == "load_forecast")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
'''
    try:
        raw = _flux_rows(flux)
    except Exception as e:
        print(f"[InfluxClient] Forecast fetch error: {e}")
        return {"pv_forecast": [], "load_forecast": []}

    pv_by_hour: dict[int, list[float]] = {}
    ld_by_hour: dict[int, list[float]] = {}

    for r in raw:
        t = r.get("_time")
        if t is None:
            continue
        if hasattr(t, "timestamp"):
            ts = datetime.fromtimestamp(t.timestamp(), tz=timezone.utc)
        else:
            ts = t
        hour = ts.hour if hasattr(ts, "hour") else 0

        pvv = r.get("pv_forecast")
        lv = r.get("load_forecast")
        if pvv is not None:
            pv_by_hour.setdefault(hour, []).append(float(pvv))
        if lv is not None:
            ld_by_hour.setdefault(hour, []).append(float(lv))

    pv_24 = [0.0] * 24
    ld_24 = [0.0] * 24
    for h in range(24):
        if h in pv_by_hour:
            pv_24[h] = sum(pv_by_hour[h]) / len(pv_by_hour[h])
        if h in ld_by_hour:
            ld_24[h] = sum(ld_by_hour[h]) / len(ld_by_hour[h])

    pv_count = sum(1 for v in pv_24 if v != 0)
    ld_count = sum(1 for v in ld_24 if v != 0)
    print(f"[InfluxClient] Forecasts for {site_id}: PV {pv_count}/24 hours non-zero, Load {ld_count}/24 hours non-zero")

    return {"pv_forecast": pv_24, "load_forecast": ld_24}


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
    """Fetch daily peak grid power from 15-minute aggregated bucket.

    Uses max-of-15min-means because Polish utility billing (moc zamówiona)
    is based on 15-minute average demand, not instantaneous spikes.
    grid_power already reflects PV production offset — peaks naturally
    occur when PV is zero (mornings/evenings).
    """
    flux = f'''
from(bucket: "{_PEAKS_BUCKET}")
  |> range(start: -{int(days)}d)
  |> filter(fn: (r) => r.site_id == "{site_id}" and r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r._field == "grid_power_mean")
  |> aggregateWindow(every: 1d, fn: max, createEmpty: false)
  |> keep(columns: ["_time", "_value"])
'''
    try:
        rows = _flux_rows(flux)
    except Exception as e:
        print(f"[InfluxClient] Historical peaks query FAILED ({_PEAKS_BUCKET}): {e}")
        return []
    peaks: list[float] = []
    for r in rows:
        v = r.get("_value")
        if v is not None:
            peaks.append(float(v))
    if peaks:
        sp = sorted(peaks)
        p99_idx = min(int(len(sp) * 0.99), len(sp) - 1)
        print(f"[InfluxClient] Historical peaks for {site_id}: {len(peaks)} daily values, "
              f"max={max(peaks):.1f} kW, P99={sp[p99_idx]:.1f} kW, median={sp[len(sp)//2]:.1f} kW")
    else:
        print(f"[InfluxClient] Historical peaks for {site_id}: 0 values from {_PEAKS_BUCKET}")
    return peaks


def fetch_tariff_data(operator: str, tariff_group: str) -> dict[str, Any]:
    row = dynamo_get_tariff_data(operator, tariff_group)
    return dict(row) if row else {}
