"""
1-Hour Aggregation Lambda Function for InfluxDB Cloud Serverless
Based on official InfluxDB documentation:
https://docs.influxdata.com/influxdb3/cloud-serverless/process-data/downsample/client-libraries/

This function:
1. Runs every 1 hour (triggered by EventBridge)
2. Queries the previous 1 hour of 15-minute aggregated data from aiess_v1_15m
3. Aggregates to 1-hour intervals using SQL
4. Writes aggregated data to aiess_v1_1h bucket
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
SOURCE_BUCKET = "aiess_v1_15m"
TARGET_BUCKET = "aiess_v1_1h"
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
    Lambda handler for 1-hour aggregation.
    Triggered by EventBridge every 1 hour.
    """
    print(f"Starting 1-hour aggregation at {datetime.now(timezone.utc).isoformat()}")

    try:
        # Calculate time window: previous 1 hour
        now = datetime.now(timezone.utc)
        window_end = now.replace(minute=0, second=0, microsecond=0)
        window_start = window_end - timedelta(hours=1)

        aggregate_timestamp = window_start

        print(f"Aggregating data from {window_start.isoformat()} to {window_end.isoformat()}")

        # Initialize InfluxDB client
        client = InfluxDBClient3(
            host=INFLUXDB_HOST,
            token=INFLUXDB_TOKEN,
            org=INFLUXDB_ORG
        )

        # Query 15-minute aggregated data and aggregate to 1 hour
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
            time >= TIMESTAMP '{window_start.isoformat()}'
            AND time < TIMESTAMP '{window_end.isoformat()}'
            AND aggregation = '15m'
            AND site_id IS NOT NULL
            AND site_id != ''
        GROUP BY site_id, date_bin(INTERVAL '1 hour', time, TIMESTAMP '1970-01-01T00:00:00Z')
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

        # Query last active rule from the 15m bucket for this 1h window
        rule_info = {}
        try:
            rule_query = f"""
            SELECT site_id, active_rule_id, active_rule_priority, active_rule_action, active_rule_power
            FROM {MEASUREMENT}
            WHERE time >= TIMESTAMP '{window_start.isoformat()}'
              AND time < TIMESTAMP '{window_end.isoformat()}'
              AND aggregation = '15m'
              AND active_rule_id IS NOT NULL AND active_rule_id != ''
            ORDER BY time DESC
            LIMIT 1
            """
            rule_table = client.query(query=rule_query, database=SOURCE_BUCKET, language="sql")
            if rule_table.num_rows > 0:
                rule_info = {
                    'active_rule_id': str(_val(rule_table.column('active_rule_id')[0], '')),
                    'active_rule_priority': float(_val(rule_table.column('active_rule_priority')[0], 0)),
                    'active_rule_action': str(_val(rule_table.column('active_rule_action')[0], '')),
                    'active_rule_power': round(float(_val(rule_table.column('active_rule_power')[0], 0.0)), 2),
                }
                print(f"Found last active rule: {rule_info['active_rule_id']}")
        except Exception as re:
            print(f"Active rule query failed (non-fatal): {str(re)}")

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

            # Merge active rule info if available
            if rule_info:
                fields.update(rule_info)

            site_id = str(_val(table.column('site_id')[i], ''))
            if not site_id or site_id in ('0.0', 'None'):
                print(f"Skipping row {i} with invalid site_id: {site_id!r}")
                continue

            point = {
                "measurement": MEASUREMENT,
                "tags": {
                    "site_id": site_id,
                    "aggregation": "1h"
                },
                "fields": fields,
                "time": aggregate_timestamp
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
