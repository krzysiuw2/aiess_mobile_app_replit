# 06 — Analytics Tab

## Overview

The Analytics tab is the most data-rich screen in the application, providing comprehensive energy data visualization, forecasting, financial analysis, and battery health monitoring across **four sub-tabs**:

| Sub-tab | Icon | Key |
|---|---|---|
| Usage Data | `BarChart2` | `usage` |
| Forecasts | `CloudSun` | `forecasts` |
| Financial Analysis | `DollarSign` | `financial` |
| Battery Data | `Activity` | `battery` |

The tab bar uses a compact **icon-only** layout for inactive tabs and expands to **icon + text** for the active tab. The active pill gets `flex: 1` with `Colors.primary` background, while inactive pills collapse to icon-only width. This creates a smooth visual transition when switching tabs.

**Entry point:** [`app/(tabs)/analytics.tsx`](../app/(tabs)/analytics.tsx)

---

## Sub-tab 1: Usage Data

### Function

Historical energy data visualization with multiple chart types. Displays telemetry from InfluxDB across configurable time ranges, augmented with simulation data for sites with unmonitored PV arrays. Computes derived metrics (cycles, peak demand, efficiency, energy breakdown) entirely client-side from the fetched data points.

### UI/UX

**Time Range Selector** — four pill buttons: `24h`, `7d`, `30d`, `365d`. Each time range maps to a different InfluxDB pre-aggregated bucket for optimal query performance.

**Date Navigation** — left/right chevron arrows (`ChevronLeft`/`ChevronRight`) step by the current period (day, week, month, year). A center button opens a **DatePickerModal** (pure-JS three-column scroller for year/month/day, Expo Go compatible — no native date picker dependency). Future dates are capped at +2 days.

**Field Toggles** — pill-shaped toggle buttons with colored dots for each data series:
- `gridPower` (default: on)
- `batteryPower` (default: on)
- `pvPower` (default: on)
- `compensatedPower` (factory load, default: off)
- `soc` (default: on)

Each toggle shows an `Eye`/`EyeOff` icon and applies a tinted background when active.

**Charts** (rendered in scroll order):

1. **EnergyFlowChart** — Multi-line chart ([`components/analytics/EnergyFlowChart.tsx`](../components/analytics/EnergyFlowChart.tsx)). Builds a unified timeline that merges real telemetry with simulation forecast data. Real data renders as solid lines; forecast sections render as dashed lines via `lineSegments`. Supports up to 5 data series (grid, battery, PV, load, SoC). SoC renders on a secondary Y-axis (0–100%). Interactive pointer tooltip shows all visible field values. Time slots are downsampled per range (1h for 24h, 3h for 7d, 24h for 30d, 24h for 365d). Area fills are enabled for 30d/365d views.

2. **TgePriceChart** — Colored bar chart ([`components/analytics/TgePriceChart.tsx`](../components/analytics/TgePriceChart.tsx)). Only shown when site tariff is `dynamic` or `time_of_use`. Bars are color-coded by price band: green (<300 PLN/MWh), orange (300–600), red (>600). Displays current price badge with PLN/MWh and PLN/kWh. Focus-on-press tooltip shows hourly interval and price. Auto-sizes bar width based on data point count.

3. **EnergyDonutChart** — Donut/pie chart ([`components/analytics/EnergyDonutChart.tsx`](../components/analytics/EnergyDonutChart.tsx)). Shows energy source breakdown (Grid %, PV %, Battery %) using `PieChart` from `react-native-gifted-charts`. Center label shows total kWh. Legend with colored dots beside the chart. Focus-on-press interaction.

4. **EnergySummaryCards** — 6 KPI cards in 3 rows of 2 ([`components/analytics/EnergySummaryCards.tsx`](../components/analytics/EnergySummaryCards.tsx)):
   - Grid Import (kWh) / Grid Export (kWh)
   - Battery Charged (kWh) / Battery Discharged (kWh)
   - PV Production (kWh) / Average SoC (%)
   
   Each card has a colored left border matching the data series color.

5. **EnergyBarsChart** — Grouped stacked bar chart ([`components/analytics/EnergyBarsChart.tsx`](../components/analytics/EnergyBarsChart.tsx)). Groups data by hour (24h), day (7d), day (30d), or month (365d). Three stacked segments: grid import, PV production, grid export. Legend and axis label below.

