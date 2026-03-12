import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Colors from '@/constants/colors';
import { SimulationDataPoint } from '@/types';
import { SectionHeader } from './SectionHeader';
import { ForecastChart } from './ForecastChart';
import { ForecastAccuracyChart } from './ForecastAccuracyChart';
import { ForecastSummaryCards } from './ForecastSummaryCards';
import { WeatherForecastSection } from './WeatherForecastSection';
import type { TranslationKeys } from '@/locales';

type ForecastRange = '48h' | '7d';
type ForecastField = 'pvForecast' | 'loadForecast' | 'irradiance' | 'surplus';

interface ForecastViewProps {
  simData: SimulationDataPoint[];
  deviceId: string | undefined;
  loading: boolean;
  t: TranslationKeys;
}

export function ForecastView({ simData, deviceId, loading, t }: ForecastViewProps) {
  const ft = t.analytics.forecastTab;
  const [forecastRange, setForecastRange] = useState<ForecastRange>('48h');
  const [visibleFields, setVisibleFields] = useState<Record<ForecastField, boolean>>({
    pvForecast: true,
    loadForecast: true,
    surplus: true,
    irradiance: true,
  });

  const toggleField = (field: ForecastField) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const forecastData = useMemo(() => {
    return simData.filter(p => p.source === 'forecast');
  }, [simData]);

  return (
    <View>
      {/* Time Range Selector */}
      <View style={styles.rangeSelector}>
        {(['48h', '7d'] as ForecastRange[]).map(range => (
          <TouchableOpacity
            key={range}
            style={[
              styles.rangeButton,
              forecastRange === range && styles.rangeButtonActive,
            ]}
            onPress={() => setForecastRange(range)}
          >
            <Text style={[
              styles.rangeText,
              forecastRange === range && styles.rangeTextActive,
            ]}>
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PV & Load Forecast Chart */}
      <SectionHeader title={ft.pvAndLoadForecast} icon="Sun" />
      <ForecastChart
        data={simData}
        forecastRange={forecastRange}
        visibleFields={visibleFields}
        onToggleField={toggleField}
        loading={loading}
        t={t}
      />

      {/* Forecast vs Actual */}
      <SectionHeader title={ft.forecastAccuracy} icon="Target" />
      <ForecastAccuracyChart
        simData={simData}
        deviceId={deviceId}
        t={t}
      />

      {/* Daily Summary Cards */}
      <SectionHeader title={ft.dailySummary} icon="Calendar" />
      <ForecastSummaryCards
        data={simData}
        forecastRange={forecastRange}
        t={t}
      />

      {/* Weather Forecast */}
      <SectionHeader title={ft.weatherForecast} icon="CloudSun" />
      <WeatherForecastSection
        data={simData}
        forecastRange={forecastRange}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: Colors.primary,
  },
  rangeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  rangeTextActive: {
    color: '#fff',
  },
});
