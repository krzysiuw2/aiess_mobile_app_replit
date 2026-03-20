import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAgentState } from '@/hooks/useAgentState';
import { useAgentDecisions } from '@/hooks/useAgentDecisions';
import { WeeklyPlanCard } from './WeeklyPlanCard';
import { PerformanceMetrics } from './PerformanceMetrics';
import { DecisionTimeline } from './DecisionTimeline';

export function AiLogicView() {
  const { t } = useSettings();
  const { agentState, isLoading: stateLoading, refetch: refetchState } = useAgentState();
  const { decisions, isLoading: decisionsLoading, refetch: refetchDecisions, submitComment, isSubmittingComment, submitApprove, isApproving, submitReject, isRejecting } = useAgentDecisions({ limit: 20 });

  const isLoading = stateLoading || decisionsLoading;

  const handleRefresh = async () => {
    await Promise.all([refetchState(), refetchDecisions()]);
  };

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
      <PerformanceMetrics performance={agentState?.performance_30d ?? null} />
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
});
