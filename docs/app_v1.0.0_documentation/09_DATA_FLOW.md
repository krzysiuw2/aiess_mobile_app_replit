# 09 — Data Flows

End-to-end data pipelines in the AIESS system. Each section describes the full journey from source to screen.

## 1. Device Telemetry Pipeline

Raw energy data flows from physical devices through aggregation layers to the app.

```
Physical Device (BESS + Inverter + PV)
       │
       │  MQTT (5-second intervals)
       ▼
┌──────────────┐
│   InfluxDB   │
│   aiess_v1   │  ← raw 5s data
│   (bucket)   │    measurements: energy_telemetry, battery_telemetry
└──────┬───────┘
       │
       ├──── EventBridge (every 1 min) ──── aiess-aggregate-1m Lambda
       │                                           │
       │                                    ┌──────▼───────┐
       │                                    │  aiess_v1_1m  │  mean over 1m windows
       │                                    └──────┬───────┘
       │                                           │
       │         EventBridge (every 15 min) ── aiess-aggregate-15m Lambda
       │                                           │
       │                                    ┌──────▼────────┐
       │                                    │ aiess_v1_15m   │  mean over 15m windows
       │                                    └──────┬────────┘
       │                                           │
       │          EventBridge (every 1 hour) ── aiess-aggregate-1h Lambda
       │                                           │
       │                                    ┌──────▼───────┐
       │                                    │  aiess_v1_1h  │  mean over 1h windows
       │                                    └──────────────┘
       │
       └──── (raw data retained for live monitoring)
```

### Key Fields in energy_telemetry

| Field | Unit | Description |
|-------|------|-------------|
| `grid_power_mean` | kW | Grid power (+ import, - export) |
| `pcs_power_mean` | kW | Battery power (+ discharge, - charge) |
| `pv1_power_mean` | kW | PV string 1 power |
| `pv2_power_mean` | kW | PV string 2 power |
| `battery_soc` | % | State of charge |
| `active_rule_id` | string | Currently executing schedule rule |
| `active_rule_action` | string | Action type of active rule |
| `active_rule_power` | kW | Power setpoint of active rule |

### Aggregation Strategy

All aggregation Lambdas compute the `mean` of each field over their respective window. The pipeline is:

- **5s raw** → **1m mean** → **15m mean** → **1h mean**
- Each Lambda reads from the previous tier's bucket and writes to its own bucket
- Backfill scripts (`scripts/backfill-1m.py`, `backfill-15m.py`, `backfill-1h.py`) exist for gap recovery

## 2. Live Monitoring

Real-time energy flow displayed on the Monitor tab.

```
┌──────────┐    Flux query      ┌──────────┐    HTTP POST     ┌───────────┐
│  Mobile  │ ──────────────────▶│ Supabase │ ───────────────▶ │ InfluxDB  │
│   App    │    (via edge fn)   │influx-   │   (Flux query)   │  Cloud    │
│          │ ◀──────────────────│proxy     │ ◀─────────────── │ aiess_v1  │
│ Monitor  │    CSV response    │          │   CSV response    │           │
│   Tab    │                    └──────────┘                   └───────────┘
└──────────┘
```

**Client flow:**
1. `useLiveData(siteId)` hook (React Query, 5s refetchInterval)
2. Calls `fetchLiveData(siteId)` in [lib/influxdb.ts](../../lib/influxdb.ts)
3. Two Flux queries:
   - **Live:** Last data point from `aiess_v1` (5s bucket) for current values
   - **Averages:** 1-minute and 5-minute mean from `aiess_v1_1m` for trend display
4. Results parsed into `LiveData` object
5. `EnergyFlowSVG` derives `FlowState` per path and renders animated diagram

**Polling interval:** 5 seconds (matches telemetry ingestion rate)

## 3. Analytics Charts

Historical data for the Usage Data sub-tab.

```
┌──────────┐                    ┌──────────┐                   ┌───────────┐
│  Mobile  │    Flux query      │ Supabase │    Flux query     │ InfluxDB  │
│   App    │ ──────────────────▶│influx-   │ ───────────────▶  │  Cloud    │
│          │                    │proxy     │                    │           │
│Analytics │ ◀──────────────────│          │ ◀─────────────── │ auto-     │
│Usage Tab │    CSV response    └──────────┘   CSV response    │ bucket    │
└──────────┘                                                   └───────────┘
```

