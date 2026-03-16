import React, { useMemo } from 'react';
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

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + ' PLN';

const formatPercent = (value: number) => value.toFixed(1) + '%';

export function FinancialSystemView({
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
        loading={dataLoading}
        t={t}
      />

      <SectionHeader title={ft.roiTimeline} icon="TrendingUp" />
      <ROITimelineChart
        monthlySummaries={monthlySummaries}
        capex={combinedCapex}
        color={Colors.primary}
        savingsKey="total_savings_pln"
        title={ft.roiTimeline}
        loading={dataLoading}
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
