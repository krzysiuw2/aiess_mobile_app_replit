import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, DollarSign, Zap, BarChart2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { FinancialSubViewProps } from './FinancialView';
import { ROIProgressCard } from './ROIProgressCard';
import { ROITimelineChart } from './ROITimelineChart';
import { CostBreakdownChart } from './CostBreakdownChart';
import { KPICard } from './KPICard';
import { SectionHeader } from './SectionHeader';
import type { MonthlyFinancialSummary } from '@/types/financial';

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + ' PLN';

const formatPercent = (value: number) => value.toFixed(1) + '%';

const SYSTEM_SEASONAL = [0.75, 0.78, 0.88, 0.96, 1.1, 1.2, 1.22, 1.14, 1.02, 0.88, 0.8, 0.76];

function generateMockData(): MonthlyFinancialSummary[] {
  const months: MonthlyFinancialSummary[] = [];
  const base = new Date();
  base.setMonth(base.getMonth() - 11);

  let cumTotal = 0;

  for (let i = 0; i < 12; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const s = SYSTEM_SEASONAL[i];

    const energyCost = Math.round(2750 * s);
    const distCost = Math.round(910 * s);
    const marginCost = Math.round(108 * s);
    const fixedFee = 85;
    const mocCost = Math.round(375 * s);
    const totalCost = energyCost + distCost + marginCost + fixedFee + mocCost;

    const pvProd = Math.round(4600 * s);
    const selfConsumed = Math.round(pvProd * 0.63);
    const selfConsumedVal = Math.round(selfConsumed * 0.84);
    const exported = pvProd - selfConsumed;
    const exportRev = Math.round(exported * 0.43);
    const pvSavings = selfConsumedVal + exportRev;

    const arbitrage = Math.round(760 * s);
    const peakShaving = Math.round(410 * s);
    const batterySavings = arbitrage + peakShaving;
    const cycles = Math.round(23 * s);
    const chargeCost = Math.round(batterySavings * 0.34);

    const totalSavings = pvSavings + batterySavings;
    cumTotal += totalSavings;

    months.push({
      site_id: 'mock-site',
      period,
      energy_cost_pln: energyCost,
      distribution_cost_pln: distCost,
      seller_margin_cost_pln: marginCost,
      export_revenue_pln: exportRev,
      total_cost_pln: totalCost,
      pv_self_consumed_kwh: selfConsumed,
      pv_self_consumed_value_pln: selfConsumedVal,
      pv_export_revenue_pln: exportRev,
      pv_total_savings_pln: pvSavings,
      battery_charge_cost_pln: chargeCost,
      battery_discharge_value_pln: Math.round(batterySavings + chargeCost),
      battery_arbitrage_pln: arbitrage,
      peak_shaving_savings_pln: peakShaving,
      battery_total_savings_pln: batterySavings,
      total_savings_pln: totalSavings,
      cumulative_savings_pln: cumTotal,
      fixed_monthly_fee_pln: fixedFee,
      moc_zamowiona_cost_pln: mocCost,
      grid_import_kwh: Math.round(4400 * s),
      grid_export_kwh: exported,
      pv_production_kwh: pvProd,
      battery_cycles: cycles,
      cost_per_cycle_pln: cycles > 0 ? Math.round((chargeCost / cycles) * 100) / 100 : 0,
      savings_per_cycle_pln: cycles > 0 ? Math.round((batterySavings / cycles) * 100) / 100 : 0,
      pv_roi_percent: 0,
      bess_roi_percent: 0,
      system_roi_percent: Math.round((cumTotal / 300000) * 1000) / 10,
      system_break_even_date: '2031-06',
    });
  }

  return months;
}

export function FinancialSystemView({
  deviceId,
  period,
  selectedDate,
  t,
  language,
  financialSettings,
}: FinancialSubViewProps) {
  const ft = t.analytics.financialTab;
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyFinancialSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with real data from lib/financial.ts
    setMonthlySummaries(generateMockData());
    setLoading(false);
  }, [deviceId, period, selectedDate]);

  const totals = useMemo(() => {
    if (monthlySummaries.length === 0) return null;
    return monthlySummaries.reduce(
      (acc, m) => ({
        totalSavings: acc.totalSavings + m.total_savings_pln,
        totalCost: acc.totalCost + m.total_cost_pln,
        distCost: acc.distCost + m.distribution_cost_pln,
        mocCost: acc.mocCost + m.moc_zamowiona_cost_pln,
        fixedFees: acc.fixedFees + m.fixed_monthly_fee_pln,
      }),
      { totalSavings: 0, totalCost: 0, distCost: 0, mocCost: 0, fixedFees: 0 },
    );
  }, [monthlySummaries]);

  if (!totals || monthlySummaries.length === 0) return null;

  const pvCapex = financialSettings.pv_capex_pln ?? 0;
  const bessCapex = financialSettings.bess_capex_pln ?? 0;
  const combinedCapex = pvCapex + bessCapex;
  const cumulativeSavings = totals.totalSavings;
  const lastMonth = monthlySummaries[monthlySummaries.length - 1];
  const combinedROI = combinedCapex > 0 ? (cumulativeSavings / combinedCapex) * 100 : 0;

  return (
    <View>
      <SectionHeader title={ft.roiProgress} icon="TrendingUp" />
      <ROIProgressCard
        title={ft.roiProgress}
        currentSavings={cumulativeSavings}
        capex={combinedCapex}
        breakEvenDate={lastMonth?.system_break_even_date}
        color={Colors.primary}
        t={t}
      />

      <SectionHeader title={ft.savings} icon="DollarSign" />

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.totalNetSavings}
          value={formatPLN(totals.totalSavings)}
          icon={TrendingUp}
          color={Colors.success}
        />
        <KPICard
          title={ft.totalEnergyCost}
          value={formatPLN(totals.totalCost)}
          icon={Zap}
          color={Colors.error}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.totalDistributionCost}
          value={formatPLN(totals.distCost)}
          icon={DollarSign}
          color={Colors.warning}
        />
        <KPICard
          title={ft.mocZamowionaSavings}
          value={formatPLN(totals.mocCost)}
          icon={DollarSign}
          color={CHART_COLORS.error}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.fixedMonthlyFees}
          value={formatPLN(totals.fixedFees)}
          icon={DollarSign}
          color={Colors.textSecondary}
        />
        <KPICard
          title="ROI"
          value={formatPercent(combinedROI)}
          subtitle={ft.ofCapex}
          icon={BarChart2}
          color={Colors.primary}
        />
      </View>

      <SectionHeader title={ft.costBreakdown} icon="BarChart2" />
      <CostBreakdownChart
        monthlySummaries={monthlySummaries}
        title={ft.costBreakdown}
        loading={loading}
        t={t}
      />

      <SectionHeader title={ft.roiTimeline} icon="TrendingUp" />
      <ROITimelineChart
        monthlySummaries={monthlySummaries}
        capex={combinedCapex}
        color={Colors.primary}
        savingsKey="total_savings_pln"
        title={ft.roiTimeline}
        loading={loading}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
});
