# Real-World Patterns

> **Purpose**: Capture operational intelligence that the optimization engine must handle — patterns that come from running real BESS sites, not from textbooks.
> **Last Updated**: 2026-03-19

---

## 1. Battery Health Manager

### The Problem

A naive optimization engine treats the battery like a simple bucket: fill it, empty it, repeat. But real batteries degrade faster with deep cycling. If a site only has 20-30 kWh of PV surplus on a given day, there's no point discharging the battery to 5% the night before — the surplus won't fill it anyway. Deep cycling wears the battery for no economic benefit.

### The Production Pattern

The current production rules already implement smart SoC management, though manually:

```
Monday-Thursday:
  Morning:  Discharge to 40% SoC (WEEKLY-DIS, 06:00-11:00)
  Daytime:  Charge from PV surplus to ~60-70% (LAD-50)
  Evening:  Discharge to 40% SoC (WEEKLY-DIS-EV, 14:00-21:00)
  Overnight: Stay at 40%

  Daily cycle depth: 40% → 60-70% → 40% = ~20-30% depth of discharge
  Battery stress: LOW (shallow cycling)

Friday:
  Morning:  Discharge to 40% SoC (WEEKLY-DIS, 06:00-11:00)
  Daytime:  Charge from PV surplus
  Evening:  Discharge to 2% SoC (RDC-2-ALLDAY, 14:00-21:00)
  Overnight: Stay at 2%

  Daily cycle depth: 40% → 60% → 2% = ~58% depth of discharge
  Battery stress: MODERATE (deeper cycle, but only once per week)
  Purpose: Empty battery for maximum weekend PV absorption
```

### The Algorithm

The optimization engine should compute **optimal daily SoC targets** based on the weekly forecast:

```python
def compute_weekly_soc_plan(weekly_pv_forecast, weekly_load_forecast, site_config):
    daily_surplus = []
    for day in range(7):
        surplus = sum(max(0, pv[h] - load[h]) for h in day_hours(day))
        daily_surplus.append(surplus)

    plan = []
    for day in range(7):
        next_day_surplus = daily_surplus[(day + 1) % 7]
        remaining_week_surplus = sum(daily_surplus[day+1:day+3])  # Next 2 days

        if next_day_surplus > battery_capacity * 0.8:
            # Tomorrow has abundant surplus — empty battery today
            target_discharge_soc = safety_soc_min
        elif next_day_surplus > battery_capacity * 0.3:
            # Tomorrow has moderate surplus — partial discharge
            target_discharge_soc = 100 - (next_day_surplus / battery_capacity * 100)
            target_discharge_soc = max(target_discharge_soc, 20)
        else:
            # Tomorrow has little surplus — keep battery moderate
            target_discharge_soc = 40

        plan.append({
            "day": day,
            "discharge_target_soc": round(target_discharge_soc),
            "expected_surplus_kwh": daily_surplus[day],
            "next_day_surplus_kwh": next_day_surplus
        })

    return plan
```

**Example output for a typical factory:**

| Day | Expected Surplus | Next Day Surplus | Discharge Target | Reasoning |
|-----|-----------------|------------------|------------------|-----------|
| Mon | 25 kWh | 25 kWh | 40% | Moderate surplus tomorrow |
| Tue | 25 kWh | 25 kWh | 40% | Moderate surplus tomorrow |
| Wed | 25 kWh | 25 kWh | 40% | Moderate surplus tomorrow |
| Thu | 25 kWh | 180 kWh (Sat) | 40% | Moderate surplus tomorrow (Fri) |
| Fri | 25 kWh | 180 kWh (Sat) | 5% | High surplus Saturday, empty battery |
| Sat | 180 kWh | 180 kWh (Sun) | 50% | High surplus Sunday, leave room |
| Sun | 180 kWh | 25 kWh (Mon) | 40% | Moderate surplus Monday |

### Battery Longevity Benefits

- **Shallow cycling** (20-30% DoD) during workdays: ~8,000-10,000 cycle life
- **Deep cycling** (80%+ DoD) only on Fridays before weekends: ~1/5 of cycles are deep
- **Weighted average cycle depth**: Significantly better than daily 80% cycling

---

## 2. Multi-Day PV Surplus Optimization (Weekend/Holiday Problem)

### The Problem

Consider a site with 100 kWp PV, 200 kWh battery, and near-zero weekend load:

