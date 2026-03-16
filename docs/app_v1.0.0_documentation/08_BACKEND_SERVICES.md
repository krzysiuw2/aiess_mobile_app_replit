# 08 — Backend Services

> Complete reference for all backend infrastructure powering the AIESS mobile energy app.

---

## 1. Supabase

### 1.1 Authentication

| Method | Details |
|--------|---------|
| Email / password | Standard Supabase Auth with `autoRefreshToken` and `persistSession` |
| Google OAuth | Social login via Supabase Auth provider |
| Apple Sign-In | Social login via Supabase Auth provider (required for iOS) |

Client initialised in [`lib/supabase.ts`](../../lib/supabase.ts) using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Session is persisted to `expo-sqlite/localStorage`.

### 1.2 Database Tables

#### `devices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `site_id` | text | Unique site identifier (e.g. `domagala_1`) |
| `name` | text | Human-readable device name |
| `type` | text | Device type |
| `created_at` | timestamptz | |

#### `device_users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `device_id` | uuid (FK → devices) | |
| `user_id` | uuid (FK → auth.users) | |
| `role` | text | `owner` or `viewer` |
| `created_at` | timestamptz | |

Many-to-many join: one user can access multiple devices; one device can have multiple users.

#### `user_profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK, FK → auth.users) | Matches auth user id |
| `display_name` | text | |
| `avatar_url` | text | |
| `created_at` | timestamptz | |

### 1.3 Edge Functions

All Edge Functions are Deno-based and share CORS headers from [`supabase/functions/_shared/cors.ts`](../../supabase/functions/_shared/cors.ts).

| Function | Path | Purpose |
|----------|------|---------|
| **influx-proxy** | `/functions/v1/influx-proxy` | Proxies Flux queries from the app to InfluxDB Cloud. Validates Supabase JWT, forwards `{ query }` body. |
| **aws-proxy** | `/functions/v1/aws-proxy` | Proxies API calls to AWS API Gateway. Accepts `{ path, method, body }`, injects `x-api-key`. |
| **delete-account** | `/functions/v1/delete-account` | Full account deletion: removes `device_users`, `user_profiles`, then `auth.admin.deleteUser()`. Source: [`supabase/functions/delete-account/index.ts`](../../supabase/functions/delete-account/index.ts) |

Client-side proxy helpers live in [`lib/edge-proxy.ts`](../../lib/edge-proxy.ts):
- `callInfluxProxy(query)` → sends Flux query, returns CSV text
- `callAwsProxy(path, method?, body?)` → forwards request to AWS, returns `Response`

### 1.4 Secrets (Edge Function Environment)

| Secret | Used by |
|--------|---------|
| `INFLUX_URL` | influx-proxy |
| `INFLUX_TOKEN` | influx-proxy |
| `INFLUX_ORG` | influx-proxy |
| `AWS_ENDPOINT` | aws-proxy |
| `AWS_API_KEY` | aws-proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | delete-account |

---

## 2. AWS Lambda Functions

### Lambda Directory Structure

```
lambda/
├── aggregate-1m/          Python 3.11 — 5s → 1m aggregation
├── aggregate-15m/         Python 3.11 — 1m → 15m aggregation
├── aggregate-1h/          Python 3.11 — 15m → 1h aggregation
├── forecast-engine/       Node.js 20  — PV & load forecasting
│   ├── index.mjs
│   ├── cloudformation.yaml
│   ├── open-meteo-client.mjs
│   ├── pv-calculator.mjs
│   ├── load-forecaster.mjs
│   ├── day-type-classifier.mjs
│   ├── influxdb-writer.mjs
│   └── energa-parser.mjs
├── financial-engine/      Node.js 20  — Financial calculations
├── bedrock-chat/          Node.js 20  — AI chat proxy
├── bedrock-agent-action/  Node.js 20  — Bedrock Agent tools
├── site-config/           Node.js 20  — Site config CRUD
├── export-guard/          Node.js 20  — PV export control loop
└── export-guard-api/      Node.js 20  — Export guard state API
```

