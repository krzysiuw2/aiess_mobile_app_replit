import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Colors from '@/constants/colors';
import type { BatteryLiveData, BatteryDetailData } from '@/types';
import type { TranslationKeys } from '@/locales';
import { fetchBatteryLiveData, fetchBatteryDetail } from '@/lib/influxdb';
import { SectionHeader } from './SectionHeader';
import { BatteryLiveSummary } from './BatteryLiveSummary';
import { BatteryAlarms } from './BatteryAlarms';
import { BatteryDetailView } from './BatteryDetailView';

interface BatteryDataViewProps {
  deviceId: string | undefined;
  isActive: boolean;
  t: TranslationKeys;
}

const LIVE_POLL_MS = 5_000;
const DETAIL_POLL_MS = 60_000;

export function BatteryDataView({ deviceId, isActive, t }: BatteryDataViewProps) {
  const bt = t.analytics.batteryTab;

  const [liveData, setLiveData] = useState<BatteryLiveData | null>(null);
  const [detailData, setDetailData] = useState<BatteryDetailData | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLive = useCallback(async () => {
    if (!deviceId) return;
    try {
      const data = await fetchBatteryLiveData(deviceId);
      setLiveData(data);
      setLiveError(null);
    } catch (e) {
      console.error('[BatteryDataView] Live fetch error:', e);
      setLiveError(t.common.failedToLoad);
    } finally {
      setLiveLoading(false);
    }
  }, [deviceId, t.common.failedToLoad]);

  const fetchDetail = useCallback(async () => {
    if (!deviceId) return;
    try {
      const data = await fetchBatteryDetail(deviceId);
      if (data) {
        console.log(`[BatteryDetail] OK — stack ${data.stackVoltage.toFixed(1)}V, ${data.cellVoltages.length} cells, ${data.cellTemps.length} NTCs`);
      }
      setDetailData(data);
      setDetailError(null);
    } catch (e) {
      console.error('[BatteryDataView] Detail fetch error:', e);
      setDetailError(t.common.failedToLoad);
    } finally {
      setDetailLoading(false);
    }
  }, [deviceId, t.common.failedToLoad]);

  useEffect(() => {
    if (!isActive || !deviceId) {
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (detailTimer.current) clearInterval(detailTimer.current);
      liveTimer.current = null;
      detailTimer.current = null;
      return;
    }

    setLiveLoading(true);
    setDetailLoading(true);
    fetchLive();
    fetchDetail();

    liveTimer.current = setInterval(fetchLive, LIVE_POLL_MS);
    detailTimer.current = setInterval(fetchDetail, DETAIL_POLL_MS);

    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (detailTimer.current) clearInterval(detailTimer.current);
    };
  }, [isActive, deviceId, fetchLive, fetchDetail]);

  if (!deviceId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>{t.common.noDeviceSelected}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Section: Live Battery Summary (5s) */}
      <SectionHeader title={bt.liveSummary} icon="Activity" />
      {liveLoading && !liveData ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : liveError && !liveData ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{liveError}</Text>
        </View>
      ) : (
        <BatteryLiveSummary data={liveData} t={t} />
      )}

      {/* Section: Alarms (from 5s live data) */}
      <SectionHeader title={bt.alarms} icon="AlertTriangle" />
      <BatteryAlarms data={liveData} t={t} />

      {/* Section: Battery Detail — stack summary + heatmaps (60s) */}
      {detailLoading && !detailData ? (
        <View style={[styles.loadingRow, { marginTop: 24 }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>{bt.loadingDetail}</Text>
        </View>
      ) : (
        <BatteryDetailView data={detailData} t={t} />
      )}

      {/* Timestamps */}
      <View style={styles.timestampRow}>
        {liveData && (
          <Text style={styles.timestamp}>
            {bt.liveUpdate}: {liveData.lastUpdate.toLocaleTimeString()}
          </Text>
        )}
        {detailData && (
          <Text style={styles.timestamp}>
            {bt.detailUpdate}: {detailData.lastUpdate.toLocaleTimeString()}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  timestampRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.textLight,
  },
});
