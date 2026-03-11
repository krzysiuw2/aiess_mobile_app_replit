import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import type { HealthStatus } from '@/lib/batteryHealth';
import { getHealthColor } from '@/lib/batteryHealth';

interface CellHeatmapGridProps {
  values: number[];
  unit: string;
  getStatus: (value: number) => HealthStatus;
  columnsPerRow?: number;
}

export function CellHeatmapGrid({
  values,
  unit,
  getStatus,
  columnsPerRow = 6,
}: CellHeatmapGridProps) {
  const cells = useMemo(() => {
    return values.map((val, idx) => {
      const status = getStatus(val);
      const bgColor = getHealthColor(status) + '25';
      const textColor = getHealthColor(status);
      return { val, idx, bgColor, textColor };
    });
  }, [values, getStatus]);

  if (values.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No cell data</Text>
      </View>
    );
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += columnsPerRow) {
    rows.push(cells.slice(i, i + columnsPerRow));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((cell) => (
            <View
              key={cell.idx}
              style={[styles.cell, { backgroundColor: cell.bgColor }]}
            >
              <Text style={[styles.cellIndex, { color: cell.textColor }]}>
                {cell.idx + 1}
              </Text>
              <Text style={[styles.cellValue, { color: cell.textColor }]}>
                {cell.val}
              </Text>
              <Text style={[styles.cellUnit, { color: cell.textColor + '99' }]}>
                {unit}
              </Text>
            </View>
          ))}
          {/* Fill empty slots in last row */}
          {row.length < columnsPerRow &&
            Array.from({ length: columnsPerRow - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.cellEmpty} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  cell: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  cellIndex: {
    fontSize: 9,
    fontWeight: '500',
    opacity: 0.6,
    marginBottom: 1,
  },
  cellValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cellUnit: {
    fontSize: 8,
    marginTop: 1,
  },
  cellEmpty: {
    flex: 1,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
