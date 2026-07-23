import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import type { CabinetDetail } from '@/types';
import type { TranslationKeys } from '@/locales';
import {
  getHealthColor,
  getSohStatus,
  getCellVoltageStatus,
  getCellTempStatus,
  getWorkingModeLabel,
  getWorkingModeStatus,
  getChargeDischargeLabel,
  cabinetDisplayNumber,
} from '@/lib/batteryHealth';
import { SectionHeader } from './SectionHeader';
import { CellHeatmapGrid } from './CellHeatmapGrid';

interface BatteryDetailViewProps {
  data: CabinetDetail | null;
  multiCabinet: boolean;
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

export function BatteryDetailView({ data, multiCabinet, t }: BatteryDetailViewProps) {
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
  const cdsLabel = getChargeDischargeLabel(data.chargeDischargeStatus);
  const showHeatmaps = !data.isAggregate && data.online && data.cellVoltages.length > 0;
  const showOffline = !data.online && !data.isAggregate;

  return (
    <View style={showOffline ? styles.offlineWrap : undefined}>
      {/* Stack Summary */}
      <SectionHeader title={bt.stackSummary} icon="Battery" />
      <View style={[styles.stackCard, showOffline && styles.stackCardOffline]}>
        <View style={styles.badgeRow}>
          {data.isAggregate ? (
            <View style={[styles.statusBadge, { backgroundColor: Colors.primary + '18' }]}>
              <Text style={[styles.statusBadgeText, { color: Colors.primary }]}>
                {bt.wholeSite}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: data.online
                    ? getHealthColor('healthy') + '20'
                    : Colors.textLight + '30',
                },
              ]}
            >
              <View
                style={[
                  styles.wmDot,
                  {
                    backgroundColor: data.online
                      ? getHealthColor('healthy')
                      : Colors.textLight,
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: data.online
                      ? getHealthColor('healthy')
                      : Colors.textSecondary,
                  },
                ]}
              >
                {data.online ? bt.online : bt.offline}
              </Text>
            </View>
          )}
          {!data.isAggregate && data.stackId !== null && (
            <Text style={styles.cabinetLabel}>
              {bt.cabinet} {cabinetDisplayNumber(data.stackId)}
            </Text>
          )}
        </View>

        {showOffline ? (
          <View style={styles.offlineBlock}>
            <Text style={styles.offlineNote}>{bt.cabinetOfflineNote}</Text>
            <Text style={styles.lastSeen}>
              {bt.lastSeen}: {data.lastUpdate.toLocaleString()}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.stackGrid}>
              <View style={styles.stackHalf}>
                <StackRow
                  label={bt.stackVoltage}
                  value={data.stackVoltage.toFixed(1)}
                  unit="V"
                />
                <StackRow
                  label={bt.stackCurrent}
                  value={data.stackCurrent.toFixed(1)}
                  unit="A"
                />
                <StackRow
                  label={bt.maxCharge}
                  value={data.maxChargeKw.toFixed(1)}
                  unit="kW"
                />
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
                <StackRow
                  label={bt.maxDischarge}
                  value={data.maxDischargeKw.toFixed(1)}
                  unit="kW"
                />
              </View>
            </View>
            <View style={styles.cellCountRow}>
              <View style={[styles.wmBadge, { backgroundColor: wmColor + '20' }]}>
                <View style={[styles.wmDot, { backgroundColor: wmColor }]} />
                <Text style={[styles.wmText, { color: wmColor }]}>{wmLabel}</Text>
              </View>
              <View style={styles.cdsBadge}>
                <Text style={styles.cdsText}>
                  {bt.chargeStatus}: {cdsLabel}
                </Text>
              </View>
              <Text style={styles.cellCountText}>
                {data.cellCount} {bt.cells} · {data.ntcCount} NTC
              </Text>
            </View>
            {data.isAggregate && multiCabinet && (
              <Text style={styles.aggregateNote}>{bt.siteAggregateNote}</Text>
            )}
          </>
        )}
      </View>

      {/* Cell Voltages Heatmap — cabinet view only */}
      {showHeatmaps && (
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
      {!showOffline && !data.isAggregate && data.cellTemps.length > 0 && (
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
  offlineWrap: {
    opacity: 0.85,
  },
  stackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  stackCardOffline: {
    borderColor: Colors.textLight + '50',
    backgroundColor: Colors.surface,
    opacity: 0.7,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cabinetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  offlineBlock: {
    paddingVertical: 8,
    gap: 6,
  },
  offlineNote: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  lastSeen: {
    fontSize: 12,
    color: Colors.textLight,
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
  cdsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cdsText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cellCountText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  aggregateNote: {
    marginTop: 10,
    fontSize: 11,
    color: Colors.textLight,
    textAlign: 'center',
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