6. **SocBandChart** — Line chart with optional min/max band ([`components/analytics/SocBandChart.tsx`](../components/analytics/SocBandChart.tsx)). Shows SoC mean line with shaded area between `socMin` and `socMax` (when available from pre-aggregated buckets). Stats row above chart: Current, Min, Max, Range. Interactive pointer tooltip. Y-axis fixed 0–100%.

7. **LoadCompositionChart** — Stacked bar chart ([`components/analytics/LoadCompositionChart.tsx`](../components/analytics/LoadCompositionChart.tsx)). Uses `prepareStackedAreaData()` from analytics.ts to compute load composition: from Grid, from PV, from Battery. Groups by time period. Shows average power (kW).

8. **KPICards** — Two KPI cards in a row ([`components/analytics/KPICard.tsx`](../components/analytics/KPICard.tsx)):
   - Peak Grid Demand (kW with timestamp)
   - Peak Factory Load (kW with timestamp)

9. **CyclesBarChart** — Bar chart ([`components/analytics/CyclesBarChart.tsx`](../components/analytics/CyclesBarChart.tsx)). Groups battery cycles by period (4h buckets for 24h, daily for 7d, weekly for 30d, monthly for 365d). Summary row shows total cycles. Top labels on bars show per-period cycle count.

10. **Efficiency KPICards** — Two KPI cards:
    - Self-Consumption (% of PV used directly)
    - Grid Independence (% of load covered by PV + Battery)

### Backend

**Data fetching** ([`lib/influxdb.ts`](../lib/influxdb.ts)):

- **`fetchChartData(siteId, timeRange, selectedDate)`** — Auto-selects the pre-aggregated InfluxDB bucket based on time range:
  - `24h` → `aiess_v1_1m` bucket (1-minute aggregation, 5-minute window)
  - `7d` → `aiess_v1_15m` bucket (15-minute aggregation, 1-hour window)
  - `30d` → `aiess_v1_1h` bucket (1-hour aggregation, 6-hour window)
  - `365d` → `aiess_v1_1h` bucket (1-hour aggregation, 1-day window)
  
  Uses Flux queries with `aggregateWindow(every: ..., fn: mean)` and `pivot()`. Fields: `grid_power_mean`, `pcs_power_mean`, `total_pv_power_mean`, `soc_mean`, `compensated_power_mean`, `soc_min`, `soc_max`. Calendar-aligned period boundaries via `computePeriodRange()`.

- **`fetchSimulationData(siteId, start, end)`** — Queries `energy_simulation` measurement from `aiess_v1_1h` bucket. Returns `SimulationDataPoint[]` with fields: `pv_estimated`, `pv_forecast`, `load_forecast`, `factory_load_corrected`, `energy_balance`, `weather_gti`, `weather_temp`, `weather_cloud_cover`, `weather_code`, `weather_wind_speed`, `source`.

- **`fetchTgePrices(start, end)`** — Queries `tge_energy_prices` bucket, `energy_prices` measurement, `price` field. Returns `TgePricePoint[]` (time + price in PLN/MWh).

- **PV augmentation** — For sites with unmonitored PV arrays, the main screen merges `pvEstimated` from simulation data into telemetry data and recalculates `factoryLoad` via `calculateFactoryLoad(gridPower, pvPower + pvEstimated, batteryPower)`.

**Analytics calculations** ([`lib/analytics.ts`](../lib/analytics.ts)):

- `calculateBatteryCycles(data)` — Counts cycles from SoC time series. One cycle = 100% SoC change. Only counts positive SoC differences (charge events).
- `calculateEnergyBreakdown(data, timeRange)` — Computes % from Grid, PV, Battery by integrating power over time.
- `calculateEfficiencyMetrics(data)` — Self-consumption (PV self-consumed / total PV) and grid independence (load from PV+battery / total load).
- `findPeakDemand(data)` — Returns peak grid import and peak factory load with timestamps.
- `prepareStackedAreaData(data)` — Splits each data point into positive contributions (fromGrid, fromPV, fromBattery).
- `formatTimeLabel(value, timeRange, locale)` — Formats x-axis labels per time range and locale.

**Tools used:** InfluxDB Cloud (Flux queries via edge proxy), `react-native-gifted-charts` (LineChart, BarChart, PieChart), `lucide-react-native` icons.

---

## Sub-tab 2: Forecasts

### Function