### Complete Lambda Inventory

| Name | Runtime | Trigger | Purpose | Key Env Vars |
|------|---------|---------|---------|--------------|
| **aiess-aggregate-1m** | Python 3.11 | EventBridge (every 1 min) | Aggregate 5s raw → 1m means. Source: [`lambda/aggregate-1m/lambda_function.py`](../../lambda/aggregate-1m/lambda_function.py) | `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG` |
| **aiess-aggregate-15m** | Python 3.11 | EventBridge (every 15 min) | Aggregate 1m → 15m means. Source: [`lambda/aggregate-15m/lambda_function.py`](../../lambda/aggregate-15m/lambda_function.py) | `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG` |
| **aiess-aggregate-1h** | Python 3.11 | EventBridge (every 1 hour) | Aggregate 15m → 1h means. Source: [`lambda/aggregate-1h/lambda_function.py`](../../lambda/aggregate-1h/lambda_function.py) | `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG` |
| **aiess-forecast-engine** | Node.js 20 | EventBridge (every 3h for 48h; daily 06:00 UTC for 7d) | PV & load forecasting + backfill mode. Source: [`lambda/forecast-engine/index.mjs`](../../lambda/forecast-engine/index.mjs) | `SITE_CONFIG_TABLE`, `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET`, `OPEN_METEO_API_KEY`, `ENERGA_S3_BUCKET` |
| **aiess-financial-engine** | Node.js 20 | EventBridge (daily 2:00 AM CET) | Daily financial calculations + on-demand recalculation. Source: [`lambda/financial-engine/index.mjs`](../../lambda/financial-engine/index.mjs) | `SITE_CONFIG_TABLE`, `FINANCIAL_TABLE`, `TARIFF_TABLE`, `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` |
| **aiess-bedrock-chat** | Node.js 20 | API Gateway | Proxies user messages to AWS Bedrock Agent Runtime. Source: [`lambda/bedrock-chat/index.mjs`](../../lambda/bedrock-chat/index.mjs) | `BEDROCK_AGENT_ID`, `BEDROCK_AGENT_ALIAS_ID` |
| **aiess-bedrock-action** | Node.js 20 | Bedrock Agent (action group) | Executes agent tool calls (site config, schedules, telemetry, charts, forecasts, simulations). Source: [`lambda/bedrock-agent-action/index.mjs`](../../lambda/bedrock-agent-action/index.mjs) | `SITE_CONFIG_TABLE`, `SCHEDULES_API`, `SCHEDULES_API_KEY`, `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG` |
| **aiess-site-config** | Node.js 20 | API Gateway | Site config CRUD + geocoding. Routes: `GET /site-config/{id}`, `PUT /site-config/{id}`, `PUT /site-config/{id}/geocode`. Source: [`lambda/site-config/index.mjs`](../../lambda/site-config/index.mjs) | `SITE_CONFIG_TABLE`, `LOCATION_INDEX` |
| **aiess-export-guard** | Node.js 20 | EventBridge (every 1 min, daylight hours) | PV export control loop: reads grid power, shuts down inverter via Supla when export exceeds threshold, manages cooldown. Source: [`lambda/export-guard/index.mjs`](../../lambda/export-guard/index.mjs) | `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `GUARD_TABLE`, `SUPLA_BASE_URL`, `SITE_ID`, `EXPORT_THRESHOLD`, `RESTART_THRESHOLD`, `COOLDOWN_MINUTES` |
| **aiess-export-guard-api** | Node.js 20 | API Gateway | REST API for export guard state: `GET` status, `POST` manual turn-on, `PATCH` thresholds. Source: [`lambda/export-guard-api/index.mjs`](../../lambda/export-guard-api/index.mjs) | `GUARD_TABLE`, `SUPLA_BASE_URL`, `SITE_ID`, `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG` |

### Bedrock Agent Action — Tool Handlers

The `aiess-bedrock-action` Lambda exposes these tools to the Bedrock Agent:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_site_config` | `site_id` | Read full site configuration from DynamoDB |
| `get_current_schedules` | `site_id` | Fetch current schedule rules from Schedules API |
| `send_schedule_rule` | `site_id`, `priority`, `rule`/`rule_json` | Create or update a schedule rule |
| `delete_schedule_rule` | `site_id`, `priority`, `rule_id` | Delete a schedule rule |
| `set_system_mode` | `site_id`, `mode` | Set automation mode in site config |
| `set_safety_limits` | `site_id`, `soc_min`, `soc_max` | Set battery SoC safety limits |
| `update_site_config` | `site_id`, `config_json` | Deep-merge updates into site config |
| `get_battery_status` | `site_id` | Live battery SoC, power, grid, PV from InfluxDB |
| `get_energy_summary` | `site_id`, `hours` | Averaged telemetry for a time period |
| `get_tge_price` | `site_id` | Latest TGE RDN spot price |
| `get_tge_price_history` | `hours` | Bar chart data of TGE prices |
| `get_tge_prices` | `site_id`, `hours` | Current price + history chart combined |
| `get_chart_data` | `site_id`, `fields`, `hours`, `chart_type`, `title` | Generic telemetry chart builder |
| `get_rule_config_history` | `site_id`, `hours` | Historical rule config changes |
| `get_active_rule_history` | `site_id`, `hours` | Which rules were active over time |
| `get_rule_history` | `site_id`, `hours`, `type` | Combined rule config + active history |
| `get_energy_forecast` | `site_id`, `hours` | PV and load forecast chart from simulation data |
| `run_battery_simulation` | `site_id`, `strategy`, `hours` | Battery simulation (self-consumption / peak-shaving) |

