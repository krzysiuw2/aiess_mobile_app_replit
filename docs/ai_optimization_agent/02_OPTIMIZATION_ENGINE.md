# AI Optimization Agent — Optimization Engine

The Optimization Engine is a **structured math pipeline** implemented in `lambda/optimization-engine/`. It performs deterministic computations without LLM calls, producing charge/discharge windows, PV self-consumption, peak shaving, and safety constraints for the agent tiers to consume.

---

## 1. Overview

The engine runs in three modes:

| Mode | Horizon | Invoked by |
|------|---------|------------|
| `weekly` | 168 hours (7 days) | Weekly Strategist |
| `daily` | 48 hours | Daily Planner |
| `intraday` | 12 hours | Intraday Adjuster |

**Input:** `site_id`, `site_config`, `mode`

**Output:** `OptimizationResult` with charge/discharge windows, PV surplus windows, peak shaving windows, bell curve limits, tariff zones, projected savings, and safety constraints.

---

## 2. Data Sources

| Source | Data | Purpose |
|--------|------|---------|
| **InfluxDB** | `tge_rdn_prices` (price_pln_mwh) | TGE RDN hourly prices for arbitrage |
| **InfluxDB** | `energy_forecast` (pv_forecast_kw, load_forecast_kw) | PV and load forecasts |
| **InfluxDB** | `energy_telemetry` (soc) | Current battery state of charge |
| **DynamoDB** | `site_config` | Site configuration, `ai_profile`, `power_limits`, etc. |
| **DynamoDB** | `aiess_tariff_data` | Distribution tariff zones and rates |

---

## 3. Pipeline Components

### 3.1 Price Window Optimizer

**Purpose:** Identifies optimal charge and discharge windows based on TGE RDN hourly prices.

**Algorithm:**
1. Sort hourly prices ascending.
2. Select cheapest hours for charging (number needed = `usableCapacity / max_charge_kw`).
3. Select most expensive hours for discharging (number needed = `usableCapacity / max_discharge_kw`).
4. Apply **90% round-trip efficiency** when comparing charge vs discharge economics.
5. Compute profitable spread: `avgDischargePrice - (avgChargePrice / 0.90)`.
6. If spread ≤ 0, return `arbitrage_not_profitable: true` and empty windows.
7. Group consecutive hours into windows for charge and discharge.

**Output:**
- `charge_windows`: `[{ start, end, avg_price_pln_mwh, recommended_power_kw }]`
- `discharge_windows`: `[{ start, end, avg_price_pln_mwh, recommended_power_kw }]`
- `estimated_arbitrage_pln`: Estimated profit from arbitrage

**Config:** `battery_capacity_kwh`, `current_soc`, `max_charge_kw`, `max_discharge_kw`, `safety_soc_min`, `safety_soc_max`, `backup_reserve_pct`

---

### 3.2 PV Self-Consumption Calculator

**Purpose:** Routes surplus PV to battery charging instead of grid export.

**Algorithm:**
1. For each forecast point, compute surplus = `pv_kw - load_kw`.
2. If surplus > 0, charge battery up to `safety_soc_max`, respecting `max_charge_kw`.
3. Track total surplus and self-consumed energy.
4. Group surplus windows by consecutive hours.

**Output:**
- `pv_surplus_windows`: `[{ start, end, surplus_kw }]`
- `total_surplus_kwh`: Total PV surplus over horizon
- `self_consumed_kwh`: Energy stored in battery from PV

**Config:** `battery_capacity_kwh`, `current_soc`, `max_charge_kw`, `export_allowed`, `safety_soc_max`

---

### 3.3 Peak Shaving Calculator

**Purpose:** Identifies hours when load exceeds `moc_zamowiona` (contracted capacity) and recommends discharge to cap grid import.

**Algorithm:**
1. Use `target_grid_kw` or `moc_zamowiona_kw` as limit.
2. Apply **2–3% safety margin** (default 3%): `safeLimit = limit * (1 - safety_margin_pct/100)`.
3. For each forecast point, if `load_kw > safeLimit`, compute overshoot and discharge power needed.
4. Group consecutive hours into peak shaving windows.

**Output:**
- `peak_shaving_needed`: boolean
- `peak_shaving_windows`: `[{ start, end, target_grid_kw, discharge_needed_kw }]`
- `safe_limit_kw`: The effective limit after safety margin

