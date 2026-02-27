import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { calculateBatteryCycles } from '@/lib/analytics';

interface CyclesBarChartProps {
  data: ChartDataPoint[];
  timeRange: string;
}

interface CycleGroup {
  label: string;
  cycles: number;
}

function groupCyclesData(data: ChartDataPoint[], timeRange: string): CycleGroup[] {
  if (data.length === 0) return [];

  const groups: Record<string, ChartDataPoint[]> = {};

  for (const point of data) {
    let key: string;
    const d = point.time;

    switch (timeRange) {
      case '24h': {
        const h = d.getHours();
        const bucket = Math.floor(h / 4) * 4;
        key = `${bucket.toString().padStart(2, '0')}:00`;
        break;
      }
      case '7d':
        key = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        break;
      case '30d': {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = `W${weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
        break;
      }
      case '365d':
        key = d.toLocaleDateString('en-US', { month: 'short' });
        break;
      default:
        key = d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(point);
  }

  return Object.entries(groups).map(([label, points]) => ({
    label,
    cycles: calculateBatteryCycles(points),
  }));
}

export function CyclesBarChart({ data, timeRange }: CyclesBarChartProps) {
  const { t } = useSettings();
  const groups = useMemo(() => groupCyclesData(data, timeRange), [data, timeRange]);
  const totalCycles = useMemo(() => calculateBatteryCycles(data), [data]);

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noCycleData}</Text>
      </View>
    );
  }

  const barData = groups.map(g => ({
    value: g.cycles,
    label: g.label,
    frontColor: CHART_COLORS.battery.line,
    topLabelComponent: () =>
      g.cycles > 0 ? (
        <Text style={styles.barTopLabel}>{g.cycles.toFixed(1)}</Text>
      ) : null,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t.analytics.totalCycles}</Text>
        <Text style={[styles.summaryValue, { color: CHART_COLORS.battery.line }]}>
          {totalCycles.toFixed(2)}
        </Text>
      </View>

      <View style={styles.chartWrapper}>
        <BarChart
          data={barData}
          height={180}
          barWidth={groups.length > 12 ? 14 : groups.length > 6 ? 22 : 32}
          spacing={groups.length > 12 ? 6 : 10}
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
          roundedTop
          isAnimated
          animationDuration={400}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
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
  barTopLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 2,
  },
});
