import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { EnergyBreakdown } from '@/lib/analytics';

interface EnergyDonutChartProps {
  breakdown: EnergyBreakdown;
}

export function EnergyDonutChart({ breakdown }: EnergyDonutChartProps) {
  if (breakdown.totalEnergy === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No energy data available</Text>
      </View>
    );
  }

  const pieData = [
    {
      value: breakdown.fromGrid,
      color: CHART_COLORS.donut.grid,
      text: `${breakdown.fromGrid}%`,
      focused: breakdown.fromGrid >= breakdown.fromPV && breakdown.fromGrid >= breakdown.fromBattery,
    },
    {
      value: breakdown.fromPV,
      color: CHART_COLORS.donut.pv,
      text: `${breakdown.fromPV}%`,
      focused: breakdown.fromPV > breakdown.fromGrid && breakdown.fromPV >= breakdown.fromBattery,
    },
    {
      value: breakdown.fromBattery,
      color: CHART_COLORS.donut.battery,
      text: `${breakdown.fromBattery}%`,
      focused: breakdown.fromBattery > breakdown.fromGrid && breakdown.fromBattery > breakdown.fromPV,
    },
  ].filter(d => d.value > 0);

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        <PieChart
          data={pieData}
          donut
          radius={80}
          innerRadius={50}
          innerCircleColor={Colors.surface}
          centerLabelComponent={() => (
            <View style={styles.centerLabel}>
              <Text style={styles.centerValue}>
                {breakdown.totalEnergy.toFixed(0)}
              </Text>
              <Text style={styles.centerUnit}>kWh</Text>
            </View>
          )}
          focusOnPress
          sectionAutoFocus
          showValuesAsLabels
          textColor={Colors.text}
          textSize={10}
          fontWeight="600"
        />

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.grid }]} />
            <View style={styles.legendTextContainer}>
              <Text style={styles.legendLabel}>Grid</Text>
              <Text style={styles.legendValue}>{breakdown.fromGrid.toFixed(1)}%</Text>
            </View>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.pv }]} />
            <View style={styles.legendTextContainer}>
              <Text style={styles.legendLabel}>PV</Text>
              <Text style={styles.legendValue}>{breakdown.fromPV.toFixed(1)}%</Text>
            </View>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.donut.battery }]} />
            <View style={styles.legendTextContainer}>
              <Text style={styles.legendLabel}>Battery</Text>
              <Text style={styles.legendValue}>{breakdown.fromBattery.toFixed(1)}%</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
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
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  centerUnit: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  legend: {
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  legendValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
