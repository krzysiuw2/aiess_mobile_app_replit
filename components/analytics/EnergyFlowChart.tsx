import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS, FieldKey } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { SimulationDataPoint } from '@/types';
import { formatTimeLabel } from '@/lib/analytics';
import { GrafanaLineChart, ChartSeries } from './GrafanaLineChart';

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

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Calendar-aligned period [start, stop) plus the chart sampling interval.
 * The slot interval is intentionally fine (close to the InfluxDB fetch
 * resolution) so lines render with enough points to look smooth instead of
 * angular. slotCount is derived from the exact span so it never overshoots
 * the period (avoids stray trailing slots on short months / leap years).
 */
function getRange(selectedDate: Date, timeRange: string): {
  periodStartMs: number;
  intervalMs: number;
  slotCount: number;
} {
  const start = new Date(selectedDate);
  const stop = new Date(selectedDate);
  let intervalMs: number;

  switch (timeRange) {
    case '24h':
      start.setHours(0, 0, 0, 0);
      stop.setHours(0, 0, 0, 0);
      stop.setDate(stop.getDate() + 1);
      intervalMs = 5 * MIN;           // fetch is 2m; 5m slots (288/day) keep the line dense
      break;
    case '7d':
      start.setHours(0, 0, 0, 0);
      stop.setHours(0, 0, 0, 0);
      stop.setDate(stop.getDate() + 7);
      intervalMs = 1 * HOUR;          // matches 7d fetch window
      break;
    case '30d':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      stop.setDate(1);
      stop.setHours(0, 0, 0, 0);
      stop.setMonth(stop.getMonth() + 1);
      intervalMs = 6 * HOUR;          // matches 30d fetch window
      break;
    case '365d':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      stop.setMonth(0, 1);
      stop.setHours(0, 0, 0, 0);
      stop.setFullYear(stop.getFullYear() + 1);
      intervalMs = 24 * HOUR;         // matches 365d fetch window
      break;
    default:
      start.setHours(0, 0, 0, 0);
      stop.setHours(0, 0, 0, 0);
      stop.setDate(stop.getDate() + 1);
      intervalMs = 5 * MIN;
  }

  const slotCount = Math.max(1, Math.round((stop.getTime() - start.getTime()) / intervalMs));
  return { periodStartMs: start.getTime(), intervalMs, slotCount };
}

