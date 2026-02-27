import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
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
  const { t } = useSettings();

  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }
  
  // Show empty state
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
        <Text style={styles.emptySubtext}>{t.analytics.tryDifferentRange}</Text>
      </View>
    );
  }
  
  // Prepare chart data - convert to Gifted Charts format
  const chartData = data.map((point, index) => {
    const obj: any = {
      value: 0, // Will be overridden by dataPointText
      label: index % Math.floor(data.length / 6) === 0 ? formatTimeLabel(point.time, timeRange) : '',
      hideDataPoint: index % 5 !== 0, // Show fewer dots for performance
    };
    
    return obj;
  });
  
  // Build line datasets
  const lineDatasets: any[] = [];
  
  // Grid Power
  if (visibleFields.gridPower) {
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.gridPower,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.grid.line,
      })),
      color: CHART_COLORS.grid.line,
      thickness: 2,
      curved: true,
      areaChart: timeRange === '30d' || timeRange === '365d',
      startFillColor: CHART_COLORS.grid.line,
      endFillColor: CHART_COLORS.grid.line,
      startOpacity: 0.3,
      endOpacity: 0.05,
    });
  }
  
  // Battery Power
  if (visibleFields.batteryPower) {
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.batteryPower,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.battery.line,
      })),
      color: CHART_COLORS.battery.line,
      thickness: 2,
      curved: true,
      areaChart: timeRange === '30d' || timeRange === '365d',
      startFillColor: CHART_COLORS.battery.line,
      endFillColor: CHART_COLORS.battery.line,
      startOpacity: 0.3,
      endOpacity: 0.05,
    });
  }
  
  // PV Power
  if (visibleFields.pvPower) {
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.pvPower,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.pv.production,
      })),
      color: CHART_COLORS.pv.production,
      thickness: 2,
      curved: true,
      areaChart: timeRange === '30d' || timeRange === '365d',
      startFillColor: CHART_COLORS.pv.production,
      endFillColor: CHART_COLORS.pv.production,
      startOpacity: 0.3,
      endOpacity: 0.05,
    });
  }
  
  // Factory Load
  if (visibleFields.factoryLoad) {
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.factoryLoad,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.factory.load,
      })),
      color: CHART_COLORS.factory.load,
      thickness: 2,
      curved: true,
    });
  }

  // Compensated Power (Load)
  if (visibleFields.compensatedPower) {
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.compensatedPower,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.load.line,
      })),
      color: CHART_COLORS.load.line,
      thickness: 2,
      curved: true,
    });
  }
  
  // SoC (scaled to match power range for visualization)
  if (visibleFields.soc) {
    const maxPower = Math.max(...data.flatMap(p => [
      Math.abs(p.gridPower),
      Math.abs(p.batteryPower),
      p.pvPower,
      p.factoryLoad
    ]));
    const scaleFactor = maxPower > 0 ? maxPower / 100 : 1;
    
    lineDatasets.push({
      data: data.map((point, index) => ({
        value: point.soc * scaleFactor,
        hideDataPoint: index % 5 !== 0,
        dataPointColor: CHART_COLORS.soc.line,
      })),
      color: CHART_COLORS.soc.line,
      thickness: 2,
      curved: true,
    });
  }
  
  // Use first dataset as primary, others as additional datasets
  const primaryData = lineDatasets[0]?.data || chartData;
  const dataSet2 = lineDatasets[1]?.data;
  const dataSet3 = lineDatasets[2]?.data;
  const dataSet4 = lineDatasets[3]?.data;
  const dataSet5 = lineDatasets[4]?.data;
  
  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <LineChart
          data={primaryData}
          data2={dataSet2}
          data3={dataSet3}
          data4={dataSet4}
          data5={dataSet5}
          height={250}
          spacing={data.length > 50 ? 8 : 15}
          initialSpacing={10}
          endSpacing={10}
          color1={lineDatasets[0]?.color || CHART_COLORS.grid.line}
          color2={lineDatasets[1]?.color}
          color3={lineDatasets[2]?.color}
          color4={lineDatasets[3]?.color}
          color5={lineDatasets[4]?.color}
          thickness1={lineDatasets[0]?.thickness}
          thickness2={lineDatasets[1]?.thickness}
          thickness3={lineDatasets[2]?.thickness}
          thickness4={lineDatasets[3]?.thickness}
          thickness5={lineDatasets[4]?.thickness}
          curved={true}
          areaChart={lineDatasets[0]?.areaChart}
          areaChart2={lineDatasets[1]?.areaChart}
          areaChart3={lineDatasets[2]?.areaChart}
          areaChart4={lineDatasets[3]?.areaChart}
          areaChart5={lineDatasets[4]?.areaChart}
          startFillColor1={lineDatasets[0]?.startFillColor}
          startFillColor2={lineDatasets[1]?.startFillColor}
          startFillColor3={lineDatasets[2]?.startFillColor}
          startFillColor4={lineDatasets[3]?.startFillColor}
          startFillColor5={lineDatasets[4]?.startFillColor}
          endFillColor1={lineDatasets[0]?.endFillColor}
          endFillColor2={lineDatasets[1]?.endFillColor}
          endFillColor3={lineDatasets[2]?.endFillColor}
          endFillColor4={lineDatasets[3]?.endFillColor}
          endFillColor5={lineDatasets[4]?.endFillColor}
          startOpacity1={lineDatasets[0]?.startOpacity}
          startOpacity2={lineDatasets[1]?.startOpacity}
          startOpacity3={lineDatasets[2]?.startOpacity}
          startOpacity4={lineDatasets[3]?.startOpacity}
          startOpacity5={lineDatasets[4]?.startOpacity}
          endOpacity1={lineDatasets[0]?.endOpacity}
          endOpacity2={lineDatasets[1]?.endOpacity}
          endOpacity3={lineDatasets[2]?.endOpacity}
          endOpacity4={lineDatasets[3]?.endOpacity}
          endOpacity5={lineDatasets[4]?.endOpacity}
          xAxisColor={CHART_COLORS.grid}
          yAxisColor={CHART_COLORS.grid}
          xAxisLabelTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
          yAxisTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
          backgroundColor={Colors.surface}
          rulesColor={CHART_COLORS.grid}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={0}
          hideDataPoints={data.length > 100}
          showVerticalLines={false}
          verticalLinesColor={CHART_COLORS.grid}
          isAnimated
          animationDuration={400}
          animateOnDataChange
          onDataChangeAnimationDuration={300}
          pointerConfig={{
            pointerStripHeight: 240,
            pointerStripColor: Colors.textLight,
            pointerStripWidth: 1,
            pointerColor: Colors.primary,
            radius: 6,
            pointerLabelWidth: 120,
            pointerLabelHeight: 90,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: any) => {
              const item = items[0];
              if (!item) return null;
              
              const pointIndex = Math.round(item.index || 0);
              const pointData = data[pointIndex];
              
              if (!pointData) return null;
              
              return (
                <View style={styles.tooltipCard}>
                  <Text style={styles.tooltipTime}>
                    {new Date(pointData.time).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {visibleFields.gridPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.grid.line }}>● </Text>
                      {`${t.analytics.grid}: `}{pointData.gridPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.batteryPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.battery.line }}>● </Text>
                      {`${t.analytics.battery}: `}{pointData.batteryPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.pvPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.pv.production }}>● </Text>
                      {`${t.analytics.pv}: `}{pointData.pvPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.factoryLoad && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.factory.load }}>● </Text>
                      {`${t.monitor.factory}: `}{pointData.factoryLoad.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.compensatedPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.load.line }}>● </Text>
                      {`${t.monitor.load}: `}{pointData.compensatedPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.soc && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.soc.line }}>● </Text>
                      {`${t.monitor.soc}: `}{pointData.soc.toFixed(0)}%
                    </Text>
                  )}
                </View>
              );
            },
          }}
        />
      </View>
      
      {/* Y-axis label */}
      <Text style={styles.axisLabel}>{t.analytics.powerKw}</Text>
      {visibleFields.soc && (
        <Text style={styles.axisNote}>{t.analytics.socScaledNote}</Text>
      )}
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
  tooltipCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipTime: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  tooltipValue: {
    fontSize: 11,
    color: Colors.text,
    marginVertical: 2,
  },
});
