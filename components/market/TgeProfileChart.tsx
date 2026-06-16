import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { summarize, PRICE_CHEAP, PRICE_EXPENSIVE } from '@/lib/tge-analytics';
import { warsawNowAsZ, warsawTimeLabel, warsawIntervalLabel } from '@/lib/tge-time';

interface TgeProfileChartProps {
  points: TgePricePoint[];
  resolution: '15m' | '1h';
  isToday: boolean;
  t: TranslationKeys;
  loading?: boolean;
}

export default function TgeProfileChart({ points, resolution, isToday, t, loading }: TgeProfileChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const m = t.marketData;
  const summary = useMemo(() => summarize(points), [points]);
  const stepMin = resolution === '15m' ? 15 : 60;

  const { chartData, yMax, yMin, sectionsBelow } = useMemo(() => {
    if (!points.length) {
      return { chartData: [], yMax: 100, yMin: 0, sectionsBelow: 0 };
    }

    const now = warsawNowAsZ();
    let currentIdx = -1;
    let best = Infinity;
    if (isToday) {
      points.forEach((p, i) => {
        const diff = Math.abs(p.time.getTime() - now.getTime());
        if (diff < best) {
          best = diff;
          currentIdx = i;
        }
      });
    }

    // Label every 3h (00:00, 03:00, ...) regardless of resolution.
    const labelEvery = resolution === '15m' ? 12 : 3;
    const labelStyle = { color: Colors.textLight, fontSize: 9, width: 34 };

    const data = points.map((p, i) => ({
      value: p.price,
      label: i % labelEvery === 0 ? warsawTimeLabel(p.time) : '',
      labelTextStyle: labelStyle,
      hideDataPoint: !(isToday && i === currentIdx),
      dataPointColor: Colors.primary,
      dataPointRadius: 5,
      _interval: warsawIntervalLabel(p.time, stepMin),
      _kwh: (p.price / 1000).toFixed(2),
    }));

    // Carry the last slot's price out to 24:00 so the step chart closes on the
    // full-day boundary and the x-axis reads 00:00 -> 24:00.
    const last = points[points.length - 1];
    data.push({
      value: last.price,
      label: '24:00',
      labelTextStyle: labelStyle,
      hideDataPoint: true,
      dataPointColor: Colors.primary,
      dataPointRadius: 5,
      _interval: warsawIntervalLabel(last.time, stepMin),
      _kwh: (last.price / 1000).toFixed(2),
    });

    const stepValue = Math.max(100, Math.ceil((summary.max * 1.1) / 100) * 100) / 4;
    const top = stepValue * 4;
    const below = summary.min < 0 ? Math.ceil(Math.abs(summary.min * 1.1) / stepValue) : 0;
    return {
      chartData: data,
      yMax: top,
      yMin: -below * stepValue,
      sectionsBelow: below,
    };
  }, [points, resolution, isToday, summary, stepMin]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!chartData.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>—</Text>
        <Text style={styles.emptySub}>{m.noData}</Text>
      </View>
    );
  }

  // width prop is the plot area only; the chart adds ~40px of y-axis labels to
  // the left, so subtract page padding (32) + card padding (24) + y-axis (40).
  const chartWidth = screenWidth - 32 - 24 - 40;
  const initialSpacing = 6;
  const endSpacing = 14; // room for the right-most "24:00" label
  const lastIndex = Math.max(1, chartData.length - 1);
  const spacing = (chartWidth - initialSpacing - endSpacing) / lastIndex;
  const showRefCheap = yMax > PRICE_CHEAP;
  const showRefExpensive = yMax > PRICE_EXPENSIVE;

  return (
    <View>
      <View style={styles.chartCard}>
        <LineChart
          data={chartData}
          width={chartWidth}
          height={190}
          areaChart
          stepChart
          curved={false}
          thickness={2}
          color={Colors.primary}
          startFillColor={Colors.primary}
          endFillColor={Colors.surface}
          startOpacity={0.22}
          endOpacity={0.02}
          initialSpacing={initialSpacing}
          endSpacing={endSpacing}
          spacing={spacing}
          maxValue={yMax}
          mostNegativeValue={yMin}
          noOfSections={4}
          noOfSectionsBelowXAxis={sectionsBelow}
          yAxisColor={Colors.border}
          xAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textLight, fontSize: 10 }}
          rulesColor={Colors.borderLight}
          rulesType="dashed"
          yAxisLabelWidth={38}
          isAnimated={false}
          hideRules={false}
          showReferenceLine1={showRefCheap}
          referenceLine1Position={PRICE_CHEAP}
          referenceLine1Config={{ color: '#4CAF50', dashWidth: 4, dashGap: 4, thickness: 1 }}
          showReferenceLine2={showRefExpensive}
          referenceLine2Position={PRICE_EXPENSIVE}
          referenceLine2Config={{ color: '#F44336', dashWidth: 4, dashGap: 4, thickness: 1 }}
          pointerConfig={{
            pointerStripHeight: 170,
            pointerStripColor: Colors.border,
            pointerStripWidth: 1,
            pointerColor: Colors.primary,
            radius: 5,
            autoAdjustPointerLabelPosition: true,
            pointerLabelWidth: 130,
            pointerLabelHeight: 70,
            pointerLabelComponent: (items: any[]) => {
              const item = items?.[0];
              if (!item) return null;
              return (
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipTime}>{item._interval}</Text>
                  <Text style={styles.tooltipPrice}>
                    {Math.round(item.value)} {m.unitMwh}
                  </Text>
                  <Text style={styles.tooltipKwh}>
                    {item._kwh} {m.unitKwh}
                  </Text>
                </View>
              );
            },
          }}
        />
      </View>

      <View style={styles.summaryRow}>
        <SummaryCell
          label={m.summaryMin}
          value={summary.minPoint ? Math.round(summary.min) : null}
          sub={summary.minPoint ? warsawIntervalLabel(summary.minPoint.time, stepMin) : ''}
          color="#4CAF50"
        />
        <SummaryCell
          label={m.summaryMax}
          value={summary.maxPoint ? Math.round(summary.max) : null}
          sub={summary.maxPoint ? warsawIntervalLabel(summary.maxPoint.time, stepMin) : ''}
          color="#F44336"
        />
        <SummaryCell label={m.summaryAvg} value={Math.round(summary.avg)} sub={m.unitMwh} />
        <SummaryCell label={m.summaryRange} value={Math.round(summary.range)} sub={m.unitMwh} />
      </View>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | null;
  sub: string;
  color?: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color ? { color } : null]}>
        {value === null ? '—' : value}
      </Text>
      <Text style={styles.summarySub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loading: {
    height: 220,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    height: 160,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  summaryCell: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  summarySub: {
    fontSize: 9,
    color: Colors.textLight,
    marginTop: 2,
  },
  tooltip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tooltipTime: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  tooltipPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  tooltipKwh: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