**Naive approach (Saturday):**
- Saturday sunrise: SoC 5% (emptied Friday evening)
- Saturday 09:00-16:00: PV surplus charges battery to 95% by noon
- Saturday 12:00-16:00: Battery full, PV surplus goes to grid at low feed-in tariff
- **Wasted opportunity**: 4 hours of free PV energy exported instead of stored

**The issue**: Sunday has the same surplus pattern. But the battery is already full from Saturday. We need to distribute battery capacity across both days.

### The Algorithm: Multi-Day Surplus Planner

```python
def plan_multi_day_surplus(
    daily_pv_forecasts,     # List of hourly PV forecast per day
    daily_load_forecasts,   # List of hourly load forecast per day
    current_soc,
    site_config
):
    """Plan battery usage across a multi-day no-discharge period (weekend/holiday)."""

    # Compute total surplus per day
    daily_surplus_kwh = []
    for day_pv, day_load in zip(daily_pv_forecasts, daily_load_forecasts):
        surplus = sum(max(0, pv - load) for pv, load in zip(day_pv, day_load))
        daily_surplus_kwh.append(surplus)

    total_surplus = sum(daily_surplus_kwh)
    usable_capacity = (soc_max - soc_min) / 100 * battery_capacity

    # Distribute battery capacity across days proportionally
    daily_charge_targets = []
    remaining_capacity = usable_capacity

    for i, surplus in enumerate(daily_surplus_kwh):
        if total_surplus > 0:
            day_share = surplus / total_surplus
        else:
            day_share = 1.0 / len(daily_surplus_kwh)

        day_capacity = min(remaining_capacity * day_share, surplus)
        daily_charge_targets.append(day_capacity)

    # Convert to SoC targets
    soc_targets = []
    running_soc = current_soc

    for i, target_kwh in enumerate(daily_charge_targets):
        end_of_day_soc = running_soc + (target_kwh / battery_capacity * 100)
        end_of_day_soc = min(end_of_day_soc, soc_max)
        soc_targets.append({
            "day": i,
            "start_soc": round(running_soc),
            "end_soc": round(end_of_day_soc),
            "charge_kwh": round(target_kwh, 1),
            "surplus_kwh": round(daily_surplus_kwh[i], 1)
        })

        if i < len(daily_charge_targets) - 1:
            # Evening discharge is needed if the battery must have room for tomorrow
            running_soc = end_of_day_soc  # No discharge on weekends (keep stored)

    return soc_targets
```

### Concrete Example: Weekend with 200 kWh Battery

**Scenario**: 100 kWp PV, near-zero load, battery empty (5% SoC from Friday discharge)

| Day | PV Surplus | Battery Share | Start SoC | End SoC |
|-----|-----------|---------------|-----------|---------|
| Saturday | 180 kWh | 90 kWh (50%) | 5% | 50% |
| Sunday | 180 kWh | 90 kWh (50%) | 50% | 95% |

**Saturday rule**: Charge when grid < -X kW, but SoC capped at 50% (not 95%)

```json
{
  "id": "opt-wknd-sat",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "gpo": "lt", "gpv": -5, "sx": 50 },
  "d": [6]
}
```

**Sunday rule**: Charge when grid < -X kW, SoC up to 95%

```json
{
  "id": "opt-wknd-sun",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "gpo": "lt", "gpv": -5, "sx": 95 },
  "d": [0]
}
```

### Dynamic Threshold Adjustment

As the day progresses and PV surplus declines (afternoon), the charging threshold should become more aggressive to capture remaining energy:

```python
def compute_dynamic_threshold(
    remaining_capacity_kwh,
    remaining_surplus_hours,
    export_limit_kw,
    base_threshold
):
    """
    As surplus declines in the afternoon, lower the grid threshold
    to capture more of the remaining energy.

    Morning (lots of surplus ahead): Threshold = -5 kW (selective charging)
    Afternoon (surplus declining): Threshold = -1 kW (charge from any surplus)
    """
    if remaining_surplus_hours <= 0 or remaining_capacity_kwh <= 0:
        return base_threshold

    urgency = remaining_capacity_kwh / (remaining_surplus_hours * export_limit_kw)

    if urgency > 0.8:
        # Battery nearly full relative to remaining surplus — be selective
        return base_threshold  # e.g., -5 kW
    elif urgency > 0.4:
        # Moderate — charge from moderate surplus
        return base_threshold / 2  # e.g., -2.5 kW
    else:
        # Lots of room, little surplus left — charge from any surplus
        return -1  # Charge as soon as grid goes slightly negative
```

