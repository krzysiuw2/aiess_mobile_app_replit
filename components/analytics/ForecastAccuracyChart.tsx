import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { TrendingUp, Target } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { ChartDataPoint, fetchChartData, calculateFactoryLoad } from '@/lib/influxdb';
import { SimulationDataPoint } from '@/types';
import { formatTimeLabel } from '@/lib/analytics';
import { KPICard } from './KPICard';
import type { TranslationKeys } from '@/locales';

interface ForecastAccuracyChartProps {
  simData: SimulationDataPoint[];
  deviceId: string | undefined;
  t: TranslationKeys;
}

const Y_AXIS_WIDTH = 50;
const CHART_H_PADDING = 12 * 2;
const PARENT_H_PADDING = 16 * 2;
const INITIAL_SPACING = 10;
const END_SPACING = 10;

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

function computeMAPE(actual: number[], forecast: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] > 1) {
      sum += Math.abs((actual[i] - forecast[i]) / actual[i]);
      count++;
    }
  }
  return count > 0 ? (sum / count) * 100 : 0;
}

export function ForecastAccuracyChart({ simData, deviceId, t }: ForecastAccuracyChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const ft = t.analytics.forecastTab;
  const [yesterdayActual, setYesterdayActual] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - END_SPACING;

  useEffect(() => {
    if (!deviceId) {
      setLoading(false);
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    fetchChartData(deviceId, '24h', yesterday)
      .then(data => setYesterdayActual(data))
      .catch(() => setYesterdayActual([]))
      .finally(() => setLoading(false));
  }, [deviceId]);

  const { slots, pvMAPE, loadMAPE, maxVal, hasMeteredPv } = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const todayStart = new Date(yesterday);
    todayStart.setDate(todayStart.getDate() + 1);

    const yesterdayStartMs = yesterday.getTime();
    const todayStartMs = todayStart.getTime();
    const intervalMs = 3_600_000;

    // Build sim data maps: pvEstimated (unmonitored) and forecast per hour
    const simByHour = new Map<number, { pvEstimated: number; pvForecast: number; loadForecast: number }>();
    for (const p of simData) {
      const ts = p.time?.getTime?.();
      if (!ts || ts < yesterdayStartMs || ts >= todayStartMs) continue;
      const idx = Math.floor((ts - yesterdayStartMs) / intervalMs);
      if (idx < 0 || idx >= 24) continue;
      if (!simByHour.has(idx)) {
        simByHour.set(idx, {
          pvEstimated: p.pvEstimated || 0,
          pvForecast: p.pvForecast || 0,
          loadForecast: p.loadForecast || 0,
        });
      }
    }

    // Check if any metered PV exists (pvForecast > pvEstimated means some arrays are monitored)
    let siteHasMeteredPv = false;
    for (const s of simByHour.values()) {
      if (s.pvForecast > s.pvEstimated + 0.1) { siteHasMeteredPv = true; break; }
    }

    // Build actual data: augment PV with pvEstimated for correct load calculation
    const actualByHour = new Map<number, { meteredPv: number[]; load: number[] }>();
    for (const p of yesterdayActual) {
      const ts = p.time?.getTime?.();
      if (!ts || ts < yesterdayStartMs || ts >= todayStartMs) continue;
      const idx = Math.floor((ts - yesterdayStartMs) / intervalMs);
      if (idx < 0 || idx >= 24) continue;
      if (!actualByHour.has(idx)) actualByHour.set(idx, { meteredPv: [], load: [] });
      const b = actualByHour.get(idx)!;
      const meteredPv = p.pvPower || 0;
      b.meteredPv.push(meteredPv);
      // Augment PV with pvEstimated for correct total load
      const pvEst = simByHour.get(idx)?.pvEstimated || 0;
      const totalPv = meteredPv + pvEst;
      b.load.push(calculateFactoryLoad(p.gridPower, totalPv, p.batteryPower));
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    let mx = 10;
    const pvActArr: number[] = [];
    const pvFcArr: number[] = [];
    const loadActArr: number[] = [];
    const loadFcArr: number[] = [];
    const result: { time: Date; pvActual: number; pvFc: number; loadActual: number; loadFc: number }[] = [];

    for (let i = 0; i < 24; i++) {
      const time = new Date(yesterdayStartMs + i * intervalMs);
      const a = actualByHour.get(i);
      const s = simByHour.get(i);

      // PV: compare metered actual vs monitored-portion forecast (pvForecast - pvEstimated)
      const pvA = a ? avg(a.meteredPv) : 0;
      const pvF = s ? Math.max(0, s.pvForecast - s.pvEstimated) : 0;
      // Load: augmented actual vs forecast (both account for full PV)
      const loadA = a ? avg(a.load) : 0;
      const loadF = s ? s.loadForecast : 0;

      pvActArr.push(pvA);
      pvFcArr.push(pvF);
      loadActArr.push(loadA);
      loadFcArr.push(loadF);

      const vals = [pvA, pvF, loadA, loadF];
      for (const v of vals) if (v > mx) mx = v;

      result.push({ time, pvActual: pvA, pvFc: pvF, loadActual: loadA, loadFc: loadF });
    }

    return {
      slots: result,
      pvMAPE: computeMAPE(pvActArr, pvFcArr),
      loadMAPE: computeMAPE(loadActArr, loadFcArr),
      maxVal: mx,
      hasMeteredPv: siteHasMeteredPv,
    };
  }, [yesterdayActual, simData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const hasData = yesterdayActual.length > 0 && slots.some(s => s.pvActual > 0 || s.loadActual > 0);

  if (!hasData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{ft.noForecastData}</Text>
      </View>
    );
  }

  const labelInterval = 4;
  const autoSpacing = slots.length > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (slots.length - 1))
    : chartWidth;

  const rawRange = maxVal || 10;
  const step = niceRound(rawRange / 5) || 1;
  const yAxisMax = Math.max(step, Math.ceil(maxVal / step) * step);
  const noOfSections = Math.round(yAxisMax / step);

  const makePoints = (getValue: (s: typeof slots[0]) => number, color: string) =>
    slots.map((s, i) => ({
      value: getValue(s),
      label: i % labelInterval === 0 ? formatTimeLabel(s.time, '24h') : '',
      labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
      hideDataPoint: true,
      dataPointColor: color,
    }));

  const loadActualData = makePoints(s => s.loadActual, CHART_COLORS.forecast.load);
  const loadFcData = makePoints(s => s.loadFc, CHART_COLORS.forecast.load);
  const pvActualData = hasMeteredPv ? makePoints(s => s.pvActual, CHART_COLORS.forecast.pv) : null;
  const pvFcData = hasMeteredPv ? makePoints(s => s.pvFc, CHART_COLORS.forecast.pv) : null;

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legendRow}>
        {hasMeteredPv && (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: CHART_COLORS.forecast.pv }]} />
              <Text style={styles.legendText}>{`PV ${ft.actual}`}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLineDashed, { borderColor: CHART_COLORS.forecast.pv }]} />
              <Text style={styles.legendText}>{`PV ${ft.forecast}`}</Text>
            </View>
          </>
        )}
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: CHART_COLORS.forecast.load }]} />
          <Text style={styles.legendText}>{`Load ${ft.actual}`}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLineDashed, { borderColor: CHART_COLORS.forecast.load }]} />
          <Text style={styles.legendText}>{`Load ${ft.forecast}`}</Text>
        </View>
      </View>

      <View style={styles.chartWrapper}>
        <LineChart
          data={pvActualData || loadActualData}
          data2={pvFcData || loadFcData}
          data3={pvActualData ? loadActualData : undefined}
          data4={pvActualData ? loadFcData : undefined}
          maxValue={yAxisMax}
          noOfSections={noOfSections}
          stepValue={step}
          width={chartWidth}
          height={200}
          spacing={autoSpacing}
          initialSpacing={INITIAL_SPACING}
          endSpacing={END_SPACING}
          disableScroll
          color1={pvActualData ? CHART_COLORS.forecast.pv : CHART_COLORS.forecast.load}
          color2={pvActualData ? CHART_COLORS.forecast.pv : CHART_COLORS.forecast.load}
          color3={pvActualData ? CHART_COLORS.forecast.load : undefined}
          color4={pvActualData ? CHART_COLORS.forecast.load : undefined}
          thickness1={2}
          thickness2={1.5}
          thickness3={2}
          thickness4={1.5}
          strokeDashArray2={[6, 4]}
          strokeDashArray4={[6, 4]}
          curved
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints
          showVerticalLines={false}
          isAnimated
          animationDuration={400}
        />
      </View>

      {/* MAPE KPIs */}
      <View style={styles.kpiRow}>
        <KPICard
          title={ft.pvMape}
          value={hasMeteredPv ? `${pvMAPE.toFixed(1)}%` : 'N/A'}
          subtitle={hasMeteredPv ? undefined : ft.noMeteredPv}
          icon={Target}
          color={CHART_COLORS.forecast.pv}
        />
        <KPICard
          title={ft.loadMape}
          value={`${loadMAPE.toFixed(1)}%`}
          icon={TrendingUp}
          color={CHART_COLORS.forecast.load}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendLineDashed: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  loadingContainer: {
    height: 200,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    height: 140,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
