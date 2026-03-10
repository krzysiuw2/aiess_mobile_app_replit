"""
1-Minute Aggregation Lambda Function for InfluxDB Cloud Serverless
Based on official InfluxDB documentation:
https://docs.influxdata.com/influxdb3/cloud-serverless/process-data/downsample/client-libraries/

This function:
1. Runs every 1 minute (triggered by EventBridge)
2. Queries the previous 1 minute of raw 5-second data from aiess_v1
3. Aggregates to 1-minute intervals using SQL
4. Writes aggregated data to aiess_v1_1m bucket
"""

import sys
sys.path.insert(0, '/opt')  # Lambda layer puts pyarrow at /opt/pyarrow/

import os
import json
from datetime import datetime, timedelta, timezone
from influxdb_client_3 import InfluxDBClient3


# InfluxDB Configuration
INFLUXDB_HOST = os.environ['INFLUXDB_HOST']
INFLUXDB_TOKEN = os.environ['INFLUXDB_TOKEN']
INFLUXDB_ORG = os.environ['INFLUXDB_ORG']
SOURCE_BUCKET = "aiess_v1"
TARGET_BUCKET = "aiess_v1_1m"
MEASUREMENT = "energy_telemetry"


def _val(v, default=0.0):
    """Safely extract a scalar value from a pyarrow result.
    Handles both Python None and pyarrow null scalars (where as_py() returns None).
    """
    if v is None:
        return default
    try:
        result = v.as_py() if hasattr(v, 'as_py') else v
        return result if result is not None else default
    except Exception:
        return default


def lambda_handler(event, context):
    """
    Lambda handler for 1-minute aggregation.
    Triggered by EventBridge every 1 minute.
    """
    print(f"Starting 1-minute aggregation at {datetime.now(timezone.utc).isoformat()}")

    try:
        # Offset by 1 extra minute so slow-ingesting sites have time to land
        now = datetime.now(timezone.utc)
        window_end = now.replace(second=0, microsecond=0) - timedelta(minutes=1)
        window_start = window_end - timedelta(minutes=1)

        print(f"Aggregating data from {window_start.isoformat()} to {window_end.isoformat()}")

        # Initialize InfluxDB client
        client = InfluxDBClient3(
            host=INFLUXDB_HOST,
            token=INFLUXDB_TOKEN,
            org=INFLUXDB_ORG
        )

        # Query raw data and aggregate using SQL
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
            time >= TIMESTAMP '{window_start.isoformat()}'
            AND time < TIMESTAMP '{window_end.isoformat()}'
            AND site_id IS NOT NULL
            AND site_id != ''
        GROUP BY site_id, date_bin(INTERVAL '1 minute', time, TIMESTAMP '1970-01-01T00:00:00Z')
        """

        print(f"Executing query:\n{query}")

        table = client.query(query=query, database=SOURCE_BUCKET, language="sql")

        if table.num_rows == 0:
            print("No data found in the time window. Skipping aggregation.")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No data to aggregate',
                    'window_start': window_start.isoformat(),
                    'window_end': window_end.isoformat()
                })
            }

        num_rows = table.num_rows
        print(f"Found {num_rows} aggregated records to write")

        # Query active rule info (last value per window) - optional, backwards compatible
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
                WHERE time >= TIMESTAMP '{window_start.isoformat()}'
                  AND time < TIMESTAMP '{window_end.isoformat()}'
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
                print(f"Found active rule info for {len(rule_info)} windows")
        except Exception as re:
            print(f"Active rule query failed (non-fatal, fields may not exist yet): {str(re)}")

        # Write aggregated data to target bucket
        points = []
        for i in range(num_rows):
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

            site_id = str(_val(table.column('site_id')[i], ''))
            time_val = _val(table.column('_time')[i])
            if not site_id or site_id == '0.0' or site_id == 'None':
                print(f"Skipping row {i} with invalid site_id: {site_id!r}")
                continue
            key = (site_id, str(time_val))
            if key in rule_info:
                fields.update(rule_info[key])

            point = {
                "measurement": MEASUREMENT,
                "tags": {
                    "site_id": site_id,
                    "aggregation": "1m"
                },
                "fields": fields,
                "time": time_val
            }
            points.append(point)

        # Write to InfluxDB
        client.write(database=TARGET_BUCKET, record=points)

        print(f"Successfully wrote {len(points)} aggregated points to {TARGET_BUCKET}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Aggregation completed successfully',
                'records_processed': len(points),
                'window_start': window_start.isoformat(),
                'window_end': window_end.isoformat(),
                'target_bucket': TARGET_BUCKET
            })
        }

    except Exception as e:
        print(f"Error during aggregation: {str(e)}")
        import traceback
        traceback.print_exc()

        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Aggregation failed',
                'error': str(e)
            })
        }

    finally:
        if 'client' in locals():
            client.close()
