# AIESS Energy Core — Data Sources

All telemetry and price data is stored in **InfluxDB Cloud Serverless (v3.0)**, hosted in `eu-central-1`. The AI agent queries this data via the Flux HTTP API.

---

## Connection Details

| Parameter | Value |
|-----------|-------|
| URL | `https://eu-central-1-1.aws.cloud2.influxdata.com` |
| Organization | `aiess` |
| Auth | Token-based (`Authorization: Token <INFLUX_TOKEN>`) |
| API endpoint | `POST /api/v2/query?org=aiess` |
| Content-Type | `application/vnd.flux` |
| Response format | CSV (parsed by `_parse_csv_response()` in `influx_client.py`) |

---

## Buckets Overview

### Energy Telemetry Buckets

| Bucket | Resolution | Retention | Use Case |
|--------|-----------|-----------|----------|
| `aiess_v1` | 5 seconds (raw) | 90 days | Real-time status, last 2 minutes |
| `aiess_v1_1m` | 1 minute (aggregated) | 180 days | Short-range charts/analysis (≤48h) |
| `aiess_v1_15m` | 15 minutes (aggregated) | 1,095 days (~3 years) | Medium-range analysis (≤7 days) |
| `aiess_v1_1h` | 1 hour (aggregated) | 3,650 days (~10 years) | Long-range analysis (>7 days) |

### Other Buckets

| Bucket | Resolution | Retention | Use Case |
|--------|-----------|-----------|----------|
| `tge_energy_prices` | 1 hour | Long-term | Polish electricity market prices |

---

## Measurement: `energy_telemetry`

### Tags

| Tag | Values | Notes |
|-----|--------|-------|
| `site_id` | `domagala_1` | Single-site system |
| `host` | (varies) | Raw bucket only |
| `topic` | (varies) | Raw bucket only |
| `aggregation` | `1m`, `15m`, `1h` | Aggregated buckets only — **must filter on this** |

### Raw Fields (bucket `aiess_v1`)

| Field | Unit | Sign Convention |
|-------|------|----------------|
| `grid_power` | kW | + importing from grid, − exporting to grid |
| `pcs_power` | kW | + discharging, − charging |
| `soc` | % | 0–100 |
| `total_pv_power` | kW | Always ≥ 0 |
| `compensated_power` | kW | Power after compensation |
| `active_rule_id` | string | ID of currently executing rule (firmware v1.5+) |
| `active_rule_priority` | string | Priority level of executing rule |
| `active_rule_action` | string | Action type being executed (ch, dis, sb, etc.) |
| `active_rule_power` | kW | Commanded power setpoint (+ discharge, − charge) |

### Aggregated Fields (buckets `aiess_v1_1m/15m/1h`)

For each numeric raw field, three aggregated variants exist:

| Suffix | Meaning |
|--------|---------|
| `_mean` | Average value over the window |
| `_min` | Minimum value over the window |
| `_max` | Maximum value over the window |

Full list: `grid_power_mean`, `grid_power_min`, `grid_power_max`, `pcs_power_mean`, `pcs_power_min`, `pcs_power_max`, `soc_mean`, `soc_min`, `soc_max`, `total_pv_power_mean`, `total_pv_power_min`, `total_pv_power_max`, `compensated_power_mean`, `compensated_power_min`, `compensated_power_max`, `sample_count`.

String fields (active rule tracking) use `LAST_VALUE` in aggregation:
`active_rule_id`, `active_rule_priority`, `active_rule_action`, `active_rule_power`.

---

## Measurement: `rule_config`

Stored in the `aiess_v1_1m` bucket. Snapshots of the device shadow rule configuration, taken every 1 minute by the `aiess-rule-snapshot` Lambda.

### Tags

| Tag | Values |
|-----|--------|
| `site_id` | `domagala_1` |
| `rule_id` | The rule's `id` field |
| `priority` | Priority level string (e.g., `"7"`) |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `action_type` | string | `ch`, `dis`, `sb`, `sl`, `ct`, `dt` |
| `power_kw` | float | Power setting (if applicable) |
| `soc_target` | float | Target SoC (for ct/dt) |
| `time_start` | integer | HHMM start time |
| `time_end` | integer | HHMM end time |
| `is_active` | integer | 1 = active, 0 = expired/invalid |
| `valid_until` | integer | Unix timestamp (0 = permanent) |
| `source` | string | `"ai"` or `"man"` |
| `rule_count` | integer | Total rules configured at snapshot time |
| `mode` | string | System mode at snapshot time |

---

## Measurement: `energy_prices` (TGE)

Stored in the `tge_energy_prices` bucket. Hourly Polish electricity spot market prices.

### Tags

| Tag | Values |
|-----|--------|
| `source` | `"real"` |

### Fields

