import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS, FieldKey } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { SimulationDataPoint } from '@/types';
import { formatTimeLabel } from '@/lib/analytics';

interface EnergyFlowChartProps {
  data: ChartDataPoint[];
  simulationData?: SimulationDataPoint[];
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
  simulationData,
  timeRange, 
  visibleFields,
  loading = false 
}: EnergyFlowChartProps) {
  const { t } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  const hasSoc = visibleFields.soc;
  const endSpacing = hasSoc ? END_SPACING_SOC : END_SPACING_DEFAULT;

  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - endSpacing;

  const simMap = useMemo(() => {
    if (!simulationData || simulationData.length === 0) return new Map<string, SimulationDataPoint>();
    const m = new Map<string, SimulationDataPoint>();
    for (const s of simulationData) {
      const t = s.time?.getTime?.();
      if (!t || isNaN(t)) continue;
      m.set(s.time.toISOString().slice(0, 13), s);
    }
    return m;
  }, [simulationData]);

  const extendedData = useMemo((): ChartDataPoint[] => {
    if (data.length === 0 || !simulationData || simulationData.length === 0) return data;
    const lastTelemetry = data[data.length - 1]?.time?.getTime();
    if (!lastTelemetry || isNaN(lastTelemetry)) return data;

    const futureSimPoints = simulationData.filter(s => {
      const t = s.time?.getTime?.();
      return t && !isNaN(t) && t > lastTelemetry;
    });

    if (futureSimPoints.length === 0) return data;

    const lastSoc = data[data.length - 1]?.soc || 0;
    const synthPoints: ChartDataPoint[] = futureSimPoints.map(s => ({
      time: s.time,
      gridPower: 0,
      batteryPower: 0,
      pvPower: 0,
      soc: lastSoc,
      factoryLoad: 0,
      compensatedPower: 0,
    }));

    return [...data, ...synthPoints];
  }, [data, simulationData]);

  const isForecastOnly = data.length === 0 && simulationData && simulationData.length > 0;

  const pointCount = isForecastOnly ? (simulationData?.length || 0) : extendedData.length;
  const autoSpacing = pointCount > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (pointCount - 1))
    : chartWidth;

  const {
    powerDatasets,
    socData,
    maxPositive,
    maxNegative,
    effectiveData,
  } = useMemo(() => {
    type DSEntry = {
      key: string;
      data: any[];
      color: string;
      thickness: number;
      areaChart?: boolean;
      startFillColor?: string;
      endFillColor?: string;
      startOpacity?: number;
      endOpacity?: number;
      dashed?: boolean;
    };

    if (isForecastOnly && simulationData) {
      const simPoints = simulationData.filter(s => {
        const t = s.time?.getTime?.();
        return t && !isNaN(t);
      });
      if (simPoints.length === 0) return { powerDatasets: [], socData: null, maxPositive: 10, maxNegative: 0, effectiveData: data };

      const fcLabelInterval = buildLabelInterval(simPoints.length, autoSpacing);
      const datasets: DSEntry[] = [];
      let rawMaxPos = 0;

      const makeFcPoints = (getValue: (s: SimulationDataPoint) => number, color: string) =>
        simPoints.map((s, i) => {
          const val = getValue(s);
          if (val > rawMaxPos) rawMaxPos = val;
          return {
            value: val,
            label: i % fcLabelInterval === 0 ? formatTimeLabel(s.time, timeRange) : '',
            labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
            hideDataPoint: simPoints.length > 50 || i % 3 !== 0,
            dataPointColor: color,
          };
        });

      if (visibleFields.pvPower) {
        datasets.push({
          key: 'pvForecast',
          data: makeFcPoints(s => s.pvForecast || s.pvEstimated || 0, '#f59e0b'),
          color: '#f59e0b',
          thickness: 2,
          dashed: true,
        });
      }

      if (visibleFields.compensatedPower) {
        datasets.push({
          key: 'loadForecast',
          data: makeFcPoints(s => s.loadForecast || 0, CHART_COLORS.load.line),
          color: CHART_COLORS.load.line,
          thickness: 2,
          dashed: true,
        });
      }

      const synthData: ChartDataPoint[] = simPoints.map(s => ({
        time: s.time,
        gridPower: 0, batteryPower: 0, pvPower: 0, soc: 0, factoryLoad: 0, compensatedPower: 0,
      }));

      return { powerDatasets: datasets, socData: null, maxPositive: rawMaxPos, maxNegative: 0, effectiveData: synthData };
    }

    const chartPoints = extendedData;
    if (chartPoints.length === 0) return { powerDatasets: [], socData: null, maxPositive: 10, maxNegative: 0, effectiveData: chartPoints };

    const labelInterval = buildLabelInterval(chartPoints.length, autoSpacing);
    const isArea = timeRange === '30d' || timeRange === '365d';

    const datasets: DSEntry[] = [];

    let rawMaxPos = 0;
    let rawMaxNeg = 0;
    for (const p of chartPoints) {
      const values = [
        visibleFields.gridPower ? p.gridPower : 0,
        visibleFields.batteryPower ? p.batteryPower : 0,
        visibleFields.pvPower ? p.pvPower : 0,
        visibleFields.compensatedPower ? p.factoryLoad : 0,
      ];
      for (const v of values) {
        if (v > rawMaxPos) rawMaxPos = v;
        if (v < rawMaxNeg) rawMaxNeg = v;
      }
    }

    const makePoints = (getValue: (p: ChartDataPoint) => number, color: string) =>
      chartPoints.map((point, i) => ({
        value: getValue(point),
        label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
        labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
        hideDataPoint: chartPoints.length > 100 || i % 5 !== 0,
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
        data: makePoints(p => p.factoryLoad, CHART_COLORS.load.line),
        color: CHART_COLORS.load.line,
        thickness: 2,
      });
    }

    if (visibleFields.pvPower && simMap.size > 0) {
      const hasForecastValues = [...simMap.values()].some(s => s.pvEstimated > 0 || s.pvForecast > 0);
      if (hasForecastValues) {
        const pvEstPoints = chartPoints.map((point, i) => {
          const tMs = point.time?.getTime?.();
          const key = (tMs && !isNaN(tMs)) ? point.time.toISOString().slice(0, 13) : '';
          const sim = key ? simMap.get(key) : undefined;
          const val = sim ? (sim.pvEstimated || sim.pvForecast || 0) : 0;
          if (val > rawMaxPos) rawMaxPos = val;
          return {
            value: val,
            label: '',
            labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
            hideDataPoint: true,
            dataPointColor: '#f59e0b',
          };
        });

        datasets.push({
          key: 'pvEstimated',
          data: pvEstPoints,
          color: '#f59e0b',
          thickness: 2,
          dashed: true,
        });
      }
    }

    if (visibleFields.compensatedPower && simMap.size > 0) {
      const hasLoadForecast = [...simMap.values()].some(s => s.loadForecast > 0);
      if (hasLoadForecast) {
        const loadFcPoints = chartPoints.map((point, i) => {
          const tMs = point.time?.getTime?.();
          const key = (tMs && !isNaN(tMs)) ? point.time.toISOString().slice(0, 13) : '';
          const sim = key ? simMap.get(key) : undefined;
          const val = sim ? (sim.loadForecast || 0) : 0;
          if (val > rawMaxPos) rawMaxPos = val;
          return {
            value: val,
            label: '',
            labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
            hideDataPoint: true,
            dataPointColor: CHART_COLORS.load.line,
          };
        });

        datasets.push({
          key: 'loadForecast',
          data: loadFcPoints,
          color: CHART_COLORS.load.line + '80',
          thickness: 1.5,
          dashed: true,
        });
      }
    }

    if (__DEV__) {
      console.log(`[Chart] Total datasets: ${datasets.length} → [${datasets.map(d => d.key).join(', ')}]`);
    }

    let soc = null;
    if (visibleFields.soc) {
      soc = chartPoints.map((point, i) => ({
        value: point.soc,
        hideDataPoint: chartPoints.length > 100 || i % 5 !== 0,
        dataPointColor: CHART_COLORS.soc.line,
      }));
    }

    return {
      powerDatasets: datasets,
      socData: soc,
      maxPositive: rawMaxPos,
      maxNegative: rawMaxNeg,
      effectiveData: chartPoints,
    };
  }, [data, extendedData, simulationData, isForecastOnly, simMap, timeRange, visibleFields, autoSpacing]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }
  
  if ((!effectiveData || effectiveData.length === 0) && powerDatasets.length === 0) {
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

  const ed = effectiveData || [];
  const labelInterval = buildLabelInterval(ed.length, autoSpacing);

  const fallbackPrimary = ed.map((point, i) => ({
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

  const getDashArray = (idx: number): number[] | undefined => {
    return ds[idx]?.dashed ? [6, 4] : undefined;
  };

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
            hideDataPoints: ed.length > 100,
            dataPointsColor: CHART_COLORS.soc.line,
            strokeDashArray: [2, 3],
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
          strokeDashArray1={getDashArray(0)}
          strokeDashArray2={getDashArray(1)}
          strokeDashArray3={getDashArray(2)}
          strokeDashArray4={getDashArray(3)}
          strokeDashArray5={getDashArray(4)}
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
          hideDataPoints={ed.length > 100}
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
            pointerLabelComponent: (items: any, _secondaryDataItem: any, pointerIndex: number) => {
              const idx = typeof pointerIndex === 'number' ? pointerIndex : 0;
              if (idx < 0 || idx >= ed.length) return null;
              
              const pointData = ed[idx];
              if (!pointData) return null;

              let pvEstVal: number | null = null;
              let loadFcVal: number | null = null;
              const tMs = pointData.time?.getTime?.();
              const key = (tMs && !isNaN(tMs)) ? pointData.time.toISOString().slice(0, 13) : '';
              if (simMap.size > 0 && key) {
                const sim = simMap.get(key);
                if (sim) {
                  if (sim.pvEstimated > 0 || sim.pvForecast > 0) pvEstVal = sim.pvEstimated || sim.pvForecast;
                  if (sim.loadForecast > 0) loadFcVal = sim.loadForecast;
                }
              }

              if (isForecastOnly) {
                return (
                  <View style={styles.tooltipCard}>
                    <Text style={styles.tooltipTime}>
                      {formatTimeLabel(pointData.time, timeRange)}
                    </Text>
                    <Text style={[styles.tooltipValue, { fontStyle: 'italic', color: Colors.textSecondary, marginBottom: 4 }]}>
                      {t.monitor.forecast || 'Forecast'}
                    </Text>
                    {pvEstVal != null && (
                      <Text style={styles.tooltipValue}>
                        <Text style={{ color: '#f59e0b' }}>◌{' '}</Text>
                        {`${t.analytics.pv}: `}{pvEstVal.toFixed(1)} kW
                      </Text>
                    )}
                    {loadFcVal != null && (
                      <Text style={styles.tooltipValue}>
                        <Text style={{ color: CHART_COLORS.load.line }}>◌{' '}</Text>
                        {`${t.monitor.load}: `}{loadFcVal.toFixed(1)} kW
                      </Text>
                    )}
                  </View>
                );
              }
              
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
                  {pvEstVal != null && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: '#f59e0b' }}>◌{' '}</Text>
                      {`${t.monitor.pvEstimated}: `}{pvEstVal.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.compensatedPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.load.line }}>●{' '}</Text>
                      {`${t.monitor.load}: `}{pointData.factoryLoad.toFixed(1)} kW
                    </Text>
                  )}
                  {loadFcVal != null && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.load.line + '80' }}>◌{' '}</Text>
                      {`${t.monitor.load} ${t.monitor.forecast || 'fc'}: `}{loadFcVal.toFixed(1)} kW
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