Displays PV production forecasts, load forecasts, energy balance projections, solar irradiance, forecast accuracy metrics, daily summary cards, and weather forecasts. All data comes from the `energy_simulation` measurement which is populated by the forecast-engine Lambda.

### UI/UX

**Entry point:** [`components/analytics/ForecastView.tsx`](../components/analytics/ForecastView.tsx)

**Time Range Selector** — two pills: `48h` and `7d`.

**Field Toggles** — four toggleable series:
- `pvForecast` (PV forecast, green)
- `loadForecast` (Load forecast, blue)
- `energyBalance` (Energy balance, surplus/deficit)
- `irradiance` (GTI irradiance, orange)

**Charts:**

1. **ForecastChart** ([`components/analytics/ForecastChart.tsx`](../components/analytics/ForecastChart.tsx)) — Main multi-line chart with:
   - PV forecast and load forecast on the primary Y-axis (kW)
   - GTI irradiance on the secondary Y-axis (W/m²) with area fill
   - Slot configuration: 48h = 1h intervals (48 slots), 7d = 3h intervals (56 slots)
   - Data is bucketed and averaged per slot, filtered to `source === 'forecast'`
   - Interactive pointer tooltip with all visible field values
   - **Energy Balance sub-chart** — separate `LineChart` below the main chart, showing surplus (positive, green area) and deficit (negative, red area) as two data series with `mostNegativeValue` support. Dynamic Y-axis scaling with minimum ratio enforcement between positive and negative ranges.

2. **ForecastAccuracyChart** ([`components/analytics/ForecastAccuracyChart.tsx`](../components/analytics/ForecastAccuracyChart.tsx)) — Compares yesterday's actual telemetry with forecast predictions:
   - Fetches yesterday's actual data via `fetchChartData(deviceId, '24h', yesterday)`
   - Overlays actual (solid lines) vs. forecast (dashed lines) for both PV and Load
   - Handles sites with mixed monitored/unmonitored PV: compares metered PV actual vs. monitored-portion forecast (`pvForecast - pvEstimated`), and augmented load actual vs. `loadForecast`
   - **MAPE KPI cards**: computes Mean Absolute Percentage Error for PV and Load forecasts. PV MAPE shows "N/A" if no metered PV exists.

3. **ForecastSummaryCards** ([`components/analytics/ForecastSummaryCards.tsx`](../components/analytics/ForecastSummaryCards.tsx)) — Horizontally scrollable per-day summary cards (3 days for 48h, 7 days for 7d):
   - Weather icon (from WMO weather code via `getWeatherIcon()`)
   - Temperature range (min/max °C)
   - PV Yield (kWh), Peak PV (kW), Avg Load (kW)
   - Surplus/Deficit (kWh, color-coded green/red)
   - Self-sufficiency (%, color-coded: ≥80% green, ≥40% orange, <40% red)
   - "Today" card has highlighted border

4. **WeatherForecastSection** ([`components/analytics/WeatherForecastSection.tsx`](../components/analytics/WeatherForecastSection.tsx)):
   - **Hourly weather strip** — horizontal ScrollView of compact cards with hour, weather icon, temperature, cloud cover mini-bar
   - **Temperature chart** — line chart with area fill (°C), supports negative values
   - **Cloud cover chart** — line chart with area fill (0–100%)
   - **Wind speed chart** — line chart with area fill (m/s)

### Backend

**Data source:** The Forecasts sub-tab fetches a wider simulation window from `energy_simulation` (yesterday → +8 days) when the tab becomes active. Uses `fetchSimulationData()` from [`lib/influxdb.ts`](../lib/influxdb.ts).

**`useForecastData` hook** ([`hooks/useForecastData.ts`](../hooks/useForecastData.ts)) — Reusable hook wrapping `fetchSimulationData()`. Computes date ranges per `TimeRange` and provides `{ data, loading, error, refetch }`. Currently used directly in the main analytics screen rather than via the hook (the screen manages its own `forecastSimData` state).

**forecast-engine Lambda** (AWS):
- Runs every **3 hours** for the 48h forecast and **daily** for the 7d forecast
- Sources weather data from the **Open-Meteo API** (GHI/GTI irradiance, temperature, cloud cover, wind speed, weather codes)
- Computes PV production forecasts using irradiance-to-power models parameterized per site
- Computes load forecasts from historical load patterns
- Writes results to the `energy_simulation` measurement in InfluxDB with `source: 'forecast'`

