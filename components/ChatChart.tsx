import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import type { ChartData } from '@/lib/aws-chat';

const CHART_WIDTH = Dimensions.get('window').width - 120;

function formatTimeLabel(iso: string, hours: number): string {
  const d = new Date(iso);
  if (hours <= 24) return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (hours <= 168) return d.toLocaleDateString('pl-PL', { weekday: 'short', hour: '2-digit', hour12: false });
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

interface ChatChartProps {
  data: ChartData;
}

export function ChatChart({ data }: ChatChartProps) {
  const { datasets, labels, chart_type, title, hours } = data;

  const labelInterval = useMemo(
    () => Math.max(1, Math.floor(labels.length / 5)),
    [labels.length],
  );

  const lineDataSets = useMemo(() => {
    if (!datasets || datasets.length === 0) return [];

    return datasets.map((ds) => {
      const points = ds.data.map((val, i) => ({
        value: val,
        label: i % labelInterval === 0 ? formatTimeLabel(labels[i], hours) : '',
        hideDataPoint: true,
      }));
      return { points, color: ds.color, label: ds.label };
    });
  }, [datasets, labels, labelInterval, hours]);

  const barData = useMemo(() => {
    if (chart_type !== 'bar' || !datasets || datasets.length === 0) return [];
    const ds = datasets[0];
    return ds.data.map((val, i) => ({
      value: val,
      label: i % labelInterval === 0 ? formatTimeLabel(labels[i], hours) : '',
      frontColor: ds.color,
    }));
  }, [chart_type, datasets, labels, labelInterval, hours]);

  if (!datasets || datasets.length === 0) return null;

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      {chart_type === 'bar' ? (
        <BarChart
          data={barData}
          width={CHART_WIDTH}
          height={160}
          barWidth={Math.max(2, CHART_WIDTH / barData.length - 2)}
          spacing={2}
          hideRules
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={styles.axisLabel}
          xAxisLabelTextStyle={styles.axisLabel}
          noOfSections={4}
          isAnimated={false}
        />
      ) : (
        <LineChart
          data={lineDataSets[0]?.points || []}
          data2={lineDataSets[1]?.points}
          data3={lineDataSets[2]?.points}
          data4={lineDataSets[3]?.points}
          data5={lineDataSets[4]?.points}
          color={lineDataSets[0]?.color || Colors.primary}
          color2={lineDataSets[1]?.color}
          color3={lineDataSets[2]?.color}
          color4={lineDataSets[3]?.color}
          color5={lineDataSets[4]?.color}
          width={CHART_WIDTH}
          height={160}
          curved
          hideDataPoints
          thickness={2}
          hideRules
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={styles.axisLabel}
          xAxisLabelTextStyle={styles.axisLabel}
          noOfSections={4}
          isAnimated={false}
          areaChart={datasets.length === 1}
          startFillColor={datasets.length === 1 ? datasets[0].color + '30' : undefined}
          endFillColor={datasets.length === 1 ? datasets[0].color + '05' : undefined}
        />
      )}

      {datasets.length > 1 && (
        <View style={styles.legend}>
          {datasets.map((ds, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ds.color }]} />
              <Text style={styles.legendLabel}>{ds.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  axisLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
