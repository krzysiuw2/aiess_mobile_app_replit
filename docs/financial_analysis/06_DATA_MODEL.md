# 06 — Data Model

This document describes all database schemas used by the Financial Analysis feature.

## InfluxDB

### `financial_metrics` Measurement (Write)

Written by the financial-engine Lambda. One point per hour per site.

**Bucket:** `aiess_v1_1h`

| Component | Name | Type | Description |
|-----------|------|------|-------------|
| Tag | `site_id` | string | Site identifier |
| Field | `energy_cost_pln` | float | Grid import energy cost |
| Field | `distribution_cost_pln` | float | Distribution network fee |
| Field | `seller_margin_cost_pln` | float | Seller margin component |
| Field | `export_revenue_pln` | float | Revenue from grid export |
| Field | `pv_self_consumed_kwh` | float | PV energy consumed on-site |
| Field | `pv_self_consumed_value_pln` | float | Value of self-consumed PV energy |
| Field | `battery_charge_cost_pln` | float | Cost of energy used to charge battery |
| Field | `battery_discharge_value_pln` | float | Value of discharged battery energy |
| Field | `battery_arbitrage_pln` | float | Net battery arbitrage profit |
| Field | `total_rate_pln_kwh` | float | Combined energy + distribution rate |
| Field | `grid_import_kwh` | float | Energy imported from grid |
| Field | `grid_export_kwh` | float | Energy exported to grid |
| Field | `battery_charge_kwh` | float | Energy charged into battery |
| Field | `battery_discharge_kwh` | float | Energy discharged from battery |
| Field | `pv_production_kwh` | float | Total PV production |
| Timestamp | — | nanoseconds | UTC hour timestamp |

**Line protocol example:**
```
financial_metrics,site_id=site-001 energy_cost_pln=5.25,distribution_cost_pln=2.70,seller_margin_cost_pln=0.75,export_revenue_pln=0.0,pv_self_consumed_kwh=12.0,pv_self_consumed_value_pln=6.36,battery_charge_cost_pln=0.0,battery_discharge_value_pln=4.24,battery_arbitrage_pln=4.24,total_rate_pln_kwh=0.53,grid_import_kwh=15.0,grid_export_kwh=0.0,battery_charge_kwh=0.0,battery_discharge_kwh=8.0,pv_production_kwh=12.0 1710288000000000000
```

### `energy_telemetry` Measurement (Read)

Source telemetry consumed by the financial-engine Lambda.

| Field | Description |
|-------|-------------|
| `grid_power_mean` | Grid power (positive = import, negative = export) |
| `pcs_power_mean` | Battery power (positive = discharge, negative = charge) |
| `total_pv_power_mean` | PV production power (always positive) |

### `tge_rdn` Measurement (Read)

TGE RDN spot market energy prices.

| Field | Description |
|-------|-------------|
| `price_pln_mwh` | Spot price in PLN per MWh |

### Flux Queries

**Fetch hourly telemetry:**
```flux
from(bucket: "aiess_v1_1h")
  |> range(start: 2025-01-01T00:00:00Z, stop: 2025-01-02T23:59:59Z)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "site-001")
  |> filter(fn: (r) => r._field == "grid_power_mean"
                     or r._field == "pcs_power_mean"
                     or r._field == "total_pv_power_mean")
```

**Fetch TGE prices:**
```flux
from(bucket: "aiess_v1_1h")
  |> range(start: 2025-01-01T00:00:00Z, stop: 2025-01-02T23:59:59Z)
  |> filter(fn: (r) => r._measurement == "tge_rdn")
  |> filter(fn: (r) => r._field == "price_pln_mwh")
```

