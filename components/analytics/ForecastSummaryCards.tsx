import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import { SimulationDataPoint } from '@/types';
import { getWeatherIcon } from '@/lib/weather-codes';
import type { TranslationKeys } from '@/locales';

interface ForecastSummaryCardsProps {
  data: SimulationDataPoint[];
  forecastRange: '48h' | '7d';
  t: TranslationKeys;
}

interface DaySummary {
  date: Date;
  pvYieldKwh: number;
  peakPvKw: number;
  avgLoadKw: number;
  surplusKwh: number;
  selfSufficiency: number;
  tempMin: number;
  tempMax: number;
  dominantWeatherCode: number;
}

export function ForecastSummaryCards({ data, forecastRange, t }: ForecastSummaryCardsProps) {
  const ft = t.analytics.forecastTab;

  const days = useMemo((): DaySummary[] => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayCount = forecastRange === '48h' ? 3 : 7;

    const result: DaySummary[] = [];

    for (let d = 0; d < dayCount; d++) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() + d);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayEnd.getTime();

      const dayPoints = data.filter(p => {
        const ts = p.time?.getTime?.();
        return ts && ts >= dayStartMs && ts < dayEndMs && p.source === 'forecast';
      });

      if (dayPoints.length === 0) {
        result.push({
          date: dayStart,
          pvYieldKwh: 0,
          peakPvKw: 0,
          avgLoadKw: 0,
          surplusKwh: 0,
          selfSufficiency: 0,
          tempMin: 0,
          tempMax: 0,
          dominantWeatherCode: 0,
        });
        continue;
      }

      let pvSum = 0;
      let peakPv = 0;
      let loadSum = 0;
      let surplusSum = 0;
      let tempMin = Infinity;
      let tempMax = -Infinity;
      const weatherCodes: number[] = [];

      for (const p of dayPoints) {
        pvSum += p.pvForecast || 0;
        if ((p.pvForecast || 0) > peakPv) peakPv = p.pvForecast || 0;
        loadSum += p.loadForecast || 0;
        surplusSum += p.energyBalance || ((p.pvForecast || 0) - (p.loadForecast || 0));
        if (p.weatherTemp < tempMin) tempMin = p.weatherTemp;
        if (p.weatherTemp > tempMax) tempMax = p.weatherTemp;
        weatherCodes.push(p.weatherCode);
      }

      // Dominant weather code (most frequent during daytime: codes with GTI > 0)
      const dayTimeCodes = dayPoints
        .filter(p => p.weatherGti > 10)
        .map(p => p.weatherCode);
      const codeFreq = new Map<number, number>();
      for (const c of (dayTimeCodes.length > 0 ? dayTimeCodes : weatherCodes)) {
        codeFreq.set(c, (codeFreq.get(c) || 0) + 1);
      }
      let dominantCode = 0;
      let maxFreq = 0;
      for (const [code, freq] of codeFreq) {
        if (freq > maxFreq) { maxFreq = freq; dominantCode = code; }
      }

      const pvYieldKwh = pvSum;
      const loadTotalKwh = loadSum;
      const selfSuff = loadTotalKwh > 0 ? Math.min(100, (pvYieldKwh / loadTotalKwh) * 100) : 0;

      result.push({
        date: dayStart,
        pvYieldKwh,
        peakPvKw: peakPv,
        avgLoadKw: dayPoints.length > 0 ? loadSum / dayPoints.length : 0,
        surplusKwh: surplusSum,
        selfSufficiency: selfSuff,
        tempMin: tempMin === Infinity ? 0 : tempMin,
        tempMax: tempMax === -Infinity ? 0 : tempMax,
        dominantWeatherCode: dominantCode,
      });
    }

    return result;
  }, [data, forecastRange]);

  if (days.length === 0 || days.every(d => d.pvYieldKwh === 0 && d.avgLoadKw === 0)) {
    return null;
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {days.map((day, i) => {
        const isToday = i === 0;
        const dayName = isToday ? 'Today' : dayNames[day.date.getDay()];
        const dateStr = `${day.date.getDate()}/${day.date.getMonth() + 1}`;

        return (
          <View key={i} style={[styles.card, isToday && styles.cardToday]}>
            <Text style={styles.cardDayName}>{dayName}</Text>
            <Text style={styles.cardDate}>{dateStr}</Text>
            <Text style={styles.weatherIcon}>{getWeatherIcon(day.dominantWeatherCode)}</Text>
            <Text style={styles.tempRange}>
              {`${day.tempMin.toFixed(0)}° / ${day.tempMax.toFixed(0)}°`}
            </Text>

            <View style={styles.divider} />

            <View style={styles.statRow}>
              <View style={[styles.statDot, { backgroundColor: CHART_COLORS.forecast.pv }]} />
              <Text style={styles.statLabel}>{ft.pvYield}</Text>
            </View>
            <Text style={styles.statValue}>{`${day.pvYieldKwh.toFixed(0)} kWh`}</Text>

            <View style={styles.statRow}>
              <View style={[styles.statDot, { backgroundColor: CHART_COLORS.forecast.pv }]} />
              <Text style={styles.statLabel}>{ft.peakPv}</Text>
            </View>
            <Text style={styles.statValue}>{`${day.peakPvKw.toFixed(1)} kW`}</Text>

            <View style={styles.statRow}>
              <View style={[styles.statDot, { backgroundColor: CHART_COLORS.forecast.load }]} />
              <Text style={styles.statLabel}>{ft.avgLoad}</Text>
            </View>
            <Text style={styles.statValue}>{`${day.avgLoadKw.toFixed(1)} kW`}</Text>

            <View style={styles.divider} />

            <Text style={styles.suffLabel}>
              {day.surplusKwh >= 0 ? ft.surplus : ft.deficit}
            </Text>
            <Text style={[
              styles.surplusValue,
              { color: day.surplusKwh >= 0 ? CHART_COLORS.success : CHART_COLORS.error },
            ]}>
              {`${day.surplusKwh >= 0 ? '+' : ''}${day.surplusKwh.toFixed(0)} kWh`}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.suffLabel}>{ft.selfSufficiency}</Text>
            <Text style={[
              styles.suffValue,
              { color: day.selfSufficiency >= 80 ? CHART_COLORS.success : day.selfSufficiency >= 40 ? CHART_COLORS.warning : CHART_COLORS.error },
            ]}>
              {`${day.selfSufficiency.toFixed(0)}%`}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingVertical: 4,
    gap: 10,
  },
  card: {
    width: 130,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cardToday: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  cardDayName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cardDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  weatherIcon: {
    fontSize: 28,
    marginVertical: 4,
  },
  tempRange: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  surplusValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 2,
  },
  suffLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  suffValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
});