Confirmable (destructive) tools: `send_schedule_rule`, `delete_schedule_rule`, `set_system_mode`, `set_safety_limits`, `update_site_config`.

### Forecast Engine — Modules

| Module | Purpose |
|--------|---------|
| [`open-meteo-client.mjs`](../../lambda/forecast-engine/open-meteo-client.mjs) | Fetches weather forecasts for multiple panel orientations |
| [`pv-calculator.mjs`](../../lambda/forecast-engine/pv-calculator.mjs) | Calculates PV output from irradiance per orientation |
| [`load-forecaster.mjs`](../../lambda/forecast-engine/load-forecaster.mjs) | Builds load profiles with temperature correction and day-type scaling |
| [`day-type-classifier.mjs`](../../lambda/forecast-engine/day-type-classifier.mjs) | Classifies days (workday / weekend / holiday) for load patterns |
| [`influxdb-writer.mjs`](../../lambda/forecast-engine/influxdb-writer.mjs) | Reads historical data and writes simulation results to InfluxDB |
| [`energa-parser.mjs`](../../lambda/forecast-engine/energa-parser.mjs) | Loads and parses Energa CSV billing data from S3 (backfill mode) |
| [`cloudformation.yaml`](../../lambda/forecast-engine/cloudformation.yaml) | CloudFormation stack: Lambda + IAM role + EventBridge rules |

CloudFormation stack provisions: Lambda (256 MB, 60s timeout, concurrency 5), IAM role with DynamoDB read + S3 read, two EventBridge rules. Estimated cost: **< $1/site/month**.

### Financial Engine — Modules

| Module | Purpose |
|--------|---------|
| [`index.mjs`](../../lambda/financial-engine/index.mjs) | Main handler: daily and recalculate modes, orchestrates price/tariff resolution and financial calculation |
| [`price-resolver.mjs`](../../lambda/financial-engine/price-resolver.mjs) | Resolves energy/export prices (fixed, TGE RDN spot, calendar) |
| [`tariff-resolver.mjs`](../../lambda/financial-engine/tariff-resolver.mjs) | Resolves distribution tariff rates from DynamoDB `aiess_tariff_data`, classifies hours by day-type and zone schedule |
| [`financial-calculator.mjs`](../../lambda/financial-engine/financial-calculator.mjs) | Core calculation engine: hourly financial metrics and monthly aggregation |
| [`influxdb-writer.mjs`](../../lambda/financial-engine/influxdb-writer.mjs) | Reads telemetry/TGE from InfluxDB, writes hourly `financial_metrics` line protocol |
| [`dynamodb-writer.mjs`](../../lambda/financial-engine/dynamodb-writer.mjs) | Writes monthly summaries to `aiess_financial_summaries` table, reads cumulative savings |