**Fetch financial metrics (client-side):**
```flux
from(bucket: "aiess_v1_1h")
  |> range(start: 2025-01-01T00:00:00Z, stop: 2025-02-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "financial_metrics")
  |> filter(fn: (r) => r.site_id == "site-001")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

## DynamoDB

### `aiess_tariff_data` Table

Distribution tariff definitions. Seeded from `docs/tariffs/tariff-data.json`.

**Key schema:**

| Key | Type | Format | Example |
|-----|------|--------|---------|
| `PK` (Hash) | String | `TARIFF#{operator}#{tariff_group}` | `TARIFF#energa#C22` |
| `SK` (Range) | String | `{valid_year}` | `2025` |

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `operator` | String | DSO identifier |
| `tariff_group` | String | Tariff group code |
| `valid_year` | Number | Year the tariff is valid for |
| `zones` | List | Array of zone objects |
| `zones[].name` | String | Zone name (e.g., `peak`, `off_peak`, `shoulder`) |
| `zones[].rate_pln_kwh` | Number | Distribution rate in PLN/kWh |
| `zones[].schedule.weekday` | List | Time ranges for weekdays |
| `zones[].schedule.saturday` | List | Time ranges for Saturdays |
| `zones[].schedule.sunday_holiday` | List | Time ranges for Sundays/holidays |

### `aiess_financial_summaries` Table

Monthly financial aggregations. Written by the financial-engine Lambda.

**Key schema:**

| Key | Type | Format | Example |
|-----|------|--------|---------|
| `PK` (Hash) | String | `FINANCIAL#{site_id}` | `FINANCIAL#site-001` |
| `SK` (Range) | String | `{YYYY-MM}` | `2025-03` |

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `site_id` | String | Site identifier |
| `period` | String | Month period `YYYY-MM` |
| `energy_cost_pln` | Number | Total energy cost for the month |
| `distribution_cost_pln` | Number | Total distribution fees |
| `seller_margin_cost_pln` | Number | Total seller margin |
| `export_revenue_pln` | Number | Total export revenue |
| `total_cost_pln` | Number | Net total cost |
| `pv_self_consumed_kwh` | Number | PV self-consumed energy |
| `pv_self_consumed_value_pln` | Number | Value of PV self-consumption |
| `pv_export_revenue_pln` | Number | Revenue from PV export |
| `pv_total_savings_pln` | Number | Total PV savings |
| `battery_charge_cost_pln` | Number | Battery charging cost |
| `battery_discharge_value_pln` | Number | Battery discharge value |
| `battery_arbitrage_pln` | Number | Net battery arbitrage |
| `peak_shaving_savings_pln` | Number | Moc zamówiona savings |
| `battery_total_savings_pln` | Number | Total battery savings |
| `total_savings_pln` | Number | Combined PV + battery savings |
| `cumulative_savings_pln` | Number | Running total of all savings |
| `fixed_monthly_fee_pln` | Number | Fixed monthly charges |
| `moc_zamowiona_cost_pln` | Number | Contracted power cost |
| `grid_import_kwh` | Number | Total grid import |
| `grid_export_kwh` | Number | Total grid export |
| `pv_production_kwh` | Number | Total PV production |
| `battery_cycles` | Number | Estimated battery cycles |
| `cost_per_cycle_pln` | Number | Charging cost per cycle |
| `savings_per_cycle_pln` | Number | Savings per cycle |
| `pv_roi_percent` | Number | PV return on investment % |
| `bess_roi_percent` | Number | BESS return on investment % |
| `system_roi_percent` | Number | Combined system ROI % |
| `pv_payback_remaining_months` | Number | Months until PV payback (optional) |
| `bess_payback_remaining_months` | Number | Months until BESS payback (optional) |
| `system_payback_remaining_months` | Number | Months until system payback (optional) |
| `pv_break_even_date` | String | Estimated PV break-even `YYYY-MM` (optional) |
| `bess_break_even_date` | String | Estimated BESS break-even `YYYY-MM` (optional) |
| `system_break_even_date` | String | Estimated system break-even `YYYY-MM` (optional) |
| `updated_at` | String | ISO timestamp of last update |

### `site_config` Table (Extended)

The existing `site_config` table gains a `financial` attribute containing the `FinancialSettings` object (see [03 Settings](03_SETTINGS.md)).

**Key schema:**

| Key | Type |
|-----|------|
| `site_id` (Hash) | String |

**New attribute:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `financial` | Map | Complete `FinancialSettings` object |

## TypeScript Interfaces

All client-side types are defined in `types/financial.ts`:

- `FinancialSettings` — settings stored in site_config
- `HourlyFinancialData` — hourly InfluxDB data shape
- `MonthlyFinancialSummary` — monthly DynamoDB summary shape
- `DistributionTariffEntry`, `TariffZone`, `TariffZoneSchedule` — tariff data shapes
- `FinancialSubTab`, `FinancialPeriod` — UI state types
