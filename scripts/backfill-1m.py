"""
Backfill 1-minute aggregated data for the gap period.
Queries raw aiess_v1 data and writes aggregated results to aiess_v1_1m.
Processes in 2-hour batches to avoid query timeouts.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from influxdb_client_3 import InfluxDBClient3

INFLUXDB_HOST = "eu-central-1-1.aws.cloud2.influxdata.com"
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN", "fj9uZEkxE9AIX1xUMlA4HFaJXFPSJBdz86sQnhs_Y4UwY5t4Z9iNuLFc_qD9DMIXj-0WfyZNUh4BTHfpathxew==")
INFLUXDB_ORG = "aiess"
SOURCE_BUCKET = "aiess_v1"
TARGET_BUCKET = "aiess_v1_1m"
MEASUREMENT = "energy_telemetry"

GAP_START = datetime(2026, 3, 5, 8, 55, tzinfo=timezone.utc)
GAP_END = datetime(2026, 3, 6, 10, 51, tzinfo=timezone.utc)
BATCH_HOURS = 2


def _val(v, default=0.0):
    if v is None:
        return default
    try:
        result = v.as_py() if hasattr(v, 'as_py') else v
        return result if result is not None else default
    except Exception:
        return default


def backfill_batch(client, batch_start, batch_end):
    query = f"""
    SELECT
        site_id,
        date_bin(INTERVAL '1 minute', time, TIMESTAMP '1970-01-01T00:00:00Z') AS _time,
        COALESCE(AVG(grid_power), 0) AS grid_power_mean,
        COALESCE(MIN(grid_power), 0) AS grid_power_min,
        COALESCE(MAX(grid_power), 0) AS grid_power_max,
        COALESCE(AVG(pcs_power), 0) AS pcs_power_mean,
        COALESCE(MIN(pcs_power), 0) AS pcs_power_min,
        COALESCE(MAX(pcs_power), 0) AS pcs_power_max,
        COALESCE(AVG(soc), 0) AS soc_mean,
        COALESCE(MIN(soc), 0) AS soc_min,
        COALESCE(MAX(soc), 0) AS soc_max,
        COALESCE(AVG(total_pv_power), 0) AS total_pv_power_mean,
        COALESCE(MIN(total_pv_power), 0) AS total_pv_power_min,
        COALESCE(MAX(total_pv_power), 0) AS total_pv_power_max,
        COALESCE(AVG(compensated_power), 0) AS compensated_power_mean,
        COALESCE(MIN(compensated_power), 0) AS compensated_power_min,
        COALESCE(MAX(compensated_power), 0) AS compensated_power_max,
        COUNT(*) AS sample_count
    FROM {MEASUREMENT}
    WHERE
        time >= TIMESTAMP '{batch_start.isoformat()}'
        AND time < TIMESTAMP '{batch_end.isoformat()}'
        AND site_id IS NOT NULL
        AND site_id != ''
    GROUP BY site_id, date_bin(INTERVAL '1 minute', time, TIMESTAMP '1970-01-01T00:00:00Z')
    """

    table = client.query(query=query, database=SOURCE_BUCKET, language="sql")

    if table.num_rows == 0:
        print(f"  No raw data for {batch_start.isoformat()} - {batch_end.isoformat()}")
        return 0

    # Also get active rule info
    rule_info = {}
    try:
        rule_query = f"""
        SELECT site_id, _time, active_rule_id, active_rule_priority, active_rule_action, active_rule_power
        FROM (
            SELECT
                site_id,
                date_bin(INTERVAL '1 minute', time, TIMESTAMP '1970-01-01T00:00:00Z') AS _time,
                active_rule_id,
                active_rule_priority,
                active_rule_action,
                active_rule_power,
                ROW_NUMBER() OVER (
                    PARTITION BY site_id, date_bin(INTERVAL '1 minute', time, TIMESTAMP '1970-01-01T00:00:00Z')
                    ORDER BY time DESC
                ) as rn
            FROM {MEASUREMENT}
            WHERE time >= TIMESTAMP '{batch_start.isoformat()}'
              AND time < TIMESTAMP '{batch_end.isoformat()}'
              AND active_rule_id IS NOT NULL AND active_rule_id != ''
        )
        WHERE rn = 1
        """
        rule_table = client.query(query=rule_query, database=SOURCE_BUCKET, language="sql")
        if rule_table.num_rows > 0:
            for i in range(rule_table.num_rows):
                key = (str(_val(rule_table.column('site_id')[i])),
                       str(_val(rule_table.column('_time')[i])))
                rule_info[key] = {
                    'active_rule_id': str(_val(rule_table.column('active_rule_id')[i], '')),
                    'active_rule_priority': float(_val(rule_table.column('active_rule_priority')[i], 0)),
                    'active_rule_action': str(_val(rule_table.column('active_rule_action')[i], '')),
                    'active_rule_power': round(float(_val(rule_table.column('active_rule_power')[i], 0.0)), 2),
                }
    except Exception as e:
        print(f"  Rule query failed (non-fatal): {e}")

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
            "sample_count": int(_val(table.column('sample_count')[i]))
        }

        key = (site_id, str(time_val))
        if key in rule_info:
            fields.update(rule_info[key])

        points.append({
            "measurement": MEASUREMENT,
            "tags": {"site_id": site_id, "aggregation": "1m"},
            "fields": fields,
            "time": time_val,
        })

    if points:
        client.write(database=TARGET_BUCKET, record=points)

    return len(points)


def main():
    client = InfluxDBClient3(host=INFLUXDB_HOST, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    total = 0
    batch_start = GAP_START

    print(f"Backfilling 1m aggregations from {GAP_START.isoformat()} to {GAP_END.isoformat()}")

    try:
        while batch_start < GAP_END:
            batch_end = min(batch_start + timedelta(hours=BATCH_HOURS), GAP_END)
            print(f"Batch: {batch_start.isoformat()} -> {batch_end.isoformat()}")
            count = backfill_batch(client, batch_start, batch_end)
            total += count
            print(f"  Wrote {count} points (total: {total})")
            batch_start = batch_end

        print(f"\nBackfill complete! Total points written: {total}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
