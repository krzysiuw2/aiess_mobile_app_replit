/**
 * Financial calculator — core hourly computation.
 *
 * Computes energy costs, export revenue, PV self-consumption value,
 * battery arbitrage, and all related metrics for a single hour.
 *
 * Also provides monthly aggregation with ROI / payback tracking.
 */

/**
 * Calculate financial metrics for a single hour.
 *
 * Telemetry values are 1-hour means in kW, which equal kWh for a 1h window.
 * Sign convention: grid positive = import, negative = export;
 *                  battery positive = discharge, negative = charge;
 *                  PV always positive.
 *
 * @param {{ gridPower: number, batteryPower: number, pvPower: number }} telemetry
 * @param {number} energyPrice       PLN/kWh (import, including seller margin)
 * @param {number} distributionRate  PLN/kWh (distribution network fee)
 * @param {number} exportRate        PLN/kWh (export / sell-back price)
 * @param {number} sellerMargin      PLN/kWh (seller margin, already included in energyPrice)
 * @returns {object}
 */
export function calculateHourlyFinancials(telemetry, energyPrice, distributionRate, exportRate, sellerMargin) {
  const gridImportKwh = Math.max(0, telemetry.gridPower);
  const gridExportKwh = Math.max(0, -telemetry.gridPower);
  const batteryChargeKwh = Math.max(0, -telemetry.batteryPower);
  const batteryDischargeKwh = Math.max(0, telemetry.batteryPower);
  const pvProductionKwh = Math.max(0, telemetry.pvPower);

  const totalImportRate = energyPrice + distributionRate;

  const chargeFromGrid = Math.min(batteryChargeKwh, gridImportKwh);

  const energyCost = gridImportKwh * energyPrice;
  const distributionCost = gridImportKwh * distributionRate;
  const sellerMarginCost = gridImportKwh * sellerMargin;
  const exportRevenue = gridExportKwh * exportRate;

  const pvSelfConsumedKwh = Math.max(0, pvProductionKwh - gridExportKwh);
  const pvSelfConsumedValue = pvSelfConsumedKwh * totalImportRate;

  const batteryChargeCost = chargeFromGrid * totalImportRate;
  const batteryDischargeValue = batteryDischargeKwh * totalImportRate;
  const batteryArbitrage = batteryDischargeValue - batteryChargeCost;

  return {
    energy_cost_pln: round2(energyCost),
    distribution_cost_pln: round2(distributionCost),
    seller_margin_cost_pln: round2(sellerMarginCost),
    export_revenue_pln: round2(exportRevenue),
    pv_self_consumed_kwh: round2(pvSelfConsumedKwh),
    pv_self_consumed_value_pln: round2(pvSelfConsumedValue),
    battery_charge_cost_pln: round2(batteryChargeCost),
    battery_discharge_value_pln: round2(batteryDischargeValue),
    battery_arbitrage_pln: round2(batteryArbitrage),
    total_rate_pln_kwh: round2(totalImportRate),
    grid_import_kwh: round2(gridImportKwh),
    grid_export_kwh: round2(gridExportKwh),
    battery_charge_kwh: round2(batteryChargeKwh),
    battery_discharge_kwh: round2(batteryDischargeKwh),
    pv_production_kwh: round2(pvProductionKwh),
  };
}

/**
 * Aggregate hourly financial results into a monthly summary.
 *
 * @param {string} siteId
 * @param {string} period                     "YYYY-MM"
 * @param {Array<object>} hourlyResults       array of calculateHourlyFinancials outputs
 * @param {object} financialSettings          site_config.financial
 * @param {number} previousCumulativeSavings  cumulative savings from prior months
 * @returns {object}
 */
