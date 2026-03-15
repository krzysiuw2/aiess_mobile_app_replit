# 02 — Calculations

All financial calculations happen in `lambda/financial-engine/financial-calculator.mjs`. This document covers every formula, sign convention, and edge case.

## Sign Conventions

| Measurement | Positive | Negative |
|-------------|----------|----------|
| Grid power | Import (buying from grid) | Export (selling to grid) |
| Battery power | Discharge | Charge |
| PV power | Always positive | — |

All telemetry values are **1-hour means in kW**, which equal **kWh** for a 1-hour window.

## Hourly Calculations

### Input Decomposition

```
gridImportKwh      = max(0, gridPower)
gridExportKwh      = max(0, -gridPower)
batteryChargeKwh   = max(0, -batteryPower)
batteryDischargeKwh = max(0, batteryPower)
pvProductionKwh    = max(0, pvPower)
```

### Price Components

```
totalImportRate = energyPrice + distributionRate     [PLN/kWh]
```

Where:
- `energyPrice` = base price (fixed / TGE RDN / calendar) + seller margin if enabled
- `distributionRate` = operator-specific tariff based on zone, day type, and hour

### Cost Calculations

```
energyCost        = gridImportKwh × energyPrice                [PLN]
distributionCost  = gridImportKwh × distributionRate           [PLN]
sellerMarginCost  = gridImportKwh × sellerMargin               [PLN]
exportRevenue     = gridExportKwh × exportRate                 [PLN]
```

### PV Self-Consumption Value

The value of PV energy consumed on-site (avoided grid import):

```
pvSelfConsumedKwh   = max(0, pvProductionKwh - gridExportKwh)
pvSelfConsumedValue = pvSelfConsumedKwh × totalImportRate      [PLN]
```

This represents the money saved by consuming PV energy directly instead of buying from the grid.

### Battery Arbitrage (Opportunity Cost Model)

Simplified approach measuring the financial benefit of battery operation:

```
chargeFromGrid       = min(batteryChargeKwh, gridImportKwh)
batteryChargeCost    = chargeFromGrid × totalImportRate        [PLN]
batteryDischargeValue = batteryDischargeKwh × totalImportRate  [PLN]
batteryArbitrage     = batteryDischargeValue - batteryChargeCost [PLN]
```

**Why this approach?**
- Battery round-trip efficiency (RTE) is implicitly handled because we measure power at the inverter. If we charge 100 kWh but only 95 kWh reaches the battery, the telemetry already reflects the loss.
- `chargeFromGrid` is capped at actual grid import to avoid counting PV-to-battery charging as a "cost".

### Worked Example

Given for a single hour:
- Grid power: +15 kW (importing)
- Battery power: +8 kW (discharging)
- PV power: +12 kW
- Energy price: 0.35 PLN/kWh
- Distribution rate: 0.18 PLN/kWh
- Export rate: 0.25 PLN/kWh
- Seller margin: 0.05 PLN/kWh

```
gridImportKwh       = 15 kWh
gridExportKwh       = 0 kWh
batteryChargeKwh    = 0 kWh
batteryDischargeKwh = 8 kWh
pvProductionKwh     = 12 kWh
totalImportRate     = 0.35 + 0.18 = 0.53 PLN/kWh

energyCost          = 15 × 0.35 = 5.25 PLN
distributionCost    = 15 × 0.18 = 2.70 PLN
sellerMarginCost    = 15 × 0.05 = 0.75 PLN
exportRevenue       = 0 × 0.25 = 0.00 PLN
pvSelfConsumedKwh   = max(0, 12 - 0) = 12 kWh
pvSelfConsumedValue = 12 × 0.53 = 6.36 PLN
chargeFromGrid      = min(0, 15) = 0
batteryChargeCost   = 0 × 0.53 = 0.00 PLN
batteryDischargeValue = 8 × 0.53 = 4.24 PLN
batteryArbitrage    = 4.24 - 0.00 = 4.24 PLN
```

## Monthly Aggregation

Monthly summaries are computed in `aggregateMonthly()` by summing all hourly results for the period, then adding derived KPIs.

### Summed Fields

All hourly fields are summed directly:
- `energy_cost_pln`, `distribution_cost_pln`, `seller_margin_cost_pln`
- `export_revenue_pln`
- `pv_self_consumed_kwh`, `pv_self_consumed_value_pln`
- `battery_charge_cost_pln`, `battery_discharge_value_pln`, `battery_arbitrage_pln`
- `grid_import_kwh`, `grid_export_kwh`, `battery_charge_kwh`, `battery_discharge_kwh`, `pv_production_kwh`

### Contracted Power (Moc Zamówiona)

Monthly demand charge calculation:

```
mocCost            = mocAfter × mocPricePerKw             [PLN/month]
peakShavingSavings = max(0, (mocBefore - mocAfter)) × mocPricePerKw  [PLN/month]
```

Where:
- `mocBefore` = contracted power before BESS installation (kW)
- `mocAfter` = contracted power after BESS optimization (kW)
- `mocPricePerKw` = monthly rate per kW (default: 25.05 PLN/kW)

This captures the savings from reducing contracted power through battery peak shaving.

### Total Cost

```
totalCost = energyCost + distributionCost + sellerMarginCost
            - exportRevenue + fixedMonthlyFee + mocCost
```

### Savings Breakdown

```
pvTotalSavings      = pvSelfConsumedValue + exportRevenue
batteryTotalSavings = batteryArbitrage + peakShavingSavings
totalSavings        = pvTotalSavings + batteryTotalSavings
cumulativeSavings   = previousCumulativeSavings + totalSavings
```

### Battery Cycles

```
batteryCycles   = batteryDischargeKwh / bessCapacityKwh
costPerCycle    = batteryChargeCost / batteryCycles
savingsPerCycle = batteryTotalSavings / batteryCycles
```

### ROI Calculations

ROI is tracked separately for PV, BESS, and the combined system:

```
pvRoi     = (pvCumulativeSavings / pvCapex) × 100          [%]
bessRoi   = (bessCumulativeSavings / bessCapex) × 100      [%]
systemRoi = (cumulativeSavings / systemCapex) × 100        [%]
```

Where:
- `systemCapex = pvCapex + bessCapex`
- Cumulative savings are allocated proportionally: `pvCumulativeSavings = previousCumulative × (pvCapex / systemCapex) + pvTotalSavings`

### Payback Period Estimation

For each component (PV, BESS, system), if CAPEX > 0 and monthly savings > 0:

```
remaining = max(0, capex - cumulativeSavings)
paybackRemainingMonths = ceil(remaining / monthlySavings)
breakEvenDate = currentPeriod + paybackRemainingMonths
```

The break-even date is returned as `YYYY-MM` string.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No telemetry data for a day | Skipped with warning log; 0 hours processed |
| TGE price unavailable for an hour | Falls back to 0 PLN/MWh |
| No tariff in DynamoDB for operator/year | Distribution rate = 0 |
| PV-only system (no BESS) | Battery fields are 0; battery sub-tab hidden in UI |
| BESS-only system (no PV) | PV fields are 0; PV sub-tab hidden in UI |
| Zero CAPEX | ROI = 0%; payback not calculated |
| Negative battery arbitrage (charge > discharge value) | Stored as negative; reflects real cost |
| Calendar price missing for a month/quarter | Price = 0 |