**Auto-bucket selection** based on time range:

| Time Range | Bucket | Resolution | Typical Points |
|------------|--------|------------|----------------|
| 24h | `aiess_v1_1m` | 1 minute | ~1,440 |
| 7d | `aiess_v1_15m` | 15 minutes | ~672 |
| 30d | `aiess_v1_1h` | 1 hour | ~720 |
| 365d | `aiess_v1_1h` | 1 hour | ~8,760 |

**Client flow:**
1. `fetchChartData(siteId, timeRange, selectedDate)` selects the appropriate bucket
2. Queries `energy_telemetry` measurement with field filters
3. Returns `ChartDataPoint[]` with grid, battery, PV, load, SoC values
4. `lib/analytics.ts` computes derived metrics (cycles, breakdown, efficiency, peaks)
5. Chart components render via `react-native-gifted-charts`

**Simulation overlay:**
- `fetchSimulationData(siteId, start, end)` queries `energy_simulation` measurement
- Data from forecast-engine Lambda merged as dashed overlay on EnergyFlowChart

## 4. Energy Forecasts

PV production and load forecasting pipeline.

```
┌──────────────┐                    ┌───────────────────┐
│  Open-Meteo  │   Weather API      │  forecast-engine  │
│     API      │ ──────────────────▶│     Lambda        │
└──────────────┘                    │                   │
                                    │  1. Fetch weather  │
┌──────────────┐   Site config      │  2. Load site cfg  │
│   DynamoDB   │ ──────────────────▶│  3. Run PV model   │
│  site_config │                    │  4. Run load model  │
└──────────────┘                    │  5. Write results   │
                                    └────────┬──────────┘
                                             │
                                      ┌──────▼───────┐
                                      │   InfluxDB   │
                                      │  aiess_v1_1h │
                                      │  energy_     │
                                      │  simulation  │
                                      └──────────────┘
```

**Trigger schedule:**
- Every 3 hours: 48-hour ahead forecast
- Once daily: 7-day ahead forecast

**Forecast data fields:**
- `pv_power_estimated` (kW)
- `load_power_estimated` (kW)
- `energy_balance` (kW, PV - load)
- `irradiance` (W/m2)
- `temperature` (C)
- `cloud_cover` (%)
- `wind_speed` (m/s)

**Client reads:**
- `useForecastData` hook → `fetchSimulationData`
- ForecastView renders charts, accuracy comparison, weather section

## 5. Financial Calculations

Financial metrics pipeline (energy costs, savings, ROI).

```
┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐
│InfluxDB   │  │InfluxDB   │  │ DynamoDB  │  │ DynamoDB  │
│energy_    │  │tge_rdn    │  │site_config│  │aiess_     │
│telemetry  │  │(prices)   │  │.financial │  │tariff_data│
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │              │              │              │
      └──────────────┴──────────────┴──────────────┘
                           │
                    ┌──────▼──────────┐
                    │ financial-engine │
                    │     Lambda      │
                    │                 │
                    │ For each hour:  │
                    │ 1. Resolve      │
                    │    energy price │
                    │ 2. Resolve      │
                    │    tariff rate  │
                    │ 3. Calculate    │
                    │    financials   │
                    └──────┬─────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼───────┐         ┌──────▼──────────┐
       │   InfluxDB   │         │    DynamoDB      │
       │  financial_  │         │  aiess_financial │
       │  metrics     │         │  _summaries      │
       │  (hourly)    │         │  (monthly)       │
       └──────────────┘         └──────────────────┘
```

**Daily trigger:** EventBridge at 1:00 UTC (2:00 AM CET), processes yesterday's data.

**Recalculation:** On-demand via Lambda invoke with `mode: 'recalculate'`, `start_date`, `end_date`.

**Price resolution:**
- Fixed: static value from settings
- TGE RDN: hourly spot price from `tge_rdn` measurement (PLN/MWh → PLN/kWh)
- Calendar: monthly or quarterly prices from settings map

