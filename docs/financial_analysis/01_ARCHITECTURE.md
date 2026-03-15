# 01 — Architecture

## System Overview

The Financial Analysis feature follows a **pre-compute and store** pattern. A Lambda function runs daily (and on-demand), reads energy telemetry, resolves prices and tariffs, computes financial metrics for each hour, and writes results to two storage backends:

- **InfluxDB** (`financial_metrics` measurement) — hourly granularity for time-series charts
- **DynamoDB** (`aiess_financial_summaries` table) — monthly aggregations for KPI cards and ROI tracking

```
┌──────────────────────────────────────────────────────────────────┐
│                        EventBridge                               │
│              cron(0 1 * * ? *)  → 2:00 AM CET daily             │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                 aiess-financial-engine (Lambda)                   │
│  Runtime: Node.js 20 │ Memory: 512 MB │ Timeout: 300s           │
│                                                                  │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ price-      │  │ tariff-          │  │ financial-       │   │
│  │ resolver    │  │ resolver         │  │ calculator       │   │
│  └──────┬──────┘  └──────┬───────────┘  └──────┬───────────┘   │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  influxdb-writer  │  dynamodb-writer                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
         │                    │                │                │
         ▼                    ▼                ▼                ▼
   ┌──────────┐    ┌──────────────┐    ┌────────────┐   ┌──────────────┐
   │ InfluxDB │    │  InfluxDB    │    │ DynamoDB   │   │ DynamoDB     │
   │ telemetry│    │ tge_rdn      │    │ tariff_data│   │ fin_summaries│
   │ (read)   │    │ (read)       │    │ (read)     │   │ (write)      │
   └──────────┘    └──────────────┘    └────────────┘   └──────────────┘
                                                              │
                          InfluxDB financial_metrics (write) ◄─┘
```

## Lambda Module Breakdown

### `index.mjs` — Main Handler

Orchestrates the entire pipeline:
1. Scans `site_config` DynamoDB table for all sites (or targets a specific `site_id`)
2. Skips sites without `financial` settings
3. Determines mode: `daily` (yesterday) or `recalculate` (date range)
4. For each site, calls `processDateRange()`

**Invocation payload:**

```json
{
  "mode": "daily"
}
```

```json
{
  "mode": "recalculate",
  "site_id": "site-001",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

### `price-resolver.mjs` — Energy Price Resolution

Resolves the energy import price (PLN/kWh) for each hour based on the configured model:

| Model | Source | Logic |
|-------|--------|-------|
| `fixed` | `fixed_price_pln_kwh` setting | Static value |
| `tge_rdn` | `tge_rdn` measurement in InfluxDB | Hourly spot price, converted from PLN/MWh to PLN/kWh |
| `calendar` | `calendar_prices` map in settings | Looks up `YYYY-MM` key first, then `YYYY-QN` quarterly key |

Also resolves export (sell-back) price with the same `fixed` / `tge_rdn` logic.

**Seller margin:** Optionally added on top of the base price. Configured in PLN/MWh (default 50), converted to PLN/kWh internally. Defaults to `true` for TGE RDN, `false` for fixed/calendar.

### `tariff-resolver.mjs` — Distribution Tariff Resolution

Resolves the distribution network rate (PLN/kWh) for each hour:

1. Fetches tariff definition from DynamoDB (cached per Lambda invocation)
2. Converts UTC hour to local time (`Europe/Warsaw`)
3. Classifies day type: weekday, Saturday, or Sunday/holiday
4. Matches the local hour against zone schedule ranges
5. Returns the applicable rate

Includes a complete Polish holiday calendar with fixed-date holidays and Easter-dependent movable holidays (computed via the Gregorian computus algorithm).

### `financial-calculator.mjs` — Core Calculations

Two main functions:

- `calculateHourlyFinancials()` — per-hour cost/savings calculation
- `aggregateMonthly()` — monthly rollup with ROI and payback tracking

See [02 Calculations](02_CALCULATIONS.md) for detailed formulas.

### `influxdb-writer.mjs` — InfluxDB I/O

- **Read:** Fetches `energy_telemetry` and `tge_rdn` from InfluxDB using Flux queries
- **Write:** Writes `financial_metrics` points using InfluxDB line protocol
- Batches writes at 5000 points per request

### `dynamodb-writer.mjs` — DynamoDB I/O

- **Write:** Puts monthly summary items to `aiess_financial_summaries`
- **Read:** Queries existing summaries for cumulative savings calculation

## Data Flow — Daily Run

1. **2:00 AM CET** — EventBridge triggers the Lambda
2. Lambda scans all site configs from DynamoDB
3. For each site with financial settings:
   a. Reads yesterday's hourly telemetry from InfluxDB (`energy_telemetry`)
   b. Pre-fetches TGE RDN prices for the date range (lazy, cached)
   c. For each hour:
      - Resolves energy price (fixed / TGE / calendar + margin)
      - Resolves distribution rate (operator + tariff group + zone + day type)
      - Resolves export price
      - Calculates hourly financials
   d. Writes all hourly points to InfluxDB (`financial_metrics`)
   e. Groups results by month, aggregates summaries
   f. Writes monthly summaries to DynamoDB

## Recalculation Flow

Identical to daily, but processes an arbitrary date range. Used when:
- Financial settings change (user updates prices, tariffs, CAPEX)
- Historical data needs reprocessing
- Initial backfill after feature setup

Invoked via direct Lambda invocation (AWS Console, CLI, or programmatically).

## IAM Role

The Lambda uses `aiess-bedrock-action-role` which has permissions for:
- DynamoDB read/write on `site_config`, `aiess_tariff_data`, `aiess_financial_summaries`
- CloudWatch Logs
- (InfluxDB access is via HTTP API with token, not IAM)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_CONFIG_TABLE` | `site_config` | DynamoDB table for site configuration |
| `FINANCIAL_TABLE` | `aiess_financial_summaries` | DynamoDB table for monthly summaries |
| `TARIFF_TABLE` | `aiess_tariff_data` | DynamoDB table for distribution tariffs |
| `INFLUX_URL` | — | InfluxDB Cloud URL |
| `INFLUX_TOKEN` | — | InfluxDB API token |
| `INFLUX_ORG` | `aiess` | InfluxDB organization |
| `INFLUX_BUCKET` | `aiess_v1_1h` | InfluxDB bucket for hourly data |
