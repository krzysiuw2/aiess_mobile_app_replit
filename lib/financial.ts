/**
 * Financial Data Layer
 *
 * Client-side fetching and helpers for financial metrics.
 * Queries hourly data from InfluxDB (aiess_v1_1h / financial_metrics)
 * and aggregates into monthly summaries with derived fields.
 */

import { callInfluxProxy } from '@/lib/edge-proxy';
import type {
  FinancialSettings,
  HourlyFinancialData,
  MonthlyFinancialSummary,
} from '@/types/financial';

// ─── CSV Parsing (mirrors influxdb.ts internals) ────────────────

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseInfluxCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: Record<string, string>[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const values = splitCsvLine(line);

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

// ─── InfluxDB Queries ───────────────────────────────────────────

/**
 * Fetch hourly financial metrics from the financial_metrics measurement.
 * Data is pre-computed by the financial-engine Lambda and written to InfluxDB.
 */
export async function fetchHourlyFinancialData(
  siteId: string,
  from: Date,
  to: Date,
): Promise<HourlyFinancialData[]> {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: ${from.toISOString()}, stop: ${to.toISOString()})
      |> filter(fn: (r) => r._measurement == "financial_metrics")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  try {
    const csv = await callInfluxProxy(query);
    const rows = parseInfluxCSV(csv);

    console.log(`[Financial] Received ${rows.length} hourly data points`);

    return rows
      .map((row) => {
        const time = new Date(row['_time']);
        if (isNaN(time.getTime())) return null;

        return {
          time,
          energy_cost_pln: parseFloat(row['energy_cost_pln']) || 0,
          distribution_cost_pln: parseFloat(row['distribution_cost_pln']) || 0,
          seller_margin_cost_pln: parseFloat(row['seller_margin_cost_pln']) || 0,
          export_revenue_pln: parseFloat(row['export_revenue_pln']) || 0,
          pv_self_consumed_kwh: parseFloat(row['pv_self_consumed_kwh']) || 0,
          pv_self_consumed_value_pln: parseFloat(row['pv_self_consumed_value_pln']) || 0,
          battery_charge_cost_pln: parseFloat(row['battery_charge_cost_pln']) || 0,
          battery_discharge_value_pln: parseFloat(row['battery_discharge_value_pln']) || 0,
          battery_arbitrage_pln: parseFloat(row['battery_arbitrage_pln']) || 0,
          total_rate_pln_kwh: parseFloat(row['total_rate_pln_kwh']) || 0,
          grid_import_kwh: parseFloat(row['grid_import_kwh']) || 0,
          grid_export_kwh: parseFloat(row['grid_export_kwh']) || 0,
          battery_charge_kwh: parseFloat(row['battery_charge_kwh']) || 0,
          battery_discharge_kwh: parseFloat(row['battery_discharge_kwh']) || 0,
          pv_production_kwh: parseFloat(row['pv_production_kwh']) || 0,
        } satisfies HourlyFinancialData;
      })
      .filter((p): p is HourlyFinancialData => p !== null)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  } catch (error) {
    console.error('[Financial] Error fetching hourly data:', error);
    throw error;
  }
}

// ─── Monthly Summaries (InfluxDB aggregation) ───────────────────

interface RawMonthlySums {
  period: string;
  energy_cost_pln: number;
  distribution_cost_pln: number;
  seller_margin_cost_pln: number;
  export_revenue_pln: number;
  pv_self_consumed_kwh: number;
  pv_self_consumed_value_pln: number;
  battery_charge_cost_pln: number;
  battery_discharge_value_pln: number;
  battery_arbitrage_pln: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  pv_production_kwh: number;
}

