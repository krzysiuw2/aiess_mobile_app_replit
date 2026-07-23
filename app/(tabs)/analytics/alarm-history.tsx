import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { fetchAlarmHistory } from '@/lib/influxdb';
import { getBessProducer } from '@/constants/bessProducers';
import { getAlarmLabel } from '@/lib/alarmCodes';
import { formatDuration } from '@/lib/format';
import type { AlarmEpisode } from '@/types';

type HistoryRange = '24h' | '7d' | '30d' | '90d' | '365d';

const RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AlarmHistoryScreen() {
  const { t, language } = useSettings();
  const bt = t.analytics.batteryTab;
  const router = useRouter();
  const { selectedDevice } = useDevices();
  const siteId = selectedDevice?.device_id;

  const [range, setRange] = useState<HistoryRange>('7d');
  const [episodes, setEpisodes] = useState<AlarmEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) {
      setEpisodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const stop = new Date();
      const start = new Date(stop.getTime() - RANGE_MS[range]);
      const data = await fetchAlarmHistory(siteId, start, stop);
      setEpisodes(data);
    } catch (e) {
      console.error('[AlarmHistory] load failed:', e);
      setError(t.common.failedToLoad);
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, range, t.common.failedToLoad]);

  useEffect(() => {
    load();
  }, [load]);

  const producer = siteId ? getBessProducer(siteId) : 'wincle';

  const rangeLabels: Record<HistoryRange, string> = {
    '24h': bt.range24h,
    '7d': bt.range7d,
    '30d': bt.range30d,
    '90d': bt.range90d,
    '365d': bt.range365d,
  };

  const sections = useMemo(() => {
    const map = new Map<string, AlarmEpisode[]>();
    for (const ep of episodes) {
      const key = dayKey(ep.start);
      const list = map.get(key) ?? [];
      list.push(ep);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
  }, [episodes]);

  const renderEpisode = (ep: AlarmEpisode) => {
    const ongoing = ep.end === null;
    return (
      <View
        key={`${ep.stackId}-${ep.kind}-${ep.code}-${ep.start.getTime()}`}
        style={[styles.card, ongoing && styles.cardOngoing]}
      >
        <View style={styles.cardHeader}>
          <AlertTriangle
            size={16}
            color={ongoing ? CHART_COLORS.error : Colors.textSecondary}
          />
          <Text style={styles.cardTitle} numberOfLines={2}>
            {getAlarmLabel(producer, ep.code, ep.kind, language)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {bt.cabinet} {ep.stackId}
          </Text>
          <Text style={styles.meta}>
            {bt.code} #{ep.code}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {ep.start.toLocaleString()}
            {ep.end ? ` → ${ep.end.toLocaleTimeString()}` : ''}
          </Text>
          {ongoing ? (
            <View style={styles.ongoingBadge}>
              <Text style={styles.ongoingText}>{bt.ongoing}</Text>
            </View>
          ) : (
            <Text style={styles.meta}>
              {bt.duration}: {formatDuration(ep.durationMs)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{bt.alarmHistoryTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.rangeRow}>
        {(Object.keys(RANGE_MS) as HistoryRange[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.rangeChip, range === r && styles.rangeChipActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>
              {rangeLabels[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!siteId ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t.common.noDeviceSelected}</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : episodes.length === 0 ? (
        <View style={styles.center}>
          <CheckCircle size={40} color={CHART_COLORS.success} />
          <Text style={styles.emptyTitle}>{bt.alarmHistoryEmpty}</Text>
          <Text style={styles.emptyHint}>{bt.alarmHistoryEmptyHint}</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={s => s.day}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{item.day}</Text>
              {item.items.map(renderEpisode)}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangeChipActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary,
  },
  rangeText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  rangeTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardOngoing: {
    borderColor: CHART_COLORS.error + '50',
    backgroundColor: CHART_COLORS.error + '08',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  ongoingBadge: {
    backgroundColor: CHART_COLORS.error + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ongoingText: {
    fontSize: 11,
    fontWeight: '700',
    color: CHART_COLORS.error,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: CHART_COLORS.success,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary + '18',
  },
  retryText: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