**Config:** `moc_zamowiona_kw`, `target_grid_kw`, `max_discharge_kw`, `battery_capacity_kwh`, `safety_margin_pct`

---

### 3.4 Bell Curve Compliance

**Purpose:** Generates Gaussian export limits for hours when PV is available, mimicking a PV system for grid compliance when `export_follows_sun` is true.

**Algorithm:**
1. If `export_follows_sun` is false, return `bell_curve_active: false`.
2. Compute day length and sunrise/sunset based on day of year and latitude.
3. For each hour, compute a sine-based bell curve: `maxExport = pv_peak_kw * sin(normalized)`.
4. Hours outside sunrise–sunset: `max_export_kw = 0`.
5. Minimum export when active: 1 kW (to avoid zero).

**Output:**
- `bell_curve_active`: boolean
- `bell_curve_limits`: `[{ hour, max_export_kw }]`

**Config:** `export_follows_sun`, `pv_peak_kw`, `latitude`

---

### 3.5 Distribution Tariff Zone Mapper

**Purpose:** Maps each hour to peak/off-peak zones for tariff-aware optimization.

**Algorithm:**
1. Fetch tariff from `aiess_tariff_data` with PK `TARIFF#{operator}#{tariff_group}`, SK `{year}`.
2. Determine day type: `weekday`, `saturday`, or `sunday_holiday`.
3. For each hour, look up zone from `schedule[scheduleKey]` (e.g. `08:00`–`22:00` for peak).
4. Return hourly zones with `zone_name` and `rate_pln_kwh`.

**Output:**
- `zones`: `[{ hour, zone_name, rate_pln_kwh }]`
- `tariff_data`: Full tariff object

**Config:** `distribution_operator`, `distribution_tariff_group`

---

### 3.6 Safety Constraint Validator

**Purpose:** Enforces safety limits and documents them for the agent.

**Constraints enforced:**
- **SoC range:** `safety_soc_min`–`safety_soc_max` (default 5–100%)
- **Max charge:** `max_charge_kw`
- **Max discharge:** `max_discharge_kw`
- **Export buffer:** 1 kW when `export_allowed` is false
- **Import margin:** 2–3% on `grid_capacity_kva` for safe import limit

**Output:**
- `constraints_applied`: List of human-readable constraint strings
- `violations`: Empty list (validation only; violations would trigger rollback elsewhere)

**Config:** `safety_soc_min`, `safety_soc_max`, `max_charge_kw`, `max_discharge_kw`, `grid_capacity_kva`, `export_allowed`, `export_buffer_kw`, `import_safety_margin_pct`

---

## 4. Projected Savings Calculation

The engine produces:

```javascript
projected_savings: {
  arbitrage_pln: priceResult.estimated_arbitrage_pln || 0,
  peak_shaving_pln: peakResult.peak_shaving_needed
    ? (moc_zamowiona_price_pln_kw || 25) * (moc_zamowiona - safe_limit_kw) / 12
    : 0,
  pv_self_consumption_pln: pvResult.self_consumed_kwh * (price_pln_kwh || 0.5),
}
```

---

## 5. Full Output Structure

```javascript
{
  site_id,
  mode,
  timestamp,
  current_soc,
  charge_windows,
  discharge_windows,
  pv_surplus_windows,
  peak_shaving_needed,
  peak_shaving_windows,
  bell_curve_active,
  bell_curve_limits,
  tariff_zones,
  projected_savings,
  constraints_applied,
  data_summary: {
    tge_prices_count,
    forecast_points,
    price_range: { min, max, avg }
  }
}
```

---

## 6. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INFLUX_URL` | `https://eu-central-1-1.aws.cloud2.influxdata.com` | InfluxDB API URL |
| `INFLUX_TOKEN` | — | InfluxDB API token |
| `INFLUX_ORG` | `aiess` | InfluxDB organization |
| `TARIFF_TABLE` | `aiess_tariff_data` | DynamoDB table for distribution tariffs |

---

## 7. Invocation

The engine is invoked by Lambda:

```javascript
const payload = {
  site_id: 'site-123',
  site_config: { /* full site config */ },
  mode: 'daily'  // 'weekly' | 'daily' | 'intraday'
};
```

No direct HTTP API; invoked only by other Lambda functions (Weekly, Daily, Intraday agents).