**Tools used:** InfluxDB Cloud, Open-Meteo API, AWS Lambda, `react-native-gifted-charts` (LineChart), `lucide-react-native` icons.

---

## Sub-tab 3: Financial Analysis

### Function

Financial performance tracking for energy system investments. Tracks ROI progress, cumulative savings, cost breakdowns, and projected break-even dates for battery (BESS), PV, and combined system investments. Sub-sub-tabs are conditionally shown based on which CAPEX values are configured in the site's financial settings.

For detailed financial analysis documentation, see [`docs/financial_analysis/`](../docs/financial_analysis/).

### UI/UX

**Entry point:** [`components/analytics/FinancialView.tsx`](../components/analytics/FinancialView.tsx)

**Sub-sub-tabs** — pill selector with up to three tabs:
- **Battery** — shown only if `bess_capex_pln` is configured
- **PV** — shown only if `pv_capex_pln` is configured
- **System** — always shown (combined view)

Available tabs are computed from `siteConfig.financial` (from `useSiteConfig` hook). If no financial settings exist, a configuration prompt card with a button to navigate to `/(tabs)/settings/financial` is shown.

**Period Selector** — `Monthly` / `Yearly` toggle with date navigation (left/right chevrons). Monthly view shows month name + year, yearly view shows year only.

**Battery sub-view** ([`components/analytics/FinancialBatteryView.tsx`](../components/analytics/FinancialBatteryView.tsx)):
- `ROIProgressCard` — progress bar showing cumulative savings vs. BESS CAPEX, percentage, estimated break-even date
- KPI cards: Arbitrage Savings, Peak Shaving Savings, Cost per Cycle, Savings per Cycle, Battery Cycles, Total Battery Savings
- `ROITimelineChart` — cumulative savings line with dashed CAPEX reference line, break-even marker
- Monthly Arbitrage bar chart

**PV sub-view** ([`components/analytics/FinancialPVView.tsx`](../components/analytics/FinancialPVView.tsx)):
- `ROIProgressCard` — progress bar showing cumulative savings vs. PV CAPEX
- KPI cards: Self-Consumption Savings, Export Revenue, PV Production (kWh), Self-Consumption Ratio (%), Avoided Grid Import (kWh), Total PV Savings
- `ROITimelineChart` — cumulative savings line with CAPEX reference
- Monthly PV Savings bar chart

**System sub-view** ([`components/analytics/FinancialSystemView.tsx`](../components/analytics/FinancialSystemView.tsx)):
- `ROIProgressCard` — combined CAPEX (PV + BESS)
- KPI cards: Total Net Savings, Total Energy Cost, Distribution Cost, Moc Zamówiona (contracted capacity), Fixed Monthly Fees, ROI %
- `CostBreakdownChart` — stacked bar chart with segments: Energy Cost, Distribution, Moc Zamówiona, Fixed Fees
- `ROITimelineChart` — combined cumulative savings vs. combined CAPEX

**Shared components:**
- [`ROIProgressCard`](../components/analytics/ROIProgressCard.tsx) — Shows percentage, savings/CAPEX amounts, progress bar, break-even date, and installation date
- [`ROITimelineChart`](../components/analytics/ROITimelineChart.tsx) — Line chart with cumulative savings area fill and a dashed red CAPEX reference line. Configurable `savingsKey` (`pv_total_savings_pln` | `battery_total_savings_pln` | `total_savings_pln`). Shows break-even marker when cumulative crosses CAPEX.
- [`CostBreakdownChart`](../components/analytics/CostBreakdownChart.tsx) — Stacked bar chart with 4 cost segments: Energy (blue), Distribution (amber), Moc Zamówiona (red), Fixed Fees (gray). Auto-sizing bars and Y-axis label formatting (1k, 2k...).
- [`KPICard`](../components/analytics/KPICard.tsx) — Reusable card with icon circle, value, title, optional subtitle. Colored left border and icon background tint.

### Backend

