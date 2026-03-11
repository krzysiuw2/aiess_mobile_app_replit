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
  selectedDate: Date;
  timeRange: string;
  visibleFields: Record<FieldKey, boolean>;
  loading?: boolean;
}

interface TimelinePoint {
  time: Date;
  gridPower: number;
  batteryPower: number;
  pvPower: number;
  factoryLoad: number;
  soc: number;
  isForecast: boolean;
}

type LineSegment = {
  startIndex: number;
  endIndex: number;
  color?: string;
  thickness?: number;
  strokeDashArray?: number[];
};

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
  lineSegments?: LineSegment[];
};

function getSlotConfig(timeRange: string) {
  switch (timeRange) {
    case '24h': return { intervalMs: 3_600_000, slotCount: 24 };
    case '7d':  return { intervalMs: 3_600_000 * 3, slotCount: 56 };
    case '30d': return { intervalMs: 3_600_000 * 24, slotCount: 31 };
    case '365d': return { intervalMs: 3_600_000 * 24, slotCount: 365 };
    default:    return { intervalMs: 3_600_000, slotCount: 24 };
  }
}

function getPeriodStart(selectedDate: Date, timeRange: string): Date {
  const d = new Date(selectedDate);
  switch (timeRange) {
    case '24h':
      d.setHours(0, 0, 0, 0);
      return d;
    case '7d':
      d.setHours(0, 0, 0, 0);
      return d;
    case '30d':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case '365d':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      d.setHours(0, 0, 0, 0);
      return d;
  }
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

const avg = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const Y_AXIS_WIDTH = 50;
const CHART_H_PADDING = 12 * 2;
const PARENT_H_PADDING = 16 * 2;
const INITIAL_SPACING = 10;
const END_SPACING_SOC = 40;
const END_SPACING_DEFAULT = 10;

export function EnergyFlowChart({
  data,
  simulationData,
  selectedDate,
  timeRange,
  visibleFields,
  loading = false,
}: EnergyFlowChartProps) {
  const { t } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  const hasSoc = visibleFields.soc;
  const endSpacing = hasSoc ? END_SPACING_SOC : END_SPACING_DEFAULT;
  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - endSpacing;

  // ─── Unified timeline: downsample telemetry + merge forecast ───────
  const unifiedTimeline = useMemo((): TimelinePoint[] => {
    const { intervalMs, slotCount } = getSlotConfig(timeRange);
    const periodStart = getPeriodStart(selectedDate, timeRange);
    const periodStartMs = periodStart.getTime();

    const telemetryBySlot = new Map<
      number,
      { grid: number[]; battery: number[]; pv: number[]; load: number[]; soc: number[] }
    >();

    for (const point of data) {
      const t = point.time?.getTime?.();
      if (!t || isNaN(t)) continue;
      const slotIdx = Math.floor((t - periodStartMs) / intervalMs);
      if (slotIdx < 0 || slotIdx >= slotCount) continue;
      if (!telemetryBySlot.has(slotIdx)) {
        telemetryBySlot.set(slotIdx, { grid: [], battery: [], pv: [], load: [], soc: [] });
      }
      const bucket = telemetryBySlot.get(slotIdx)!;
      bucket.grid.push(point.gridPower);
      bucket.battery.push(point.batteryPower);
      bucket.pv.push(point.pvPower);
      bucket.load.push(point.factoryLoad);
      bucket.soc.push(point.soc);
    }

    const simBySlot = new Map<number, SimulationDataPoint>();
    if (simulationData) {
      for (const s of simulationData) {
        const st = s.time?.getTime?.();
        if (!st || isNaN(st)) continue;
        const slotIdx = Math.floor((st - periodStartMs) / intervalMs);
        if (slotIdx < 0 || slotIdx >= slotCount) continue;
        if (!simBySlot.has(slotIdx)) simBySlot.set(slotIdx, s);
      }
    }

    let lastKnownSoc = 0;
    const timeline: TimelinePoint[] = [];

    for (let i = 0; i < slotCount; i++) {
      const slotTime = new Date(periodStartMs + i * intervalMs);
      const tel = telemetryBySlot.get(i);
      const sim = simBySlot.get(i);

      if (tel && tel.grid.length > 0) {
        const socVal = avg(tel.soc);
        lastKnownSoc = socVal;
        timeline.push({
          time: slotTime,
          gridPower: avg(tel.grid),
          batteryPower: avg(tel.battery),
          pvPower: avg(tel.pv),
          factoryLoad: avg(tel.load),
          soc: socVal,
          isForecast: false,
        });
      } else if (sim) {
        timeline.push({
          time: slotTime,
          gridPower: 0,
          batteryPower: 0,
          pvPower: sim.pvForecast || sim.pvEstimated || 0,
          factoryLoad: sim.loadForecast || 0,
          soc: lastKnownSoc,
          isForecast: true,
        });
      } else {
        timeline.push({
          time: slotTime,
          gridPower: 0,
          batteryPower: 0,
          pvPower: 0,
          factoryLoad: 0,
          soc: lastKnownSoc,
          isForecast: true,
        });
      }
    }

    if (__DEV__) {
      const realCount = timeline.filter(p => !p.isForecast).length;
      const fcCount = timeline.filter(p => p.isForecast).length;
      console.log(`[Chart] Unified timeline: ${timeline.length} slots (${realCount} real, ${fcCount} forecast)`);
    }

    return timeline;
  }, [data, simulationData, selectedDate, timeRange]);

  // ─── Spacing ───────────────────────────────────────────────────────
  const pointCount = unifiedTimeline.length;
  const autoSpacing = pointCount > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (pointCount - 1))
    : chartWidth;

  // ─── Build datasets with lineSegments for solid→dashed transition ──
  const { powerDatasets, socData, maxPositive, maxNegative, hasLineSegments } = useMemo(() => {
    const tl = unifiedTimeline;
    if (tl.length === 0) {
      return { powerDatasets: [] as DSEntry[], socData: null, maxPositive: 10, maxNegative: 0 };
    }

    const labelInterval = buildLabelInterval(tl.length, autoSpacing);
    const isArea = timeRange === '30d' || timeRange === '365d';

    const forecastStartIndex = tl.findIndex(p => p.isForecast);
    const lastRealIndex = forecastStartIndex > 0 ? forecastStartIndex - 1 : forecastStartIndex < 0 ? tl.length - 1 : -1;

    const hasPvForecast = tl.some(p => p.isForecast && p.pvPower > 0);
    const hasLoadForecast = tl.some(p => p.isForecast && p.factoryLoad > 0);

    const clipAtReal = (color: string): LineSegment[] | undefined => {
      if (forecastStartIndex < 0) return undefined;
      if (lastRealIndex < 0) return [{ startIndex: 0, endIndex: tl.length - 1, color: 'transparent' }];
      return [
        { startIndex: 0, endIndex: lastRealIndex, color },
        { startIndex: lastRealIndex, endIndex: tl.length - 1, color: 'transparent' },
      ];
    };

    const buildSegments = (color: string): LineSegment[] | undefined => {
      if (forecastStartIndex < 0) return undefined;
      if (forecastStartIndex === 0) {
        return [{ startIndex: 0, endIndex: tl.length - 1, color, strokeDashArray: [6, 4] }];
      }
      return [
        { startIndex: 0, endIndex: forecastStartIndex, color },
        { startIndex: forecastStartIndex, endIndex: tl.length - 1, color, strokeDashArray: [6, 4] },
      ];
    };

    let rawMaxPos = 0;
    let rawMaxNeg = 0;
    for (const p of tl) {
      const vals = [
        visibleFields.gridPower ? p.gridPower : 0,
        visibleFields.batteryPower ? p.batteryPower : 0,
        visibleFields.pvPower ? p.pvPower : 0,
        visibleFields.compensatedPower ? p.factoryLoad : 0,
      ];
      for (const v of vals) {
        if (v > rawMaxPos) rawMaxPos = v;
        if (v < rawMaxNeg) rawMaxNeg = v;
      }
    }

    const dpInterval = Math.max(1, Math.floor(tl.length / 12));
    const makePoints = (getValue: (p: TimelinePoint) => number, color: string, clipForecast = false) =>
      tl.map((point, i) => ({
        value: getValue(point),
        label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 9,
          width: 48,
          textAlign: 'center' as const,
        },
        hideDataPoint: tl.length > 30 || i % dpInterval !== 0 || (clipForecast && point.isForecast),
        dataPointColor: color,
      }));

    const datasets: DSEntry[] = [];

    if (visibleFields.gridPower) {
      datasets.push({
        key: 'grid',
        data: makePoints(p => p.gridPower, CHART_COLORS.grid.line, true),
        color: CHART_COLORS.grid.line,
        thickness: 2,
        areaChart: isArea,
        startFillColor: CHART_COLORS.grid.line,
        endFillColor: CHART_COLORS.grid.line,
        startOpacity: 0.3,
        endOpacity: 0.05,
        lineSegments: clipAtReal(CHART_COLORS.grid.line),
      });
    }

    if (visibleFields.batteryPower) {
      datasets.push({
        key: 'battery',
        data: makePoints(p => p.batteryPower, CHART_COLORS.battery.line, true),
        color: CHART_COLORS.battery.line,
        thickness: 2,
        areaChart: isArea,
        startFillColor: CHART_COLORS.battery.line,
        endFillColor: CHART_COLORS.battery.line,
        startOpacity: 0.3,
        endOpacity: 0.05,
        lineSegments: clipAtReal(CHART_COLORS.battery.line),
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
        lineSegments: hasPvForecast
          ? buildSegments(CHART_COLORS.pv.production)
          : clipAtReal(CHART_COLORS.pv.production),
      });
    }

    if (visibleFields.compensatedPower) {
      datasets.push({
        key: 'load',
        data: makePoints(p => p.factoryLoad, CHART_COLORS.load.line),
        color: CHART_COLORS.load.line,
        thickness: 2,
        lineSegments: hasLoadForecast
          ? buildSegments(CHART_COLORS.load.line)
          : clipAtReal(CHART_COLORS.load.line),
      });
    }

    let soc = null;
    if (visibleFields.soc) {
      const socEnd = lastRealIndex >= 0 ? lastRealIndex + 1 : tl.length;
      soc = tl.slice(0, socEnd).map((point, i) => ({
        value: point.soc,
        hideDataPoint: tl.length > 30 || i % dpInterval !== 0,
        dataPointColor: CHART_COLORS.soc.line,
      }));
    }

    if (__DEV__) {
      console.log(`[Chart] Datasets: [${datasets.map(d => d.key).join(', ')}], lineSegments on pv/load: ${forecastStartIndex >= 0 ? `boundary@${forecastStartIndex}` : 'none'}`);
    }

    const hasSegments = datasets.some(d => d.lineSegments != null);

    return {
      powerDatasets: datasets,
      socData: soc,
      maxPositive: rawMaxPos,
      maxNegative: rawMaxNeg,
      hasLineSegments: hasSegments,
    };
  }, [unifiedTimeline, timeRange, visibleFields, autoSpacing]);

  // ─── Loading / empty states ────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }

  if (unifiedTimeline.length === 0 && powerDatasets.length === 0) {
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

  // ─── Y-axis scaling ────────────────────────────────────────────────
  const ds = powerDatasets;
  const tl = unifiedTimeline;
  const labelInterval = buildLabelInterval(tl.length, autoSpacing);

  const fallbackPrimary = tl.map((point, i) => ({
    value: 0,
    label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
    labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
    hideDataPoint: true,
  }));

  const primaryData = ds[0]?.data || fallbackPrimary;

  const rawRange = maxPositive + Math.abs(maxNegative) || 10;
  const step = niceRound(rawRange / 6) || 1;
  const yAxisMax = Math.max(step, Math.ceil((maxPositive || 1) / step) * step);
  const yAxisNeg = maxNegative < 0 ? -Math.ceil(Math.abs(maxNegative) / step) * step : 0;
  const noOfSections = Math.round(yAxisMax / step);

  const DESIRED_TOTAL = 250;
  const fullRange = yAxisMax + Math.abs(yAxisNeg);
  const chartHeight =
    fullRange > 0 && yAxisNeg < 0
      ? Math.round(DESIRED_TOTAL * yAxisMax / fullRange)
      : DESIRED_TOTAL;

  const secondaryYAxisConfig = socData
    ? {
        noOfSections: 5,
        maxValue: 100,
        yAxisColor: CHART_COLORS.soc.line,
        yAxisTextStyle: { color: CHART_COLORS.soc.line, fontSize: 10 },
        yAxisLabelSuffix: '%',
      }
    : undefined;

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.axisLabelsRow}>
        <Text style={styles.yAxisLabel}>{t.analytics.powerKw}</Text>
        {socData && (
          <Text style={[styles.yAxisLabel, { color: CHART_COLORS.soc.line }]}>SoC %</Text>
        )}
      </View>
      <View style={styles.chartWrapper}>
        <LineChart
          data={primaryData}
          data2={ds[1]?.data}
          data3={ds[2]?.data}
          data4={ds[3]?.data}
          data5={ds[4]?.data}
          secondaryData={socData || undefined}
          secondaryLineConfig={
            socData
              ? {
                  color: CHART_COLORS.soc.line,
                  thickness: 2,
                  curved: true,
                  hideDataPoints: tl.length > 30,
                  dataPointsColor: CHART_COLORS.soc.line,
                  strokeDashArray: [2, 3],
                }
              : undefined
          }
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
          lineSegments={ds[0]?.lineSegments}
          lineSegments2={ds[1]?.lineSegments}
          lineSegments3={ds[2]?.lineSegments}
          lineSegments4={ds[3]?.lineSegments}
          lineSegments5={ds[4]?.lineSegments}
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
          xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints={tl.length > 30}
          showVerticalLines={false}
          isAnimated={!hasLineSegments}
          animationDuration={hasLineSegments ? 0 : 400}
          animateOnDataChange={!hasLineSegments}
          onDataChangeAnimationDuration={hasLineSegments ? 0 : 300}
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
            pointerLabelComponent: (
              _items: any,
              _secondaryDataItem: any,
              pointerIndex: number,
            ) => {
              const idx = typeof pointerIndex === 'number' ? pointerIndex : 0;
              if (idx < 0 || idx >= tl.length) return null;
              const point = tl[idx];
              if (!point) return null;

              return (
                <View style={styles.tooltipCard}>
                  <Text style={styles.tooltipTime}>
                    {formatTimeLabel(point.time, timeRange)}
                  </Text>
                  {point.isForecast && (
                    <Text
                      style={[
                        styles.tooltipValue,
                        { fontStyle: 'italic', color: Colors.textSecondary, marginBottom: 4 },
                      ]}
                    >
                      {t.monitor.forecast || 'Forecast'}
                    </Text>
                  )}
                  {visibleFields.gridPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.grid.line }}>●{' '}</Text>
                      {`${t.analytics.grid}: `}
                      {point.gridPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.batteryPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.battery.line }}>●{' '}</Text>
                      {`${t.analytics.battery}: `}
                      {point.batteryPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.pvPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.pv.production }}>
                        {point.isForecast ? '◌' : '●'}
                        {' '}
                      </Text>
                      {`${t.analytics.pv}: `}
                      {point.pvPower.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.compensatedPower && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.load.line }}>
                        {point.isForecast ? '◌' : '●'}
                        {' '}
                      </Text>
                      {`${t.monitor.load}: `}
                      {point.factoryLoad.toFixed(1)} kW
                    </Text>
                  )}
                  {visibleFields.soc && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.soc.line }}>●{' '}</Text>
                      {`${t.monitor.soc}: `}
                      {point.soc.toFixed(0)}%
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