**Distribution tariff resolution:**
- Fetch tariff definition from `aiess_tariff_data` (cached per invocation)
- Classify hour: weekday / Saturday / Sunday+holiday (13 Polish holidays)
- Match zone schedule to find applicable rate

See [docs/financial_analysis/](../financial_analysis/) for detailed calculation formulas.

**Client-side read path:**

```
       ┌──────────────┐
       │   InfluxDB   │
       │  financial_  │
       │  metrics     │
       │  (hourly)    │
       └──────┬───────┘
              │ Flux: aggregateWindow(every: 1mo, fn: sum)
       ┌──────▼───────┐
       │ influx-proxy │
       │  (Supabase   │
       │   Edge Fn)   │
       └──────┬───────┘
              │ CSV response
       ┌──────▼──────────────────────┐
       │  lib/financial.ts           │
       │  fetchMonthlyFinancialSummary │
       │                             │
       │  1. Parse CSV into          │
       │     raw monthly sums        │
       │  2. Compute derived fields: │
       │     - peak shaving savings  │
       │     - battery cycles        │
       │     - cumulative savings    │
       │     - ROI %, break-even     │
       │     - fixed fees, moc cost  │
       └──────┬──────────────────────┘
              │ MonthlyFinancialSummary[]
       ┌──────▼──────────────────────┐
       │  FinancialView.tsx (parent) │
       │  - loads data once          │
       │  - fallback to projected    │
       │    mock data if empty       │
       │  - passes monthlySummaries  │
       │    to sub-views via props   │
       └──────┬──────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
 Battery    PV      System
  View     View      View
```