**Data layer** ([`lib/financial.ts`](../lib/financial.ts)):
- `fetchHourlyFinancialData(siteId, from, to)` — Queries `financial_metrics` measurement from `aiess_v1_1h` bucket. Fields: `energy_cost_pln`, `distribution_cost_pln`, `seller_margin_cost_pln`, `export_revenue_pln`, `pv_self_consumed_kwh`, `pv_self_consumed_value_pln`, `battery_charge_cost_pln`, `battery_discharge_value_pln`, `battery_arbitrage_pln`, `total_rate_pln_kwh`, `grid_import_kwh`, `grid_export_kwh`, `battery_charge_kwh`, `battery_discharge_kwh`, `pv_production_kwh`.
- `fetchMonthlyFinancialSummary(siteId, from, to, financialSettings, batteryCapacityKwh)` — Aggregates hourly `financial_metrics` from InfluxDB into monthly sums using a Flux `aggregateWindow(every: 1mo, fn: sum)` query via the `influx-proxy` edge function. Returns ~12 rows per year. Derived fields (ROI %, cumulative savings, break-even dates, battery cycles, peak shaving savings, fixed fees, moc zamówiona) are computed client-side from `FinancialSettings` and `SiteConfig.battery.capacity_kwh`.
- `generateMockMonthlySummaries(months, financialSettings)` — Generates projected/estimated data used as fallback when no real `financial_metrics` data exists in InfluxDB (e.g. before the financial-engine Lambda has run).

**Data flow architecture:**
1. `FinancialView.tsx` (parent) calls `fetchMonthlyFinancialSummary` on mount and when the period/date changes.
2. If real data is available, it is passed via the `monthlySummaries` prop to all three sub-views (`FinancialBatteryView`, `FinancialPVView`, `FinancialSystemView`).
3. If no data is returned (empty result or error), the parent falls back to `generateMockMonthlySummaries` and displays a **projected-data banner** ("Projected data — real values will appear after nightly calculation").
4. Sub-views are stateless with respect to data — they receive `monthlySummaries` and `dataLoading` from the parent via `FinancialSubViewProps`.

**financial-engine Lambda** (AWS):
- Scheduled daily at **2:00 AM CET** via EventBridge
- Reads hourly telemetry from InfluxDB and tariff structure from DynamoDB
- Computes hourly financial metrics (energy costs, arbitrage value, peak shaving savings)
- Writes hourly results to `financial_metrics` measurement in InfluxDB (`aiess_v1_1h` bucket)
- Aggregates monthly summaries to `aiess_financial_summaries` DynamoDB table

**Financial settings** — stored in DynamoDB site configuration (`siteConfig.financial`), type: `FinancialSettings`. Includes: `bess_capex_pln`, `pv_capex_pln`, `bess_installation_date`, `pv_installation_date`, `fixed_monthly_fee_pln`, `moc_zamowiona_price_pln_kw`, `moc_zamowiona_before_bess_kw`, `moc_zamowiona_after_bess_kw`.

**Tools used:** InfluxDB Cloud, DynamoDB, AWS Lambda, Supabase Edge Function (`influx-proxy`), `react-native-gifted-charts` (LineChart, BarChart), `lucide-react-native` icons.

---

## Sub-tab 4: Battery Data

### Function

Real-time battery health monitoring with two tiers of data at different polling intervals. Provides live cell-level telemetry, alarm monitoring, stack summary metrics, and individual cell voltage/temperature heatmaps.

### UI/UX

**Entry point:** [`components/analytics/BatteryDataView.tsx`](../components/analytics/BatteryDataView.tsx)

Polling is active only while `isActive === true` (the Battery tab is selected). Timers are cleared when navigating away.

**Sections:**

1. **BatteryLiveSummary** ([`components/analytics/BatteryLiveSummary.tsx`](../components/analytics/BatteryLiveSummary.tsx)) — Two side-by-side cards:
   - **Voltages card** (⚡ icon): Min Cell Voltage (mV), Max Cell Voltage (mV), Voltage Delta (mV)
   - **Temperatures card** (🌡 icon): Min Cell Temp (°C), Max Cell Temp (°C), Temp Delta (°C)
   
   Each metric row has a colored status dot (green/yellow/red) based on health thresholds from `lib/batteryHealth.ts`. Values use `fontVariant: ['tabular-nums']` for stable alignment.

2. **BatteryAlarms** ([`components/analytics/BatteryAlarms.tsx`](../components/analytics/BatteryAlarms.tsx)) — Active fault display:
   - If no faults: green `CheckCircle` icon with "No Alarms" message
   - If faults: red `AlertTriangle` icon with fault count, plus red badge pills for each active fault register (e.g., "REG 42")
   - Fault data comes from `activeFaults` (comma-separated string) and `activeFaultCount` fields

