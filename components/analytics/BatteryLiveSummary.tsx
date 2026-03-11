import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Zap, Thermometer } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { BatteryLiveData } from '@/types';
import type { TranslationKeys } from '@/locales';
import {
  getHealthColor,
  getVoltageDeltaStatus,
  getMinVoltageStatus,
  getMaxVoltageStatus,
  getMinTempStatus,
  getMaxTempStatus,
} from '@/lib/batteryHealth';

interface BatteryLiveSummaryProps {
  data: BatteryLiveData | null;
  t: TranslationKeys;
}

function MetricRow({ label, value, unit, status }: {
  label: string;
  value: number;
  unit: string;
  status: ReturnType<typeof getVoltageDeltaStatus>;
}) {
  const color = getHealthColor(status);
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export function BatteryLiveSummary({ data, t }: BatteryLiveSummaryProps) {
  const bt = t.analytics.batteryTab;

  if (!data) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>{t.analytics.noDataAvailable}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Voltage Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Zap size={16} color={Colors.primary} />
          <Text style={styles.cardTitle}>{bt.voltages}</Text>
        </View>
        <MetricRow
          label={bt.minVoltage}
          value={data.minCellVoltage}
          unit="mV"
          status={getMinVoltageStatus(data.minCellVoltage)}
        />
        <MetricRow
          label={bt.maxVoltage}
          value={data.maxCellVoltage}
          unit="mV"
          status={getMaxVoltageStatus(data.maxCellVoltage)}
        />
        <MetricRow
          label={bt.voltageDelta}
          value={data.voltageDelta}
          unit="mV"
          status={getVoltageDeltaStatus(data.voltageDelta)}
        />
      </View>

      {/* Temperature Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Thermometer size={16} color={Colors.primary} />
          <Text style={styles.cardTitle}>{bt.temperatures}</Text>
        </View>
        <MetricRow
          label={bt.minTemp}
          value={data.minCellTemp}
          unit="°C"
          status={getMinTempStatus(data.minCellTemp)}
        />
        <MetricRow
          label={bt.maxTemp}
          value={data.maxCellTemp}
          unit="°C"
          status={getMaxTempStatus(data.maxCellTemp)}
        />
        <MetricRow
          label={bt.tempDelta}
          value={data.maxCellTemp - data.minCellTemp}
          unit="°C"
          status={getVoltageDeltaStatus(0)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    fontSize: 11,
    color: Colors.textLight,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
