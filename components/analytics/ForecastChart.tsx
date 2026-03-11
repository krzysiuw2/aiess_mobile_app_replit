import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Eye, EyeOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { SimulationDataPoint } from '@/types';
import { formatTimeLabel } from '@/lib/analytics';
import type { TranslationKeys } from '@/locales';

type ForecastField = 'pvForecast' | 'loadForecast' | 'irradiance';

interface ForecastChartProps {
  data: SimulationDataPoint[];
  forecastRange: '48h' | '7d';
  visibleFields: Record<ForecastField, boolean>;
  onToggleField: (field: ForecastField) => void;
  loading?: boolean;
  t: TranslationKeys;
}

const Y_AXIS_WIDTH = 50;
const CHART_H_PADDING = 12 * 2;
const PARENT_H_PADDING = 16 * 2;
const INITIAL_SPACING = 10;
const END_SPACING_IRR = 40;
const END_SPACING_DEFAULT = 10;

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

function getSlotConfig(forecastRange: '48h' | '7d') {
  return forecastRange === '48h'
    ? { intervalMs: 3_600_000, slotCount: 48 }
    : { intervalMs: 3_600_000 * 3, slotCount: 56 };
}

const FIELD_CONFIG: Record<ForecastField, { color: string; label: (t: TranslationKeys) => string }> = {
  pvForecast: { color: CHART_COLORS.forecast.pv, label: t => t.analytics.forecastTab.pvForecast },
  loadForecast: { color: CHART_COLORS.forecast.load, label: t => t.analytics.forecastTab.loadForecast },
  irradiance: { color: CHART_COLORS.forecast.irradiance, label: t => t.analytics.forecastTab.irradiance },
};