3. **BatteryDetailView** ([`components/analytics/BatteryDetailView.tsx`](../components/analytics/BatteryDetailView.tsx)) — Stack-level metrics and cell heatmaps:
   - **Stack Summary card** — 2×2 grid: Stack Voltage (V), Stack Current (A), SoC (%), SoH (% with health color). Working mode badge below (Normal/Charge Disabled/Discharge Disabled/Standby/Stop/No Communication) with status dot. Cell count and NTC count.
   - **Cell Voltages Heatmap** — `CellHeatmapGrid` with `unit="mV"`, 6 columns per row. Each cell shows index, value, and unit, color-coded by `getCellVoltageStatus()`.
   - **Cell Temperatures Heatmap** — `CellHeatmapGrid` with `unit="°C"`, 4 columns per row. Color-coded by `getCellTempStatus()`.

4. **CellHeatmapGrid** ([`components/analytics/CellHeatmapGrid.tsx`](../components/analytics/CellHeatmapGrid.tsx)) — Generic grid component:
   - Takes `values: number[]`, `unit: string`, `getStatus` function, `columnsPerRow` (default 6)
   - Each cell: background tinted by health status (25% opacity), text colored by status
   - Shows cell index (1-based), value, and unit
   - Empty slots in last row are filled with spacer views

5. **Timestamps** — Bottom row showing last live update time and last detail update time.

### Backend

**Data fetching** ([`lib/influxdb.ts`](../lib/influxdb.ts)):

- **`fetchBatteryLiveData(siteId)`** — 5-second polling interval (`LIVE_POLL_MS = 5000`). Queries `aiess_v1` bucket (raw, non-aggregated), `energy_telemetry` measurement, range `-1m`, `last()`. Fields: `min_cell_voltage_mv`, `max_cell_voltage_mv`, `voltage_delta_mv`, `min_cell_temp_c`, `max_cell_temp_c`, `active_faults`, `active_fault_count`. Returns `BatteryLiveData`.

- **`fetchBatteryDetail(siteId)`** — 60-second polling interval (`DETAIL_POLL_MS = 60000`). Queries `battery_detail` bucket, `energy_telemetry` measurement, range `-5m`, `last()`. Fields: `stack_voltage_v`, `stack_current_a`, `stack_soc_percent`, `stack_soh_percent`, `stack_wm` (working mode), `cell_count`, `cell_voltage_min/max/delta`, `cell_voltage_csv`, `ntc_count`, `cell_temp_min/max`, `cell_temp_csv`. CSV fields are parsed via `parseCsvToNumbers()`. Returns `BatteryDetailData`.

**Health thresholds** ([`lib/batteryHealth.ts`](../lib/batteryHealth.ts)):

| Metric | Healthy | Warning | Critical |
|---|---|---|---|
| Cell voltage | 3000–3650 mV | <3000 or >3650 mV | <2800 or >3750 mV |
| Voltage delta | ≤30 mV | 31–80 mV | >80 mV |
| Cell temperature | 10–45 °C | <10 or >45 °C | <0 or >55 °C |
| SoH | ≥90% | 80–90% | <80% |
| Working mode | 0 (Normal) | 1–4 (Restricted) | 170 (No Communication) |

Functions: `getVoltageDeltaStatus`, `getMinVoltageStatus`, `getMaxVoltageStatus`, `getCellVoltageStatus`, `getMinTempStatus`, `getMaxTempStatus`, `getCellTempStatus`, `getSohStatus`, `getWorkingModeStatus`, `getOverallBatteryStatus`, `getHealthColor`, `getWorkingModeLabel`, `parseCsvToNumbers`.

**Tools used:** InfluxDB Cloud (two buckets: `aiess_v1` for live 5s data, `battery_detail` for 60s cell-level data), `lucide-react-native` icons.

---

## File Index

