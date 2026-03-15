import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { TrendingUp, DollarSign, RefreshCw, Zap, Battery } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { FinancialSubViewProps } from './FinancialView';
import { ROIProgressCard } from './ROIProgressCard';
import { ROITimelineChart } from './ROITimelineChart';
import { KPICard } from './KPICard';
import { SectionHeader } from './SectionHeader';
import type { MonthlyFinancialSummary } from '@/types/financial';

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + ' PLN';

const SEASONAL = [0.7, 0.75, 0.85, 0.95, 1.1, 1.2, 1.25, 1.15, 1.05, 0.9, 0.8, 0.75];

function generateMockData(): MonthlyFinancialSummary[] {
  const months: MonthlyFinancialSummary[] = [];
  const base = new Date();
  base.setMonth(base.getMonth() - 11);

  let cumBattery = 0;
  let cumTotal = 0;

  for (let i = 0; i < 12; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const s = SEASONAL[i];

    const arbitrage = Math.round(780 * s);
    const peakShaving = Math.round(420 * s);
    const batterySavings = arbitrage + peakShaving;
    const cycles = Math.round(24 * s);
    const chargeCost = Math.round(batterySavings * 0.35);

    const pvProd = Math.round(3800 * s);
    const selfConsumed = Math.round(pvProd * 0.62);
    const selfConsumedVal = Math.round(selfConsumed * 0.82);
    const exportRev = Math.round((pvProd - selfConsumed) * 0.42);
    const pvSavings = selfConsumedVal + exportRev;

    cumBattery += batterySavings;
    cumTotal += batterySavings + pvSavings;

    months.push({
      site_id: 'mock-site',
      period,
      energy_cost_pln: Math.round(2650 * s),
      distribution_cost_pln: Math.round(890 * s),
      seller_margin_cost_pln: Math.round(105 * s),
      export_revenue_pln: exportRev,
      total_cost_pln: Math.round(3900 * s),
      pv_self_consumed_kwh: selfConsumed,
      pv_self_consumed_value_pln: selfConsumedVal,
      pv_export_revenue_pln: exportRev,
      pv_total_savings_pln: pvSavings,
      battery_charge_cost_pln: chargeCost,
      battery_discharge_value_pln: Math.round(batterySavings + chargeCost),
      battery_arbitrage_pln: arbitrage,
      peak_shaving_savings_pln: peakShaving,
      battery_total_savings_pln: batterySavings,
      total_savings_pln: batterySavings + pvSavings,
      cumulative_savings_pln: cumTotal,
      fixed_monthly_fee_pln: 85,
      moc_zamowiona_cost_pln: Math.round(365 * s),
      grid_import_kwh: Math.round(4200 * s),
      grid_export_kwh: pvProd - selfConsumed,
      pv_production_kwh: pvProd,
      battery_cycles: cycles,
      cost_per_cycle_pln: cycles > 0 ? Math.round((chargeCost / cycles) * 100) / 100 : 0,
      savings_per_cycle_pln: cycles > 0 ? Math.round((batterySavings / cycles) * 100) / 100 : 0,
      pv_roi_percent: 0,
      bess_roi_percent: Math.round((cumBattery / 120000) * 1000) / 10,
      system_roi_percent: 0,
      bess_break_even_date: '2031-03',
    });
  }

  return months;
}

