import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertTriangle, CheckCircle, History } from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { CabinetDetail, LiveAlarmItem, Language } from '@/types';
import type { TranslationKeys } from '@/locales';
import { getBessProducer } from '@/constants/bessProducers';
import { getAlarmLabel } from '@/lib/alarmCodes';
import { alarmStartKey } from '@/lib/influxdb';
import { formatDuration } from '@/lib/format';
import { cabinetDisplayNumber } from '@/lib/batteryHealth';

interface BatteryAlarmsProps {
  cabinets: CabinetDetail[];
  /** null = whole site */
  selection: number | null;
  /** Start time of each currently-ongoing episode, keyed by alarmStartKey(). */
  alarmStarts: Map<string, Date>;
  siteId: string;
  language: Language;
  t: TranslationKeys;
}

export function BatteryAlarms({
  cabinets,
  selection,
  alarmStarts,
  siteId,
  language,
  t,
}: BatteryAlarmsProps) {
  const bt = t.analytics.batteryTab;
  const router = useRouter();
  const producer = getBessProducer(siteId);

  const items = useMemo((): LiveAlarmItem[] => {
    const source =
      selection === null
        ? cabinets.filter(c => c.online)
        : cabinets.filter(c => c.stackId === selection);

    const out: LiveAlarmItem[] = [];
    for (const c of source) {
      if (c.stackId === null) continue;
      for (const code of c.alarmCodes) {
        out.push({
          stackId: c.stackId,
          code,
          kind: 'alarm',
          since: alarmStarts.get(alarmStartKey(c.stackId, 'alarm', code)),
        });
      }
      for (const code of c.faultCodes) {
        out.push({
          stackId: c.stackId,
          code,
          kind: 'fault',
          since: alarmStarts.get(alarmStartKey(c.stackId, 'fault', code)),
        });
      }
    }
    return out;
  }, [cabinets, selection, alarmStarts]);

  const hasAlarms = items.length > 0;
  const showCabinetTag = selection === null && cabinets.length > 1;
  const now = Date.now();

  return (
    <View style={[styles.container, hasAlarms ? styles.containerAlert : styles.containerOk]}>
      <View style={styles.header}>
        {hasAlarms ? (
          <AlertTriangle size={18} color={CHART_COLORS.error} />
        ) : (
          <CheckCircle size={18} color={CHART_COLORS.success} />
        )}
        <Text style={[styles.title, { color: hasAlarms ? CHART_COLORS.error : CHART_COLORS.success }]}>
          {hasAlarms ? `${bt.alarms} (${items.length})` : bt.noAlarms}
        </Text>
      </View>

      {hasAlarms && (
        <View style={styles.faultList}>
          {items.map((item, i) => (
            <View key={`${item.stackId}-${item.kind}-${item.code}-${i}`} style={styles.faultBadge}>
              <View style={styles.faultTextCol}>
                <Text style={styles.faultText}>
                  {showCabinetTag ? `${bt.cabinet} ${cabinetDisplayNumber(item.stackId)}: ` : ''}
                  {getAlarmLabel(producer, item.code, item.kind, language)}
                </Text>
                <Text style={styles.sinceText}>
                  {item.since
                    ? `${bt.activeSince} ${item.since.toLocaleString()} (${formatDuration(
                        now - item.since.getTime(),
                      )})`
                    : bt.justDetected}
                </Text>
              </View>
              <Text style={styles.codeText}>#{item.code}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.historyLink}
        onPress={() => router.push('/(tabs)/analytics/alarm-history' as Href)}
        accessibilityRole="button"
      >
        <History size={14} color={Colors.primary} />
        <Text style={styles.historyText}>{bt.viewAlarmHistory}</Text>
      </TouchableOpacity>
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
    gap: 8,
    marginTop: 10,
  },
  faultBadge: {
    backgroundColor: CHART_COLORS.error + '20',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  faultTextCol: {
    flex: 1,
    gap: 2,
  },
  faultText: {
    fontSize: 12,
    fontWeight: '600',
    color: CHART_COLORS.error,
  },
  sinceText: {
    fontSize: 11,
    color: CHART_COLORS.error,
    opacity: 0.75,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '500',
    color: CHART_COLORS.error,
    opacity: 0.7,
    fontVariant: ['tabular-nums'],
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '80',
  },
  historyText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
});