| File | Purpose |
|---|---|
| [`app/(tabs)/analytics.tsx`](../app/(tabs)/analytics.tsx) | Main screen, tab routing, Usage Data view, data fetching orchestration |
| [`components/analytics/EnergyFlowChart.tsx`](../components/analytics/EnergyFlowChart.tsx) | Multi-line power chart with forecast overlay |
| [`components/analytics/TgePriceChart.tsx`](../components/analytics/TgePriceChart.tsx) | TGE energy price bar chart (dynamic tariff) |
| [`components/analytics/EnergyDonutChart.tsx`](../components/analytics/EnergyDonutChart.tsx) | Energy source breakdown donut chart |
| [`components/analytics/EnergySummaryCards.tsx`](../components/analytics/EnergySummaryCards.tsx) | 6 energy KPI summary cards |
| [`components/analytics/EnergyBarsChart.tsx`](../components/analytics/EnergyBarsChart.tsx) | Grouped/stacked energy totals bar chart |
| [`components/analytics/SocBandChart.tsx`](../components/analytics/SocBandChart.tsx) | SoC line chart with min/max band |
| [`components/analytics/LoadCompositionChart.tsx`](../components/analytics/LoadCompositionChart.tsx) | Stacked bar chart of load composition |
| [`components/analytics/CyclesBarChart.tsx`](../components/analytics/CyclesBarChart.tsx) | Battery cycles per period bar chart |
| [`components/analytics/KPICard.tsx`](../components/analytics/KPICard.tsx) | Reusable KPI card with icon |
| [`components/analytics/ForecastView.tsx`](../components/analytics/ForecastView.tsx) | Forecasts sub-tab container |
| [`components/analytics/ForecastChart.tsx`](../components/analytics/ForecastChart.tsx) | PV/load/irradiance forecast line chart + energy balance chart |
| [`components/analytics/ForecastAccuracyChart.tsx`](../components/analytics/ForecastAccuracyChart.tsx) | Actual vs. forecast comparison with MAPE KPIs |
| [`components/analytics/ForecastSummaryCards.tsx`](../components/analytics/ForecastSummaryCards.tsx) | Per-day forecast summary cards (horizontal scroll) |
| [`components/analytics/WeatherForecastSection.tsx`](../components/analytics/WeatherForecastSection.tsx) | Weather strip + temperature/cloud/wind mini-charts |
| [`components/analytics/FinancialView.tsx`](../components/analytics/FinancialView.tsx) | Financial sub-tab container with sub-sub-tab routing |
| [`components/analytics/FinancialBatteryView.tsx`](../components/analytics/FinancialBatteryView.tsx) | Battery financial analysis (ROI, arbitrage, peak shaving) |
| [`components/analytics/FinancialPVView.tsx`](../components/analytics/FinancialPVView.tsx) | PV financial analysis (self-consumption, export revenue) |
| [`components/analytics/FinancialSystemView.tsx`](../components/analytics/FinancialSystemView.tsx) | Combined system financial analysis + cost breakdown |
| [`components/analytics/ROIProgressCard.tsx`](../components/analytics/ROIProgressCard.tsx) | ROI progress bar card with break-even estimate |
| [`components/analytics/ROITimelineChart.tsx`](../components/analytics/ROITimelineChart.tsx) | Cumulative savings line vs. CAPEX reference |
| [`components/analytics/CostBreakdownChart.tsx`](../components/analytics/CostBreakdownChart.tsx) | Monthly cost breakdown stacked bar chart |
| [`components/analytics/BatteryDataView.tsx`](../components/analytics/BatteryDataView.tsx) | Battery sub-tab container with polling lifecycle |
| [`components/analytics/BatteryLiveSummary.tsx`](../components/analytics/BatteryLiveSummary.tsx) | Live voltage and temperature summary cards |
| [`components/analytics/BatteryAlarms.tsx`](../components/analytics/BatteryAlarms.tsx) | Active fault / alarm display |
| [`components/analytics/BatteryDetailView.tsx`](../components/analytics/BatteryDetailView.tsx) | Stack summary + cell heatmaps |
| [`components/analytics/CellHeatmapGrid.tsx`](../components/analytics/CellHeatmapGrid.tsx) | Generic color-coded cell grid |
| [`lib/influxdb.ts`](../lib/influxdb.ts) | InfluxDB client (fetchChartData, fetchSimulationData, fetchTgePrices, fetchBatteryLiveData, fetchBatteryDetail) |
| [`lib/analytics.ts`](../lib/analytics.ts) | Analytics calculations (cycles, breakdown, efficiency, peak demand) |
| [`lib/financial.ts`](../lib/financial.ts) | Financial data layer (hourly metrics, InfluxDB monthly aggregation, derived field computation, projected-data fallback) |
| [`lib/batteryHealth.ts`](../lib/batteryHealth.ts) | Battery health thresholds and status helpers |
| [`hooks/useForecastData.ts`](../hooks/useForecastData.ts) | Reusable hook for forecast/simulation data fetching |