export function ForecastChart({
  data,
  forecastRange,
  visibleFields,
  onToggleField,
  loading = false,
  t,
}: ForecastChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const ft = t.analytics.forecastTab;

  const hasIrradiance = visibleFields.irradiance;
  const endSpacing = hasIrradiance ? END_SPACING_IRR : END_SPACING_DEFAULT;
  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - endSpacing;

  const timeRange = forecastRange === '48h' ? '24h' : '7d';

  const { slots, maxPower, maxGti } = useMemo(() => {
    const { intervalMs, slotCount } = getSlotConfig(forecastRange);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const periodStartMs = now.getTime();

    const buckets = new Map<number, { pv: number[]; load: number[]; gti: number[] }>();

    for (const p of data) {
      const ts = p.time?.getTime?.();
      if (!ts || isNaN(ts) || p.source !== 'forecast') continue;
      const idx = Math.floor((ts - periodStartMs) / intervalMs);
      if (idx < 0 || idx >= slotCount) continue;
      if (!buckets.has(idx)) buckets.set(idx, { pv: [], load: [], gti: [] });
      const b = buckets.get(idx)!;
      b.pv.push(p.pvForecast || 0);
      b.load.push(p.loadForecast || 0);
      b.gti.push(p.weatherGti || 0);
    }

    let mxP = 10;
    let mxG = 100;
    const result: { time: Date; pv: number; load: number; gti: number }[] = [];

    for (let i = 0; i < slotCount; i++) {
      const slotTime = new Date(periodStartMs + i * intervalMs);
      const b = buckets.get(i);
      const pv = b ? avg(b.pv) : 0;
      const load = b ? avg(b.load) : 0;
      const gti = b ? avg(b.gti) : 0;
      if (pv > mxP) mxP = pv;
      if (load > mxP) mxP = load;
      if (gti > mxG) mxG = gti;
      result.push({ time: slotTime, pv, load, gti });
    }

    return { slots: result, maxPower: mxP, maxGti: mxG };
  }, [data, forecastRange]);

  const pointCount = slots.length;
  const autoSpacing = pointCount > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (pointCount - 1))
    : chartWidth;

  const labelInterval = Math.max(1, Math.floor(pointCount / 6));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t.analytics.loadingChart}</Text>
      </View>
    );
  }

  if (slots.length === 0 || slots.every(s => s.pv === 0 && s.load === 0)) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{ft.noForecastData}</Text>
      </View>
    );
  }

  const rawRange = maxPower || 10;
  const step = niceRound(rawRange / 5) || 1;
  const yAxisMax = Math.max(step, Math.ceil(maxPower / step) * step);
  const noOfSections = Math.round(yAxisMax / step);

  const makePoints = (getValue: (s: typeof slots[0]) => number, color: string) =>
    slots.map((s, i) => ({
      value: getValue(s),
      label: i % labelInterval === 0 ? formatTimeLabel(s.time, timeRange) : '',
      labelTextStyle: { color: Colors.textSecondary, fontSize: 9, width: 48, textAlign: 'center' as const },
      hideDataPoint: pointCount > 30 || i % Math.max(1, Math.floor(pointCount / 12)) !== 0,
      dataPointColor: color,
    }));

  const pvData = visibleFields.pvForecast ? makePoints(s => s.pv, CHART_COLORS.forecast.pv) : null;
  const loadData = visibleFields.loadForecast ? makePoints(s => s.load, CHART_COLORS.forecast.load) : null;

  const primaryData = pvData || loadData || makePoints(() => 0, 'transparent');
  const secondaryPowerData = pvData && loadData ? loadData : null;

  const gtiData = visibleFields.irradiance
    ? slots.map(s => ({
        value: s.gti,
        hideDataPoint: true,
      }))
    : null;

  const secondaryYAxisConfig = gtiData
    ? {
        noOfSections: 5,
        maxValue: Math.ceil(maxGti / 200) * 200,
        yAxisColor: CHART_COLORS.forecast.irradiance,
        yAxisTextStyle: { color: CHART_COLORS.forecast.irradiance, fontSize: 10 },
        yAxisLabelSuffix: '',
      }
    : undefined;

  return (
    <View style={styles.container}>
      {/* Field toggles */}
      <View style={styles.fieldToggles}>
        {(Object.keys(FIELD_CONFIG) as ForecastField[]).map(key => {
          const cfg = FIELD_CONFIG[key];
          const active = visibleFields[key];
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.fieldToggle,
                active && { borderColor: cfg.color, backgroundColor: cfg.color + '20' },
              ]}
              onPress={() => onToggleField(key)}
            >
              <View style={[styles.fieldDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.fieldToggleText, active && { color: cfg.color }]}>
                {cfg.label(t)}
              </Text>
              {active ? (
                <Eye size={14} color={cfg.color} />
              ) : (
                <EyeOff size={14} color={Colors.textLight} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.axisLabelsRow}>
        <Text style={styles.yAxisLabel}>{t.analytics.powerKw}</Text>
        {gtiData && (
          <Text style={[styles.yAxisLabel, { color: CHART_COLORS.forecast.irradiance }]}>
            {ft.irradianceUnit}
          </Text>
        )}
      </View>
      <View style={styles.chartWrapper}>
        <LineChart
          data={primaryData}
          data2={secondaryPowerData || undefined}
          secondaryData={gtiData || undefined}
          secondaryLineConfig={
            gtiData
              ? {
                  color: CHART_COLORS.forecast.irradiance,
                  thickness: 1,
                  curved: true,
                  hideDataPoints: true,
                  startFillColor: CHART_COLORS.forecast.irradianceArea,
                  endFillColor: CHART_COLORS.forecast.irradianceArea,
                  startOpacity: 0.5,
                  endOpacity: 0.1,
                  areaChart: true,
                }
              : undefined
          }
          secondaryYAxis={secondaryYAxisConfig}
          maxValue={yAxisMax}
          noOfSections={noOfSections}
          stepValue={step}
          width={chartWidth}
          height={250}
          spacing={autoSpacing}
          initialSpacing={INITIAL_SPACING}
          endSpacing={endSpacing}
          disableScroll
          color1={pvData ? CHART_COLORS.forecast.pv : CHART_COLORS.forecast.load}
          color2={secondaryPowerData ? CHART_COLORS.forecast.load : undefined}
          thickness1={2}
          thickness2={2}
          areaChart1={true}
          startFillColor1={pvData ? CHART_COLORS.forecast.pv : CHART_COLORS.forecast.load}
          endFillColor1={pvData ? CHART_COLORS.forecast.pv : CHART_COLORS.forecast.load}
          startOpacity1={0.2}
          endOpacity1={0.02}
          curved
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          yAxisThickness={1}
          xAxisThickness={1}
          hideDataPoints={pointCount > 30}
          showVerticalLines={false}
          isAnimated
          animationDuration={400}
          rotateLabel={forecastRange === '7d'}
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
              if (idx < 0 || idx >= slots.length) return null;
              const s = slots[idx];

              return (
                <View style={styles.tooltipCard}>
                  <Text style={styles.tooltipTime}>
                    {formatTimeLabel(s.time, timeRange)}
                  </Text>
                  {visibleFields.pvForecast && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.forecast.pv }}>● </Text>
                      {`${ft.pvForecast}: ${s.pv.toFixed(1)} kW`}
                    </Text>
                  )}
                  {visibleFields.loadForecast && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.forecast.load }}>● </Text>
                      {`${ft.loadForecast}: ${s.load.toFixed(1)} kW`}
                    </Text>
                  )}
                  {visibleFields.irradiance && (
                    <Text style={styles.tooltipValue}>
                      <Text style={{ color: CHART_COLORS.forecast.irradiance }}>● </Text>
                      {`GTI: ${s.gti.toFixed(0)} W/m²`}
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

const avg = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  fieldToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  fieldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  fieldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fieldToggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
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
    height: 200,
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
