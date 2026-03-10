# AIESS InfluxDB Buckets Schema Reference

> **Purpose**: Complete reference for querying InfluxDB energy telemetry data in AIESS mobile app charts and analytics.  
> **Target**: React Native / Expo mobile application  
> **Last Updated**: December 2025

---

## 📋 Table of Contents

1. [Connection Configuration](#connection-configuration)
2. [Buckets Overview](#buckets-overview)
3. [Data Schema](#data-schema)
4. [HTTP API Reference](#http-api-reference)
5. [Query Examples - Flux](#query-examples---flux)
6. [Query Examples - SQL](#query-examples---sql)
7. [Mobile App Query Patterns](#mobile-app-query-patterns)
8. [Time Range to Bucket Mapping](#time-range-to-bucket-mapping)
9. [Aggregation Pipeline](#aggregation-pipeline)
10. [Response Parsing](#response-parsing)
11. [Error Handling](#error-handling)
12. [Best Practices](#best-practices)

---

## Connection Configuration

### Environment Variables

```bash
EXPO_PUBLIC_INFLUX_URL=https://eu-central-1-1.aws.cloud2.influxdata.com
EXPO_PUBLIC_INFLUX_ORG=aiess
EXPO_PUBLIC_INFLUX_TOKEN=<your-read-only-token>
```

### Connection Details

| Property | Value |
|----------|-------|
| **Host** | `https://eu-central-1-1.aws.cloud2.influxdata.com` |
| **Organization** | `aiess` |
| **Region** | EU Central (Frankfurt) |
| **Protocol** | HTTPS (TLS 1.2+) |
| **API Version** | v2 (InfluxDB 3.0 Cloud Serverless) |

### Authentication

- **Method**: Token-based authentication
- **Header**: `Authorization: Token <your-token>`
- **Token Permissions**: Read-only for mobile app (write tokens for backend only)

---

## Buckets Overview

### Available Buckets

| Bucket | Resolution | Retention | Primary Use Case |
|--------|------------|-----------|------------------|
| `aiess_v1` | 5 seconds | 90 days | Live dashboard, real-time monitoring |
| `aiess_v1_1m` | 1 minute | 365 days | Daily charts, hourly trends |
| `aiess_v1_15m` | 15 minutes | 3 years | Weekly/monthly analytics |
| `aiess_v1_1h` | 1 hour | 10 years | Long-term trends, yearly reports |

### Data Points Density

| Bucket | Points/Hour | Points/Day | Points/Week | Points/Month |
|--------|-------------|------------|-------------|--------------|
| `aiess_v1` | 720 | 17,280 | 120,960 | ~518,400 |
| `aiess_v1_1m` | 60 | 1,440 | 10,080 | ~43,200 |
| `aiess_v1_15m` | 4 | 96 | 672 | ~2,880 |
| `aiess_v1_1h` | 1 | 24 | 168 | ~720 |

### Bucket Selection Guide

| Time Range | Recommended Bucket | Reason |
|------------|-------------------|--------|
| Last 5 minutes (live) | `aiess_v1` | Real-time 5-second data |
| Last 1 hour | `aiess_v1` or `aiess_v1_1m` | High resolution |
| Last 24 hours | `aiess_v1_1m` | 1-minute resolution, ~1,440 points |
| Last 7 days | `aiess_v1_15m` | 15-minute resolution, ~672 points |
| Last 30 days | `aiess_v1_1h` | Hourly resolution, ~720 points |
| Last 90+ days | `aiess_v1_1h` | Long-term trends |

---

## Data Schema

### Measurement

All buckets use the same measurement name:
```
energy_telemetry
```

### Raw Data Schema (`aiess_v1`)

```
measurement: energy_telemetry
tags:
  - site_id: string          # Device/site identifier (e.g., "domagala_1")

fields:
  - grid_power: float        # Grid power in kW (+ = import, - = export)
  - pcs_power: float         # Battery power in kW (+ = discharge, - = charge)
  - soc: float               # State of Charge 0-100%
  - total_pv_power: float    # Solar PV power in kW
  - compensated_power: float # Compensated power in kW

time: timestamp              # 5-second intervals (e.g., :00, :05, :10, :15...)
```

### Aggregated Data Schema (`aiess_v1_1m`, `aiess_v1_15m`, `aiess_v1_1h`)

```
measurement: energy_telemetry
tags:
  - site_id: string          # Device/site identifier
  - aggregation: string      # Aggregation level: "1m", "15m", or "1h"

fields:
  # Grid Power (kW)
  - grid_power_mean: float   # Average grid power in window
  - grid_power_min: float    # Minimum grid power in window
  - grid_power_max: float    # Maximum grid power in window
  
  # Battery Power (kW)
  - pcs_power_mean: float    # Average battery power
  - pcs_power_min: float     # Minimum battery power
  - pcs_power_max: float     # Maximum battery power
  
  # State of Charge (%)
  - soc_mean: float          # Average SoC
  - soc_min: float           # Minimum SoC
  - soc_max: float           # Maximum SoC
  
  # Solar PV Power (kW)
  - total_pv_power_mean: float
  - total_pv_power_min: float
  - total_pv_power_max: float
  
  # Compensated Power (kW)
  - compensated_power_mean: float
  - compensated_power_min: float
  - compensated_power_max: float
  
  # Sample Count
  - sample_count: integer    # Number of raw samples in aggregation window

time: timestamp              # Start of aggregation window
```

### Field Value Conventions

| Field | Positive Value | Negative Value | Unit |
|-------|---------------|----------------|------|
| `grid_power` | Importing from grid | Exporting to grid | kW |
| `pcs_power` | Discharging battery | Charging battery | kW |
| `total_pv_power` | Solar production | N/A (always ≥0) | kW |
| `soc` | Battery level (0-100) | N/A | % |
| `compensated_power` | Power compensation active | N/A | kW |

### Derived Values (Calculate in App)

```typescript
// Factory Load = Grid + PV + Battery
factoryLoad = Math.max(0, gridPower + pvPower + batteryPower);

// Battery Status
batteryStatus = batteryPower < -0.5 ? 'Charging' 
              : batteryPower > 0.5 ? 'Discharging' 
              : 'Standby';

// Self-Consumption Rate
selfConsumption = pvPower > 0 ? (1 - gridExport / pvPower) * 100 : 0;

// Grid Independence
gridIndependence = factoryLoad > 0 ? ((pvPower + batteryDischarge) / factoryLoad) * 100 : 100;
```

---

## HTTP API Reference

### Query Endpoint

```
POST https://eu-central-1-1.aws.cloud2.influxdata.com/api/v2/query?org=aiess
```

### Required Headers

| Header | Value | Description |
|--------|-------|-------------|
| `Authorization` | `Token <token>` | API authentication token |
| `Content-Type` | `application/vnd.flux` | For Flux queries |
| `Accept` | `application/csv` | Response format |

### Alternative Content Types

| Query Language | Content-Type |
|---------------|--------------|
| Flux | `application/vnd.flux` |
| SQL | `application/sql` (or use `/api/v2/query/sql`) |

### TypeScript Client Setup

```typescript
const INFLUX_URL = process.env.EXPO_PUBLIC_INFLUX_URL;
const INFLUX_ORG = process.env.EXPO_PUBLIC_INFLUX_ORG;
const INFLUX_TOKEN = process.env.EXPO_PUBLIC_INFLUX_TOKEN;

async function queryInflux(fluxQuery: string): Promise<string> {
  const response = await fetch(
    `${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv',
      },
      body: fluxQuery,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`InfluxDB error: ${response.status} - ${error}`);
  }

  return response.text();
}
```

---

## Query Examples - Flux

### 1. Live Data (Last 5 Minutes)

**Use Case**: Real-time dashboard, current values

```flux
from(bucket: "aiess_v1")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => 
      r._field == "grid_power" or 
      r._field == "total_pv_power" or 
      r._field == "pcs_power" or 
      r._field == "soc"
  )
  |> last()
```

### 2. Hourly Chart (Last 24 Hours)

**Use Case**: Daily power flow chart

```flux
from(bucket: "aiess_v1_1m")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r.aggregation == "1m")
  |> filter(fn: (r) => 
      r._field == "grid_power_mean" or 
      r._field == "pcs_power_mean" or 
      r._field == "total_pv_power_mean" or 
      r._field == "soc_mean"
  )
  |> aggregateWindow(every: 15m, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### 3. Weekly Chart (Last 7 Days)

**Use Case**: Weekly trends, energy patterns

```flux
from(bucket: "aiess_v1_15m")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r.aggregation == "15m")
  |> filter(fn: (r) => 
      r._field == "grid_power_mean" or 
      r._field == "pcs_power_mean" or 
      r._field == "total_pv_power_mean" or 
      r._field == "soc_mean"
  )
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### 4. Monthly Chart (Last 30 Days)

**Use Case**: Monthly analytics, long-term patterns

```flux
from(bucket: "aiess_v1_1h")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r.aggregation == "1h")
  |> filter(fn: (r) => 
      r._field == "grid_power_mean" or 
      r._field == "pcs_power_mean" or 
      r._field == "total_pv_power_mean" or 
      r._field == "soc_mean"
  )
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### 5. Daily Energy Totals

**Use Case**: Energy consumption/production summaries

```flux
from(bucket: "aiess_v1_1h")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r.aggregation == "1h")
  |> filter(fn: (r) => r._field == "grid_power_mean")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> map(fn: (r) => ({ r with _value: r._value * 24.0 }))  // kW to kWh/day
```

### 6. Peak Power Analysis

**Use Case**: Find peak grid demand times

```flux
from(bucket: "aiess_v1_1m")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r._field == "grid_power_max")
  |> max()
```

### 7. Battery Cycle Analysis

**Use Case**: Track charge/discharge patterns

```flux
from(bucket: "aiess_v1_15m")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r._field == "soc_mean" or r._field == "pcs_power_mean")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### 8. Multi-Site Comparison

**Use Case**: Compare performance across sites

```flux
from(bucket: "aiess_v1_1h")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.aggregation == "1h")
  |> filter(fn: (r) => r._field == "grid_power_mean")
  |> group(columns: ["site_id"])
  |> mean()
```

---

## Query Examples - SQL

### SQL Query Endpoint

```
POST https://eu-central-1-1.aws.cloud2.influxdata.com/api/v2/query?org=aiess
Content-Type: application/sql
```

Or use the dedicated SQL endpoint:
```
POST https://eu-central-1-1.aws.cloud2.influxdata.com/query
```

### 1. Latest Values (SQL)

```sql
SELECT 
    time,
    site_id,
    grid_power,
    pcs_power,
    soc,
    total_pv_power
FROM energy_telemetry
WHERE site_id = 'domagala_1'
  AND time >= now() - INTERVAL '5 minutes'
ORDER BY time DESC
LIMIT 1
```

### 2. Hourly Aggregation (SQL)

```sql
SELECT 
    DATE_BIN(INTERVAL '1 hour', time, TIMESTAMP '1970-01-01T00:00:00Z') AS time_bucket,
    site_id,
    AVG(grid_power_mean) AS avg_grid_power,
    AVG(pcs_power_mean) AS avg_battery_power,
    AVG(soc_mean) AS avg_soc,
    AVG(total_pv_power_mean) AS avg_pv_power
FROM energy_telemetry
WHERE site_id = 'domagala_1'
  AND aggregation = '1m'
  AND time >= now() - INTERVAL '24 hours'
GROUP BY time_bucket, site_id
ORDER BY time_bucket ASC
```

### 3. Daily Statistics (SQL)

```sql
SELECT 
    DATE_TRUNC('day', time) AS day,
    site_id,
    AVG(grid_power_mean) AS avg_grid_power,
    MIN(grid_power_min) AS min_grid_power,
    MAX(grid_power_max) AS max_grid_power,
    AVG(soc_mean) AS avg_soc,
    AVG(total_pv_power_mean) AS avg_pv_power
FROM energy_telemetry
WHERE site_id = 'domagala_1'
  AND aggregation = '1h'
  AND time >= now() - INTERVAL '30 days'
GROUP BY day, site_id
ORDER BY day ASC
```

### 4. Energy Calculation (SQL)

```sql
-- Daily energy in kWh (average power × hours)
SELECT 
    DATE_TRUNC('day', time) AS day,
    site_id,
    SUM(CASE WHEN grid_power_mean > 0 THEN grid_power_mean ELSE 0 END) AS grid_import_kwh,
    SUM(CASE WHEN grid_power_mean < 0 THEN ABS(grid_power_mean) ELSE 0 END) AS grid_export_kwh,
    SUM(total_pv_power_mean) AS pv_production_kwh
FROM energy_telemetry
WHERE site_id = 'domagala_1'
  AND aggregation = '1h'
  AND time >= now() - INTERVAL '30 days'
GROUP BY day, site_id
ORDER BY day ASC
```

---

## Mobile App Query Patterns

### Pattern 1: Live Dashboard Data

**Refresh**: Every 5-10 seconds

```typescript
export async function fetchLiveData(siteId: string): Promise<LiveData | null> {
  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => 
          r._field == "grid_power" or 
          r._field == "total_pv_power" or 
          r._field == "pcs_power" or 
          r._field == "soc"
      )
      |> last()
  `;
  
  const csv = await queryInflux(query);
  const rows = parseInfluxCSV(csv);
  
  // Parse and return LiveData object
  // See Response Parsing section for implementation
}
```

### Pattern 2: Time Series Chart Data

**Use Case**: Line charts, area charts

```typescript
interface ChartDataPoint {
  time: Date;
  gridPower: number;
  batteryPower: number;
  pvPower: number;
  soc: number;
}

export async function fetchChartData(
  siteId: string,
  timeRange: '1h' | '24h' | '7d' | '30d'
): Promise<ChartDataPoint[]> {
  const config = {
    '1h':  { bucket: 'aiess_v1',     start: '-1h',  window: '1m' },
    '24h': { bucket: 'aiess_v1_1m',  start: '-24h', window: '15m', aggTag: '1m' },
    '7d':  { bucket: 'aiess_v1_15m', start: '-7d',  window: '1h',  aggTag: '15m' },
    '30d': { bucket: 'aiess_v1_1h',  start: '-30d', window: '6h',  aggTag: '1h' },
  }[timeRange];

  const fieldSuffix = config.aggTag ? '_mean' : '';
  const aggFilter = config.aggTag 
    ? `|> filter(fn: (r) => r.aggregation == "${config.aggTag}")` 
    : '';

  const query = `
    from(bucket: "${config.bucket}")
      |> range(start: ${config.start})
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      ${aggFilter}
      |> filter(fn: (r) => 
          r._field == "grid_power${fieldSuffix}" or 
          r._field == "pcs_power${fieldSuffix}" or 
          r._field == "total_pv_power${fieldSuffix}" or 
          r._field == "soc${fieldSuffix}"
      )
      |> aggregateWindow(every: ${config.window}, fn: mean, createEmpty: false)
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;
  
  const csv = await queryInflux(query);
  return parseChartData(csv, fieldSuffix);
}
```

### Pattern 3: Statistics Summary

**Use Case**: Dashboard cards, KPI widgets

```typescript
interface EnergyStats {
  avgGridPower: number;
  maxGridPower: number;
  minGridPower: number;
  avgSoc: number;
  totalPvProduction: number;  // kWh estimate
}

export async function fetchDailyStats(siteId: string): Promise<EnergyStats> {
  const query = `
    from(bucket: "aiess_v1_1m")
      |> range(start: -24h)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r.aggregation == "1m")
      |> filter(fn: (r) => 
          r._field == "grid_power_mean" or 
          r._field == "grid_power_max" or 
          r._field == "soc_mean" or 
          r._field == "total_pv_power_mean"
      )
  `;
  
  const csv = await queryInflux(query);
  return calculateStats(csv);
}
```

### Pattern 4: Historical Comparison

**Use Case**: Compare today vs yesterday, this week vs last week

```typescript
export async function fetchComparison(
  siteId: string,
  periodA: { start: string; end: string },
  periodB: { start: string; end: string }
): Promise<{ periodA: EnergyStats; periodB: EnergyStats }> {
  // Query both periods and compare
  const queryA = buildStatsQuery(siteId, periodA.start, periodA.end);
  const queryB = buildStatsQuery(siteId, periodB.start, periodB.end);
  
  const [csvA, csvB] = await Promise.all([
    queryInflux(queryA),
    queryInflux(queryB)
  ]);
  
  return {
    periodA: calculateStats(csvA),
    periodB: calculateStats(csvB)
  };
}
```

---

## Time Range to Bucket Mapping

### Automatic Bucket Selection

```typescript
function selectBucket(timeRangeHours: number): BucketConfig {
  if (timeRangeHours <= 1) {
    return {
      bucket: 'aiess_v1',
      aggregation: null,
      fieldSuffix: '',
      recommendedWindow: '1m'
    };
  }
  
  if (timeRangeHours <= 24) {
    return {
      bucket: 'aiess_v1_1m',
      aggregation: '1m',
      fieldSuffix: '_mean',
      recommendedWindow: '15m'
    };
  }
  
  if (timeRangeHours <= 168) {  // 7 days
    return {
      bucket: 'aiess_v1_15m',
      aggregation: '15m',
      fieldSuffix: '_mean',
      recommendedWindow: '1h'
    };
  }
  
  return {
    bucket: 'aiess_v1_1h',
    aggregation: '1h',
    fieldSuffix: '_mean',
    recommendedWindow: '6h'
  };
}
```

### Data Point Targets

For optimal chart performance, target **100-500 data points** per chart:

| Time Range | Bucket | Window | ~Data Points |
|------------|--------|--------|--------------|
| 1 hour | `aiess_v1` | 1 minute | 60 |
| 6 hours | `aiess_v1_1m` | 5 minutes | 72 |
| 24 hours | `aiess_v1_1m` | 15 minutes | 96 |
| 7 days | `aiess_v1_15m` | 1 hour | 168 |
| 30 days | `aiess_v1_1h` | 6 hours | 120 |
| 90 days | `aiess_v1_1h` | 12 hours | 180 |

---

## Aggregation Pipeline

### Data Flow

```
IoT Device (5-second samples)
    ↓
AWS IoT Core → Lambda → EC2 (Telegraf)
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    InfluxDB Cloud                           │
│                                                             │
│  aiess_v1 (raw)  ───[Lambda 1m]───► aiess_v1_1m            │
│       │                                  │                  │
│       │                                  │                  │
│       │                        [Lambda 15m]                 │
│       │                                  │                  │
│       │                                  ↓                  │
│       │                           aiess_v1_15m              │
│       │                                  │                  │
│       │                        [Lambda 1h]                  │
│       │                                  │                  │
│       │                                  ↓                  │
│       │                            aiess_v1_1h              │
│       │                                                     │
└───────┴─────────────────────────────────────────────────────┘
```

### Aggregation Schedule

| Lambda | Schedule | Source Bucket | Target Bucket |
|--------|----------|---------------|---------------|
| `aiess-aggregate-1m` | Every 1 minute | `aiess_v1` | `aiess_v1_1m` |
| `aiess-aggregate-15m` | Every 15 minutes | `aiess_v1_1m` | `aiess_v1_15m` |
| `aiess-aggregate-1h` | Every 1 hour | `aiess_v1_15m` | `aiess_v1_1h` |

### Aggregation Timestamp Format

| Level | Timestamp Pattern | Example |
|-------|------------------|---------|
| 1 minute | `HH:MM:00` | `10:42:00` |
| 15 minutes | `HH:00:00`, `HH:15:00`, `HH:30:00`, `HH:45:00` | `10:45:00` |
| 1 hour | `HH:00:00` | `10:00:00` |

### Expected Sample Counts

| Aggregation | Expected `sample_count` |
|-------------|------------------------|
| 1 minute | ~12 (60s ÷ 5s) |
| 15 minutes | ~15 (15 × 1m records) |
| 1 hour | ~4 (4 × 15m records) |

---

## Response Parsing

### CSV Response Format

InfluxDB returns CSV with annotation headers:

```csv
#group,false,false,true,true,false,false,true,true
#datatype,string,long,dateTime:RFC3339,dateTime:RFC3339,dateTime:RFC3339,double,string,string
#default,_result,,,,,,,
,result,table,_start,_stop,_time,_value,_field,site_id
,,0,2025-01-01T00:00:00Z,2025-01-01T01:00:00Z,2025-01-01T00:55:00Z,12.5,grid_power,domagala_1
,,1,2025-01-01T00:00:00Z,2025-01-01T01:00:00Z,2025-01-01T00:55:00Z,5.2,pcs_power,domagala_1
,,2,2025-01-01T00:00:00Z,2025-01-01T01:00:00Z,2025-01-01T00:55:00Z,75.0,soc,domagala_1
```

### TypeScript CSV Parser

```typescript
interface InfluxRow {
  [key: string]: string;
}

function parseInfluxCSV(csv: string): InfluxRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: InfluxRow[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    // Skip empty lines and annotation comments
    if (!line || line.startsWith('#')) continue;
    
    const values = line.split(',');
    
    // First non-comment line is headers
    if (headers.length === 0) {
      headers = values;
      continue;
    }

    // Parse data row
    const row: InfluxRow = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    results.push(row);
  }

  return results;
}
```

### Extract Field Values

```typescript
function extractFieldValues(rows: InfluxRow[]): Record<string, number> {
  const values: Record<string, number> = {};
  
  for (const row of rows) {
    const field = row['_field'];
    const value = parseFloat(row['_value']) || 0;
    if (field) {
      values[field] = value;
    }
  }
  
  return values;
}
```

### Parse Pivoted Data (for charts)

```typescript
interface ChartPoint {
  time: Date;
  [field: string]: any;
}

function parsePivotedData(rows: InfluxRow[], fieldSuffix: string = ''): ChartPoint[] {
  return rows.map(row => ({
    time: new Date(row['_time']),
    gridPower: parseFloat(row[`grid_power${fieldSuffix}`]) || 0,
    batteryPower: parseFloat(row[`pcs_power${fieldSuffix}`]) || 0,
    pvPower: parseFloat(row[`total_pv_power${fieldSuffix}`]) || 0,
    soc: parseFloat(row[`soc${fieldSuffix}`]) || 0,
  }));
}
```

---

## Error Handling

### Common Error Codes

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 401 | Unauthorized | Invalid or expired token | Check token, refresh if needed |
| 403 | Forbidden | Token lacks bucket permissions | Use token with read access |
| 404 | Not Found | Bucket doesn't exist | Verify bucket name |
| 400 | Bad Request | Invalid Flux query syntax | Check query syntax |
| 429 | Too Many Requests | Rate limit exceeded | Implement backoff, reduce frequency |
| 500 | Internal Error | InfluxDB server issue | Retry with exponential backoff |

### Error Handling Implementation

```typescript
class InfluxError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'InfluxError';
  }
}

async function queryInfluxWithRetry(
  query: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${INFLUX_TOKEN}`,
            'Content-Type': 'application/vnd.flux',
            'Accept': 'application/csv',
          },
          body: query,
        }
      );

      if (!response.ok) {
        const body = await response.text();
        
        // Don't retry client errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new InfluxError(
            `InfluxDB error: ${response.status}`,
            response.status,
            body
          );
        }
        
        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      return response.text();
    } catch (error) {
      lastError = error as Error;
      
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  
  throw lastError;
}
```

### Handling Empty Results

```typescript
async function fetchLiveDataSafe(siteId: string): Promise<LiveData | null> {
  try {
    const data = await fetchLiveData(siteId);
    return data;
  } catch (error) {
    if (error instanceof InfluxError && error.statusCode === 404) {
      console.warn(`No data for site: ${siteId}`);
      return null;
    }
    throw error;
  }
}
```

---

## Best Practices

### 1. Query Optimization

```typescript
// ✅ GOOD: Filter early, select only needed fields
const query = `
  from(bucket: "aiess_v1_1m")
    |> range(start: -24h)
    |> filter(fn: (r) => r.site_id == "${siteId}")
    |> filter(fn: (r) => r._field == "grid_power_mean")
`;

// ❌ BAD: Select all, filter later
const query = `
  from(bucket: "aiess_v1")
    |> range(start: -30d)
    |> filter(fn: (r) => r._measurement == "energy_telemetry")
`;
```

### 2. Use Appropriate Bucket

```typescript
// ✅ GOOD: Use aggregated bucket for long ranges
if (timeRangeHours > 24) {
  bucket = 'aiess_v1_15m';
}

// ❌ BAD: Query raw data for 30 days (millions of points)
from(bucket: "aiess_v1")
  |> range(start: -30d)
```

### 3. Implement Caching

```typescript
const CACHE_TTL = {
  live: 5_000,      // 5 seconds
  hourly: 60_000,   // 1 minute
  daily: 300_000,   // 5 minutes
  weekly: 900_000,  // 15 minutes
};

const cache = new Map<string, { data: any; expires: number }>();

async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.data as T;
  }
  
  const data = await fetcher();
  cache.set(key, { data, expires: Date.now() + ttl });
  return data;
}
```

### 4. Limit Data Points for Charts

```typescript
// Target ~100-200 points for smooth charts
function calculateWindow(rangeHours: number): string {
  const targetPoints = 150;
  const windowMinutes = Math.ceil((rangeHours * 60) / targetPoints);
  
  if (windowMinutes < 1) return '30s';
  if (windowMinutes < 5) return '1m';
  if (windowMinutes < 15) return '5m';
  if (windowMinutes < 60) return '15m';
  if (windowMinutes < 360) return '1h';
  return '6h';
}
```

### 5. Handle Timezone Properly

```typescript
// InfluxDB stores UTC, convert to local for display
function formatLocalTime(utcTime: Date): string {
  return utcTime.toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw'
  });
}

// For queries, use UTC
function toUTCString(localDate: Date): string {
  return localDate.toISOString();
}
```

### 6. Batch Requests When Possible

```typescript
// ✅ GOOD: Single query with multiple fields
const query = `
  from(bucket: "aiess_v1")
    |> filter(fn: (r) => 
        r._field == "grid_power" or 
        r._field == "pcs_power" or 
        r._field == "soc"
    )
`;

// ❌ BAD: Multiple separate queries
await queryInflux(`... |> filter(fn: (r) => r._field == "grid_power")`);
await queryInflux(`... |> filter(fn: (r) => r._field == "pcs_power")`);
await queryInflux(`... |> filter(fn: (r) => r._field == "soc")`);
```

---

## Quick Reference Card

### Bucket Selection

| Query Type | Bucket | Filter |
|------------|--------|--------|
| Live data | `aiess_v1` | None |
| 24h charts | `aiess_v1_1m` | `aggregation == "1m"` |
| Weekly charts | `aiess_v1_15m` | `aggregation == "15m"` |
| Monthly charts | `aiess_v1_1h` | `aggregation == "1h"` |

### Field Names

| Raw Bucket | Aggregated Buckets |
|------------|-------------------|
| `grid_power` | `grid_power_mean`, `grid_power_min`, `grid_power_max` |
| `pcs_power` | `pcs_power_mean`, `pcs_power_min`, `pcs_power_max` |
| `soc` | `soc_mean`, `soc_min`, `soc_max` |
| `total_pv_power` | `total_pv_power_mean`, `total_pv_power_min`, `total_pv_power_max` |
| `compensated_power` | `compensated_power_mean`, `compensated_power_min`, `compensated_power_max` |

### API Quick Reference

```
POST /api/v2/query?org=aiess
Authorization: Token <token>
Content-Type: application/vnd.flux
Accept: application/csv
```

---

## Appendix: Complete TypeScript Client

```typescript
// influxdb-client.ts

import { Platform } from 'react-native';

const INFLUX_URL = process.env.EXPO_PUBLIC_INFLUX_URL;
const INFLUX_ORG = process.env.EXPO_PUBLIC_INFLUX_ORG;
const INFLUX_TOKEN = process.env.EXPO_PUBLIC_INFLUX_TOKEN;

// Types
export interface LiveData {
  gridPower: number;
  batteryPower: number;
  batterySoc: number;
  batteryStatus: 'Charging' | 'Discharging' | 'Standby';
  pvPower: number;
  factoryLoad: number;
  lastUpdate: Date;
}

export interface ChartDataPoint {
  time: Date;
  gridPower: number;
  batteryPower: number;
  pvPower: number;
  soc: number;
}

export interface EnergyStats {
  avgGridPower: number;
  maxGridPower: number;
  minGridPower: number;
  avgSoc: number;
  minSoc: number;
  maxSoc: number;
  avgPvPower: number;
  totalPvEnergy: number;
}

// Configuration
const BUCKET_CONFIG = {
  live: { bucket: 'aiess_v1', aggregation: null, fieldSuffix: '' },
  '1m': { bucket: 'aiess_v1_1m', aggregation: '1m', fieldSuffix: '_mean' },
  '15m': { bucket: 'aiess_v1_15m', aggregation: '15m', fieldSuffix: '_mean' },
  '1h': { bucket: 'aiess_v1_1h', aggregation: '1h', fieldSuffix: '_mean' },
} as const;

// CSV Parser
function parseInfluxCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: Record<string, string>[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    
    const values = line.split(',');
    
    if (headers.length === 0) {
      headers = values;
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    results.push(row);
  }

  return results;
}

// Query executor
async function queryInflux(query: string): Promise<string> {
  if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_TOKEN) {
    throw new Error('InfluxDB configuration missing');
  }

  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv',
    },
    body: query,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`InfluxDB error: ${response.status} - ${error}`);
  }

  return response.text();
}

// Utility functions
export function calculateFactoryLoad(gridPower: number, pvPower: number, batteryPower: number): number {
  return Math.max(0, gridPower + pvPower + batteryPower);
}

export function getBatteryStatus(batteryPower: number): 'Charging' | 'Discharging' | 'Standby' {
  if (batteryPower < -0.5) return 'Charging';
  if (batteryPower > 0.5) return 'Discharging';
  return 'Standby';
}

// Public API
export async function fetchLiveData(siteId: string): Promise<LiveData | null> {
  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => 
          r._field == "grid_power" or 
          r._field == "total_pv_power" or 
          r._field == "pcs_power" or 
          r._field == "soc"
      )
      |> last()
  `;

  const csv = await queryInflux(query);
  const rows = parseInfluxCSV(csv);

  if (rows.length === 0) return null;

  const values: Record<string, number> = {};
  for (const row of rows) {
    const field = row['_field'];
    const value = parseFloat(row['_value']) || 0;
    if (field) values[field] = value;
  }

  const gridPower = values['grid_power'] || 0;
  const pvPower = values['total_pv_power'] || 0;
  const batteryPower = values['pcs_power'] || 0;
  const batterySoc = values['soc'] || 0;

  return {
    gridPower: Math.round(gridPower * 10) / 10,
    batteryPower: Math.round(batteryPower * 10) / 10,
    batterySoc: Math.round(batterySoc),
    batteryStatus: getBatteryStatus(batteryPower),
    pvPower: Math.round(pvPower * 10) / 10,
    factoryLoad: Math.round(calculateFactoryLoad(gridPower, pvPower, batteryPower) * 10) / 10,
    lastUpdate: new Date(),
  };
}

export async function fetchChartData(
  siteId: string,
  timeRange: '1h' | '24h' | '7d' | '30d'
): Promise<ChartDataPoint[]> {
  const config = {
    '1h':  { ...BUCKET_CONFIG.live, start: '-1h', window: '1m' },
    '24h': { ...BUCKET_CONFIG['1m'], start: '-24h', window: '15m' },
    '7d':  { ...BUCKET_CONFIG['15m'], start: '-7d', window: '1h' },
    '30d': { ...BUCKET_CONFIG['1h'], start: '-30d', window: '6h' },
  }[timeRange];

  const aggFilter = config.aggregation 
    ? `|> filter(fn: (r) => r.aggregation == "${config.aggregation}")` 
    : '';

  const query = `
    from(bucket: "${config.bucket}")
      |> range(start: ${config.start})
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      ${aggFilter}
      |> filter(fn: (r) => 
          r._field == "grid_power${config.fieldSuffix}" or 
          r._field == "pcs_power${config.fieldSuffix}" or 
          r._field == "total_pv_power${config.fieldSuffix}" or 
          r._field == "soc${config.fieldSuffix}"
      )
      |> aggregateWindow(every: ${config.window}, fn: mean, createEmpty: false)
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  const csv = await queryInflux(query);
  const rows = parseInfluxCSV(csv);

  return rows.map(row => ({
    time: new Date(row['_time']),
    gridPower: parseFloat(row[`grid_power${config.fieldSuffix}`]) || 0,
    batteryPower: parseFloat(row[`pcs_power${config.fieldSuffix}`]) || 0,
    pvPower: parseFloat(row[`total_pv_power${config.fieldSuffix}`]) || 0,
    soc: parseFloat(row[`soc${config.fieldSuffix}`]) || 0,
  }));
}

export async function fetchEnergyStats(
  siteId: string,
  timeRange: '24h' | '7d' | '30d'
): Promise<EnergyStats> {
  const config = {
    '24h': { ...BUCKET_CONFIG['1m'], start: '-24h' },
    '7d':  { ...BUCKET_CONFIG['15m'], start: '-7d' },
    '30d': { ...BUCKET_CONFIG['1h'], start: '-30d' },
  }[timeRange];

  const query = `
    from(bucket: "${config.bucket}")
      |> range(start: ${config.start})
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r.aggregation == "${config.aggregation}")
      |> filter(fn: (r) => 
          r._field == "grid_power${config.fieldSuffix}" or 
          r._field == "grid_power_min" or 
          r._field == "grid_power_max" or 
          r._field == "soc${config.fieldSuffix}" or 
          r._field == "soc_min" or 
          r._field == "soc_max" or 
          r._field == "total_pv_power${config.fieldSuffix}"
      )
  `;

  const csv = await queryInflux(query);
  const rows = parseInfluxCSV(csv);

  // Calculate statistics from rows
  let sumGrid = 0, sumSoc = 0, sumPv = 0;
  let minGrid = Infinity, maxGrid = -Infinity;
  let minSoc = Infinity, maxSoc = -Infinity;
  let count = 0;

  for (const row of rows) {
    const field = row['_field'];
    const value = parseFloat(row['_value']) || 0;
    
    if (field?.includes('grid_power')) {
      if (field.endsWith('_min')) minGrid = Math.min(minGrid, value);
      else if (field.endsWith('_max')) maxGrid = Math.max(maxGrid, value);
      else { sumGrid += value; count++; }
    }
    else if (field?.includes('soc')) {
      if (field.endsWith('_min')) minSoc = Math.min(minSoc, value);
      else if (field.endsWith('_max')) maxSoc = Math.max(maxSoc, value);
      else sumSoc += value;
    }
    else if (field?.includes('pv_power')) {
      sumPv += value;
    }
  }

  const avgCount = count || 1;
  const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;

  return {
    avgGridPower: Math.round((sumGrid / avgCount) * 10) / 10,
    maxGridPower: maxGrid === -Infinity ? 0 : Math.round(maxGrid * 10) / 10,
    minGridPower: minGrid === Infinity ? 0 : Math.round(minGrid * 10) / 10,
    avgSoc: Math.round(sumSoc / avgCount),
    minSoc: minSoc === Infinity ? 0 : Math.round(minSoc),
    maxSoc: maxSoc === -Infinity ? 0 : Math.round(maxSoc),
    avgPvPower: Math.round((sumPv / avgCount) * 10) / 10,
    totalPvEnergy: Math.round((sumPv / avgCount) * hours * 10) / 10, // kWh estimate
  };
}
```

---

**Document Version**: 1.0  
**Created**: December 2025  
**For**: AIESS Mobile App - Analytics & Charts Module  
**Maintained by**: AWS Mastermind Project

