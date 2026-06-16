import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { averageOf, priceColor } from '@/lib/tge-analytics';
import {
  warsawNowAsZ,
  warsawTimeLabel,
  warsawFullDate,
  warsawDayStartAsZ,
} from '@/lib/tge-time';

interface TgeHeaderProps {
  todayPoints: TgePricePoint[];
  tomorrowPoints: TgePricePoint[];
  t: TranslationKeys;
  locale: string;
}

export function TgeHeader({ todayPoints, tomorrowPoints, t, locale }: TgeHeaderProps) {
  const m = t.marketData;

  const { current, updatedLabel } = useMemo(() => {
    const now = warsawNowAsZ();
    let nearest: TgePricePoint | null = null;
    let best = Infinity;
    for (const p of todayPoints) {
      const diff = Math.abs(p.time.getTime() - now.getTime());
      if (diff < best) {
        best = diff;
        nearest = p;
      }
    }
    return { current: nearest, updatedLabel: warsawTimeLabel(now) };
  }, [todayPoints]);

  const tomorrowAvg = useMemo(() => averageOf(tomorrowPoints), [tomorrowPoints]);
  const todayDate = warsawFullDate(warsawDayStartAsZ(0), locale);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{m.sourceBadge}</Text>
        </View>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {m.live} · {m.updated} {updatedLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle}>{m.dayAhead}</Text>
      <Text style={styles.date}>{todayDate}</Text>

      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {m.priceNow}
            {current ? ` · ${warsawTimeLabel(current.time)}` : ''}
          </Text>
          {current ? (
            <>
              <View style={styles.cardValueRow}>
                <View style={[styles.dot, { backgroundColor: priceColor(current.price) }]} />
                <Text style={[styles.cardValue, { color: priceColor(current.price) }]}>
                  {Math.round(current.price)}
                </Text>
                <Text style={styles.cardUnit}>{m.unitMwh}</Text>
              </View>
              <Text style={styles.cardKwh}>
                {(current.price / 1000).toFixed(2)} {m.unitKwh}
              </Text>
            </>
          ) : (
            <Text style={styles.cardEmpty}>—</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{m.tomorrowAvg}</Text>
          {tomorrowAvg !== null ? (
            <>
              <View style={styles.cardValueRow}>
                <Text style={[styles.cardValue, { color: Colors.text }]}>
                  {tomorrowAvg.toFixed(1)}
                </Text>
                <Text style={styles.cardUnit}>{m.unitMwh}</Text>
              </View>
              <Text style={styles.cardKwh}>
                {(tomorrowAvg / 1000).toFixed(2)} {m.unitKwh}
              </Text>
            </>
          ) : (
            <Text style={styles.cardEmpty}>—</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  date: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
    marginBottom: 14,
  },
  cards: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    alignSelf: 'center',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  cardUnit: {
    fontSize: 12,
    color: Colors.textLight,
  },
  cardKwh: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  cardEmpty: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textLight,
  },
});
