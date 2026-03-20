import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, BarChart3, RotateCcw, Crosshair } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import type { AgentPerformance30d } from '@/types/ai-agent';

interface PerformanceMetricsProps {
  performance: AgentPerformance30d | null;
}

export function PerformanceMetrics({ performance }: PerformanceMetricsProps) {
  const { t } = useSettings();
  const pt = t.aiAgent.performance;

  const p = performance ?? {
    total_savings_pln: 0,
    avg_daily_savings_pln: 0,
    decisions_count: 0,
    rollbacks_count: 0,
    forecast_accuracy_pv: 0,
    forecast_accuracy_load: 0,
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <TrendingUp size={18} color={Colors.primary} />
        <Text style={s.title}>{pt.title}</Text>
      </View>

      <View style={s.grid}>
        <View style={s.metric}>
          <Text style={s.metricValue}>{p.total_savings_pln.toFixed(0)} PLN</Text>
          <Text style={s.metricLabel}>{pt.totalSavings}</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricValue}>{p.avg_daily_savings_pln.toFixed(0)} PLN</Text>
          <Text style={s.metricLabel}>{pt.avgDaily}</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricValue}>{p.decisions_count}</Text>
          <Text style={s.metricLabel}>{pt.decisions}</Text>
        </View>
        <View style={s.metric}>
          <Text style={[s.metricValue, p.rollbacks_count > 0 && { color: Colors.danger }]}>
            {p.rollbacks_count}
          </Text>
          <Text style={s.metricLabel}>{pt.rollbacks}</Text>
        </View>
      </View>

      {(p.forecast_accuracy_pv > 0 || p.forecast_accuracy_load > 0) && (
        <View style={s.accuracyRow}>
          <Crosshair size={14} color={Colors.textSecondary} />
          <Text style={s.accuracyLabel}>{pt.forecastAccuracy}:</Text>
          <Text style={s.accuracyValue}>{pt.pv} {p.forecast_accuracy_pv.toFixed(0)}%</Text>
          <Text style={s.accuracySep}>|</Text>
          <Text style={s.accuracyValue}>{pt.load} {p.forecast_accuracy_load.toFixed(0)}%</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '47%', backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  metricValue: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  metricLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  accuracyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  accuracyLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  accuracyValue: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  accuracySep: { fontSize: 12, color: Colors.border },
});
