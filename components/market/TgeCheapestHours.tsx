import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { cheapestHours, priceColor } from '@/lib/tge-analytics';
import { warsawIntervalLabel } from '@/lib/tge-time';

interface TgeCheapestHoursProps {
  points: TgePricePoint[];
  t: TranslationKeys;
}

export function TgeCheapestHours({ points, t }: TgeCheapestHoursProps) {
  const m = t.marketData;
  const top = useMemo(() => cheapestHours(points, 5), [points]);

  if (!top.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptySub}>{m.noData}</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.subtitle}>{m.cheapestSubtitle}</Text>
      {top.map((p, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rank}>
            <Text style={styles.rankText}>{i + 1}</Text>
          </View>
          <Text style={styles.interval}>{warsawIntervalLabel(p.time, 60)}</Text>
          <View style={[styles.dot, { backgroundColor: priceColor(p.price) }]} />
          <Text style={[styles.price, { color: priceColor(p.price) }]}>
            {p.price.toFixed(1)}
          </Text>
          <Text style={styles.unit}>{m.unitMwh}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  interval: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
  },
  unit: {
    fontSize: 11,
    color: Colors.textLight,
  },
  empty: {
    height: 80,
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
