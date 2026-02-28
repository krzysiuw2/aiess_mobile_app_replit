import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { ChartDataPoint } from '@/lib/influxdb';
import { formatTimeLabel } from '@/lib/analytics';

interface SocBandChartProps {
  data: ChartDataPoint[];
  timeRange: string;
}

const Y_AXIS_WIDTH = 50;
const CHART_H_PADDING = 16 * 2;
const PARENT_H_PADDING = 16 * 2;
const INITIAL_SPACING = 10;
const END_SPACING = 10;

export function SocBandChart({ data, timeRange }: SocBandChartProps) {
  const { t } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  const chartWidth = screenWidth - PARENT_H_PADDING - CHART_H_PADDING - Y_AXIS_WIDTH - END_SPACING;
  const autoSpacing = data.length > 1
    ? Math.max(1, (chartWidth - INITIAL_SPACING) / (data.length - 1))
    : chartWidth;

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.analytics.noSocData}</Text>
      </View>
    );
  }

  const hasMinMax = data.some(p => p.socMin !== undefined && p.socMax !== undefined);
  const minLabelWidthPx = 52;
  const maxLabelsBySpace = Math.floor((data.length * autoSpacing) / minLabelWidthPx);
  const targetLabels = Math.min(6, Math.max(2, maxLabelsBySpace));
  const labelInterval = Math.max(1, Math.floor(data.length / targetLabels));

  const socMeanData = data.map((point, i) => ({
    value: point.soc,
    label: i % labelInterval === 0 ? formatTimeLabel(point.time, timeRange) : '',
    hideDataPoint: i % 5 !== 0,
    dataPointColor: CHART_COLORS.soc.line,
  }));

  const socMaxData = hasMinMax
    ? data.map((point, i) => ({
        value: point.socMax ?? point.soc,
        hideDataPoint: true,
      }))
    : undefined;

  const socMinData = hasMinMax
    ? data.map((point, i) => ({
        value: point.socMin ?? point.soc,
        hideDataPoint: true,
      }))
    : undefined;

  const currentSoc = data[data.length - 1]?.soc ?? 0;
  const minSoc = hasMinMax
    ? Math.min(...data.map(p => p.socMin ?? p.soc))
    : Math.min(...data.map(p => p.soc));
  const maxSoc = hasMinMax
    ? Math.max(...data.map(p => p.socMax ?? p.soc))
    : Math.max(...data.map(p => p.soc));

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t.analytics.current}</Text>
          <Text style={[styles.statValue, { color: CHART_COLORS.soc.line }]}>{currentSoc}%</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t.analytics.min}</Text>
          <Text style={styles.statValue}>{Math.round(minSoc)}%</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t.analytics.max}</Text>
          <Text style={styles.statValue}>{Math.round(maxSoc)}%</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t.analytics.range}</Text>
          <Text style={styles.statValue}>{Math.round(maxSoc - minSoc)}%</Text>
        </View>
      </View>

      <View style={styles.chartWrapper}>
        <LineChart
          data={socMeanData}
          data2={socMaxData}
          data3={socMinData}
          width={chartWidth}
          height={200}
          spacing={autoSpacing}
          initialSpacing={INITIAL_SPACING}
          endSpacing={END_SPACING}
          disableScroll
          maxValue={100}
          noOfSections={5}
          color1={CHART_COLORS.soc.line}
          color2={CHART_COLORS.soc.area}
          color3={CHART_COLORS.soc.area}
          thickness1={2}
          thickness2={1}
          thickness3={1}
          dashWidth={6}
          dashGap={4}
          curved
          areaChart={hasMinMax}
          areaChart2={hasMinMax}
          areaChart3={false}
          startFillColor1={hasMinMax ? 'transparent' : CHART_COLORS.soc.line}
          endFillColor1={hasMinMax ? 'transparent' : CHART_COLORS.soc.line}
          startOpacity1={hasMinMax ? 0 : 0.15}
          endOpacity1={hasMinMax ? 0 : 0.02}
          startFillColor2={CHART_COLORS.soc.area}
          endFillColor2={CHART_COLORS.soc.area}
          startOpacity2={0.25}
          endOpacity2={0.1}
          hideDataPoints1={data.length > 100}
          hideDataPoints2
          hideDataPoints3
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisThickness={0}
          xAxisThickness={0}
          xAxisLabelTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
          yAxisTextStyle={{
            color: Colors.textSecondary,
            fontSize: 10,
          }}
          yAxisLabelSuffix="%"
          rulesColor={Colors.border}
          rulesType="dashed"
          backgroundColor={Colors.surface}
          isAnimated
          animationDuration={400}
          pointerConfig={{
            pointerStripHeight: 190,
            pointerStripColor: Colors.textLight,
            pointerStripWidth: 1,
            pointerColor: CHART_COLORS.soc.line,
            radius: 5,
            pointerLabelWidth: 100,
            pointerLabelHeight: 50,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: any) => {
              const item = items[0];
              if (!item) return null;
              const idx = Math.round(item.index || 0);
              const point = data[idx];
              if (!point) return null;
              return (
                <View style={styles.tooltipCard}>
                  <Text style={styles.tooltipTime}>
                    {point.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.tooltipValue}>{`${t.monitor.soc}: `}{point.soc}%</Text>
                  {point.socMin !== undefined && (
                    <Text style={styles.tooltipRange}>
                      {point.socMin}% - {point.socMax}%
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
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    paddingTop: 20,
  },
  emptyContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tooltipCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  tooltipTime: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  tooltipValue: {
    fontSize: 12,
    color: CHART_COLORS.soc.line,
    fontWeight: '600',
  },
  tooltipRange: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
