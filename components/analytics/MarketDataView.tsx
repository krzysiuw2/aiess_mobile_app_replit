import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { TranslationKeys } from '@/locales';
import type { Language } from '@/types';
import { SectionHeader } from './SectionHeader';
import { Segmented } from '@/components/market/Segmented';
import { TgeHeader } from '@/components/market/TgeHeader';
import TgeProfileChart from '@/components/market/TgeProfileChart';
import { TgePriceTable } from '@/components/market/TgePriceTable';
import { TgeCheapestHours } from '@/components/market/TgeCheapestHours';
import { TgeHeatmap } from '@/components/market/TgeHeatmap';
import { TgeDistribution } from '@/components/market/TgeDistribution';
import { fetchTgePrices, fetchTgePrices15m, TgePricePoint } from '@/lib/influxdb';
import { warsawDayStartAsZ, warsawDateKey, warsawFullDate } from '@/lib/tge-time';
import Colors from '@/constants/colors';

type DaySel = 'yesterday' | 'today' | 'tomorrow';
type Resolution = '15m' | '1h';
type Period = '7d' | '30d';

const DAY_OFFSET: Record<DaySel, number> = { yesterday: -1, today: 0, tomorrow: 1 };

interface MarketDataViewProps {
  isActive: boolean;
  t: TranslationKeys;
  language: Language;
}

export function MarketDataView({ isActive, t, language }: MarketDataViewProps) {
  const m = t.marketData;
  const locale = language === 'pl' ? 'pl-PL' : 'en-US';

  const [daySel, setDaySel] = useState<DaySel>('today');
  const [resolution, setResolution] = useState<Resolution>('15m');
  const [period, setPeriod] = useState<Period>('30d');

  const [hourlyDays, setHourlyDays] = useState<TgePricePoint[]>([]);
  const [fifteenSel, setFifteenSel] = useState<TgePricePoint[]>([]);
  const [periodPoints, setPeriodPoints] = useState<TgePricePoint[]>([]);
  const [loadingDay, setLoadingDay] = useState(true);

  // Hourly window covering yesterday -> tomorrow (header cards + 1h profile).
  const loadHourlyDays = useCallback(async () => {
    setLoadingDay(true);
    try {
      const points = await fetchTgePrices(warsawDayStartAsZ(-1), warsawDayStartAsZ(2));
      setHourlyDays(points);
    } catch {
      setHourlyDays([]);
    } finally {
      setLoadingDay(false);
    }
  }, []);

  // Period window for heatmap / distribution / negative-hours.
  const loadPeriod = useCallback(async () => {
    try {
      const days = period === '7d' ? 7 : 30;
      const points = await fetchTgePrices(warsawDayStartAsZ(-(days - 1)), warsawDayStartAsZ(1));
      setPeriodPoints(points);
    } catch {
      setPeriodPoints([]);
    }
  }, [period]);

  // 15-minute data for the selected day (only when 15m resolution is chosen).
  const loadFifteen = useCallback(async () => {
    if (resolution !== '15m') {
      setFifteenSel([]);
      return;
    }
    const offset = DAY_OFFSET[daySel];
    try {
      const points = await fetchTgePrices15m(warsawDayStartAsZ(offset), warsawDayStartAsZ(offset + 1));
      setFifteenSel(points);
    } catch {
      setFifteenSel([]);
    }
  }, [resolution, daySel]);

  useEffect(() => {
    if (isActive) loadHourlyDays();
  }, [isActive, loadHourlyDays]);

  useEffect(() => {
    if (isActive) loadPeriod();
  }, [isActive, loadPeriod]);

  useEffect(() => {
    if (isActive) loadFifteen();
  }, [isActive, loadFifteen]);

  const keys = useMemo(
    () => ({
      yesterday: warsawDateKey(warsawDayStartAsZ(-1)),
      today: warsawDateKey(warsawDayStartAsZ(0)),
      tomorrow: warsawDateKey(warsawDayStartAsZ(1)),
    }),
    [],
  );

  const todayPoints = useMemo(
    () => hourlyDays.filter(p => warsawDateKey(p.time) === keys.today),
    [hourlyDays, keys.today],
  );
  const tomorrowPoints = useMemo(
    () => hourlyDays.filter(p => warsawDateKey(p.time) === keys.tomorrow),
    [hourlyDays, keys.tomorrow],
  );

  const selectedKey = keys[daySel];
  const hourlySelected = useMemo(
    () => hourlyDays.filter(p => warsawDateKey(p.time) === selectedKey),
    [hourlyDays, selectedKey],
  );
  const fifteenSelected = useMemo(
    () => fifteenSel.filter(p => warsawDateKey(p.time) === selectedKey),
    [fifteenSel, selectedKey],
  );

  // 15-min view falls back to hourly when the quarter series is unavailable
  // (pre-cutover days or not-yet-published).
  const profilePoints =
    resolution === '15m' && fifteenSelected.length ? fifteenSelected : hourlySelected;
  const effectiveResolution: Resolution =
    resolution === '15m' && fifteenSelected.length ? '15m' : '1h';

  const dayLabel = warsawFullDate(warsawDayStartAsZ(DAY_OFFSET[daySel]), locale);

  return (
    <View style={styles.container}>
      <TgeHeader todayPoints={todayPoints} tomorrowPoints={tomorrowPoints} t={t} locale={locale} />

      <View style={styles.daySelector}>
        <Segmented<DaySel>
          options={[
            { value: 'yesterday', label: m.yesterday },
            { value: 'today', label: m.today },
            { value: 'tomorrow', label: m.tomorrow },
          ]}
          value={daySel}
          onChange={setDaySel}
        />
      </View>

      <SectionHeader title={m.profileTitle} icon="TrendingUp" />
      <View style={styles.toggleRow}>
        <Segmented<Resolution>
          options={[
            { value: '15m', label: m.res15m },
            { value: '1h', label: m.res1h },
          ]}
          value={resolution}
          onChange={setResolution}
          small
        />
      </View>
      <TgeProfileChart
        points={profilePoints}
        resolution={effectiveResolution}
        isToday={daySel === 'today'}
        t={t}
        loading={loadingDay}
      />

      <SectionHeader title={m.tableTitle} icon="List" />
      <TgePriceTable points={profilePoints} resolution={effectiveResolution} dayLabel={dayLabel} t={t} />

      <SectionHeader title={m.cheapestTitle} icon="TrendingDown" />
      <TgeCheapestHours points={hourlySelected} t={t} />

      <SectionHeader title={m.heatmapTitle} icon="LayoutGrid" />
      <View style={styles.toggleRow}>
        <Segmented<Period>
          options={[
            { value: '7d', label: m.period7d },
            { value: '30d', label: m.period30d },
          ]}
          value={period}
          onChange={setPeriod}
          small
        />
      </View>
      <TgeHeatmap points={periodPoints} t={t} />

      <SectionHeader title={m.distributionTitle} icon="BarChart3" />
      <TgeDistribution points={periodPoints} t={t} />

      <Text style={styles.footer}>{m.footer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  daySelector: {
    marginTop: 16,
    alignItems: 'center',
  },
  toggleRow: {
    marginBottom: 12,
  },
  footer: {
    fontSize: 11,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
});
