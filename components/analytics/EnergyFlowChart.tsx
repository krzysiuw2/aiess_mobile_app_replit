import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS, FieldKey } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { formatTimeLabel } from '@/lib/analytics';

interface EnergyFlowChartProps {
  data: ChartDataPoint[];
  timeRange: string;
  visibleFields: Record<FieldKey, boolean>;
  loading?: boolean;
}

function buildLabelInterval(dataLen: number, spacing: number): number {
  const minLabelWidthPx = 52;
  const maxLabelsBySpace = Math.floor((dataLen * spacing) / minLabelWidthPx);
  const targetLabels = Math.min(6, Math.max(2, maxLabelsBySpace));
  return Math.max(1, Math.floor(dataLen / targetLabels));
}

function niceRound(value: number): number {
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

const Y_AXIS_WIDTH = 50;
const CHART_H_PADDING = 12 * 2;
const PARENT_H_PADDING = 16 * 2;
const INITIAL_SPACING = 10;
const END_SPACING_SOC = 40;
const END_SPACING_DEFAULT = 10;

export function EnergyFlowChart({ 
  data, 
  timeRange, 
  visibleFields,
  loading = false 
}: EnergyFlowChartProps) {
  const { t } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  const hasSoc = visibleFields.soc;
  const endSpacing = hasSoc ? END_SPACING_SOC : END_SPACING_DEFAULT;

  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - endSpacing;
  const autoSpacing = data.length > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (data.length - 1))
    : chartWidth;

  const {
    powerDatasets,
    socData,
    maxPositive,
    maxNegative,
  } = useMemo(() => {
    if (data.length === 0) return { powerDatasets: [], socData: null, maxPositive: 10, maxNegative: 0 };

    const labelInterval = buildLabelInterval(data.length, autoSpacing);
    const isArea = timeRange === '30d' || timeRange === '365d';

    const datasets: {
      key: string;
      data: any[];
      color: string;
      thickness: number;
      areaChart?: boolean;
      startFillColor?: string;
      endFillColor?: string;
      startOpacity?: number;
      endOpacity?: number;
    }[] = [];

    let rawMaxPos = 0;
    let rawMaxNeg = 0;
    for (const p of data) {
      const values = [
        visibleFields.gridPower ? p.gridPower : 0,
        visibleFields.batteryPower ? p.batteryPower : 0,
        visibleFields.pvPower ? p.pvPower : 0,
        visibleFields.compensatedPower ? p.compensatedPower : 0,
      ];
      for (const v of values) {
        if (v > rawMaxPos) rawMaxPos = v;
        if (v < rawMaxNeg) rawMaxNeg = v;
      }
    }

    const makePoints = (getValue: (p: ChartDataPoint) => number, color: string) =>
      data.map((point, i) => ({
        value: getValue(point),
        label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
        labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
        hideDataPoint: data.length > 100 || i % 5 !== 0,
        dataPointColor: color,
      }));

    if (visibleFields.gridPower) {
      datasets.push({
        key: 'grid',
        data: makePoints(p => p.gridPower, CHART_COLORS.grid.line),
        color: CHART_COLORS.grid.line,
        thickness: 2,
        areaChart: isArea,
        startFillColor: CHART_COLORS.grid.line,
        endFillColor: CHART_COLORS.grid.line,
        startOpacity: 0.3,
        endOpacity: 0.05,
      });
    }

    if (visibleFields.batteryPower) {
      datasets.push({
        key: 'battery',
        data: makePoints(p => p.batteryPower, CHART_COLORS.battery.line),
        color: CHART_COLORS.battery.line,
        thickness: 2,
        areaChart: isArea,
        startFillColor: CHART_COLORS.battery.line,
        endFillColor: CHART_COLORS.battery.line,
        startOpacity: 0.3,
        endOpacity: 0.05,
      });
    }

    if (visibleFields.pvPower) {
      datasets.push({
        key: 'pv',
        data: makePoints(p => p.pvPower, CHART_COLORS.pv.production),
        color: CHART_COLORS.pv.production,
        thickness: 2,
        areaChart: isArea,
        startFillColor: CHART_COLORS.pv.production,
        endFillColor: CHART_COLORS.pv.production,
        startOpacity: 0.3,
        endOpacity: 0.05,
      });
    }

    if (visibleFields.compensatedPower) {
      datasets.push({
        key: 'load',
        data: makePoints(p => p.compensatedPower, CHART_COLORS.load.line),
        color: CHART_COLORS.load.line,
        thickness: 2,
      });
    }

    let soc = null;
    if (visibleFields.soc) {
      soc = data.map((point, i) => ({
        value: point.soc,
        hideDataPoint: data.length > 100 || i % 5 !== 0,
        dataPointColor: CHART_COLORS.soc.line,
      }));
    }

    return {
      powerDatasets: datasets,
      socData: soc,
      maxPositive: rawMaxPos,
      maxNegative: rawMaxNeg,
    };
  }, [data, timeRange, visibleFields, autoSpacing]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }
  
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
        <Text style={styles.emptySubtext}>{t.analytics.tryDifferentRange}</Text>
      </View>
    );
  }

  if (powerDatasets.length === 0 && !socData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
        <Text style={styles.emptySubtext}>{t.analytics.tryDifferentRange}</Text>
      </View>
    );
  }

  const labelInterval = buildLabelInterval(data.length, autoSpacing);

  const fallbackPrimary = data.map((point, i) => ({
    value: 0,
    label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
    labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
    hideDataPoint: true,
  }));

  const ds = powerDatasets;
  const primaryData = ds[0]?.data || fallbackPrimary;

  const rawRange = maxPositive + Math.abs(maxNegative) || 10;
  const step = niceRound(rawRange / 6) || 1;
  const yAxisMax = Math.max(step, Math.ceil((maxPositive || 1) / step) * step);
  const yAxisNeg = maxNegative < 0 ? -Math.ceil(Math.abs(maxNegative) / step) * step : 0;
  const noOfSections = Math.round(yAxisMax / step);

  // `height` in the library controls only 0→maxValue; negative extends below
  // proportionally. Scale height so the TOTAL (pos + neg) stays at ~250px.
  const DESIRED_TOTAL = 250;
  const fullRange = yAxisMax + Math.abs(yAxisNeg);
  const chartHeight = fullRange > 0 && yAxisNeg < 0
    ? Math.round(DESIRED_TOTAL * yAxisMax / fullRange)
    : DESIRED_TOTAL;

  const secondaryYAxisConfig = socData ? {
    noOfSections: 5,
    maxValue: 100,
    yAxisColor: CHART_COLORS.soc.line,
    yAxisTextStyle: { color: CHART_COLORS.soc.line, fontSize: 10 },
    yAxisLabelSuffix: '%',
  } : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.axisLabelsRow}>
        <Text style={styles.yAxisLabel}>{t.analytics.powerKw}</Text>
        {socData && <Text style={[styles.yAxisLabel, { color: CHART_COLORS.soc.line }]}>SoC %</Text>}
      </View>
      <View style={styles.chartWrapper}>
        <LineChart
          data={primaryData}
          data2={ds[1]?.data}
          data3={ds[2]?.data}
          data4={ds[3]?.data}
          data5={ds[4]?.data}
          secondaryData={socData || undefined}
          secondaryLineConfig={socData ? {
            color: CHART_COLORS.soc.line,
            thickness: 2,
            curved: true,
            hideDataPoints: data.length > 100,
            dataPointsColor: CHART_COLORS.soc.line,
            strokeDashArray: [6, 4],
          } : undefined}
          secondaryYAxis={secondaryYAxisConfig}
          maxValue={yAxisMax}
          mostNegativeValue={yAxisNeg}
          noOfSections={noOfSections}
          stepValue={step}
          width={chartWidth}
          height={chartHeight}
          spacing={autoSpacing}
          initialSpacing={INITIAL_SPACING}
          endSpacing={endSpacing}
          disableScroll
          color1={ds[0]?.color || CHART_COLORS.grid.line}
          color2={ds[1]?.color}
          color3={ds[2]?.color}
          color4={ds[3]?.color}
          color5={ds[4]?.color}
          thickness1={ds[0]?.thickness}
          thickness2={ds[1]?.thickness}
          thickness3={ds[2]?.thickness}
          thickness4={ds[3]?.thickness}
          thickness5={ds[4]?.thickness}
          curved
          areaChart={ds[0]?.areaChart}
          areaChart2={ds[1]?.areaChart}
          areaChart3={ds[2]?.areaChart}
          areaChart4={ds[3]?.areaChart}
          areaChart5={ds[4]?.areaChart}
          startFillColor1={ds[0]?.startFillColor}
          startFillColor2={ds[1]?.startFillColor}
          startFillColor3={ds[2]?.startFillColor}
          startFillColor4={ds[3]?.startFillColor}
          startFillColor5={ds[4]?.startFillColor}
          endFillColor1={ds[0]?.endFillColor}
          endFillColor2={ds[1]?.endFillColor}
          endFillColor3={ds[2]?.endFillColor}
          endFillColor4={ds[3]?.endFillColor}
          endFillColor5={ds[4]?.endFillColor}
          startOpacity1={ds[0]?.startOpacity}
          startOpacity2={ds[1]?.startOpacity}
          startOpacity3={ds[2]?.startOpacity}
          startOpacity4={ds[3]?.startOpacity}
          startOpacity5={ds[4]?.startOpacity}
          endOpacity1={ds[0]?.endOpacity}
          endOpacity2={ds[1]?.endOpacity}
          endOpacity3={ds[2]?.endOpacity}
          endOpacity4={ds[3]?.endOpacity}
          endOpacity5={ds[4]?.endOpacity}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          xAxisLabelTextStyle={{
            color: Colors.textSecondary,
            fontSize: 9,
          }}
          yAxisTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints={data.length > 100}
          showVerticalLines={false}
          isAnimated
          animationDuration={400}
          animateOnDataChange
          onDataChangeAnimationDuration={300}
          rotateLabel={timeRange === '7d' || timeRange === '30d'}
          pointerConfig={{
            pointerStripHeight: 240,
            pointerStripColor: Colors.textLight,
            pointerStripWidth: 1,
            pointerColor: Colors.primary,
            radius: 6,
            pointerLabelWidth: 140,
            pointerLabelHeight: 100,
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
                    {formatTimeLabel(pointData.time, timeRange)}
                  </Text>
                  {visibleFields.gridPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.grid.line }}>●{' '}</Text>
                      {`${t.analytics.grid}: `}{pointData.gridPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.batteryPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.battery.line }}>●{' '}</Text>
                      {`${t.analytics.battery}: `}{pointData.batteryPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.pvPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.pv.production }}>●{' '}</Text>
                      {`${t.analytics.pv}: `}{pointData.pvPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.compensatedPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.load.line }}>●{' '}</Text>
                      {`${t.monitor.load}: `}{pointData.compensatedPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.soc && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.soc.line }}>●{' '}</Text>
                      {`${t.monitor.soc}: `}{pointData.soc.toFixed(0)}%
                    </Text>
                  )}
                </View>
              );
            },
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  axisLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  yAxisLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    paddingTop: 16,
    paddingBottom: 8,
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
