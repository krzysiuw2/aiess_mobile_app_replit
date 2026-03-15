import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import { MonthlyFinancialSummary } from '@/types/financial';

interface ROITimelineChartProps {
  monthlySummaries: MonthlyFinancialSummary[];
  capex: number;
  color: string;
  savingsKey: 'pv_total_savings_pln' | 'battery_total_savings_pln' | 'total_savings_pln';
  title: string;
  loading?: boolean;
  t: any;
}

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const Y_AXIS_WIDTH = 55;
const CHART_PADDING = 16 * 2;
const PARENT_PADDING = 16 * 2;

export function ROITimelineChart({
  monthlySummaries,
  capex,
  color,
  savingsKey,
  title,
  loading = false,
  t,
}: ROITimelineChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - PARENT_PADDING - CHART_PADDING - Y_AXIS_WIDTH - 10;

  const { lineData, maxValue, breakEvenIndex } = useMemo(() => {
    if (monthlySummaries.length === 0) {
      return { lineData: [], maxValue: 0, breakEvenIndex: -1 };
    }

    let cumulative = 0;
    let beIdx = -1;
    let maxVal = capex;

    const labelInterval = Math.max(1, Math.ceil(monthlySummaries.length / 8));

    const points = monthlySummaries.map((m, i) => {
      cumulative += m[savingsKey] || 0;
      if (cumulative > maxVal) maxVal = cumulative;
      if (beIdx < 0 && cumulative >= capex) beIdx = i;

      const periodDate = new Date(m.period + '-01');
      const label = periodDate.toLocaleDateString('pl-PL', { month: 'short' });

      return {
        value: Math.round(cumulative),
        label: i % labelInterval === 0 ? label : '',
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 9,
          textAlign: 'center' as const,
        },
        dataPointColor: color,
        hideDataPoint: monthlySummaries.length > 24 || i % Math.max(1, Math.floor(monthlySummaries.length / 12)) !== 0,
      };
    });

    return { lineData: points, maxValue: maxVal, breakEvenIndex: beIdx };
  }, [monthlySummaries, capex, color, savingsKey]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics?.loadingChart ?? 'Loading chart...'}</Text>
      </View>
    );
  }

  if (lineData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics?.noDataAvailable ?? 'No data available'}</Text>
      </View>
    );
  }

  const spacing = lineData.length > 1
    ? Math.max(6, (chartWidth - 10) / (lineData.length - 1))
    : chartWidth;

  const niceMax = Math.ceil(maxValue * 1.15 / 1000) * 1000;
  const step = Math.max(1000, Math.round(niceMax / 5 / 1000) * 1000);
  const sections = Math.max(1, Math.ceil(niceMax / step));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chartWrapper}>
        <LineChart
          data={lineData}
          width={chartWidth}
          height={200}
          spacing={spacing}
          initialSpacing={10}
          endSpacing={10}
          disableScroll
          color1={color}
          thickness1={2}
          curved
          areaChart
          startFillColor={color}
          endFillColor={color}
          startOpacity={0.2}
          endOpacity={0.02}
          maxValue={niceMax}
          noOfSections={sections}
          stepValue={step}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          xAxisThickness={0}
          yAxisThickness={0}
          xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          formatYLabel={(val: string) => {
            const n = Number(val);
            return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : val;
          }}
          rulesColor={Colors.border}
          rulesType="dashed"
          showReferenceLine1
          referenceLine1Position={capex}
          referenceLine1Config={{
            color: Colors.error,
            dashWidth: 6,
            dashGap: 4,
            thickness: 1.5,
          }}
          isAnimated
          animationDuration={400}
          hideDataPoints={monthlySummaries.length > 24}
          dataPointsRadius={4}
          dataPointsColor={color}
        />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendLabel}>
            {t.financial?.cumulativeSavings ?? 'Cumulative savings'}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { borderColor: Colors.error }]} />
          <Text style={styles.legendLabel}>
            CAPEX ({formatPLN(capex)} PLN)
          </Text>
        </View>
        {breakEvenIndex >= 0 && (
          <View style={styles.legendItem}>
            <Text style={[styles.legendLabel, { color: Colors.success, fontWeight: '600' }]}>
              Break-even ✓
            </Text>
          </View>
        )}
      </View>
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
    gap: 16,
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
  legendLine: {
    width: 14,
    height: 0,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  legendLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
