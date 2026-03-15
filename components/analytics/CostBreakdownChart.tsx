import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { MonthlyFinancialSummary } from '@/types/financial';

interface CostBreakdownChartProps {
  monthlySummaries: MonthlyFinancialSummary[];
  title: string;
  loading?: boolean;
  t: any;
}

const SEGMENT_COLORS = {
  energy: CHART_COLORS.grid.line,
  distribution: '#F59E0B',
  mocZamowiona: '#EF4444',
  fixed: '#6B7280',
} as const;

export function CostBreakdownChart({
  monthlySummaries,
  title,
  loading = false,
  t,
}: CostBreakdownChartProps) {
  const { width: screenWidth } = useWindowDimensions();

  const { stackData, maxValue } = useMemo(() => {
    if (monthlySummaries.length === 0) return { stackData: [], maxValue: 0 };

    const labelInterval = Math.max(1, Math.ceil(monthlySummaries.length / 10));
    let maxVal = 0;

    const bars = monthlySummaries.map((m, i) => {
      const energy = Math.max(0, m.energy_cost_pln || 0);
      const distribution = Math.max(0, m.distribution_cost_pln || 0);
      const moc = Math.max(0, m.moc_zamowiona_cost_pln || 0);
      const fixed = Math.max(0, m.fixed_monthly_fee_pln || 0);

      const total = energy + distribution + moc + fixed;
      if (total > maxVal) maxVal = total;

      const periodDate = new Date(m.period + '-01');
      const label = periodDate.toLocaleDateString('pl-PL', { month: 'short' });

      return {
        stacks: [
          { value: energy, color: SEGMENT_COLORS.energy },
          { value: distribution, color: SEGMENT_COLORS.distribution, marginBottom: 1 },
          { value: moc, color: SEGMENT_COLORS.mocZamowiona, marginBottom: 1 },
          { value: fixed, color: SEGMENT_COLORS.fixed, marginBottom: 1 },
        ],
        label: i % labelInterval === 0 ? label : '',
      };
    });

    return { stackData: bars, maxValue: maxVal };
  }, [monthlySummaries]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics?.loadingChart ?? 'Loading chart...'}</Text>
      </View>
    );
  }

  if (stackData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics?.noDataAvailable ?? 'No data available'}</Text>
      </View>
    );
  }

  const barCount = stackData.length;
  const barWidth = barCount > 20 ? 10 : barCount > 10 ? 16 : 24;
  const spacing = barCount > 20 ? 4 : 8;

  const niceMax = Math.ceil(maxValue * 1.1 / 100) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chartWrapper}>
        <BarChart
          stackData={stackData}
          height={200}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={8}
          endSpacing={8}
          maxValue={niceMax > 0 ? niceMax : undefined}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisThickness={0}
          xAxisThickness={0}
          xAxisLabelTextStyle={{
            color: Colors.textSecondary,
            fontSize: 9,
            textAlign: 'center',
          }}
          yAxisTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
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

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: SEGMENT_COLORS.energy }]} />
          <Text style={styles.legendLabel}>
            {t.financial?.energyCost ?? 'Energy cost'}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: SEGMENT_COLORS.distribution }]} />
          <Text style={styles.legendLabel}>
            {t.financial?.distributionCost ?? 'Distribution'}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: SEGMENT_COLORS.mocZamowiona }]} />
          <Text style={styles.legendLabel}>
            {t.financial?.mocZamowiona ?? 'Moc zamówiona'}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: SEGMENT_COLORS.fixed }]} />
          <Text style={styles.legendLabel}>
            {t.financial?.fixedFees ?? 'Fixed fees'}
          </Text>
        </View>
      </View>

      <Text style={styles.axisLabel}>PLN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    paddingTop: 20,
  },
  loadingContainer: {
    height: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  axisLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