function aggregateRowToSums(row: Record<string, string>): RawMonthlySums | null {
  const time = new Date(row['_time']);
  if (isNaN(time.getTime())) return null;

  const period = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}`;

  return {
    period,
    energy_cost_pln: parseFloat(row['energy_cost_pln']) || 0,
    distribution_cost_pln: parseFloat(row['distribution_cost_pln']) || 0,
    seller_margin_cost_pln: parseFloat(row['seller_margin_cost_pln']) || 0,
    export_revenue_pln: parseFloat(row['export_revenue_pln']) || 0,
    pv_self_consumed_kwh: parseFloat(row['pv_self_consumed_kwh']) || 0,
    pv_self_consumed_value_pln: parseFloat(row['pv_self_consumed_value_pln']) || 0,
    battery_charge_cost_pln: parseFloat(row['battery_charge_cost_pln']) || 0,
    battery_discharge_value_pln: parseFloat(row['battery_discharge_value_pln']) || 0,
    battery_arbitrage_pln: parseFloat(row['battery_arbitrage_pln']) || 0,
    grid_import_kwh: parseFloat(row['grid_import_kwh']) || 0,
    grid_export_kwh: parseFloat(row['grid_export_kwh']) || 0,
    battery_charge_kwh: parseFloat(row['battery_charge_kwh']) || 0,
    battery_discharge_kwh: parseFloat(row['battery_discharge_kwh']) || 0,
    pv_production_kwh: parseFloat(row['pv_production_kwh']) || 0,
  };
}

function computeDerivedFields(
  rawMonths: RawMonthlySums[],
  siteId: string,
  settings: FinancialSettings,
  batteryCapacityKwh: number,
): MonthlyFinancialSummary[] {
  const bessCapex = settings.bess_capex_pln ?? 0;
  const pvCapex = settings.pv_capex_pln ?? 0;
  const totalCapex = bessCapex + pvCapex;
  const fixedFee = settings.fixed_monthly_fee_pln ?? 0;
  const mocPricePerKw = settings.moc_zamowiona_price_pln_kw;
  const mocBefore = settings.moc_zamowiona_before_bess_kw ?? 0;
  const mocAfter = settings.moc_zamowiona_after_bess_kw ?? 0;
  const peakShavingPerMonth = (mocBefore - mocAfter) * mocPricePerKw;
  const mocCostPerMonth = mocAfter * mocPricePerKw;

  let cumulativeSavings = 0;
  let cumulativePvSavings = 0;
  let cumulativeBessSavings = 0;

  return rawMonths.map((m, idx) => {
    const pvExportRevenue = m.export_revenue_pln;
    const pvTotalSavings = m.pv_self_consumed_value_pln + pvExportRevenue;
    const batteryTotalSavings = m.battery_arbitrage_pln + peakShavingPerMonth;
    const totalSavings = pvTotalSavings + batteryTotalSavings;

    cumulativePvSavings += pvTotalSavings;
    cumulativeBessSavings += batteryTotalSavings;
    cumulativeSavings += totalSavings;

    const totalCost = m.energy_cost_pln + m.distribution_cost_pln +
      m.seller_margin_cost_pln - m.export_revenue_pln + fixedFee + mocCostPerMonth;

    const batteryCycles = batteryCapacityKwh > 0
      ? Math.round(m.battery_charge_kwh / batteryCapacityKwh)
      : 0;

    const pvRoi = pvCapex > 0 ? (cumulativePvSavings / pvCapex) * 100 : 0;
    const bessRoi = bessCapex > 0 ? (cumulativeBessSavings / bessCapex) * 100 : 0;
    const systemRoi = totalCapex > 0 ? (cumulativeSavings / totalCapex) * 100 : 0;

    const monthsElapsed = idx + 1;
    const avgMonthlySavings = cumulativeSavings / monthsElapsed;

    const remainingMonths = (cap: number, cumul: number): number | undefined => {
      if (cap <= 0 || avgMonthlySavings <= 0) return undefined;
      const remaining = cap - cumul;
      return remaining <= 0 ? 0 : Math.ceil(remaining / avgMonthlySavings);
    };

    const breakEvenDate = (cap: number, cumul: number): string | undefined => {
      if (cap <= 0 || avgMonthlySavings <= 0) return undefined;
      const rem = cap - cumul;
      if (rem <= 0) return m.period;
      const monthsLeft = Math.ceil(rem / avgMonthlySavings);
      const d = new Date(m.period + '-01');
      d.setMonth(d.getMonth() + monthsLeft);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    return {
      site_id: siteId,
      period: m.period,
      energy_cost_pln: Math.round(m.energy_cost_pln),
      distribution_cost_pln: Math.round(m.distribution_cost_pln),
      seller_margin_cost_pln: Math.round(m.seller_margin_cost_pln),
      export_revenue_pln: Math.round(m.export_revenue_pln),
      total_cost_pln: Math.round(totalCost),
      pv_self_consumed_kwh: Math.round(m.pv_self_consumed_kwh),
      pv_self_consumed_value_pln: Math.round(m.pv_self_consumed_value_pln),
      pv_export_revenue_pln: Math.round(pvExportRevenue),
      pv_total_savings_pln: Math.round(pvTotalSavings),
      battery_charge_cost_pln: Math.round(m.battery_charge_cost_pln),
      battery_discharge_value_pln: Math.round(m.battery_discharge_value_pln),
      battery_arbitrage_pln: Math.round(m.battery_arbitrage_pln),
      peak_shaving_savings_pln: Math.round(peakShavingPerMonth),
      battery_total_savings_pln: Math.round(batteryTotalSavings),
      total_savings_pln: Math.round(totalSavings),
      cumulative_savings_pln: Math.round(cumulativeSavings),
      fixed_monthly_fee_pln: Math.round(fixedFee),
      moc_zamowiona_cost_pln: Math.round(mocCostPerMonth),
      grid_import_kwh: Math.round(m.grid_import_kwh),
      grid_export_kwh: Math.round(m.grid_export_kwh),
      pv_production_kwh: Math.round(m.pv_production_kwh),
      battery_cycles: batteryCycles,
      cost_per_cycle_pln: batteryCycles > 0 ? Math.round(m.battery_charge_cost_pln / batteryCycles) : 0,
      savings_per_cycle_pln: batteryCycles > 0 ? Math.round(batteryTotalSavings / batteryCycles) : 0,
      pv_roi_percent: Math.round(pvRoi * 10) / 10,
      bess_roi_percent: Math.round(bessRoi * 10) / 10,
      system_roi_percent: Math.round(systemRoi * 10) / 10,
      pv_payback_remaining_months: remainingMonths(pvCapex, cumulativePvSavings),
      bess_payback_remaining_months: remainingMonths(bessCapex, cumulativeBessSavings),
      system_payback_remaining_months: remainingMonths(totalCapex, cumulativeSavings),
      pv_break_even_date: breakEvenDate(pvCapex, cumulativePvSavings),
      bess_break_even_date: breakEvenDate(bessCapex, cumulativeBessSavings),
      system_break_even_date: breakEvenDate(totalCapex, cumulativeSavings),
    };
  });
}

/**
 * Fetch monthly financial summaries by aggregating hourly financial_metrics
 * from InfluxDB using Flux aggregateWindow(every: 1mo, fn: sum).
 * Derived fields (ROI, cumulative, cycles, peak shaving) are computed client-side.
 */
export async function fetchMonthlyFinancialSummary(
  siteId: string,
  from: Date,
  to: Date,
  financialSettings: FinancialSettings,
  batteryCapacityKwh: number,
): Promise<MonthlyFinancialSummary[]> {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: ${from.toISOString()}, stop: ${to.toISOString()})
      |> filter(fn: (r) => r._measurement == "financial_metrics")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> aggregateWindow(every: 1mo, fn: sum, createEmpty: false)
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  try {
    const csv = await callInfluxProxy(query);
    const rows = parseInfluxCSV(csv);

    console.log(`[Financial] Received ${rows.length} monthly aggregated rows`);

    if (rows.length === 0) return [];

    const rawMonths = rows
      .map(aggregateRowToSums)
      .filter((r): r is RawMonthlySums => r !== null)
      .sort((a, b) => a.period.localeCompare(b.period));

    return computeDerivedFields(rawMonths, siteId, financialSettings, batteryCapacityKwh);
  } catch (error) {
    console.error('[Financial] Error fetching monthly summaries:', error);
    throw error;
  }
}

// ─── Mock Data Generator ────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate realistic mock monthly summaries for development / preview.
 * Produces `months` entries going backwards from today.
 */
export function generateMockMonthlySummaries(
  months: number,
  financialSettings: FinancialSettings,
): MonthlyFinancialSummary[] {
  const summaries: MonthlyFinancialSummary[] = [];
  const now = new Date();

  const bessCapex = financialSettings.bess_capex_pln ?? 0;
  const pvCapex = financialSettings.pv_capex_pln ?? 0;
  const totalCapex = bessCapex + pvCapex;
  const fixedFee = financialSettings.fixed_monthly_fee_pln ?? 0;
  const mocPricePerKw = financialSettings.moc_zamowiona_price_pln_kw;
  const mocBefore = financialSettings.moc_zamowiona_before_bess_kw ?? 0;
  const mocAfter = financialSettings.moc_zamowiona_after_bess_kw ?? 0;

  let cumulativeSavings = 0;
  let cumulativePvSavings = 0;
  let cumulativeBessSavings = 0;

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const energyCost = rand(3000, 8000);
    const distributionCost = rand(1500, 4000);
    const sellerMarginCost = rand(200, 600);
    const exportRevenue = rand(100, 800);

    const pvSelfConsumedKwh = rand(2000, 6000);
    const pvSelfConsumedValue = rand(1500, 4000);
    const pvExportRevenue = rand(100, 500);
    const pvTotalSavings = pvSelfConsumedValue + pvExportRevenue;

    const batteryArbitrage = rand(800, 2500);
    const peakShavingSavings = (mocBefore - mocAfter) * mocPricePerKw;
    const batteryChargeCost = rand(400, 1200);
    const batteryDischargeValue = rand(600, 1800);
    const batteryTotalSavings = batteryArbitrage + peakShavingSavings;

    const totalSavings = pvTotalSavings + batteryTotalSavings;
    cumulativeSavings += totalSavings;
    cumulativePvSavings += pvTotalSavings;
    cumulativeBessSavings += batteryTotalSavings;

    const totalCost = energyCost + distributionCost + sellerMarginCost - exportRevenue;
    const mocCost = mocAfter * mocPricePerKw;
    const batteryCycles = Math.round(rand(15, 30));

    const pvRoi = pvCapex > 0 ? (cumulativePvSavings / pvCapex) * 100 : 0;
    const bessRoi = bessCapex > 0 ? (cumulativeBessSavings / bessCapex) * 100 : 0;
    const systemRoi = totalCapex > 0 ? (cumulativeSavings / totalCapex) * 100 : 0;

    const avgMonthlySavings = cumulativeSavings / (months - i);
    const remainingMonths = (cap: number, cumul: number) => {
      if (cap <= 0 || avgMonthlySavings <= 0) return undefined;
      const remaining = cap - cumul;
      return remaining <= 0 ? 0 : Math.ceil(remaining / avgMonthlySavings);
    };

    summaries.push({
      site_id: 'mock',
      period,
      energy_cost_pln: Math.round(energyCost),
      distribution_cost_pln: Math.round(distributionCost),
      seller_margin_cost_pln: Math.round(sellerMarginCost),
      export_revenue_pln: Math.round(exportRevenue),
      total_cost_pln: Math.round(totalCost),
      pv_self_consumed_kwh: Math.round(pvSelfConsumedKwh),
      pv_self_consumed_value_pln: Math.round(pvSelfConsumedValue),
      pv_export_revenue_pln: Math.round(pvExportRevenue),
      pv_total_savings_pln: Math.round(pvTotalSavings),
      battery_charge_cost_pln: Math.round(batteryChargeCost),
      battery_discharge_value_pln: Math.round(batteryDischargeValue),
      battery_arbitrage_pln: Math.round(batteryArbitrage),
      peak_shaving_savings_pln: Math.round(peakShavingSavings),
      battery_total_savings_pln: Math.round(batteryTotalSavings),
      total_savings_pln: Math.round(totalSavings),
      cumulative_savings_pln: Math.round(cumulativeSavings),
      fixed_monthly_fee_pln: Math.round(fixedFee),
      moc_zamowiona_cost_pln: Math.round(mocCost),
      grid_import_kwh: Math.round(rand(5000, 15000)),
      grid_export_kwh: Math.round(rand(500, 3000)),
      pv_production_kwh: Math.round(rand(3000, 8000)),
      battery_cycles: batteryCycles,
      cost_per_cycle_pln: batteryCycles > 0 ? Math.round(batteryChargeCost / batteryCycles) : 0,
      savings_per_cycle_pln: batteryCycles > 0 ? Math.round(batteryTotalSavings / batteryCycles) : 0,
      pv_roi_percent: Math.round(pvRoi * 10) / 10,
      bess_roi_percent: Math.round(bessRoi * 10) / 10,
      system_roi_percent: Math.round(systemRoi * 10) / 10,
      pv_payback_remaining_months: remainingMonths(pvCapex, cumulativePvSavings),
      bess_payback_remaining_months: remainingMonths(bessCapex, cumulativeBessSavings),
      system_payback_remaining_months: remainingMonths(totalCapex, cumulativeSavings),
    });
  }

  return summaries;
}

// ─── Formatting Helpers ─────────────────────────────────────────

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPln(value: number): string {
  return plnFormatter.format(Math.round(value)) + ' PLN';
}

export function formatPlnCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
}
