import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';

interface EnergyBarsChartProps {
  data: ChartDataPoint[];
  timeRange: string;
}

interface BarGroup {
  label: string;
  gridImport: number;
  gridExport: number;
  pvProduction: number;
}

function groupDataForBars(data: ChartDataPoint[], timeRange: string): BarGroup[] {
  if (data.length === 0) return [];

  const groups: Record<string, { gridImport: number; gridExport: number; pv: number; count: number }> = {};

  for (const point of data) {
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
      groups[key] = { gridImport: 0, gridExport: 0, pv: 0, count: 0 };
    }

    groups[key].gridImport += Math.max(0, point.gridPower);
    groups[key].gridExport += Math.max(0, -point.gridPower);
    groups[key].pv += point.pvPower;
    groups[key].count += 1;
  }

  const hoursMap: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720, '365d': 8760 };
  const totalHours = hoursMap[timeRange] || 24;
  const hoursPerPoint = totalHours / Math.max(data.length, 1);

  return Object.entries(groups).map(([label, g]) => ({
    label,
    gridImport: Math.round(g.gridImport * hoursPerPoint * 10) / 10,
    gridExport: Math.round(g.gridExport * hoursPerPoint * 10) / 10,
    pvProduction: Math.round(g.pv * hoursPerPoint * 10) / 10,
  }));
}

export function EnergyBarsChart({ data, timeRange }: EnergyBarsChartProps) {
  const { t } = useSettings();
  const barGroups = useMemo(() => groupDataForBars(data, timeRange), [data, timeRange]);

  if (barGroups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
      </View>
    );
  }

  const maxLabels = timeRange === '365d' ? 12 : timeRange === '30d' ? 10 : barGroups.length;
  const labelInterval = Math.max(1, Math.ceil(barGroups.length / maxLabels));

  const stackData = barGroups.map((group, i) => ({
    stacks: [
      { value: group.gridImport, color: CHART_COLORS.grid.import },
      { value: group.pvProduction, color: CHART_COLORS.pv.production, marginBottom: 1 },
      { value: group.gridExport, color: CHART_COLORS.grid.export, marginBottom: 1 },
    ],
    label: i % labelInterval === 0 ? group.label : '',
  }));

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <BarChart
          stackData={stackData}
          height={200}
          barWidth={barGroups.length > 20 ? 10 : barGroups.length > 10 ? 16 : 24}
          spacing={barGroups.length > 20 ? 4 : 8}
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
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.grid.import }]} />
          <Text style={styles.legendLabel}>{t.analytics.gridImport}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.pv.production }]} />
          <Text style={styles.legendLabel}>{t.analytics.pv}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.grid.export }]} />
          <Text style={styles.legendLabel}>{t.analytics.gridExport}</Text>
        </View>
      </View>
      <Text style={styles.axisLabel}>{t.analytics.energyKwh}</Text>
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
