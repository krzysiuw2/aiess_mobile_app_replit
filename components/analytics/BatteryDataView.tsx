import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Colors from '@/constants/colors';
import type { BatteryLiveData, CabinetDetail, Language } from '@/types';
import type { TranslationKeys } from '@/locales';
import { fetchBatteryLiveData, fetchBatteryCabinets, fetchOngoingAlarmStarts } from '@/lib/influxdb';
import { aggregateSite, cabinetDisplayNumber } from '@/lib/batteryHealth';
import { SectionHeader } from './SectionHeader';
import { BatteryLiveSummary } from './BatteryLiveSummary';
import { BatteryAlarms } from './BatteryAlarms';
import { BatteryDetailView } from './BatteryDetailView';

interface BatteryDataViewProps {
  deviceId: string | undefined;
  isActive: boolean;
  t: TranslationKeys;
  language: Language;
}

/** null = whole site; number = cabinet stack_id */
type CabinetSelection = null | number;

const LIVE_POLL_MS = 5_000;
const DETAIL_POLL_MS = 60_000;

export function BatteryDataView({ deviceId, isActive, t, language }: BatteryDataViewProps) {
  const bt = t.analytics.batteryTab;

  const [liveData, setLiveData] = useState<BatteryLiveData | null>(null);
  const [cabinets, setCabinets] = useState<CabinetDetail[]>([]);
  const [alarmStarts, setAlarmStarts] = useState<Map<string, Date>>(new Map());
  const [selection, setSelection] = useState<CabinetSelection>(null);
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
      const [data, starts] = await Promise.all([
        fetchBatteryCabinets(deviceId),
        fetchOngoingAlarmStarts(deviceId),
      ]);
      if (data.length > 0) {
        console.log(
          `[BatteryCabinets] OK — ${data.length} cabinet(s): ` +
            data.map(c => `#${c.stackId}${c.online ? '' : ' offline'}`).join(', '),
        );
      }
      setCabinets(data);
      setAlarmStarts(starts);
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
    setSelection(null);
    fetchLive();
    fetchDetail();

    liveTimer.current = setInterval(fetchLive, LIVE_POLL_MS);
    detailTimer.current = setInterval(fetchDetail, DETAIL_POLL_MS);

    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (detailTimer.current) clearInterval(detailTimer.current);
    };
  }, [isActive, deviceId, fetchLive, fetchDetail]);

  // Drop selection if the cabinet disappears
  useEffect(() => {
    if (selection === null) return;
    if (!cabinets.some(c => c.stackId === selection)) {
      setSelection(null);
    }
  }, [cabinets, selection]);

  const multiCabinet = cabinets.length > 1;

  const selectedDetail = useMemo((): CabinetDetail | null => {
    if (cabinets.length === 0) return null;
    if (selection === null) {
      if (multiCabinet) return aggregateSite(cabinets);
      return cabinets[0];
    }
    return cabinets.find(c => c.stackId === selection) ?? null;
  }, [cabinets, selection, multiCabinet]);

  // Live summary: prefer selected cabinet extremes when available
  const liveSummaryData = useMemo((): BatteryLiveData | null => {
    if (selectedDetail && !selectedDetail.isAggregate) {
      return {
        minCellVoltage: selectedDetail.cellVoltageMin,
        maxCellVoltage: selectedDetail.cellVoltageMax,
        voltageDelta: selectedDetail.cellVoltageDelta,
        minCellTemp: selectedDetail.cellTempMin,
        maxCellTemp: selectedDetail.cellTempMax,
        activeFaults: selectedDetail.faultCodes.join(','),
        activeFaultCount: selectedDetail.faultCount,
        lastUpdate: selectedDetail.lastUpdate,
      };
    }
    if (selectedDetail?.isAggregate) {
      return {
        minCellVoltage: selectedDetail.cellVoltageMin,
        maxCellVoltage: selectedDetail.cellVoltageMax,
        voltageDelta: selectedDetail.cellVoltageDelta,
        minCellTemp: selectedDetail.cellTempMin,
        maxCellTemp: selectedDetail.cellTempMax,
        activeFaults: selectedDetail.faultCodes.join(','),
        activeFaultCount: selectedDetail.faultCount,
        lastUpdate: selectedDetail.lastUpdate,
      };
    }
    return liveData;
  }, [selectedDetail, liveData]);

  if (!deviceId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>{t.common.noDeviceSelected}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Cabinet selector — only for multi-stack sites */}
      {multiCabinet && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.selectorScroll}
          contentContainerStyle={styles.selectorRow}
        >
          <TouchableOpacity
            style={[styles.chip, selection === null && styles.chipActive]}
            onPress={() => setSelection(null)}
          >
            <Text style={[styles.chipText, selection === null && styles.chipTextActive]}>
              {bt.wholeSite}
            </Text>
          </TouchableOpacity>
          {cabinets.map(c => {
            const stackId = c.stackId;
            if (stackId === null) return null;
            const active = selection === stackId;
            return (
              <TouchableOpacity
                key={stackId}
                style={[
                  styles.chip,
                  active && styles.chipActive,
                  !c.online && styles.chipOffline,
                ]}
                onPress={() => setSelection(stackId)}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && styles.chipTextActive,
                    !c.online && styles.chipTextOffline,
                  ]}
                >
                  {bt.cabinet} {cabinetDisplayNumber(stackId)}
                  {!c.online ? ` · ${bt.offline}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Section: Live Battery Summary */}
      <SectionHeader title={bt.liveSummary} icon="Activity" />
      {liveLoading && !liveSummaryData ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : liveError && !liveSummaryData ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{liveError}</Text>
        </View>
      ) : (
        <BatteryLiveSummary data={liveSummaryData} t={t} />
      )}

      {/* Section: Alarms from battery_detail */}
      <SectionHeader title={bt.alarms} icon="AlertTriangle" />
      <BatteryAlarms
        cabinets={cabinets}
        selection={selection}
        alarmStarts={alarmStarts}
        siteId={deviceId}
        language={language}
        t={t}
      />

      {/* Section: Battery Detail */}
      {detailLoading && cabinets.length === 0 ? (
        <View style={[styles.loadingRow, { marginTop: 24 }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>{bt.loadingDetail}</Text>
        </View>
      ) : detailError && cabinets.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{detailError}</Text>
        </View>
      ) : (
        <BatteryDetailView
          data={selectedDetail}
          multiCabinet={multiCabinet}
          t={t}
        />
      )}

      {/* Timestamps */}
      <View style={styles.timestampRow}>
        {liveData && (
          <Text style={styles.timestamp}>
            {bt.liveUpdate}: {liveData.lastUpdate.toLocaleTimeString()}
          </Text>
        )}
        {selectedDetail && (
          <Text style={styles.timestamp}>
            {bt.detailUpdate}: {selectedDetail.lastUpdate.toLocaleTimeString()}
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
  selectorScroll: {
    marginBottom: 12,
    maxHeight: 44,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary,
  },
  chipOffline: {
    opacity: 0.55,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  chipTextOffline: {
    color: Colors.textLight,
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