const avg = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const PARENT_H_PADDING = 16 * 2; // analytics screen horizontal padding
const CARD_H_PADDING = 12 * 2;   // chartWrapper horizontal padding
const CHART_HEIGHT = 260;

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

  const chartWidth = Math.max(240, screenWidth - PARENT_H_PADDING - CARD_H_PADDING);

  // ─── Unified timeline: downsample telemetry + merge forecast ───────
  const unifiedTimeline = useMemo((): TimelinePoint[] => {
    const { periodStartMs, intervalMs, slotCount } = getRange(selectedDate, timeRange);

    const telemetryBySlot = new Map<
      number,
      { grid: number[]; battery: number[]; pv: number[]; load: number[]; soc: number[] }
    >();

    for (const point of data) {
      const ts = point.time?.getTime?.();
      if (!ts || isNaN(ts)) continue;
      const slotIdx = Math.floor((ts - periodStartMs) / intervalMs);
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

    // Sorted simulation series for linear interpolation. The forecast feed is
    // hourly, so we interpolate it across the finer chart slots to keep the
    // forecast tail smooth rather than stepped/zeroed.
    const simTimes: number[] = [];
    const simPv: number[] = [];
    const simLoad: number[] = [];
    if (simulationData) {
      for (const s of simulationData) {
        const st = s.time?.getTime?.();
        if (!st || isNaN(st)) continue;
        simTimes.push(st);
        simPv.push(s.pvForecast || s.pvEstimated || 0);
        simLoad.push(s.loadForecast || 0);
      }
    }
    const sampleSim = (vals: number[], tMs: number): number => {
      const n = simTimes.length;
      if (n === 0) return 0;
      if (tMs <= simTimes[0]) return vals[0];
      if (tMs >= simTimes[n - 1]) return vals[n - 1];
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (simTimes[mid] <= tMs) lo = mid;
        else hi = mid;
      }
      const f = (tMs - simTimes[lo]) / ((simTimes[hi] - simTimes[lo]) || 1);
      return vals[lo] + (vals[hi] - vals[lo]) * f;
    };

    // Last slot that actually has telemetry — everything after it is forecast.
    let lastTelSlot = -1;
    for (const k of telemetryBySlot.keys()) if (k > lastTelSlot) lastTelSlot = k;

    let lastKnownSoc = 0;
    let lastReal: TimelinePoint | null = null;
    const timeline: TimelinePoint[] = [];

    for (let i = 0; i < slotCount; i++) {
      const slotMs = periodStartMs + i * intervalMs;
      const slotTime = new Date(slotMs);
      const tel = telemetryBySlot.get(i);

      if (tel && tel.grid.length > 0) {
        const socVal = avg(tel.soc);
        lastKnownSoc = socVal;
        const p: TimelinePoint = {
          time: slotTime,
          gridPower: avg(tel.grid),
          batteryPower: avg(tel.battery),
          pvPower: avg(tel.pv),
          factoryLoad: avg(tel.load),
          soc: socVal,
          isForecast: false,
        };
        lastReal = p;
        timeline.push(p);
      } else if (i <= lastTelSlot && lastReal) {
        // Small gap inside the real region: carry the last value forward so the
        // line stays continuous (no false spikes or breaks).
        timeline.push({
          time: slotTime,
          gridPower: lastReal.gridPower,
          batteryPower: lastReal.batteryPower,
          pvPower: lastReal.pvPower,
          factoryLoad: lastReal.factoryLoad,
          soc: lastReal.soc,
          isForecast: false,
        });
      } else {
        // Forecast / no-data region: interpolate the simulation feed.
        timeline.push({
          time: slotTime,
          gridPower: 0,
          batteryPower: 0,
          pvPower: sampleSim(simPv, slotMs),
          factoryLoad: sampleSim(simLoad, slotMs),
          soc: lastKnownSoc,
          isForecast: true,
        });
      }
    }

    return timeline;
  }, [data, simulationData, selectedDate, timeRange]);

  // ─── Build per-series value arrays (nulls for gaps / forecast) ─────
  const series = useMemo((): ChartSeries[] => {
    const tl = unifiedTimeline;
    if (tl.length === 0) return [];

    let lastRealIndex = -1;
    for (let i = 0; i < tl.length; i++) if (!tl[i].isForecast) lastRealIndex = i;
    const hasForecast = lastRealIndex >= 0 && lastRealIndex < tl.length - 1;

    const real = (get: (p: TimelinePoint) => number): (number | null)[] =>
      tl.map((p) => (p.isForecast ? null : get(p)));
    // Forecast tail shares the boundary (last real) point so the dash connects.
    const forecastTail = (get: (p: TimelinePoint) => number): (number | null)[] =>
      tl.map((p, i) => (hasForecast && i >= lastRealIndex ? get(p) : null));

    const out: ChartSeries[] = [];

    if (visibleFields.gridPower) {
      out.push({ key: 'grid', color: CHART_COLORS.grid.line, values: real((p) => p.gridPower) });
    }
    if (visibleFields.batteryPower) {
      out.push({ key: 'battery', color: CHART_COLORS.battery.line, values: real((p) => p.batteryPower) });
    }
    if (visibleFields.pvPower) {
      out.push({ key: 'pv', color: CHART_COLORS.pv.production, values: real((p) => p.pvPower) });
      if (hasForecast) {
        out.push({
          key: 'pv-fc',
          color: CHART_COLORS.pv.production,
          values: forecastTail((p) => p.pvPower),
          dash: [4, 5],
          thickness: 1.2,
        });
      }
    }
    if (visibleFields.compensatedPower) {
      out.push({ key: 'load', color: CHART_COLORS.load.line, values: real((p) => p.factoryLoad) });
      if (hasForecast) {
        out.push({
          key: 'load-fc',
          color: CHART_COLORS.load.line,
          values: forecastTail((p) => p.factoryLoad),
          dash: [4, 5],
          thickness: 1.2,
        });
      }
    }
    if (visibleFields.soc) {
      out.push({
        key: 'soc',
        color: CHART_COLORS.soc.line,
        values: real((p) => p.soc),
        dash: [2, 3],
        axis: 'pct',
      });
    }

    return out;
  }, [unifiedTimeline, visibleFields]);

  // ─── Loading / empty states ────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }

  if (unifiedTimeline.length === 0 || series.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
        <Text style={styles.emptySubtext}>{t.analytics.tryDifferentRange}</Text>
      </View>
    );
  }

  // ─── Tooltip body (rendered by GrafanaLineChart inside its card) ────
  const renderTooltip = (idx: number) => {
    const point = unifiedTimeline[idx];
    if (!point) return null;
    return (
      <>
        <Text style={styles.tipTime}>{formatTimeLabel(point.time, timeRange)}</Text>
        {point.isForecast && (
          <Text style={styles.tipForecast}>{t.monitor.forecast || 'Forecast'}</Text>
        )}
        {visibleFields.gridPower && (
          <TipRow color={CHART_COLORS.grid.line} label={t.analytics.grid} value={`${point.gridPower.toFixed(1)} kW`} />
        )}
        {visibleFields.batteryPower && (
          <TipRow color={CHART_COLORS.battery.line} label={t.analytics.battery} value={`${point.batteryPower.toFixed(1)} kW`} />
        )}
        {visibleFields.pvPower && (
          <TipRow color={CHART_COLORS.pv.production} label={t.analytics.pv} value={`${point.pvPower.toFixed(1)} kW`} dim={point.isForecast} />
        )}
        {visibleFields.compensatedPower && (
          <TipRow color={CHART_COLORS.load.line} label={t.monitor.load} value={`${point.factoryLoad.toFixed(1)} kW`} dim={point.isForecast} />
        )}
        {visibleFields.soc && !point.isForecast && (
          <TipRow color={CHART_COLORS.soc.line} label={t.monitor.soc} value={`${point.soc.toFixed(0)}%`} />
        )}
      </>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.axisLabelsRow}>
        <Text style={styles.yAxisLabel}>{t.analytics.powerKw}</Text>
        {visibleFields.soc && (
          <Text style={[styles.yAxisLabel, { color: CHART_COLORS.soc.line }]}>SoC %</Text>
        )}
      </View>
      <View style={styles.chartWrapper}>
        <GrafanaLineChart
          width={chartWidth}
          height={CHART_HEIGHT}
          pointCount={unifiedTimeline.length}
          series={series}
          formatXLabel={(i) => formatTimeLabel(unifiedTimeline[i]?.time, timeRange)}
          showSocAxis={visibleFields.soc}
          renderTooltip={renderTooltip}
        />
      </View>
    </View>
  );
}

function TipRow({
  color,
  label,
  value,
  dim = false,
}: {
  color: string;
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipDot, { backgroundColor: color }]} />
      <Text style={[styles.tipLabel, dim && styles.tipDim]} numberOfLines={1}>
        {label}
        {dim ? ' (fc)' : ''}
      </Text>
      <Text style={[styles.tipValue, dim && styles.tipDim]}>{value}</Text>
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
  tipTime: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 5,
  },
  tipForecast: {
    fontSize: 10,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1.5,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  tipLabel: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  tipValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  tipDim: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
});