| Field | Unit | Description |
|-------|------|-------------|
| `price` | PLN/MWh | TGE spot electricity price (divide by 1000 for PLN/kWh) |
| `volume` | MWh | Trading volume for the hour |
| `peak_offpeak_price` | PLN/MWh | Peak/off-peak price indicator |
| `peak_offpeak_spread` | PLN/MWh | Spread between peak and off-peak |
| `peak_offpeak_volume` | MWh | Peak/off-peak volume |

---

## Auto Bucket Selection

The AI agent's `influx_client.py` automatically picks the best bucket for a given time range.

### For general queries (`_pick_bucket`):

```
hours ≤ 48   → aiess_v1_1m   (1-minute data)
hours ≤ 168  → aiess_v1_15m  (15-minute data)
hours > 168  → aiess_v1_1h   (1-hour data)
```

### For chart rendering (`_pick_chart_bucket`):

Optimized to yield ~300–500 data points for smooth chart rendering:

```
hours ≤ 8    → aiess_v1_1m   (8h × 60/1m = 480 points)
hours ≤ 125  → aiess_v1_15m  (125h × 4/15m = 500 points)
hours > 125  → aiess_v1_1h
```

The `limit(n:)` clause is dynamically calculated:
```python
max_points = int((effective_hours * 60) / resolution_minutes) + 10
```

---

## Period Resolution

The `_resolve_period()` function converts named periods into absolute Flux range parameters.

| Period | Flux `start` | Flux `stop` | Approx Hours |
|--------|-------------|-------------|--------------|
| `today` | Today 00:00 UTC | `now()` | Dynamic |
| `yesterday` | Yesterday 00:00 UTC | Today 00:00 UTC | 24 |
| `this_week` | Monday 00:00 UTC | `now()` | Dynamic |
| `last_week` | Prev Monday 00:00 UTC | This Monday 00:00 UTC | 168 |
| (none, hours=N) | `-Nh` | `now()` | N |

**Default behavior**: When the user says "dziś" (today), the agent uses `period: "today"` which means from midnight, NOT the last 24 hours. Only explicit "ostatnie 24h" maps to `hours: 24`.

---

## Flux Query Patterns

### Real-time status (last reading)

```flux
from(bucket: "aiess_v1")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "domagala_1")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc" or r._field == "total_pv_power" or r._field == "compensated_power")
  |> last()
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### Aggregated summary (mean of means)

```flux
from(bucket: "aiess_v1_1m")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "domagala_1")
  |> filter(fn: (r) => r.aggregation == "1m")
  |> filter(fn: (r) => r._field == "grid_power_mean" or r._field == "pcs_power_mean" or r._field == "soc_mean")
  |> group(columns: ["_field"])
  |> mean()
```

### Active rule history

```flux
from(bucket: "aiess_v1_1m")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "domagala_1")
  |> filter(fn: (r) => r.aggregation == "1m")
  |> filter(fn: (r) =>
      r._field == "active_rule_id" or r._field == "active_rule_priority" or
      r._field == "active_rule_action" or r._field == "active_rule_power" or
      r._field == "soc_mean" or r._field == "pcs_power_mean")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => exists r.active_rule_id and r.active_rule_id != "")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 500)
```

### Chart data with period

```flux
from(bucket: "aiess_v1_15m")
  |> range(start: 2026-02-03T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "domagala_1")
  |> filter(fn: (r) => r.aggregation == "15m")
  |> filter(fn: (r) => r._field == "grid_power_mean" or r._field == "pcs_power_mean" or r._field == "soc_mean")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
  |> limit(n: 510)
```

### TGE prices

```flux
from(bucket: "tge_energy_prices")
  |> range(start: 2026-02-09T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "energy_prices")
  |> filter(fn: (r) => r._field == "price")
  |> sort(columns: ["_time"])
  |> limit(n: 34)
```

---

## Data Pipeline

```
Edge Device (5s MQTT) → AWS IoT Core → Lambda forwarder → Telegraf (EC2) → aiess_v1

EventBridge (1m) → Lambda 1m aggregator → aiess_v1_1m
EventBridge (15m) → Lambda 15m aggregator → aiess_v1_15m
EventBridge (1h) → Lambda 1h aggregator → aiess_v1_1h

EventBridge (1m) → Lambda rule-snapshot → aiess_v1_1m (rule_config measurement)

External script → tge_energy_prices
```

### Lambda Forwarder

`iot-to-telegraf-forwarder` transforms the raw MQTT JSON payload into InfluxDB line protocol:
- Extracts numeric fields (`grid_power`, `pcs_power`, `soc`, etc.)
- Extracts string fields (`active_rule_id`, `active_rule_priority`, `active_rule_action`)
- Extracts `active_rule_power` as a float
- POSTs to Telegraf HTTP input on EC2 (`3.66.189.107:8080`)

### Aggregation Lambdas

Each runs on a scheduled EventBridge event and:
1. Queries the source bucket (raw or previous aggregation tier)
2. Computes `MEAN`, `MIN`, `MAX` for numeric fields via SQL
3. Computes `LAST_VALUE` for string fields (active rule tracking)
4. Writes results to the target aggregated bucket via `influxdb_client_3` with PyArrow
