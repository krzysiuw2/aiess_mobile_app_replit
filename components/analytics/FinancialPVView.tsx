import React, { useMemo } from 'react';
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

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + ' PLN';

const formatPercent = (value: number) => value.toFixed(1) + '%';

export function FinancialPVView({
  t,
  financialSettings,
  monthlySummaries,
  dataLoading,
}: FinancialSubViewProps) {
  const ft = t.analytics.financialTab;

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
        loading={dataLoading}
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
