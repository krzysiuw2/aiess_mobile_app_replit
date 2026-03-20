import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CloudSun } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAgentState } from '@/hooks/useAgentState';
import { useAgentDecisions } from '@/hooks/useAgentDecisions';
import { useAgentForecast } from '@/hooks/useAgentForecast';
import type { StrategyChoice } from '@/types';
import { WeeklyPlanCard } from './WeeklyPlanCard';
import { PerformanceMetrics } from './PerformanceMetrics';
import { DecisionTimeline } from './DecisionTimeline';

function strategyTierLabel(
  choice: StrategyChoice | null | undefined,
  wiz: { riskAggressive: string; riskBalanced: string; riskConservative: string },
): string {
  if (choice === 'A') return wiz.riskAggressive;
  if (choice === 'C') return wiz.riskConservative;
  if (choice === 'B') return wiz.riskBalanced;
  return '—';
}

export function AiLogicView() {
  const { t } = useSettings();
  const { agentState, isLoading: stateLoading } = useAgentState();
  const { decisions, isLoading: decisionsLoading, submitComment, isSubmittingComment, submitApprove, isApproving, submitReject, isRejecting } = useAgentDecisions({ limit: 20 });
  const { forecast, selectedStrategy, isLoading: forecastLoading } = useAgentForecast();

  const isLoading = stateLoading || decisionsLoading;
  const ft = t.aiAgent.forecastCard;
  const wiz = t.aiAgent.wizard;

  const strategyReasoning =
    decisions.find((d) => d.reasoning && (d.selected_strategy != null || d.forecast != null))?.reasoning ?? null;

  const summary = forecast?.summary;
  const showForecastBlock = forecastLoading || summary != null || selectedStrategy != null || strategyReasoning != null;

  if (isLoading && !agentState && decisions.length === 0) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <WeeklyPlanCard weeklyPlan={agentState?.weekly_plan ?? null} />
      {showForecastBlock && (
        <View style={s.card}>
          <View style={s.header}>
            <CloudSun size={18} color={Colors.primary} />
            <Text style={s.title}>{ft.title}</Text>
          </View>
          {forecastLoading && !summary ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={s.muted}>{ft.loading}</Text>
            </View>
          ) : summary == null && selectedStrategy == null && !strategyReasoning ? (
            <Text style={s.placeholder}>{ft.unavailable}</Text>
          ) : (
            <View style={s.content}>
              {summary && (
                <View style={s.metricsGrid}>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>{summary.total_grid_import_kwh?.toFixed(1) ?? '—'} kWh</Text>
                    <Text style={s.metricLabel}>{ft.gridImport}</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>{summary.total_grid_export_kwh?.toFixed(1) ?? '—'} kWh</Text>
                    <Text style={s.metricLabel}>{ft.gridExport}</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>
                      {summary.self_consumption_pct != null ? `${summary.self_consumption_pct.toFixed(0)}%` : '—'}
                    </Text>
                    <Text style={s.metricLabel}>{ft.selfConsumption}</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricValue}>
                      {summary.estimated_savings_pln != null ? `${summary.estimated_savings_pln.toFixed(1)} PLN` : '—'}
                    </Text>
                    <Text style={s.metricLabel}>{ft.estSavings}</Text>
                  </View>
                </View>
              )}
              {(selectedStrategy != null || strategyReasoning) && (
                <View style={s.strategyBox}>
                  {selectedStrategy != null && (
                    <>
                      <Text style={s.strategyLabel}>{ft.strategyTitle}</Text>
                      <Text style={s.strategyValue}>
                        {selectedStrategy} — {strategyTierLabel(selectedStrategy, wiz)}
                      </Text>
                    </>
                  )}
                  {strategyReasoning && (
                    <>
                      <Text style={[s.strategyLabel, selectedStrategy != null && { marginTop: 10 }]}>{ft.strategyWhy}</Text>
                      <Text style={s.reasoningText}>{strategyReasoning}</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
      <PerformanceMetrics performance={agentState?.performance_30d ?? null} decisions={decisions} />
      <DecisionTimeline
        decisions={decisions}
        onSubmitComment={submitComment}
        isSubmittingComment={isSubmittingComment}
        onApprove={submitApprove}
        isApproving={isApproving}
        onReject={submitReject}
        isRejecting={isRejecting}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 16, paddingBottom: 16 },
  loadingContainer: { paddingVertical: 60, alignItems: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  placeholder: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { fontSize: 13, color: Colors.textSecondary },
  content: { gap: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '47%', backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  metricValue: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  metricLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  strategyBox: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  strategyLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  strategyValue: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 4 },
  reasoningText: { fontSize: 13, color: Colors.text, lineHeight: 18, marginTop: 4 },
});
