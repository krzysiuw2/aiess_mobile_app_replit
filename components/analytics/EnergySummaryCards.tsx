import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';
import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { EnergyStats } from '@/lib/influxdb';

interface EnergySummaryCardsProps {
  stats: EnergyStats;
}

export function EnergySummaryCards({ stats }: EnergySummaryCardsProps) {
  const { t } = useSettings();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.grid.line }]}>
          <Text style={styles.value}>{stats.gridImport} kWh</Text>
          <Text style={styles.label}>{t.analytics.gridImport}</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.grid.export }]}>
          <Text style={styles.value}>{stats.gridExport} kWh</Text>
          <Text style={styles.label}>{t.analytics.gridExport}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.battery.line }]}>
          <Text style={styles.value}>{stats.charged} kWh</Text>
          <Text style={styles.label}>{t.analytics.charged}</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.battery.discharge }]}>
          <Text style={styles.value}>{stats.discharged} kWh</Text>
          <Text style={styles.label}>{t.analytics.discharged}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.pv.production }]}>
          <Text style={styles.value}>{stats.pvProduction} kWh</Text>
          <Text style={styles.label}>{t.analytics.pvProduction}</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: CHART_COLORS.soc.line }]}>
          <Text style={styles.value}>{stats.avgSoc}%</Text>
          <Text style={styles.label}>{t.analytics.avgSoc}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});





