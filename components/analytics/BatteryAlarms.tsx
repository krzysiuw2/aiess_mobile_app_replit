import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { BatteryLiveData } from '@/types';
import type { TranslationKeys } from '@/locales';

interface BatteryAlarmsProps {
  data: BatteryLiveData | null;
  t: TranslationKeys;
}

export function BatteryAlarms({ data, t }: BatteryAlarmsProps) {
  const bt = t.analytics.batteryTab;

  if (!data) return null;

  const hasFaults = data.activeFaultCount > 0 && data.activeFaults.length > 0;
  const faultValues = hasFaults
    ? data.activeFaults.split(',').map(v => v.trim()).filter(Boolean)
    : [];

  return (
    <View style={[styles.container, hasFaults ? styles.containerAlert : styles.containerOk]}>
      <View style={styles.header}>
        {hasFaults ? (
          <AlertTriangle size={18} color={CHART_COLORS.error} />
        ) : (
          <CheckCircle size={18} color={CHART_COLORS.success} />
        )}
        <Text style={[styles.title, { color: hasFaults ? CHART_COLORS.error : CHART_COLORS.success }]}>
          {hasFaults
            ? `${bt.alarms} (${data.activeFaultCount})`
            : bt.noAlarms}
        </Text>
      </View>
      {hasFaults && (
        <View style={styles.faultList}>
          {faultValues.map((fault, i) => (
            <View key={i} style={styles.faultBadge}>
              <Text style={styles.faultText}>REG {fault}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    borderWidth: 1,
  },
  containerOk: {
    backgroundColor: CHART_COLORS.success + '10',
    borderColor: CHART_COLORS.success + '30',
  },
  containerAlert: {
    backgroundColor: CHART_COLORS.error + '10',
    borderColor: CHART_COLORS.error + '30',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  faultList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  faultBadge: {
    backgroundColor: CHART_COLORS.error + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  faultText: {
    fontSize: 12,
    fontWeight: '600',
    color: CHART_COLORS.error,
    fontVariant: ['tabular-nums'],
  },
});