export function FinancialBatteryView({
  deviceId,
  period,
  selectedDate,
  t,
  language,
  financialSettings,
}: FinancialSubViewProps) {
  const ft = t.analytics.financialTab;
  const { width: screenWidth } = useWindowDimensions();
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
        arbitrage: acc.arbitrage + m.battery_arbitrage_pln,
        peakShaving: acc.peakShaving + m.peak_shaving_savings_pln,
        totalSavings: acc.totalSavings + m.battery_total_savings_pln,
        cycles: acc.cycles + m.battery_cycles,
        totalChargeCost: acc.totalChargeCost + m.battery_charge_cost_pln,
      }),
      { arbitrage: 0, peakShaving: 0, totalSavings: 0, cycles: 0, totalChargeCost: 0 },
    );
  }, [monthlySummaries]);

  const arbitrageBarData = useMemo(() => {
    const interval = Math.max(1, Math.ceil(monthlySummaries.length / 10));
    return monthlySummaries.map((m, i) => {
      const label = new Date(m.period + '-01').toLocaleDateString('pl-PL', { month: 'short' });
      return {
        value: m.battery_arbitrage_pln,
        label: i % interval === 0 ? label : '',
        frontColor: CHART_COLORS.battery.line,
        labelTextStyle: { color: Colors.textSecondary, fontSize: 9, textAlign: 'center' as const },
      };
    });
  }, [monthlySummaries]);

  if (!totals || monthlySummaries.length === 0) return null;

  const capex = financialSettings.bess_capex_pln ?? 0;
  const cumulativeSavings = totals.totalSavings;
  const lastMonth = monthlySummaries[monthlySummaries.length - 1];
  const avgCostPerCycle = totals.cycles > 0 ? totals.totalChargeCost / totals.cycles : 0;
  const avgSavingsPerCycle = totals.cycles > 0 ? totals.totalSavings / totals.cycles : 0;

  const maxArbitrage = Math.max(...monthlySummaries.map(m => m.battery_arbitrage_pln), 1);
  const niceMaxArb = Math.ceil((maxArbitrage * 1.15) / 100) * 100;

  return (
    <View>
      <SectionHeader title={ft.roiProgress} icon="TrendingUp" />
      <ROIProgressCard
        title={ft.roiProgress}
        currentSavings={cumulativeSavings}
        capex={capex}
        breakEvenDate={lastMonth?.bess_break_even_date}
        color={CHART_COLORS.battery.line}
        installationDate={financialSettings.bess_installation_date}
        t={t}
      />

      <SectionHeader title={ft.savings} icon="DollarSign" />

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.arbitrageSavings}
          value={formatPLN(totals.arbitrage)}
          icon={Zap}
          color={CHART_COLORS.battery.line}
        />
        <KPICard
          title={ft.peakShavingSavings}
          value={formatPLN(totals.peakShaving)}
          icon={TrendingUp}
          color={Colors.warning}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.costPerCycle}
          value={formatPLN(Math.round(avgCostPerCycle))}
          subtitle={ft.plnPerCycle}
          icon={DollarSign}
          color={Colors.error}
        />
        <KPICard
          title={ft.savingsPerCycle}
          value={formatPLN(Math.round(avgSavingsPerCycle))}
          subtitle={ft.plnPerCycle}
          icon={DollarSign}
          color={Colors.success}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.batteryCycles}
          value={totals.cycles.toString()}
          icon={RefreshCw}
          color={CHART_COLORS.battery.charge}
        />
        <KPICard
          title={ft.totalBatterySavings}
          value={formatPLN(totals.totalSavings)}
          icon={Battery}
          color={Colors.success}
        />
      </View>

      <SectionHeader title={ft.roiTimeline} icon="TrendingUp" />
      <ROITimelineChart
        monthlySummaries={monthlySummaries}
        capex={capex}
        color={CHART_COLORS.battery.line}
        savingsKey="battery_total_savings_pln"
        title={ft.roiTimeline}
        loading={loading}
        t={t}
      />

      <SectionHeader title={ft.monthlyArbitrage} icon="Zap" />
      <View style={styles.chartWrapper}>
        <BarChart
          data={arbitrageBarData}
          height={160}
          barWidth={16}
          spacing={6}
          initialSpacing={8}
          endSpacing={8}
          maxValue={niceMaxArb > 0 ? niceMaxArb : undefined}
          disableScroll
          xAxisThickness={0}
          yAxisThickness={0}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          formatYLabel={(val: string) => {
            const n = Number(val);
            return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : val;
          }}
          rulesColor={Colors.border}
          rulesType="dashed"
          noOfSections={4}
          isAnimated
          animationDuration={400}
        />
      </View>
      <View style={styles.barLegend}>
        <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.battery.line }]} />
        <Text style={styles.legendLabel}>{ft.arbitrageSavings} (PLN)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    paddingTop: 20,
  },
  barLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
