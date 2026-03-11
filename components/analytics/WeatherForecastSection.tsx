import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { SimulationDataPoint } from '@/types';
import { getWeatherIcon } from '@/lib/weather-codes';
import { formatTimeLabel } from '@/lib/analytics';
import type { TranslationKeys } from '@/locales';

interface WeatherForecastSectionProps {
  data: SimulationDataPoint[];
  forecastRange: '48h' | '7d';
  t: TranslationKeys;
}

const Y_AXIS_WIDTH = 40;
const CHART_H_PADDING = 12 * 2;
const PARENT_H_PADDING = 16 * 2;
const MINI_CHART_HEIGHT = 120;

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

interface HourSlot {
  time: Date;
  temp: number;
  cloudCover: number;
  windSpeed: number;
  weatherCode: number;
}

export function WeatherForecastSection({ data, forecastRange, t }: WeatherForecastSectionProps) {
  const { width: screenWidth } = useWindowDimensions();
  const ft = t.analytics.forecastTab;
  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - 10;

  const slots = useMemo((): HourSlot[] => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const startMs = now.getTime();
    const hours = forecastRange === '48h' ? 48 : 168;
    const intervalMs = forecastRange === '48h' ? 3_600_000 : 3_600_000 * 3;
    const slotCount = forecastRange === '48h' ? 48 : 56;

    const buckets = new Map<number, SimulationDataPoint[]>();
    for (const p of data) {
      const ts = p.time?.getTime?.();
      if (!ts || isNaN(ts) || p.source !== 'forecast') continue;
      const idx = Math.floor((ts - startMs) / intervalMs);
      if (idx < 0 || idx >= slotCount) continue;
      if (!buckets.has(idx)) buckets.set(idx, []);
      buckets.get(idx)!.push(p);
    }

    const result: HourSlot[] = [];
    for (let i = 0; i < slotCount; i++) {
      const time = new Date(startMs + i * intervalMs);
      const pts = buckets.get(i);
      if (pts && pts.length > 0) {
        const avg = (fn: (p: SimulationDataPoint) => number) =>
          pts.reduce((s, p) => s + fn(p), 0) / pts.length;
        const modeFn = (fn: (p: SimulationDataPoint) => number) => {
          const freq = new Map<number, number>();
          for (const p of pts) {
            const v = fn(p);
            freq.set(v, (freq.get(v) || 0) + 1);
          }
          let best = 0, bestCount = 0;
          for (const [v, c] of freq) { if (c > bestCount) { best = v; bestCount = c; } }
          return best;
        };
        result.push({
          time,
          temp: avg(p => p.weatherTemp),
          cloudCover: avg(p => p.weatherCloudCover),
          windSpeed: avg(p => p.weatherWindSpeed),
          weatherCode: modeFn(p => p.weatherCode),
        });
      } else {
        result.push({ time, temp: 0, cloudCover: 0, windSpeed: 0, weatherCode: 0 });
      }
    }
    return result;
  }, [data, forecastRange]);

  if (slots.length === 0 || slots.every(s => s.temp === 0 && s.cloudCover === 0)) {
    return null;
  }

  // Hourly strip: show subset for 48h, every 3h for 7d
  const stripInterval = forecastRange === '48h' ? 2 : 1;
  const stripSlots = slots.filter((_, i) => i % stripInterval === 0).slice(0, 24);

  const timeRange = forecastRange === '48h' ? '24h' : '7d';
  const pointCount = slots.length;
  const autoSpacing = pointCount > 1
    ? Math.max(1, (chartWidth - 10) / (pointCount - 1))
    : chartWidth;
  const labelInterval = Math.max(1, Math.floor(pointCount / 6));

  const makePoints = (getValue: (s: HourSlot) => number) =>
    slots.map((s, i) => ({
      value: getValue(s),
      label: i % labelInterval === 0 ? formatTimeLabel(s.time, timeRange) : '',
      labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
      hideDataPoint: true,
    }));

  const tempData = makePoints(s => s.temp);
  const cloudData = makePoints(s => s.cloudCover);
  const windData = makePoints(s => s.windSpeed);

  const tempMax = Math.max(...slots.map(s => s.temp), 5);
  const tempMin = Math.min(...slots.map(s => s.temp), 0);
  const windMax = Math.max(...slots.map(s => s.windSpeed), 2);

  const tempStep = niceRound((tempMax - tempMin) / 4) || 5;
  const tempYMax = Math.ceil(tempMax / tempStep) * tempStep;
  const tempYMin = Math.floor(tempMin / tempStep) * tempStep;

  const windStep = niceRound(windMax / 4) || 2;
  const windYMax = Math.max(windStep, Math.ceil(windMax / windStep) * windStep);

  return (
    <View style={styles.container}>
      {/* Hourly weather strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContainer}
      >
        {stripSlots.map((s, i) => {
          const hour = s.time.getHours();
          const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
          return (
            <View key={i} style={styles.stripItem}>
              <Text style={styles.stripHour}>{hourLabel}</Text>
              <Text style={styles.stripIcon}>{getWeatherIcon(s.weatherCode)}</Text>
              <Text style={styles.stripTemp}>{`${s.temp.toFixed(0)}°`}</Text>
              <View style={styles.stripCloudBar}>
                <View style={[styles.stripCloudFill, { height: `${s.cloudCover}%` }]} />
              </View>
              <Text style={styles.stripCloudText}>{`${s.cloudCover.toFixed(0)}%`}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Temperature chart */}
      <Text style={styles.miniChartTitle}>{ft.temperature} (°C)</Text>
      <View style={styles.miniChartWrapper}>
        <LineChart
          data={tempData}
          maxValue={tempYMax}
          mostNegativeValue={tempYMin < 0 ? tempYMin : undefined}
          noOfSections={4}
          width={chartWidth}
          height={MINI_CHART_HEIGHT}
          spacing={autoSpacing}
          initialSpacing={10}
          endSpacing={10}
          disableScroll
          color={CHART_COLORS.weather.temp}
          thickness={2}
          curved
          areaChart
          startFillColor={CHART_COLORS.weather.temp}
          endFillColor={CHART_COLORS.weather.temp}
          startOpacity={0.25}
          endOpacity={0.02}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints
          showVerticalLines={false}
          isAnimated
          animationDuration={300}
          rotateLabel={forecastRange === '7d'}
        />
      </View>

      {/* Cloud cover chart */}
      <Text style={styles.miniChartTitle}>{ft.cloudCover} (%)</Text>
      <View style={styles.miniChartWrapper}>
        <LineChart
          data={cloudData}
          maxValue={100}
          noOfSections={4}
          width={chartWidth}
          height={MINI_CHART_HEIGHT}
          spacing={autoSpacing}
          initialSpacing={10}
          endSpacing={10}
          disableScroll
          color={CHART_COLORS.weather.cloud}
          thickness={2}
          curved
          areaChart
          startFillColor={CHART_COLORS.weather.cloud}
          endFillColor={CHART_COLORS.weather.cloud}
          startOpacity={0.3}
          endOpacity={0.05}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints
          showVerticalLines={false}
          isAnimated
          animationDuration={300}
          rotateLabel={forecastRange === '7d'}
        />
      </View>

      {/* Wind speed chart */}
      <Text style={styles.miniChartTitle}>{ft.windSpeed} (m/s)</Text>
      <View style={styles.miniChartWrapper}>
        <LineChart
          data={windData}
          maxValue={windYMax}
          noOfSections={4}
          stepValue={windStep}
          width={chartWidth}
          height={MINI_CHART_HEIGHT}
          spacing={autoSpacing}
          initialSpacing={10}
          endSpacing={10}
          disableScroll
          color={CHART_COLORS.weather.wind}
          thickness={2}
          curved
          areaChart
          startFillColor={CHART_COLORS.weather.wind}
          endFillColor={CHART_COLORS.weather.wind}
          startOpacity={0.25}
          endOpacity={0.02}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints
          showVerticalLines={false}
          isAnimated
          animationDuration={300}
          rotateLabel={forecastRange === '7d'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  stripContainer: {
    gap: 2,
    paddingVertical: 4,
    marginBottom: 16,
  },
  stripItem: {
    width: 54,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stripHour: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  stripIcon: {
    fontSize: 18,
    marginVertical: 2,
  },
  stripTemp: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginVertical: 2,
  },
  stripCloudBar: {
    width: 18,
    height: 20,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginVertical: 2,
  },
  stripCloudFill: {
    width: '100%',
    backgroundColor: CHART_COLORS.weather.cloud,
    borderRadius: 2,
  },
  stripCloudText: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  miniChartTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  miniChartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
});