**Derived fields** use `FinancialSettings` (from DynamoDB `site_config.financial`) and `SiteConfig.battery.capacity_kwh` for cycle estimation. When no real data is available (financial-engine Lambda hasn't run yet), `generateMockMonthlySummaries()` provides projected data with a visual banner indicator.

## 6. Schedule Rules

Rule creation and execution pipeline.

```
┌──────────┐   POST /schedules   ┌──────────┐   HTTP POST    ┌───────────┐
│  Mobile  │ ──────────────────▶ │ Supabase │ ─────────────▶ │  AWS API  │
│   App    │                     │ aws-proxy│                 │  Gateway  │
│          │ ◀──────────────────│          │ ◀───────────── │           │
│Schedule  │   JSON response     └──────────┘   JSON          └─────┬─────┘
│  Tab     │                                                        │
└──────────┘                                                  ┌─────▼─────┐
                                                              │Schedules  │
                                                              │  API      │
                                                              │(Lambda)   │
                                                              └─────┬─────┘
                                                                    │
                                                              ┌─────▼─────┐
                                                              │  Rule     │
                                                              │ Execution │
                                                              │  Engine   │
                                                              └───────────┘
```

**CRUD operations:**
- `GET /schedules/{siteId}` → returns full schedule with rules grouped by priority
- `POST /schedules/{siteId}` → saves updated schedule (full replacement within a priority tier)

**Rule execution:** Rules are evaluated by the on-site controller based on priority (P4 highest → P9 lowest), conditions (time, SoC, grid power), and validity period.

## 7. AI Chat

Conversational AI pipeline.

```
┌──────────┐  POST /chat   ┌──────────┐  POST    ┌──────────┐
│  Mobile  │ ─────────────▶│ Supabase │ ───────▶ │  AWS API │
│   App    │               │ aws-proxy│          │  Gateway │
│  AI Tab  │ ◀─────────────│          │ ◀─────── │          │
└──────────┘  JSON         └──────────┘  JSON     └────┬─────┘
                                                       │
                                                 ┌─────▼──────┐
                                                 │  bedrock-  │
                                                 │  chat      │
                                                 │  Lambda    │
                                                 └─────┬──────┘
                                                       │
                                                 ┌─────▼──────┐
                                                 │  Bedrock   │
                                                 │  Agent     │
                                                 │  Runtime   │
                                                 └─────┬──────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                                   ┌──────▼──────┐          ┌──────▼──────┐
                                   │  bedrock-   │          │   Direct    │
                                   │  action     │          │  Response   │
                                   │  Lambda     │          │  (text)     │
                                   └──────┬──────┘          └─────────────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                        ┌─────▼───┐ ┌─────▼───┐ ┌────▼────┐
                        │DynamoDB │ │Schedules│ │InfluxDB │
                        │site_cfg │ │  API    │ │ queries │
                        └─────────┘ └─────────┘ └─────────┘
```

**Agent tools (actions the AI can execute):**
- `send_schedule_rule` — create/update a schedule rule
- `delete_schedule_rule` — delete a rule
- `set_system_mode` — change operating mode
- `set_safety_limits` — update SoC limits
- InfluxDB queries — fetch energy data for analysis
- Site config reads — get current system configuration

**Confirmation flow:** Actions that modify the system require user confirmation. The AI returns a `confirmation` response with tool details; the user accepts or rejects; the result is sent back via `sendConfirmationResult`.

## 8. Site Configuration

Configuration management pipeline.

```
┌──────────┐  PUT /site-config  ┌──────────┐  POST      ┌───────────┐
│  Mobile  │ ─────────────────▶ │ Supabase │ ─────────▶ │  AWS API  │
│   App    │                    │ aws-proxy│            │  Gateway  │
│Settings  │ ◀─────────────────│          │ ◀───────── │           │
│  Tab     │   JSON response    └──────────┘   JSON     └─────┬─────┘
└──────────┘                                                   │
                                                         ┌─────▼───────┐
                                                         │ site-config │
                                                         │   Lambda    │
                                                         └─────┬───────┘
                                                               │
                                                  ┌────────────┴────────┐
                                                  │                     │
                                           ┌──────▼──────┐      ┌──────▼──────┐
                                           │  DynamoDB   │      │ AWS Location│
                                           │ site_config │      │   Service   │
                                           └─────────────┘      │ (geocoding) │
                                                                └─────────────┘
```

**Operations:**
- `GET /site-config/{siteId}` → full site config
- `PUT /site-config/{siteId}` → partial update (merge)
- `PUT /site-config/{siteId}/geocode` → geocode address, return lat/lng, save to config

**Client caching:** React Query with 5-minute stale time, optimistic updates on save.

## 9. TGE Energy Prices

Spot market price ingestion.

```
┌───────────┐                    ┌──────────────┐
│  TGE/PSE  │   (external feed)  │  InfluxDB    │
│  data     │ ──────────────────▶│  aiess_v1_1h │
│  source   │                    │  tge_rdn     │
└───────────┘                    │  measurement │
                                 └──────────────┘
```

**Measurement:** `tge_rdn` in `aiess_v1_1h` bucket
**Field:** `price_pln_mwh` (PLN per MWh)

Used by:
- Financial engine (import/export price resolution for TGE RDN model)
- Analytics Usage Data tab (TgePriceChart — colored bars by price band)
- AI chat (price queries)

## Summary: Data Source to Screen Mapping

| Screen | Data Source | Bucket/Table | Polling |
|--------|------------|--------------|---------|
| Monitor | `fetchLiveData` | `aiess_v1` (5s) | 5s |
| Analytics — Usage | `fetchChartData` | auto (1m/15m/1h) | on-demand |
| Analytics — Forecasts | `fetchSimulationData` | `aiess_v1_1h` (simulation) | on-demand |
| Analytics — Financial | `fetchHourlyFinancialData` | `aiess_v1_1h` (financial) | on-demand |
| Analytics — Financial | `fetchMonthlyFinancialSummary` | `aiess_v1_1h` (financial, aggregated monthly) | on-demand |
| Analytics — Battery | `fetchBatteryLiveData` | `aiess_v1` (5s) | 5s |
| Analytics — Battery | `fetchBatteryDetail` | `battery_detail` | 60s |
| Schedule | `getSchedules` | Schedules API | on-focus |
| Settings | `getSiteConfig` | `site_config` (DynamoDB) | 5min stale |
| AI Chat | `sendChatMessage` | Bedrock Agent | on-send |
