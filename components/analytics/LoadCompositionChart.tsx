import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { prepareStackedAreaData, StackedAreaData } from '@/lib/analytics';

interface LoadCompositionChartProps {
  data: ChartDataPoint[];
  timeRange: string;
}

interface GroupedLoad {
  label: string;
  fromGrid: number;
  fromPV: number;
  fromBattery: number;
}

function groupLoadData(stackedData: StackedAreaData[], timeRange: string): GroupedLoad[] {
  if (stackedData.length === 0) return [];

  const groups: Record<string, { grid: number; pv: number; battery: number; count: number }> = {};

  for (const point of stackedData) {
    let key: string;
    const d = point.time;

    switch (timeRange) {
      case '24h':
        key = d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
        break;
      case '7d':
        key = d.toLocaleDateString('en-US', { weekday: 'short' });
        break;
      case '30d':
        key = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        break;
      case '365d':
        key = d.toLocaleDateString('en-US', { month: 'short' });
        break;
      default:
        key = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    if (!groups[key]) {
      groups[key] = { grid: 0, pv: 0, battery: 0, count: 0 };
    }

    groups[key].grid += point.fromGrid;
    groups[key].pv += point.fromPV;
    groups[key].battery += point.fromBattery;
    groups[key].count += 1;
  }

  return Object.entries(groups).map(([label, g]) => ({
    label,
    fromGrid: Math.round((g.grid / g.count) * 10) / 10,
    fromPV: Math.round((g.pv / g.count) * 10) / 10,
    fromBattery: Math.round((g.battery / g.count) * 10) / 10,
  }));
}

export function LoadCompositionChart({ data, timeRange }: LoadCompositionChartProps) {
  const { t } = useSettings();
  const stackedData = useMemo(() => prepareStackedAreaData(data), [data]);
  const grouped = useMemo(() => groupLoadData(stackedData, timeRange), [stackedData, timeRange]);

  if (grouped.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noLoadData}</Text>
      </View>
    );
  }

  const maxLabels = timeRange === '365d' ? 12 : timeRange === '30d' ? 10 : grouped.length;
  const labelInterval = Math.max(1, Math.ceil(grouped.length / maxLabels));

  const barStackData = grouped.map((group, i) => ({
    stacks: [
      { value: group.fromGrid, color: CHART_COLORS.donut.grid },
      { value: group.fromPV, color: CHART_COLORS.donut.pv, marginBottom: 1 },
      { value: group.fromBattery, color: CHART_COLORS.donut.battery, marginBottom: 1 },
    ],
    label: i % labelInterval === 0 ? group.label : '',
  }));

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <BarChart
          stackData={barStackData}
          height={200}
          barWidth={grouped.length > 20 ? 10 : grouped.length > 10 ? 16 : 24}
          spacing={grouped.length > 20 ? 4 : 8}
          initialSpacing={8}
          endSpacing={8}
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
          rulesColor={Colors.border}
          rulesType="dashed"
          noOfSections={4}
          isAnimated
          animationDuration={400}
        />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.grid }]} />
          <Text style={styles.legendLabel}>{t.analytics.fromGrid}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.pv }]} />
          <Text style={styles.legendLabel}>{t.analytics.fromPV}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.battery }]} />
          <Text style={styles.legendLabel}>{t.analytics.fromBattery}</Text>
        </View>
      </View>
      <Text style={styles.axisLabel}>{t.analytics.averagePowerKw}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    paddingTop: 20,
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
