import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Sun, TrendingUp, DollarSign, Zap } from 'lucide-react-native';
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

const formatPercent = (value: number) => value.toFixed(1) + '%';

const PV_SEASONAL = [0.25, 0.35, 0.55, 0.8, 1.1, 1.25, 1.3, 1.15, 0.85, 0.55, 0.3, 0.2];

function generateMockData(): MonthlyFinancialSummary[] {
  const months: MonthlyFinancialSummary[] = [];
  const base = new Date();
  base.setMonth(base.getMonth() - 11);

  let cumPV = 0;
  let cumTotal = 0;

  for (let i = 0; i < 12; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const s = PV_SEASONAL[i];

    const pvProd = Math.round(5200 * s);
    const selfConsumed = Math.round(pvProd * 0.64);
    const selfConsumedVal = Math.round(selfConsumed * 0.85);
    const exported = pvProd - selfConsumed;
    const exportRev = Math.round(exported * 0.42);
    const pvSavings = selfConsumedVal + exportRev;

    const batterySavings = Math.round(900 * Math.max(0.6, s));
    cumPV += pvSavings;
    cumTotal += pvSavings + batterySavings;

    const gridImport = Math.round(4800 - selfConsumed * 0.8);

    months.push({
      site_id: 'mock-site',
      period,
      energy_cost_pln: Math.round(2800 * Math.max(0.7, s)),
      distribution_cost_pln: Math.round(920 * Math.max(0.7, s)),
      seller_margin_cost_pln: Math.round(110 * Math.max(0.7, s)),
      export_revenue_pln: exportRev,
      total_cost_pln: Math.round(4100 * Math.max(0.7, s)),
      pv_self_consumed_kwh: selfConsumed,
      pv_self_consumed_value_pln: selfConsumedVal,
      pv_export_revenue_pln: exportRev,
      pv_total_savings_pln: pvSavings,
      battery_charge_cost_pln: Math.round(batterySavings * 0.35),
      battery_discharge_value_pln: Math.round(batterySavings * 1.35),
      battery_arbitrage_pln: Math.round(batterySavings * 0.6),
      peak_shaving_savings_pln: Math.round(batterySavings * 0.4),
      battery_total_savings_pln: batterySavings,
      total_savings_pln: pvSavings + batterySavings,
      cumulative_savings_pln: cumTotal,
      fixed_monthly_fee_pln: 85,
      moc_zamowiona_cost_pln: Math.round(370 * Math.max(0.7, s)),
      grid_import_kwh: Math.max(500, gridImport),
      grid_export_kwh: exported,
      pv_production_kwh: pvProd,
      battery_cycles: Math.round(22 * Math.max(0.6, s)),
      cost_per_cycle_pln: 18.5,
      savings_per_cycle_pln: 52.3,
      pv_roi_percent: Math.round((cumPV / 180000) * 1000) / 10,
      bess_roi_percent: 0,
      system_roi_percent: 0,
      pv_break_even_date: '2030-08',
    });
  }

  return months;
}

export function FinancialPVView({
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
        selfConsumptionSavings: acc.selfConsumptionSavings + m.pv_self_consumed_value_pln,
        exportRevenue: acc.exportRevenue + m.pv_export_revenue_pln,
        totalPvSavings: acc.totalPvSavings + m.pv_total_savings_pln,
        pvProduction: acc.pvProduction + m.pv_production_kwh,
        selfConsumedKwh: acc.selfConsumedKwh + m.pv_self_consumed_kwh,
        gridImport: acc.gridImport + m.grid_import_kwh,
      }),
      {
        selfConsumptionSavings: 0,
        exportRevenue: 0,
        totalPvSavings: 0,
        pvProduction: 0,
        selfConsumedKwh: 0,
        gridImport: 0,
      },
    );
  }, [monthlySummaries]);

  const savingsBarData = useMemo(() => {
    const interval = Math.max(1, Math.ceil(monthlySummaries.length / 10));
    return monthlySummaries.map((m, i) => {
      const label = new Date(m.period + '-01').toLocaleDateString('pl-PL', { month: 'short' });
      return {
        value: m.pv_total_savings_pln,
        label: i % interval === 0 ? label : '',
        frontColor: CHART_COLORS.pv.production,
        labelTextStyle: { color: Colors.textSecondary, fontSize: 9, textAlign: 'center' as const },
      };
    });
  }, [monthlySummaries]);

  if (!totals || monthlySummaries.length === 0) return null;

  const capex = financialSettings.pv_capex_pln ?? 0;
  const cumulativeSavings = totals.totalPvSavings;
  const lastMonth = monthlySummaries[monthlySummaries.length - 1];
  const selfConsumptionRatio =
    totals.pvProduction > 0 ? (totals.selfConsumedKwh / totals.pvProduction) * 100 : 0;
  const avoidedImport = totals.selfConsumedKwh;

  const maxSavings = Math.max(...monthlySummaries.map(m => m.pv_total_savings_pln), 1);
  const niceMaxSav = Math.ceil((maxSavings * 1.15) / 100) * 100;

  return (
    <View>
      <SectionHeader title={ft.roiProgress} icon="TrendingUp" />
      <ROIProgressCard
        title={ft.roiProgress}
        currentSavings={cumulativeSavings}
        capex={capex}
        breakEvenDate={lastMonth?.pv_break_even_date}
        color={CHART_COLORS.pv.production}
        installationDate={financialSettings.pv_installation_date}
        t={t}
      />

      <SectionHeader title={ft.savings} icon="DollarSign" />

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.pvSelfConsumptionSavings}
          value={formatPLN(totals.selfConsumptionSavings)}
          icon={Sun}
          color={CHART_COLORS.pv.production}
        />
        <KPICard
          title={ft.exportRevenue}
          value={formatPLN(totals.exportRevenue)}
          icon={Zap}
          color={Colors.success}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.pvProduction}
          value={`${new Intl.NumberFormat('pl-PL').format(totals.pvProduction)} kWh`}
          icon={Sun}
          color={CHART_COLORS.pv.area}
        />
        <KPICard
          title={ft.selfConsumptionRatio}
          value={formatPercent(selfConsumptionRatio)}
          icon={TrendingUp}
          color={Colors.primary}
        />
      </View>

      <View style={styles.kpiRow}>
        <KPICard
          title={ft.avoidedGridImport}
          value={`${new Intl.NumberFormat('pl-PL').format(avoidedImport)} kWh`}
          icon={Zap}
          color={CHART_COLORS.grid.import}
        />
        <KPICard
          title={ft.totalPvSavings}
          value={formatPLN(totals.totalPvSavings)}
          icon={DollarSign}
          color={Colors.success}
        />
      </View>

      <SectionHeader title={ft.roiTimeline} icon="TrendingUp" />
      <ROITimelineChart
        monthlySummaries={monthlySummaries}
        capex={capex}
        color={CHART_COLORS.pv.production}
        savingsKey="pv_total_savings_pln"
        title={ft.roiTimeline}
        loading={loading}
        t={t}
      />

      <SectionHeader title={ft.monthlySavings} icon="Sun" />
      <View style={styles.chartWrapper}>
        <BarChart
          data={savingsBarData}
          height={160}
          barWidth={16}
          spacing={6}
          initialSpacing={8}
          endSpacing={8}
          maxValue={niceMaxSav > 0 ? niceMaxSav : undefined}
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
        <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.pv.production }]} />
        <Text style={styles.legendLabel}>{ft.totalPvSavings} (PLN)</Text>
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
