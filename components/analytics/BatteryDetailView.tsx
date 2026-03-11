import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Battery, Activity, Heart } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { BatteryDetailData } from '@/types';
import type { TranslationKeys } from '@/locales';
import { getHealthColor, getSohStatus, getCellVoltageStatus, getCellTempStatus, getWorkingModeLabel, getWorkingModeStatus } from '@/lib/batteryHealth';
import { SectionHeader } from './SectionHeader';
import { CellHeatmapGrid } from './CellHeatmapGrid';

interface BatteryDetailViewProps {
  data: BatteryDetailData | null;
  t: TranslationKeys;
}

function StackRow({ label, value, unit, color }: {
  label: string;
  value: string | number;
  unit: string;
  color?: string;
}) {
  return (
    <View style={styles.stackRow}>
      <Text style={styles.stackLabel}>{label}</Text>
      <View style={styles.stackValueRow}>
        <Text style={[styles.stackValue, color ? { color } : undefined]}>{value}</Text>
        <Text style={styles.stackUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export function BatteryDetailView({ data, t }: BatteryDetailViewProps) {
  const bt = t.analytics.batteryTab;

  if (!data) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
        <Text style={styles.emptySubtext}>{bt.detailRefreshNote}</Text>
      </View>
    );
  }

  const sohStatus = getSohStatus(data.stackSoh);
  const sohColor = getHealthColor(sohStatus);
  const wmStatus = getWorkingModeStatus(data.workingMode);
  const wmColor = getHealthColor(wmStatus);
  const wmLabel = getWorkingModeLabel(data.workingMode);

  return (
    <View>
      {/* Stack Summary */}
      <SectionHeader title={bt.stackSummary} icon="Battery" />
      <View style={styles.stackCard}>
        <View style={styles.stackGrid}>
          <View style={styles.stackHalf}>
            <StackRow label={bt.stackVoltage} value={data.stackVoltage.toFixed(1)} unit="V" />
            <StackRow label={bt.stackCurrent} value={data.stackCurrent.toFixed(1)} unit="A" />
          </View>
          <View style={styles.stackDivider} />
          <View style={styles.stackHalf}>
            <StackRow label="SoC" value={`${data.stackSoc.toFixed(0)}`} unit="%" />
            <StackRow
              label="SoH"
              value={`${data.stackSoh.toFixed(0)}`}
              unit="%"
              color={sohColor}
            />
          </View>
        </View>
        <View style={styles.cellCountRow}>
          <View style={[styles.wmBadge, { backgroundColor: wmColor + '20' }]}>
            <View style={[styles.wmDot, { backgroundColor: wmColor }]} />
            <Text style={[styles.wmText, { color: wmColor }]}>{wmLabel}</Text>
          </View>
          <Text style={styles.cellCountText}>
            {data.cellCount} {bt.cells} · {data.ntcCount} NTC
          </Text>
        </View>
      </View>

      {/* Cell Voltages Heatmap */}
      {data.cellVoltages.length > 0 && (
        <>
          <SectionHeader title={bt.cellVoltages} icon="Zap" />
          <View style={styles.heatmapCard}>
            <CellHeatmapGrid
              values={data.cellVoltages}
              unit="mV"
              getStatus={getCellVoltageStatus}
            />
          </View>
        </>
      )}

      {/* Cell Temperatures Heatmap */}
      {data.cellTemps.length > 0 && (
        <>
          <SectionHeader title={bt.cellTemperatures} icon="Thermometer" />
          <View style={styles.heatmapCard}>
            <CellHeatmapGrid
              values={data.cellTemps}
              unit="°C"
              getStatus={getCellTempStatus}
              columnsPerRow={4}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  stackGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stackHalf: {
    flex: 1,
    gap: 8,
  },
  stackDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  stackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stackLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  stackValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  stackValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  stackUnit: {
    fontSize: 11,
    color: Colors.textLight,
  },
  cellCountRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
    gap: 6,
  },
  wmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  wmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  wmText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cellCountText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  heatmapCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.textLight,
  },
});
