"""
Backfill 1-hour aggregated data from 15m data.
Reads aiess_v1_15m, writes to aiess_v1_1h.
"""

import os
from datetime import datetime, timedelta, timezone
from influxdb_client_3 import InfluxDBClient3

INFLUXDB_HOST = "eu-central-1-1.aws.cloud2.influxdata.com"
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN", "fj9uZEkxE9AIX1xUMlA4HFaJXFPSJBdz86sQnhs_Y4UwY5t4Z9iNuLFc_qD9DMIXj-0WfyZNUh4BTHfpathxew==")
INFLUXDB_ORG = "aiess"
SOURCE_BUCKET = "aiess_v1_15m"
TARGET_BUCKET = "aiess_v1_1h"
MEASUREMENT = "energy_telemetry"

GAP_START = datetime(2026, 3, 5, 8, 0, tzinfo=timezone.utc)
GAP_END = datetime(2026, 3, 6, 11, 0, tzinfo=timezone.utc)


def _val(v, default=0.0):
    if v is None:
        return default
    try:
        result = v.as_py() if hasattr(v, 'as_py') else v
        return result if result is not None else default
    except Exception:
        return default


def main():
    client = InfluxDBClient3(host=INFLUXDB_HOST, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    total = 0

    print(f"Backfilling 1h aggregations from {GAP_START.isoformat()} to {GAP_END.isoformat()}")

    try:
        query = f"""
        SELECT
            site_id,
            date_bin(INTERVAL '1 hour', time, TIMESTAMP '1970-01-01T00:00:00Z') AS _time,
            COALESCE(AVG(grid_power_mean), 0) AS grid_power_mean,
            COALESCE(MIN(grid_power_min), 0) AS grid_power_min,
            COALESCE(MAX(grid_power_max), 0) AS grid_power_max,
            COALESCE(AVG(pcs_power_mean), 0) AS pcs_power_mean,
            COALESCE(MIN(pcs_power_min), 0) AS pcs_power_min,
            COALESCE(MAX(pcs_power_max), 0) AS pcs_power_max,
            COALESCE(AVG(soc_mean), 0) AS soc_mean,
            COALESCE(MIN(soc_min), 0) AS soc_min,
            COALESCE(MAX(soc_max), 0) AS soc_max,
            COALESCE(AVG(total_pv_power_mean), 0) AS total_pv_power_mean,
            COALESCE(MIN(total_pv_power_min), 0) AS total_pv_power_min,
            COALESCE(MAX(total_pv_power_max), 0) AS total_pv_power_max,
            COALESCE(AVG(compensated_power_mean), 0) AS compensated_power_mean,
            COALESCE(MIN(compensated_power_min), 0) AS compensated_power_min,
            COALESCE(MAX(compensated_power_max), 0) AS compensated_power_max,
            COALESCE(SUM(sample_count), 0) AS sample_count
        FROM {MEASUREMENT}
        WHERE
            time >= TIMESTAMP '{GAP_START.isoformat()}'
            AND time < TIMESTAMP '{GAP_END.isoformat()}'
            AND aggregation = '15m'
            AND site_id IS NOT NULL
            AND site_id != ''
        GROUP BY site_id, date_bin(INTERVAL '1 hour', time, TIMESTAMP '1970-01-01T00:00:00Z')
        """

        table = client.query(query=query, database=SOURCE_BUCKET, language="sql")

        if table.num_rows == 0:
            print("No 15m data found for the gap period.")
            return

        points = []
        for i in range(table.num_rows):
            site_id = str(_val(table.column('site_id')[i], ''))
            if not site_id or site_id in ('0.0', 'None'):
                continue

            time_val = _val(table.column('_time')[i])
            fields = {
                "grid_power_mean": round(float(_val(table.column('grid_power_mean')[i])), 2),
                "grid_power_min": round(float(_val(table.column('grid_power_min')[i])), 2),
                "grid_power_max": round(float(_val(table.column('grid_power_max')[i])), 2),
                "pcs_power_mean": round(float(_val(table.column('pcs_power_mean')[i])), 2),
                "pcs_power_min": round(float(_val(table.column('pcs_power_min')[i])), 2),
                "pcs_power_max": round(float(_val(table.column('pcs_power_max')[i])), 2),
                "soc_mean": round(float(_val(table.column('soc_mean')[i])), 2),
                "soc_min": round(float(_val(table.column('soc_min')[i])), 2),
                "soc_max": round(float(_val(table.column('soc_max')[i])), 2),
                "total_pv_power_mean": round(float(_val(table.column('total_pv_power_mean')[i])), 2),
                "total_pv_power_min": round(float(_val(table.column('total_pv_power_min')[i])), 2),
                "total_pv_power_max": round(float(_val(table.column('total_pv_power_max')[i])), 2),
                "compensated_power_mean": round(float(_val(table.column('compensated_power_mean')[i])), 2),
                "compensated_power_min": round(float(_val(table.column('compensated_power_min')[i])), 2),
                "compensated_power_max": round(float(_val(table.column('compensated_power_max')[i])), 2),
                "sample_count": int(_val(table.column('sample_count')[i])),
            }

            points.append({
                "measurement": MEASUREMENT,
                "tags": {"site_id": site_id, "aggregation": "1h"},
                "fields": fields,
                "time": time_val,
            })

        if points:
            client.write(database=TARGET_BUCKET, record=points)
            total = len(points)

        print(f"Backfill complete! Wrote {total} 1h points.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