**Data pipeline:** The financial-engine Lambda writes hourly `financial_metrics` to the `aiess_v1_1h` InfluxDB bucket. The mobile app reads this data via the `influx-proxy` Supabase Edge Function, using a Flux `aggregateWindow(every: 1mo, fn: sum)` query to aggregate into monthly summaries. Derived fields (ROI, cumulative savings, break-even, battery cycles, peak shaving) are computed client-side in [`lib/financial.ts`](../../lib/financial.ts).

---

## 3. DynamoDB Tables

| Table | Partition Key | Sort Key | Purpose |
|-------|--------------|----------|---------|
| **site_config** | `site_id` (S) | — | All site settings: location, PV panel orientations, battery specs, power limits, grid connection, automation config, financial params |
| **aiess_tariff_data** | `TARIFF#{operator}#{tariff_group}` (S) | `valid_year` (S) | Energy tariff definitions per operator, tariff group, and year |
| **aiess_financial_summaries** | `FINANCIAL#{site_id}` (S) | `YYYY-MM` (S) | Monthly financial summaries (costs, savings, revenue) per site |
| **export_guard_state** | `guard_id` (S) | — | Export guard operational state (`{site_id}` for runtime state, `{site_id}_config` for thresholds) |

---

## 4. InfluxDB Cloud

### Buckets

| Bucket | Resolution | Retention | Contents |
|--------|-----------|-----------|----------|
| **aiess_v1** | 5 seconds | Short-term | Raw telemetry: `grid_power`, `pcs_power`, `total_pv_power`, `soc`, `compensated_power`, `active_rule_id`, `active_rule_action`, `active_rule_power` |
| **aiess_v1_1m** | 1 minute | Medium-term | Aggregated means, min, max + `sample_count` + active rule snapshot |
| **aiess_v1_15m** | 15 minutes | Long-term | Aggregated means, min, max |
| **aiess_v1_1h** | 1 hour | Long-term | Aggregated means + `energy_simulation` (forecasts) + `financial_metrics` + `tge_rdn` |
| **battery_detail** | varies | — | Cell-level battery data (`battery_telemetry` measurement) |
| **tge_energy_prices** | 1 hour | — | TGE RDN spot market prices (`energy_prices` measurement, `price` field in PLN/MWh) |

### Measurements

| Measurement | Buckets | Description |
|-------------|---------|-------------|
| `energy_telemetry` | all aggregation buckets | Core telemetry fields: grid, PCS, PV, SoC, compensated power |
| `energy_simulation` | `aiess_v1_1h` | Forecast data: `pv_forecast`, `load_forecast`, `weather_temp`, `weather_cloud_cover`, `weather_code` |
| `financial_metrics` | `aiess_v1_1h` | Financial calculation outputs (hourly costs, savings, arbitrage). Written by financial-engine Lambda; read by mobile app via `influx-proxy` with Flux monthly aggregation. |
| `tge_rdn` | `aiess_v1_1h` | TGE spot price data (mirrored from `tge_energy_prices`) |
| `battery_telemetry` | `battery_detail` | Cell-level voltages and temperatures |
| `rule_config` | `aiess_v1_1m` | Schedule rule configuration change history |

### Aggregation Pipeline

