import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { heatmapGrid, heatmapColor } from '@/lib/tge-analytics';

interface TgeHeatmapProps {
  points: TgePricePoint[];
  t: TranslationKeys;
}

const HOUR_LABEL_W = 26;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LABELLED_HOURS = new Set([0, 6, 12, 18]);

export function TgeHeatmap({ points, t }: TgeHeatmapProps) {
  const m = t.marketData;
  const { width: screenWidth } = useWindowDimensions();
  const grid = useMemo(() => heatmapGrid(points), [points]);

  if (!grid.dayKeys.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptySub}>{m.noData}</Text>
      </View>
    );
  }

  const numDays = grid.dayKeys.length;
  const available = screenWidth - 32 - 24 - HOUR_LABEL_W; // page + card padding
  const cellW = Math.max(5, available / numDays);
  const cellH = 6;
  const gap = 1;
  const dayLabelEvery = Math.max(1, Math.ceil(numDays / 6));

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>{m.heatmapSubtitle}</Text>

      <View>
        {HOURS.map(hour => (
          <View key={hour} style={[styles.hourRow, { marginBottom: gap }]}>
            <Text style={styles.hourLabel}>
              {LABELLED_HOURS.has(hour) ? `${String(hour).padStart(2, '0')}` : ''}
            </Text>
            <View style={styles.cellsRow}>
              {grid.dayKeys.map(dayKey => {
                const price = grid.cells.get(`${dayKey}|${hour}`);
                return (
                  <View
                    key={dayKey + hour}
                    style={{
                      width: cellW - gap,
                      height: cellH,
                      marginRight: gap,
                      borderRadius: 1,
                      backgroundColor: price === undefined ? Colors.borderLight : heatmapColor(price),
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.dayLabelRow}>
          <View style={{ width: HOUR_LABEL_W }} />
          <View style={styles.cellsRow}>
            {grid.dayKeys.map((dayKey, i) => (
              <View key={dayKey} style={{ width: cellW, alignItems: 'flex-start' }}>
                {i % dayLabelEvery === 0 ? (
                  <Text style={styles.dayLabel}>{dayKey.slice(8, 10)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.legend}>
        <LegendItem color="#1d4ed8" label={m.scaleNegative} />
        <LegendItem color="#16a34a" label={m.scaleCheap} />
        <LegendItem color="#b91c1c" label={m.scaleExpensive} />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: HOUR_LABEL_W,
    fontSize: 8,
    color: Colors.textLight,
  },
  cellsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  dayLabelRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  dayLabel: {
    fontSize: 8,
    color: Colors.textLight,
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: Colors.textSecondary,
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