export function aggregateMonthly(siteId, period, hourlyResults, financialSettings, previousCumulativeSavings = 0) {
  const sum = (key) => hourlyResults.reduce((acc, r) => acc + (r[key] || 0), 0);

  const energyCost = round2(sum('energy_cost_pln'));
  const distributionCost = round2(sum('distribution_cost_pln'));
  const sellerMarginCost = round2(sum('seller_margin_cost_pln'));
  const exportRevenue = round2(sum('export_revenue_pln'));
  const pvSelfConsumedKwh = round2(sum('pv_self_consumed_kwh'));
  const pvSelfConsumedValue = round2(sum('pv_self_consumed_value_pln'));
  const batteryChargeCost = round2(sum('battery_charge_cost_pln'));
  const batteryDischargeValue = round2(sum('battery_discharge_value_pln'));
  const batteryArbitrage = round2(sum('battery_arbitrage_pln'));
  const gridImportKwh = round2(sum('grid_import_kwh'));
  const gridExportKwh = round2(sum('grid_export_kwh'));
  const batteryChargeKwh = round2(sum('battery_charge_kwh'));
  const batteryDischargeKwh = round2(sum('battery_discharge_kwh'));
  const pvProductionKwh = round2(sum('pv_production_kwh'));

  const fixedMonthlyFee = financialSettings.fixed_monthly_fee_pln || 0;

  const mocBefore = financialSettings.moc_zamowiona_before_bess_kw || 0;
  const mocAfter = financialSettings.moc_zamowiona_after_bess_kw || 0;
  const mocPrice = financialSettings.moc_zamowiona_price_pln_kw || 0;
  const mocCost = round2(mocAfter * mocPrice);
  const peakShavingSavings = round2(Math.max(0, (mocBefore - mocAfter) * mocPrice));

  const totalCost = round2(energyCost + distributionCost + sellerMarginCost - exportRevenue + fixedMonthlyFee + mocCost);

  const pvTotalSavings = round2(pvSelfConsumedValue + exportRevenue);
  const batteryTotalSavings = round2(batteryArbitrage + peakShavingSavings);
  const totalSavings = round2(pvTotalSavings + batteryTotalSavings);
  const cumulativeSavings = round2(previousCumulativeSavings + totalSavings);

  const batteryCycles = batteryChargeKwh > 0
    ? round2(batteryDischargeKwh / (financialSettings.bess_capacity_kwh || batteryDischargeKwh || 1))
    : 0;
  const costPerCycle = batteryCycles > 0 ? round2(batteryChargeCost / batteryCycles) : 0;
  const savingsPerCycle = batteryCycles > 0 ? round2(batteryTotalSavings / batteryCycles) : 0;

  const pvCapex = financialSettings.pv_capex_pln || 0;
  const bessCapex = financialSettings.bess_capex_pln || 0;
  const systemCapex = pvCapex + bessCapex;

  const pvCumulativeSavings = previousCumulativeSavings * (pvCapex / (systemCapex || 1)) + pvTotalSavings;
  const bessCumulativeSavings = previousCumulativeSavings * (bessCapex / (systemCapex || 1)) + batteryTotalSavings;

  const pvRoi = pvCapex > 0 ? round2((pvCumulativeSavings / pvCapex) * 100) : 0;
  const bessRoi = bessCapex > 0 ? round2((bessCumulativeSavings / bessCapex) * 100) : 0;
  const systemRoi = systemCapex > 0 ? round2((cumulativeSavings / systemCapex) * 100) : 0;

  const result = {
    site_id: siteId,
    period,
    energy_cost_pln: energyCost,
    distribution_cost_pln: distributionCost,
    seller_margin_cost_pln: sellerMarginCost,
    export_revenue_pln: exportRevenue,
    total_cost_pln: totalCost,
    pv_self_consumed_kwh: pvSelfConsumedKwh,
    pv_self_consumed_value_pln: pvSelfConsumedValue,
    pv_export_revenue_pln: exportRevenue,
    pv_total_savings_pln: pvTotalSavings,
    battery_charge_cost_pln: batteryChargeCost,
    battery_discharge_value_pln: batteryDischargeValue,
    battery_arbitrage_pln: batteryArbitrage,
    peak_shaving_savings_pln: peakShavingSavings,
    battery_total_savings_pln: batteryTotalSavings,
    total_savings_pln: totalSavings,
    cumulative_savings_pln: cumulativeSavings,
    fixed_monthly_fee_pln: fixedMonthlyFee,
    moc_zamowiona_cost_pln: mocCost,
    grid_import_kwh: gridImportKwh,
    grid_export_kwh: gridExportKwh,
    pv_production_kwh: pvProductionKwh,
    battery_cycles: batteryCycles,
    cost_per_cycle_pln: costPerCycle,
    savings_per_cycle_pln: savingsPerCycle,
    pv_roi_percent: pvRoi,
    bess_roi_percent: bessRoi,
    system_roi_percent: systemRoi,
  };

  if (pvCapex > 0 && pvTotalSavings > 0) {
    const pvRemaining = Math.max(0, pvCapex - pvCumulativeSavings);
    result.pv_payback_remaining_months = Math.ceil(pvRemaining / pvTotalSavings);
    result.pv_break_even_date = estimateBreakEvenDate(period, result.pv_payback_remaining_months);
  }

  if (bessCapex > 0 && batteryTotalSavings > 0) {
    const bessRemaining = Math.max(0, bessCapex - bessCumulativeSavings);
    result.bess_payback_remaining_months = Math.ceil(bessRemaining / batteryTotalSavings);
    result.bess_break_even_date = estimateBreakEvenDate(period, result.bess_payback_remaining_months);
  }

  if (systemCapex > 0 && totalSavings > 0) {
    const systemRemaining = Math.max(0, systemCapex - cumulativeSavings);
    result.system_payback_remaining_months = Math.ceil(systemRemaining / totalSavings);
    result.system_break_even_date = estimateBreakEvenDate(period, result.system_payback_remaining_months);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────

function round2(v) { return Math.round(v * 100) / 100; }

function estimateBreakEvenDate(currentPeriod, remainingMonths) {
  const [year, month] = currentPeriod.split('-').map(Number);
  const d = new Date(year, month - 1 + remainingMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