**Note**: This dynamic threshold adjustment currently requires the intraday agent to update rules during the day. It cannot be expressed in a single static rule. This is one use case for the intraday adjuster.

---

## 3. Fixed-Price Sites: Peak Shaving Readiness

### The Problem

Not all sites have TGE spot pricing. Some have fixed electricity contracts where the price per kWh is the same day and night. For these sites:

- **No arbitrage opportunity** — charging at night and discharging during the day yields zero profit (minus round-trip efficiency losses, it's actually a net loss)
- **PV surplus may only exist on weekends** — if the factory load exceeds PV during weekdays, there's no surplus to charge from
- **Peak shaving is still needed** — unexpected load spikes can breach moc_zamowiona regardless of pricing model

Without special handling, the battery sits empty on weekdays because nothing charges it. The peak shaving rule at P8 exists but has no energy to discharge.

### The Solution: Peak Shaving Readiness Charge

The optimization engine detects this pattern:
1. `price_result.profitable == false` (no arbitrage spread)
2. `pv_result.capturable_kwh == 0` for weekdays (no daytime surplus)
3. `peak_result` exists (peak shaving needed or defensive reserve required)

And generates an **overnight charge rule** for peak shaving readiness, where the target SoC comes from the confidence-band calculator:

```json
{
  "id": "opt-reserve-c-b",
  "s": "ai",
  "a": { "t": "ct", "soc": 33, "str": "con", "maxp": 30, "maxg": 55 },
  "c": { "ts": 2300, "te": 600 },
  "d": [1, 2, 3, 4]
}
```

In this example, `"soc": 33` came from the confidence calculator: P99 peak = 118 kW, overshoot = 21 kW × 2h = 46.2 kWh → 33% SoC on a 200 kWh battery. A more volatile site might get `"soc": 70` or even `"soc": 90`. The data decides.

### Reserve SoC: Confidence Bands, Not Fixed Numbers

The reserve SoC is **NOT** a fixed 50% or a simple safety margin. It is computed statistically from **historical load data** using confidence bands (see `03_OPTIMIZATION_ENGINE.md` §4.4).

**Why this matters in Poland**: Exceeding `moc_zamowiona` triggers severe penalty tariffs — often 10× or more the normal rate for the exceeded power. A single 1-hour breach can cost more than a month of overnight charging. The cost structure is deeply **asymmetric**:

| Action | Typical Cost |
|--------|-------------|
| Charge 50 kWh overnight at fixed price | ~15-25 PLN |
| 1 hour moc_zamowiona breach by 20 kW | Hundreds to thousands of PLN |

This asymmetry means we must design for **high confidence** (99%+), not expected values.

**How the reserve SoC is determined:**

1. Query 30-90 days of daily peak demand from InfluxDB
2. Compute the empirical percentile at the configured confidence level (default: 99%)
3. Calculate: how much energy does the battery need to shave that P99 peak for its expected duration?
4. That energy → target SoC

**The result varies per site:**

| Site Profile | P99 Peak vs Limit | Reserve SoC | Overnight Charge |
|---|---|---|---|
| Calm load, big headroom | 98 / 100 kW | ~18% | Low |
| Moderate load, normal headroom | 108 / 100 kW | ~25% | Moderate |
| Volatile load, tight headroom | 130 / 100 kW | ~55% | High |
| Extreme volatility | 160 / 100 kW | ~85%+ | Near-full |

The engine adapts automatically. A calm factory charges to 20%; a volatile site near its limit charges to 80%+. No fixed rule — the data decides.

**When near-100% IS justified**: If `reserve_soc ≥ 90%`, the engine rounds up to `soc_max`. Sites with very tight moc_zamowiona relative to their load volatility will legitimately charge to near-full every night — the penalty cost justifies it.

**Why still not 100% when the math says less:**

1. **Battery longevity**: Sitting at 100% SoC accelerates calendar aging. If P99 says 40% is enough, charging to 100% sacrifices battery life for zero additional protection.
2. **PV room**: Even on weekdays, unexpected surplus can appear. Some room helps.
3. **Diminishing returns**: Going from 99% to 99.9% confidence might only add 10% SoC — justified. Going from 99.9% to 100% SoC wastes capacity for the last 0.1% of events.

The `peak_confidence` parameter (default 0.99) is configurable per site via `site_config`, settable in the mobile app.

### Friday Behavior

On Friday, the pattern flips:

```json
{
  "id": "opt-fri-empty-b",
  "s": "ai",
  "a": { "t": "dt", "soc": 10, "str": "eq", "maxp": 50, "ming": 10 },
  "c": { "ts": 1400, "te": 2100 },
  "d": [5]
}
```

Friday afternoon: discharge to ~10% SoC. This empties the battery for weekend PV surplus absorption. The discharge also delivers energy during Friday afternoon/evening hours, which has some value even at fixed prices (reduces grid import).

### Full Weekly Pattern for Fixed-Price Site

(Reserve SoC shown as `R%` — actual value computed from confidence bands per site)

| Night | Action | Day | Action |
|-------|--------|-----|--------|
| Sun→Mon | (Battery has weekend PV energy) | Mon | Peak shaving standby, discharge on spikes |
| Mon→Tue | Charge to R% (confidence reserve) | Tue | Peak shaving standby |
| Tue→Wed | Charge to R% (confidence reserve) | Wed | Peak shaving standby |
| Wed→Thu | Charge to R% (confidence reserve) | Thu | Peak shaving standby |
| Thu→Fri | Charge to R% (confidence reserve) | Fri | Discharge to ~10% (empty for weekend) |
| Fri→Sat | (Battery nearly empty) | Sat | PV surplus → charge |
| Sat→Sun | (Keep Saturday's PV energy) | Sun | PV surplus → charge to ~soc_max |

Where `R%` might be 20% for a calm site or 85% for a volatile one near its moc_zamowiona limit.

### When This Pattern Kicks In

The optimization engine automatically detects this scenario through the trade-off resolver:

```
price_result.profitable == false    → No arbitrage
pv_result.capturable_kwh == 0       → No weekday PV surplus
peak_result exists                  → Peak shaving needed

→ charge_reason = "peak_shaving_readiness"
→ night_charge_kwh = peak_reserve_kwh (not full capacity)
```

No special configuration needed. The math handles it.

---

## 4. Always-On Defensive Rules

### Why Forecasts Will Be Wrong

Real-world deviations from forecasts are common and expected:

| Deviation | Cause | Frequency |
|-----------|-------|-----------|
| Load spike +30 kW | Machine startup, AC compressor | Multiple times/day |
| Load drop -20 kW | Shift change, production pause | Daily |
| PV overshoot +20% | Clearer sky than forecast | Weekly |
| PV shortfall -50% | Unexpected cloud cover | Weekly |
| Price update | Intraday market correction | Not applicable to day-ahead |

### Rules That Must Always Be Present

Every strategy generated by the optimization engine MUST include these, regardless of forecast:

**1. PV Surplus Capture (P6)**

```json
{
  "id": "opt-pv-def",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "gpo": "lt", "gpv": 0, "sm": 5, "sx": 90 }
}
```

Even if the forecast predicts zero surplus, unexpected PV performance or load drops can create surplus. This rule costs nothing when conditions aren't met but captures free energy when they are.

**2. Peak Shaving (P8)**

```json
{
  "id": "opt-ps-def",
  "a": { "t": "dis", "pw": 50, "pid": true },
  "c": { "gpo": "gt", "gpv": 75, "sm": 15, "sx": 95 }
}
```

Even if the forecast shows load stays well below `moc_zamowiona`, an unexpected load spike could breach it. This rule discharges when grid exceeds 75 kW (5 kW below the 80 kW moc_zamowiona). Combined with P9 capping, this provides two layers of protection.

**Note**: P9 site limits (set by user via mobile app) provide last-resort protection. The P8 peak shaving rule provides earlier, smoother response. Both are needed.

**3. SoC Safety Conditions on All Rules**

Every charge rule should have `sx` (max SoC) to prevent overcharging.
Every discharge rule should have `sm` (min SoC) to prevent deep discharge.

```json
// Charge rule: stop charging at 90%
{ "c": { ..., "sm": 5, "sx": 90 } }

// Discharge rule: stop discharging at 15%
{ "c": { ..., "sm": 15, "sx": 95 } }
```

These provide software-level SoC protection complementing P11 hardware safety.

---

## 5. Seasonal Awareness

### Summer (May-September)

- **High PV production**: 80-100% of peak capacity, 10-14 hours/day
- **Abundant surplus**: Often more PV than load, especially weekends
- **Strategy emphasis**: PV self-consumption dominates. Arbitrage is secondary.
- **Multi-day planning critical**: Weekend surplus management is essential
- **SoC management**: Keep battery moderate (40-60%) during weekdays to absorb daily surplus, empty Friday for weekend

### Winter (November-February)

- **Low PV production**: 10-30% of peak capacity, 6-8 hours/day
- **Minimal surplus**: PV rarely exceeds load
- **Strategy emphasis**: Arbitrage dominates (charge at night, discharge at peak)
- **Peak shaving critical**: Winter heating loads can spike unexpectedly
- **SoC management**: Deeper cycling is acceptable since PV contribution is small

### Transition (March-April, September-October)

- **Variable PV**: Day-to-day variation is highest
- **Mixed strategy**: Both arbitrage and PV self-consumption contribute
- **Forecast uncertainty highest**: Weather changes rapidly, PV can swing +-50%
- **Conservative approach recommended**: Leave more room for PV, lower discharge targets

### How the Engine Handles Seasons

The engine doesn't need explicit season logic. The seasonal behavior emerges naturally from the input data:

- **Summer**: PV forecast is high → `pv_surplus.capturable_kwh` is large → trade-off resolver leaves room for PV → smaller night charge, higher PV SoC targets
- **Winter**: PV forecast is low → `pv_surplus.capturable_kwh` is small → trade-off resolver charges more at night → deeper arbitrage cycling
- **Transition**: PV forecast is moderate → balanced mix

The weekly agent (LLM) can additionally adjust risk tolerance and strategy selection based on seasonal weather patterns and customer preferences.

---

## 6. Holiday Handling

### The Problem

Polish public holidays create "unexpected weekends" — factory is closed but it's a Tuesday. The optimization engine must handle:

- **Single-day holidays**: Factory closed one day, open the next
- **Long weekends**: Thursday holiday + Friday bridge day = 4-day weekend
- **Christmas/Easter**: Extended multi-day closures

### Polish Public Holidays

The optimization engine and forecasting system must be aware of these dates:

| Date | Holiday | Notes |
|------|---------|-------|
| Jan 1 | New Year's Day | |
| Jan 6 | Epiphany | |
| Easter Sunday | (movable) | March/April |
| Easter Monday | (movable) | Day after Easter |
| May 1 | Labour Day | Often combined with May 3 for long weekend |
| May 3 | Constitution Day | Often combined with May 1 for long weekend |
| Whit Sunday | (movable) | 49 days after Easter |
| Corpus Christi | (movable) | 60 days after Easter, always Thursday (bridge day Friday common) |
| Aug 15 | Assumption of Mary | |
| Nov 1 | All Saints' Day | |
| Nov 11 | Independence Day | |
| Dec 25 | Christmas Day | |
| Dec 26 | Second Day of Christmas | |

Key multi-day patterns: May 1-3 long weekend, Corpus Christi (Thu) + bridge Friday, Christmas 25-26 + nearby weekend.

### The Solution

The optimization engine receives holiday information as part of the forecast data:

- **Load forecast**: Near-zero for holiday days (forecasting system already includes holidays)
- **PV forecast**: Normal (weather is independent of holidays)
- **`is_holiday` / `is_pre_holiday` flags**: Passed to the trade-off resolver (Step 5 in `03_OPTIMIZATION_ENGINE.md`) so it treats holidays as weekend-like days for battery planning

The engine sees the same pattern as a weekend (high surplus, no load) and automatically applies multi-day surplus planning. The LLM validation layer (see `05_AI_AGENT_ROLE.md` Section 4) also has awareness of holidays and can catch cases where the math might not fully account for atypical patterns.

For long weekends (4+ days), the multi-day planner distributes battery capacity across more days:

| Day | Surplus | Battery Share | SoC Target |
|-----|---------|---------------|------------|
| Thu | 180 kWh | 45 kWh | 5% → 27.5% |
| Fri | 180 kWh | 45 kWh | 27.5% → 50% |
| Sat | 180 kWh | 45 kWh | 50% → 72.5% |
| Sun | 180 kWh | 45 kWh | 72.5% → 95% |

Each day charges only its fair share, leaving room for subsequent days.
