import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Download } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { TranslationKeys } from '@/locales';
import { TgePricePoint } from '@/lib/influxdb';
import { averageOf } from '@/lib/tge-analytics';
import { warsawIntervalLabel } from '@/lib/tge-time';

interface TgePriceTableProps {
  points: TgePricePoint[];
  resolution: '15m' | '1h';
  dayLabel: string;
  t: TranslationKeys;
}

const COLLAPSED_ROWS = 12;

export function TgePriceTable({ points, resolution, dayLabel, t }: TgePriceTableProps) {
  const m = t.marketData;
  const [expanded, setExpanded] = useState(false);
  const stepMin = resolution === '15m' ? 15 : 60;
  const avg = useMemo(() => averageOf(points), [points]);

  const rows = useMemo(
    () =>
      points.map(p => {
        const delta = avg && avg !== 0 ? ((p.price - avg) / Math.abs(avg)) * 100 : 0;
        return {
          interval: warsawIntervalLabel(p.time, stepMin),
          price: p.price,
          delta,
        };
      }),
    [points, avg, stepMin],
  );

  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  const onExport = async () => {
    const header = `${m.colInterval};${m.colPrice};${m.colDelta}`;
    const body = rows
      .map(r => `${r.interval};${r.price.toFixed(1)};${r.delta.toFixed(1)}%`)
      .join('\n');
    const csv = `${m.title} — ${dayLabel}\n${header}\n${body}`;
    try {
      await Share.share({ message: csv, title: `${m.title} — ${dayLabel}` });
    } catch {
      // user dismissed the share sheet
    }
  };

  if (!points.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptySub}>{m.noData}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.subtitle}>
          {m.tableSubtitle} · {dayLabel}
        </Text>
        <TouchableOpacity style={styles.exportBtn} onPress={onExport} activeOpacity={0.7}>
          <Download size={14} color={Colors.primary} />
          <Text style={styles.exportText}>{m.export}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.colInterval, styles.headerCell]}>{m.colInterval}</Text>
        <Text style={[styles.cell, styles.colPrice, styles.headerCell]}>{m.colPrice}</Text>
        <Text style={[styles.cell, styles.colDelta, styles.headerCell]}>{m.colDelta}</Text>
      </View>

      {visibleRows.map((r, i) => (
        <View key={r.interval + i} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
          <Text style={[styles.cell, styles.colInterval]}>{r.interval}</Text>
          <Text style={[styles.cell, styles.colPrice, styles.priceCell]}>{r.price.toFixed(1)}</Text>
          <Text
            style={[
              styles.cell,
              styles.colDelta,
              { color: r.delta >= 0 ? '#F44336' : '#4CAF50' },
            ]}
          >
            {r.delta >= 0 ? '+' : ''}
            {r.delta.toFixed(1)}%
          </Text>
        </View>
      ))}

      {rows.length > COLLAPSED_ROWS && (
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setExpanded(e => !e)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleText}>
            {expanded ? m.showLess : `${m.showAll} (${rows.length})`}
          </Text>
        </TouchableOpacity>
      )}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subtitle: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exportText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  rowAlt: {
    backgroundColor: Colors.background,
  },
  headerRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  cell: {
    fontSize: 13,
    color: Colors.text,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  priceCell: {
    fontWeight: '600',
  },
  colInterval: {
    flex: 1.4,
  },
  colPrice: {
    flex: 1,
    textAlign: 'right',
  },
  colDelta: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  toggle: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
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
