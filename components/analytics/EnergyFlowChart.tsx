import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { Circle, useFont } from '@shopify/react-native-skia';
import { Inter_500Medium } from '@expo-google-fonts/inter';
import Colors from '@/constants/colors';
import { CHART_COLORS, FieldKey, FIELD_COLORS } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { formatTimeLabel } from '@/lib/analytics';

interface EnergyFlowChartProps {
  data: ChartDataPoint[];
  timeRange: string;
  visibleFields: Record<FieldKey, boolean>;
  loading?: boolean;
}

export function EnergyFlowChart({ 
  data, 
  timeRange, 
  visibleFields,
  loading = false 
}: EnergyFlowChartProps) {
  // Load Inter font for chart labels
  const font = useFont(Inter_500Medium, 12);
  
  // Set up chart press state for tooltips
  const { state, isActive } = useChartPressState({
    x: 0,
    y: {
      gridPower: 0,
      batteryPower: 0,
      pvPower: 0,
      factoryLoad: 0,
      soc: 0,
    },
  });
  
  // Determine if we should use area charts (for 30d and 365d views)
  const useAreaChart = timeRange === '30d' || timeRange === '365d';
  
  // Show loading state
  if (loading || !font) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading chart...</Text>
      </View>
    );
  }
  
  // Show empty state
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No data available</Text>
        <Text style={styles.emptySubtext}>Try selecting a different time range</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <CartesianChart
          data={data}
          xKey="time"
          yKeys={['gridPower', 'batteryPower', 'pvPower', 'factoryLoad', 'soc']}
          padding={{ left: 10, right: 10, top: 10, bottom: 10 }}
          domainPadding={{ top: 20, bottom: 10 }}
          axisOptions={{
            font,
            lineColor: CHART_COLORS.grid,
            labelColor: Colors.textSecondary,
            formatXLabel: (value) => formatTimeLabel(value, timeRange),
            formatYLabel: (value) => {
              if (typeof value === 'number') {
                return value.toFixed(0);
              }
              return String(value);
            },
          }}
          chartPressState={state}
        >
          {({ points, chartBounds }) => (
            <>
              {/* Grid Power */}
              {visibleFields.gridPower && (
                useAreaChart ? (
                  <Area
                    points={points.gridPower}
                    y0={chartBounds.bottom}
                    color={CHART_COLORS.grid.line}
                    opacity={0.3}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                ) : (
                  <Line
                    points={points.gridPower}
                    color={CHART_COLORS.grid.line}
                    strokeWidth={2}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                )
              )}
              
              {/* Battery Power */}
              {visibleFields.batteryPower && (
                useAreaChart ? (
                  <Area
                    points={points.batteryPower}
                    y0={chartBounds.bottom}
                    color={CHART_COLORS.battery.line}
                    opacity={0.3}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                ) : (
                  <Line
                    points={points.batteryPower}
                    color={CHART_COLORS.battery.line}
                    strokeWidth={2}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                )
              )}
              
              {/* PV Power */}
              {visibleFields.pvPower && (
                useAreaChart ? (
                  <Area
                    points={points.pvPower}
                    y0={chartBounds.bottom}
                    color={CHART_COLORS.pv.production}
                    opacity={0.3}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                ) : (
                  <Line
                    points={points.pvPower}
                    color={CHART_COLORS.pv.production}
                    strokeWidth={2}
                    curveType="natural"
                    animate={{ type: 'timing', duration: 300 }}
                  />
                )
              )}
              
              {/* Factory Load */}
              {visibleFields.factoryLoad && (
                <Line
                  points={points.factoryLoad}
                  color={CHART_COLORS.factory.load}
                  strokeWidth={2}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              )}
              
              {/* SoC - scaled to fit with power values */}
              {visibleFields.soc && (
                <Line
                  points={points.soc}
                  color={CHART_COLORS.soc.line}
                  strokeWidth={2}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              )}
              
              {/* Tooltip indicator */}
              {isActive && (
                <Circle 
                  cx={state.x.position} 
                  cy={state.y.gridPower.position} 
                  r={6} 
                  color={CHART_COLORS.tooltip} 
                  opacity={0.8}
                />
              )}
            </>
          )}
        </CartesianChart>
      </View>
      
      {/* Y-axis label */}
      <Text style={styles.axisLabel}>Power (kW)</Text>
      {visibleFields.soc && (
        <Text style={styles.axisNote}>SoC shown as % for comparison</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  chartWrapper: {
    height: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 8,
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
    height: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  axisNote: {
    fontSize: 11,
    color: Colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
  },
});

