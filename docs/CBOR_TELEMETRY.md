# CBOR Telemetry & Battery Detail MQTT

Two-tier MQTT telemetry system for AIESS v2.0.3+: high-frequency main telemetry (5s) and battery detail (60s) on separate topics.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [MQTT Topics](#2-mqtt-topics)
3. [Tier 1: Main Telemetry (5s)](#3-tier-1-main-telemetry-5s)
4. [Tier 2: Battery Detail (60s)](#4-tier-2-battery-detail-60s)
5. [CBOR Key Mappings](#5-cbor-key-mappings)
6. [JSON Payload Reference](#6-json-payload-reference)
7. [Lambda Processing](#7-lambda-processing)
8. [InfluxDB Storage](#8-influxdb-storage)
9. [Telegraf Configuration](#9-telegraf-configuration)
10. [AWS IoT Rules](#10-aws-iot-rules)
11. [Mobile App Integration (InfluxDB)](#11-mobile-app-integration-influxdb)
12. [Size & Bandwidth Estimates](#12-size--bandwidth-estimates)

---

## 1. Architecture Overview

```
aiess_daemon (1Hz) --[telemetry.sock]--> aiess_aws_gateway
  |                                         |
  +-- 5s telemetry packet                   +-- CBOR encode --> aiess/{id}/telemetry (QoS 1)
  +-- 60s battery_detail packet             +-- CBOR encode --> aiess/{id}/battery/0 (QoS 1)
                                            |
                                        AWS IoT Core
                                            |
                                    +-------+-------+
                                    |               |
                            IoT Rule:        IoT Rule:
                          aiess/+/telemetry  aiess/+/battery/+
                                    |               |
                                    +-------+-------+
                                            |
                                    Lambda: iot-to-telegraf-forwarder
                                            |
                                    +-------+-------+
                                    |               |
                            Telegraf/EC2     Telegraf/EC2
                                    |               |
                            InfluxDB:        InfluxDB:
                          aiess_v1 bucket    battery_detail bucket
                            (existing)      (auto-created)
                                    |               |
                                    +-------+-------+
                                            |
                                    InfluxDB HTTP API (SQL)
                                            |
                                    Mobile App (iOS)
                                    - latest readings
                                    - historical charts
                                    - battery cell heatmaps
```

## 2. MQTT Topics

| Topic Pattern | Interval | QoS | Payload | Description |
|---|---|---|---|---|
| `aiess/{device_id}/telemetry` | 5s (configurable 1-60s) | 1 | CBOR or JSON | Main telemetry: power, SoC, rule, battery health |
| `aiess/{device_id}/battery/{stack_id}` | 60s | 1 | CBOR or JSON | Full battery detail: per-cell voltages, temps, faults |

- `device_id`: e.g., `domagala_1`, `olmar_1`, or UUID
- `stack_id`: Battery stack index (typically `0` for single-stack systems)

## 3. Tier 1: Main Telemetry (5s)

### CBOR Payload Structure (abbreviated keys)

```
{
  "ts":  1710064800,          // Unix timestamp
  "did": "domagala_1",        // Device ID
  "m": {                      // Measurements
    "gp":  -2.69,             // Grid power (kW, instant)
    "g5":  -2.50,             // Grid power 5s average (kW)
    "pp":  10.5,              // PCS power (kW) - negative=charge, positive=discharge
    "soc": 55.0,              // Battery SoC (%)
    "cgp": 7.81,              // Compensated grid (kW)
    "pv":  0.0,               // Total PV power (kW)
    "rid": "peak_shave_1",    // Active rule ID
    "rp":  8,                 // Active rule priority (1-11)
    "ra":  "D",               // Active rule action (C=charge, D=discharge, S=standby)
    "rpw": 10.5,              // Active rule power (kW)
    "mnv": 3288,              // Min cell voltage (mV)
    "mxv": 3295,              // Max cell voltage (mV)
    "mnt": 15,                // Min cell temperature (°C)
    "mxt": 17,                // Max cell temperature (°C)
    "vd":  7,                 // Voltage delta (mV) = max - min
    "af":  []                 // Active faults (non-zero register values, empty = healthy)
  },
  "s": {                      // Status
    "sa":  true,              // Schedule active
    "pa":  true,              // PID active
    "gm":  true,              // Grid meter online
    "ems": true               // EMS online
  }
}
```

### CBOR Size

| Format | Size | Reduction |
|---|---|---|
| JSON (full keys) | ~420 bytes | baseline |
| CBOR (abbreviated) | ~156 bytes | **63% reduction** |

### Configuration

In `/var/lib/aiess/aws_config.json`:
```json
{
  "cbor_enabled": true,
  "publish_interval_sec": 5
}
```
- `cbor_enabled`: `true` (default) for CBOR, `false` for JSON
- `publish_interval_sec`: 1-60, default 5

## 4. Tier 2: Battery Detail (60s)

### CBOR Payload Structure (abbreviated keys)

```
{
  "ts":  1710064800,          // Unix timestamp
  "did": "domagala_1",        // Device ID
  "sid": 0,                   // Stack ID
  "stk": {                    // Stack summary
    "v":   632.0,             // Stack voltage (V)
    "i":   -12.5,             // Stack current (A), negative=charging
    "soc": 55.0,              // Stack SoC (%)
    "soh": 100.0,             // Stack SoH (%)
    "wm":  0                  // Working mode (0=Normal)
  },
  "cls": [                    // Clusters array
    {
      "id":  0,               // Cluster index
      "soc": 55.0,            // Cluster SoC (%)
      "mnv": 3288,            // Min cell voltage (mV)
      "mxv": 3295,            // Max cell voltage (mV)
      "mnt": 15,              // Min cell temp (°C)
      "mxt": 17               // Max cell temp (°C)
    }
  ],
  "cv":  [3288, 3290, 3291, ...],  // Cell voltages array (mV), 1 per cell
  "ct":  [15, 16, 15, ...],        // Cell temperatures array (°C), 1 per NTC
  "flt": []                         // Fault registers (non-zero values only)
}
```

### CBOR Size

| Cells | CBOR Size | JSON Size |
|---|---|---|
| 48 cells  | ~350 bytes  | ~1.2 KB |
| 96 cells  | ~550 bytes  | ~2.0 KB |
| 192 cells | ~768 bytes  | ~3.5 KB |

## 5. CBOR Key Mappings

### Telemetry Key Mapping (Tier 1)

| CBOR Key | Full Key | Type | Unit |
|---|---|---|---|
| `ts` | `timestamp` | int64 | Unix epoch |
| `did` | `device_id` | string | - |
| `m` | `measurements` | map | - |
| `s` | `status` | map | - |
| `gp` | `grid_power_kw` | float | kW |
| `g5` | `grid_power_5s_avg_kw` | float | kW |
| `pp` | `pcs_power_kw` | float | kW |
| `soc` | `battery_soc_percent` | float | % |
| `cgp` | `compensated_grid_kw` | float | kW |
| `pv` | `total_pv_power_kw` | float | kW |
| `rid` | `active_rule_id` | string | - |
| `rp` | `active_rule_priority` | int | 1-11 |
| `ra` | `active_rule_action` | string | C/D/S/ZE/PS |
| `rpw` | `active_rule_power` | float | kW |
| `mnv` | `min_cell_voltage_mv` | uint16 | mV |
| `mxv` | `max_cell_voltage_mv` | uint16 | mV |
| `mnt` | `min_cell_temp_c` | int16 | °C |
| `mxt` | `max_cell_temp_c` | int16 | °C |
| `vd` | `voltage_delta_mv` | uint16 | mV |
| `af` | `active_faults` | array[uint16] | raw register values |
| `sa` | `schedule_active` | bool | - |
| `pa` | `pid_active` | bool | - |
| `gm` | `grid_meter_online` | bool | - |
| `ems` | `ems_online` | bool | - |

### Battery Detail Key Mapping (Tier 2)

| CBOR Key | Full Key | Type | Unit |
|---|---|---|---|
| `ts` | `timestamp` | int64 | Unix epoch |
| `did` | `device_id` | string | - |
| `sid` | `stack_id` | int | - |
| `stk` | `stack` | map | - |
| `cls` | `clusters` | array[map] | - |
| `cv` | `cell_voltages` | array[uint16] | mV |
| `ct` | `cell_temps` | array[int16] | °C |
| `flt` | `faults` | array[uint16] | raw register values |
| `v` | `voltage_v` | float | V |
| `i` | `current_a` | float | A |
| `soc` | `soc_percent` | float | % |
| `soh` | `soh_percent` | float | % |
| `wm` | `working_mode` | int | 0-4, 170 |
| `mnv` | `min_cell_voltage_mv` | uint16 | mV |
| `mxv` | `max_cell_voltage_mv` | uint16 | mV |
| `mnt` | `min_cell_temp_c` | int16 | °C |
| `mxt` | `max_cell_temp_c` | int16 | °C |

### Rule Action Codes

| Code | Meaning |
|---|---|
| `C` | Charge |
| `D` | Discharge |
| `S` | Standby |
| `ZE` | Zero Export |
| `PS` | Peak Shaving (P8+) |
| `` (empty) | No active rule |

### Working Mode Values

| Value | State |
|---|---|
| 0 | Normal |
| 1 | Charge Disabled |
| 2 | Discharge Disabled |
| 3 | Standby |
| 4 | Stop |
| 170 | No Communication |

## 6. JSON Payload Reference

When `cbor_enabled: false`, payloads use full key names.

### Telemetry JSON (Tier 1)

```json
{
  "timestamp": 1710064800,
  "device_id": "domagala_1",
  "measurements": {
    "grid_power_kw": -2.69,
    "grid_power_5s_avg_kw": -2.50,
    "pcs_power_kw": 10.5,
    "battery_soc_percent": 55.0,
    "compensated_grid_kw": 7.81,
    "total_pv_power_kw": 0.0,
    "active_rule_id": "peak_shave_1",
    "active_rule_priority": 8,
    "active_rule_action": "D",
    "active_rule_power": 10.5,
    "min_cell_voltage_mv": 3288,
    "max_cell_voltage_mv": 3295,
    "min_cell_temp_c": 15,
    "max_cell_temp_c": 17,
    "voltage_delta_mv": 7,
    "active_faults": []
  },
  "status": {
    "schedule_active": true,
    "pid_active": true,
    "grid_meter_online": true,
    "ems_online": true
  }
}
```

### Battery Detail JSON (Tier 2)

```json
{
  "type": "battery_detail",
  "timestamp": 1710064800,
  "stack_id": 0,
  "stack": {
    "voltage_v": 632.0,
    "current_a": -12.5,
    "soc_percent": 55.0,
    "soh_percent": 100.0,
    "working_mode": 0
  },
  "clusters": [
    {
      "id": 0,
      "soc_percent": 55.0,
      "min_cell_voltage_mv": 3288,
      "max_cell_voltage_mv": 3295,
      "min_cell_temp_c": 15,
      "max_cell_temp_c": 17
    }
  ],
  "cell_voltages": [3288, 3290, 3291, 3289, 3295, ...],
  "cell_temps": [15, 16, 15, 17, ...],
  "faults": []
}
```

## 7. Lambda Processing

### Function: `iot-to-telegraf-forwarder`

**ARN**: `arn:aws:lambda:eu-central-1:896709973986:function:iot-to-telegraf-forwarder`

**Routing Logic**:
- Topic contains `/battery/` -> `BATTERY_ABBREV_TO_FULL` normalization + battery transform
- Otherwise -> `ABBREV_TO_FULL` normalization + telemetry transform

**Backward Compatibility**:
- Handles legacy JSON (no encoding), base64-wrapped JSON, and base64-wrapped CBOR
- Unknown keys pass through `normalize_keys()` unchanged
- Battery transform flattens cell arrays to CSV strings for InfluxDB

**Source Code**: `code_reference/aws/lambda/iot-to-telegraf-forwarder/lambda_function.py`

## 8. InfluxDB Storage

### InfluxDB 3 Cloud Serverless

**Buckets**:

| Bucket | Measurement | Retention | Source |
|---|---|---|---|
| `aiess_telemetry` (existing) | `aiess_telemetry` | existing retention | 5s telemetry |
| `battery_detail` | `battery_detail` | 365 days | 60s battery detail |

**Query-Time Aggregation**: InfluxDB 3 Cloud Serverless does not support Flux tasks. Use SQL/InfluxQL `GROUP BY time()` for aggregated views:

```sql
-- 15-minute average cell voltage
SELECT mean("cell_voltage_min"), mean("cell_voltage_max"), mean("cell_voltage_delta")
FROM "battery_detail"
WHERE device_id = 'domagala_1'
GROUP BY time(15m)

-- 1-hour summary
SELECT mean("stack_voltage_v"), mean("stack_current_a"), mean("stack_soc_percent")
FROM "battery_detail"
WHERE device_id = 'domagala_1' AND time > now() - 7d
GROUP BY time(1h)
```

### InfluxDB Fields (Telemetry)

| Field | Type | Description |
|---|---|---|
| `grid_power` | float | Grid power 5s avg (kW) |
| `pcs_power` | float | PCS power (kW) |
| `soc` | float | Battery SoC (%) |
| `compensated_power` | float | Compensated grid (kW) |
| `total_pv_power` | float | Total PV (kW) |
| `active_rule_id` | string | Active rule name |
| `active_rule_priority` | int | Rule priority 1-11 |
| `active_rule_action` | string | Rule action code |
| `active_rule_power` | float | Rule power (kW) |
| `min_cell_voltage_mv` | int | Min cell voltage (mV) |
| `max_cell_voltage_mv` | int | Max cell voltage (mV) |
| `min_cell_temp_c` | int | Min cell temp (°C) |
| `max_cell_temp_c` | int | Max cell temp (°C) |
| `voltage_delta_mv` | int | Voltage delta (mV) |
| `active_fault_count` | int | Number of active faults |
| `active_faults` | string | Comma-separated fault values |
| `schedule_active` | bool | Schedule engine active |
| `pid_active` | bool | PID controller active |
| `grid_meter_online` | bool | Grid meter connected |
| `ems_online` | bool | EMS connected |

### InfluxDB Fields (Battery Detail)

| Field | Type | Description |
|---|---|---|
| `stack_voltage_v` | float | Stack DC voltage |
| `stack_current_a` | float | Stack DC current |
| `stack_soc_percent` | float | Stack SoC |
| `stack_soh_percent` | float | Stack SoH |
| `c0_soc_percent` | float | Cluster 0 SoC |
| `c0_min_cell_voltage_mv` | int | Cluster 0 min voltage |
| `c0_max_cell_voltage_mv` | int | Cluster 0 max voltage |
| `cell_count` | int | Total cell count |
| `cell_voltage_min` | int | Min cell voltage (mV) |
| `cell_voltage_max` | int | Max cell voltage (mV) |
| `cell_voltage_delta` | int | Voltage delta (mV) |
| `cell_voltage_csv` | string | All cell voltages as CSV |
| `ntc_count` | int | Temperature sensor count |
| `cell_temp_min` | int | Min cell temp (°C) |
| `cell_temp_max` | int | Max cell temp (°C) |
| `cell_temp_csv` | string | All cell temps as CSV |
| `fault_count` | int | Active fault count |
| `faults_csv` | string | Fault register values CSV |

Tags: `device_id`, `stack_id`

## 9. Telegraf Configuration (Applied)

EC2 instance `i-0a54d52e77cc141f3` (`ec2_telegraf`) was configured via AWS SSM on 2026-03-10.

### Active Config (`/etc/telegraf/telegraf.conf`)

```toml
# Output 1: Main telemetry -> aiess_v1 bucket (existing)
[[outputs.influxdb_v2]]
  urls = ["https://eu-central-1-1.aws.cloud2.influxdata.com"]
  token = "$INFLUX_TOKEN"
  organization = "aiess"
  bucket = "aiess_v1"
  timeout = "5s"
  content_encoding = "gzip"
  [outputs.influxdb_v2.tagdrop]
    measurement = ["battery_detail"]

# Output 2: Battery detail -> battery_detail bucket (new)
[[outputs.influxdb_v2]]
  urls = ["https://eu-central-1-1.aws.cloud2.influxdata.com"]
  token = "$INFLUX_TOKEN"
  organization = "aiess"
  bucket = "battery_detail"
  timeout = "5s"
  content_encoding = "gzip"
  [outputs.influxdb_v2.tagpass]
    measurement = ["battery_detail"]

# HTTP Listener v2 - receives data from Lambda
[[inputs.http_listener_v2]]
  service_address = ":8080"
  paths = ["/iot/webhook", "/iot/webhook/"]
  methods = ["POST", "PUT"]
  read_timeout = "10s"
  write_timeout = "10s"
  max_body_size = "1MB"
  data_format = "json"
  json_time_key = "timestamp"
  json_time_format = "unix"
  tag_keys = ["topic", "site_id", "measurement"]
  json_string_fields = ["active_rule_id", "active_rule_action", "active_faults",
                        "cell_voltage_csv", "cell_temp_csv", "faults_csv"]
  name_override = "energy_telemetry"
```

### Routing Logic

- Lambda sets `measurement: "battery_detail"` for battery messages (no `measurement` field for telemetry)
- Telegraf parses `measurement` as a tag via `tag_keys`
- Output 1 (`aiess_v1`): `tagdrop` drops anything tagged `measurement=battery_detail`
- Output 2 (`battery_detail`): `tagpass` only accepts `measurement=battery_detail`
- System metrics (cpu, disk, mem) have no `measurement` tag, so they go to `aiess_v1` only

### InfluxDB Buckets

| Bucket | Data | Retention | Created |
|---|---|---|---|
| `aiess_v1` | Main 5s telemetry (`energy_telemetry` measurement) + sim platform data | 90 days | Pre-existing (shared, do not delete) |
| `battery_detail` | Cell-level 60s battery health data | 365 days | Recreated clean 2026-03-10 (bucket ID `1934b8efa4680f5a`) |

#### `battery_detail` Schema (Clean)

**Tags:** `site_id`, `measurement`, `topic`, `host`

**Fields (20):**

| Field | Type | Description |
|---|---|---|
| `c0_soc_percent` | float | Cluster 0 SoC |
| `c0_min_cell_voltage_mv` | float | Cluster 0 min cell voltage (mV) |
| `c0_max_cell_voltage_mv` | float | Cluster 0 max cell voltage (mV) |
| `c0_min_cell_temp_c` | float | Cluster 0 min cell temp (degC) |
| `c0_max_cell_temp_c` | float | Cluster 0 max cell temp (degC) |
| `stack_voltage_v` | float | Stack DC voltage (V) |
| `stack_current_a` | float | Stack DC current (A) |
| `stack_soc_percent` | float | Stack SoC (%) |
| `stack_soh_percent` | float | Stack SoH (%) |
| `stack_wm` | float | Stack working mode |
| `stack_id` | float | Stack index (0 for single-stack) |
| `cell_count` | float | Total cell count (e.g. 192) |
| `cell_voltage_min` | float | Min cell voltage (mV) |
| `cell_voltage_max` | float | Max cell voltage (mV) |
| `cell_voltage_delta` | float | Voltage delta max-min (mV) |
| `cell_voltage_csv` | string | All cell voltages as CSV |
| `ntc_count` | float | Temperature sensor count |
| `cell_temp_min` | float | Min cell temp (degC) |
| `cell_temp_max` | float | Max cell temp (degC) |
| `cell_temp_csv` | string | All cell temps as CSV |

## 10. AWS IoT Rules

| Rule Name | SQL | Topic Filter | Lambda |
|---|---|---|---|
| `route_telemetry_to_ec2_https` | `SELECT encode(*, 'base64') AS data, topic() as topic FROM 'aiess/+/telemetry'` | `aiess/+/telemetry` | `iot-to-telegraf-forwarder` |
| `route_battery_to_ec2` | `SELECT encode(*, 'base64') AS data, topic() as topic FROM 'aiess/+/battery/+'` | `aiess/+/battery/+` | `iot-to-telegraf-forwarder` |

Both rules use base64 encoding to handle CBOR binary payloads.

## 11. Mobile App Integration (InfluxDB)

The mobile app queries InfluxDB Cloud Serverless directly via HTTP -- no MQTT connections or CBOR decoding needed. Data arrives pre-decoded and flattened by the Lambda/Telegraf pipeline.

### InfluxDB Connection Details

| Parameter | Value |
|---|---|
| API URL | `https://eu-central-1-1.aws.cloud2.influxdata.com` |
| Organization | `aiess` |
| Telemetry Bucket | `aiess_v1` |
| Battery Bucket | `battery_detail` |
| Auth | `Token <API_TOKEN>` header |
| Query Language | SQL (InfluxDB v3) or InfluxQL |

### iOS (Swift) -- Query Examples

**Latest telemetry for a device:**

```swift
import Foundation

struct InfluxQuery {
    static let baseURL = "https://eu-central-1-1.aws.cloud2.influxdata.com"
    static let token = "YOUR_READ_ONLY_TOKEN"

    static func query(sql: String, database: String) async throws -> Data {
        var request = URLRequest(url: URL(string: "\(baseURL)/api/v2/query")!)
        request.httpMethod = "POST"
        request.setValue("Token \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/csv", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "query": sql,
            "database": database,
            "type": "sql"
        ])
        let (data, _) = try await URLSession.shared.data(for: request)
        return data
    }
}

// Latest telemetry snapshot
let telemetry = try await InfluxQuery.query(
    sql: """
        SELECT time, grid_power, pcs_power, soc, total_pv_power,
               min_cell_voltage_mv, max_cell_voltage_mv, voltage_delta_mv,
               min_cell_temp_c, max_cell_temp_c, active_faults
        FROM energy_telemetry
        WHERE site_id = 'domagala_1'
        ORDER BY time DESC
        LIMIT 1
        """,
    database: "aiess_v1"
)
```

**Telemetry history (last 24h, 5-min averages):**

```swift
let history = try await InfluxQuery.query(
    sql: """
        SELECT DATE_BIN(INTERVAL '5 minutes', time) AS t,
               AVG(grid_power) AS grid_power_avg,
               AVG(pcs_power) AS pcs_power_avg,
               AVG(soc) AS soc_avg,
               AVG(total_pv_power) AS pv_avg
        FROM energy_telemetry
        WHERE site_id = 'domagala_1'
          AND time >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_BIN(INTERVAL '5 minutes', time)
        ORDER BY t
        """,
    database: "aiess_v1"
)
```

**Latest battery detail:**

```swift
let battery = try await InfluxQuery.query(
    sql: """
        SELECT time, stack_voltage_v, stack_current_a, stack_soc_percent,
               stack_soh_percent, cell_count, cell_voltage_min, cell_voltage_max,
               cell_voltage_delta, cell_temp_min, cell_temp_max,
               cell_voltage_csv, cell_temp_csv, fault_count, faults_csv
        FROM energy_telemetry
        WHERE site_id = 'domagala_1'
          AND measurement = 'battery_detail'
        ORDER BY time DESC
        LIMIT 1
        """,
    database: "battery_detail"
)
```

**Cell voltage heatmap (last 1h, per-cell):**

```swift
let cellData = try await InfluxQuery.query(
    sql: """
        SELECT time, cell_voltage_csv, cell_temp_csv, cell_count
        FROM energy_telemetry
        WHERE site_id = 'domagala_1'
          AND measurement = 'battery_detail'
          AND time >= NOW() - INTERVAL '1 hour'
        ORDER BY time
        """,
    database: "battery_detail"
)
// Parse cell_voltage_csv: "3312,3310,3315,..." -> [Int] per row
// Build heatmap: rows = time, columns = cell index, color = voltage
```

### Response Format

InfluxDB v3 returns CSV by default when `Accept: text/csv`:

```csv
time,grid_power,pcs_power,soc,total_pv_power,min_cell_voltage_mv,max_cell_voltage_mv,voltage_delta_mv
2026-03-10T12:00:00Z,2.45,-5.0,78.3,3.2,3310,3340,30
```

For JSON, set `Accept: application/json`:

```json
[
  {
    "time": "2026-03-10T12:00:00Z",
    "grid_power": 2.45,
    "pcs_power": -5.0,
    "soc": 78.3,
    "total_pv_power": 3.2,
    "min_cell_voltage_mv": 3310,
    "max_cell_voltage_mv": 3340,
    "voltage_delta_mv": 30
  }
]
```

### Common Query Patterns

| Use Case | SQL Pattern | Bucket |
|---|---|---|
| Latest reading | `ORDER BY time DESC LIMIT 1` | `aiess_v1` |
| 24h history (5m avg) | `DATE_BIN('5 minutes', time)` + `AVG()` | `aiess_v1` |
| 7d history (1h avg) | `DATE_BIN('1 hour', time)` + `AVG()` | `aiess_v1` |
| 30d history (1d avg) | `DATE_BIN('1 day', time)` + `AVG()` | `aiess_v1` |
| Energy totals | `SUM(grid_power) * 5/3600` (kWh from 5s samples) | `aiess_v1` |
| Battery snapshot | `ORDER BY time DESC LIMIT 1` | `battery_detail` |
| Cell voltage trend | `WHERE time >= NOW() - INTERVAL '1 hour'` | `battery_detail` |
| Fault history | `WHERE fault_count > 0 ORDER BY time DESC` | `battery_detail` |

### Why InfluxDB Instead of MQTT

| Aspect | MQTT (Direct) | InfluxDB (Recommended) |
|---|---|---|
| Connection | Persistent WebSocket | Stateless HTTP |
| Auth | AWS IoT certificates per device | Single read-only API token |
| Data scope | Real-time only (current) | Historical + real-time |
| Aggregation | Client-side | Server-side SQL (DATE_BIN, AVG) |
| Payload format | CBOR (needs decoding) | JSON/CSV (pre-decoded) |
| Offline devices | No data when offline | Data persisted up to 365d |
| Battery usage | High (persistent connection) | Low (poll on demand) |
| Cell-level data | Parse raw arrays | CSV strings, pre-computed min/max |

### Key Notes for Mobile Developers

1. **Sign convention**: `pcs_power` negative = charging, positive = discharging.
2. **Temperature offset**: Cell temps are already offset-corrected (degC). No post-processing needed.
3. **Faults**: `active_faults` is a comma-separated string of BMS fault register values. Empty = healthy. Decode using `bms_fault_codes.json`.
4. **Voltage delta**: `voltage_delta_mv` is precomputed (max - min). Values > 50mV may indicate cell imbalance.
5. **Cell data CSV**: `cell_voltage_csv` and `cell_temp_csv` are comma-separated strings. Split on `,` to get per-cell arrays. Index 0 = cell 1.
6. **Stack ID**: Currently always 0 for single-stack systems. Future multi-stack will use `stack_id` tag.
7. **Polling interval**: Telemetry updates every 5s; battery detail every 60s. Poll accordingly.
8. **API token**: Use a **read-only** token for mobile. Never embed write tokens in the app binary.

### Health Indicators for Mobile UI

| Metric | Healthy Range | Warning | Critical |
|---|---|---|---|
| `voltage_delta_mv` | 0-30 mV | 30-80 mV | > 80 mV |
| `min_cell_voltage_mv` | 3000-3650 mV | 2800-3000 mV | < 2800 mV |
| `max_cell_voltage_mv` | 3000-3650 mV | 3650-3750 mV | > 3750 mV |
| `min_cell_temp_c` | 10-45 degC | 0-10 degC | < 0 degC |
| `max_cell_temp_c` | 10-45 degC | 45-55 degC | > 55 degC |
| `active_faults` | empty | 1-2 faults | > 2 faults |
| `soh_percent` | > 90% | 80-90% | < 80% |

## 12. Size & Bandwidth Estimates

| Metric | Main Telemetry (5s) | Battery Detail (60s) |
|---|---|---|
| CBOR payload | ~156 bytes | ~350-768 bytes |
| Daily bandwidth | ~2.7 MB | ~0.5-1.1 MB |
| Monthly per device | ~80 MB | ~15-33 MB |
| Buffer on disk | ~100 MB (shared) | shared with telemetry |
| QoS 1 PUBACK overhead | 4 bytes/msg | 4 bytes/msg |

### Configurable Intervals

- Main telemetry: 1-60s (default 5s), via `aws_config.json` `publish_interval_sec`
- Battery detail: fixed 60s (hardcoded in daemon loop)
- Fault register polling: every 5s
- Cell voltage/temp reading: every 10s

---

## Changelog

- **v2.0.3-fix.1**: Fixed gateway aggregation zeroing Tier 1 battery fields; `aggregate_calculate_average()` now copies latest sample for mnv/mxv/mnt/mxt/af
- **v2.0.3**: Added Tier 1 battery fields (mnv, mxv, mnt, mxt, vd, af) and Tier 2 battery detail topic
- **v2.0.2-dev.1**: CBOR abbreviated keys (68% reduction from JSON)
- **v2.0.2**: Initial CBOR encoding support with configurable publish interval
