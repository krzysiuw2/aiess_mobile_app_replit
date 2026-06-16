import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { priceBuckets, countNegative, heatmapColor } from '@/lib/tge-analytics';

interface TgeDistributionProps {
  points: TgePricePoint[];
  t: TranslationKeys;
}

export function TgeDistribution({ points, t }: TgeDistributionProps) {
  const m = t.marketData;
  const { width: screenWidth } = useWindowDimensions();
  const buckets = useMemo(() => priceBuckets(points, 10), [points]);
  const negativeHours = useMemo(() => countNegative(points), [points]);

  if (!points.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptySub}>{m.noData}</Text>
      </View>
    );
  }

  const chartWidth = screenWidth - 32 - 24 - 36;
  const barData = buckets.map((b, i) => ({
    value: b.count,
    label: i % 2 === 0 ? `${Math.round(b.from)}` : '',
    labelTextStyle: { color: Colors.textLight, fontSize: 8 },
    frontColor: heatmapColor((b.from + b.to) / 2),
  }));
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const barWidth = Math.max(8, chartWidth / barData.length - 6);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.subtitle}>{m.distributionSubtitle}</Text>
        <BarChart
          data={barData}
          width={chartWidth}
          height={150}
          barWidth={barWidth}
          spacing={6}
          initialSpacing={6}
          maxValue={Math.ceil(maxCount * 1.1)}
          noOfSections={3}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textLight, fontSize: 9 }}
          rulesColor={Colors.borderLight}
          rulesType="dashed"
          isAnimated={false}
          barBorderRadius={2}
          disableScroll
        />
      </View>

      <View style={styles.negativeCard}>
        <Text style={styles.negativeNumber}>{negativeHours}</Text>
        <Text style={styles.negativeUnit}>{m.negativeHoursUnit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  negativeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  negativeNumber: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  negativeUnit: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  empty: {
    height: 100,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textLight,
  },
});