```
aiess_v1 (5s raw)
  │  aiess-aggregate-1m (every 1 min, SQL date_bin, mean/min/max)
  ▼
aiess_v1_1m (1-min aggregates)
  │  aiess-aggregate-15m (every 15 min, SQL date_bin, mean/min/max)
  ▼
aiess_v1_15m (15-min aggregates)
  │  aiess-aggregate-1h (every 1 hour, SQL date_bin, mean/min/max)
  ▼
aiess_v1_1h (1-hour aggregates + simulation + financial)
```

All aggregation Lambdas use the InfluxDB v3 SQL API via `influxdb_client_3` Python client and `date_bin()` for time windowing. Each Lambda offsets by one extra window to account for slow-ingesting data.

---

## 5. EventBridge Rules

| Rule Name | Schedule | Target Lambda | Input |
|-----------|----------|---------------|-------|
| `aiess-aggregate-1m` | `rate(1 minute)` | aiess-aggregate-1m | — |
| `aiess-aggregate-15m` | `rate(15 minutes)` | aiess-aggregate-15m | — |
| `aiess-aggregate-1h` | `rate(1 hour)` | aiess-aggregate-1h | — |
| `aiess-forecast-48h` | `rate(3 hours)` | aiess-forecast-engine | `{"mode": "forecast_48h"}` |
| `aiess-forecast-7d` | `cron(0 6 * * ? *)` (daily 06:00 UTC) | aiess-forecast-engine | `{"mode": "forecast_7d"}` |
| `aiess-financial-daily` | `cron(0 1 * * ? *)` (daily 01:00 UTC / 02:00 CET) | aiess-financial-engine | `{"mode": "daily"}` |
| `aiess-export-guard` | `rate(1 minute)` (daylight hours filter) | aiess-export-guard | — |

---

## 6. AWS API Gateway

All API Gateway endpoints use API key authentication (`x-api-key` header). The app accesses them through the Supabase `aws-proxy` Edge Function.

| Method | Path | Lambda |
|--------|------|--------|
| `POST` | `/chat` | aiess-bedrock-chat |
| `GET` | `/site-config/{site_id}` | aiess-site-config |
| `PUT` | `/site-config/{site_id}` | aiess-site-config |
| `PUT` | `/site-config/{site_id}/geocode` | aiess-site-config |
| `GET` | `/export-guard` | aiess-export-guard-api |
| `POST` | `/export-guard` | aiess-export-guard-api |
| `PATCH` | `/export-guard` | aiess-export-guard-api |

The Bedrock Agent action Lambda is not exposed via API Gateway — it is invoked directly by the Bedrock Agent Runtime.

---

## 7. Other AWS Services

### AWS Bedrock — Agent Runtime

- **Agent ID**: configured via `BEDROCK_AGENT_ID` env var
- **Agent Alias ID**: configured via `BEDROCK_AGENT_ALIAS_ID` env var
- **Region**: `eu-central-1`
- **SDK**: `@aws-sdk/client-bedrock-agent-runtime` → `InvokeAgentCommand`
- **Flow**: App → API Gateway → `aiess-bedrock-chat` → Bedrock Agent → `aiess-bedrock-action` (tool calls) → response streamed back
- **Session attributes**: `site_id`, `current_datetime`, `current_day_of_week`, `response_language`

### AWS Location Service

- **Place Index**: `aiess-geocode-index` (configurable via `LOCATION_INDEX` env var)
- **SDK**: `@aws-sdk/client-location` → `SearchPlaceIndexForTextCommand`
- **Used by**: `aiess-site-config` Lambda (`PUT /site-config/{id}/geocode`)
- **Purpose**: Geocode site addresses to lat/lng for PV forecasting (solar angle calculations)

### AWS S3

- **Bucket**: configured via `ENERGA_S3_BUCKET` env var
- **Purpose**: Stores Energa CSV billing/consumption files for historical backfill
- **Used by**: `aiess-forecast-engine` Lambda (backfill mode only)
- **Access**: read-only from Lambda via IAM role policy

### AWS CloudWatch Logs

All Lambda functions log to CloudWatch via the `AWSLambdaBasicExecutionRole` managed policy. Log groups follow the `/aws/lambda/{function-name}` convention.
