import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Clock, ChevronDown, ChevronUp, MessageSquare, Send, BrainCircuit, CalendarDays, Zap, Check, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import type { AgentDecision, AgentType, StrategyChoice, ValidationStatus, StrategyForecast } from '@/types';

interface DecisionTimelineProps {
  decisions: AgentDecision[];
  onSubmitComment: (decisionSK: string, comment: string) => Promise<void>;
  isSubmittingComment: boolean;
  onApprove?: (decisionSK: string, selectedRuleIds?: string[]) => Promise<unknown>;
  onReject?: (decisionSK: string, reason?: string) => Promise<unknown>;
  isApproving?: boolean;
  isRejecting?: boolean;
}

const AGENT_ICONS: Record<AgentType, typeof BrainCircuit> = {
  weekly: CalendarDays,
  daily: BrainCircuit,
  intraday: Zap,
};

const STATUS_COLORS: Record<string, string> = {
  applied: '#059669',
  pending_approval: '#D97706',
  approved: '#059669',
  rejected: '#DC2626',
  rolled_back: '#DC2626',
};

const VALIDATION_COLORS: Record<ValidationStatus, string> = {
  ok: '#059669',
  warning: '#CA8A04',
  error: '#DC2626',
};

function formatEngineStrategyName(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function strategyTierLabel(choice: StrategyChoice | undefined, wiz: { riskAggressive: string; riskBalanced: string; riskConservative: string }): string {
  if (choice === 'A') return wiz.riskAggressive;
  if (choice === 'C') return wiz.riskConservative;
  return wiz.riskBalanced;
}

function interpolateForecastSummary(template: string, savings: string, pct: string) {
  return template.replace('{{savings}}', savings).replace('{{pct}}', pct);
}

function forecastDecisionSummaryLine(forecast: StrategyForecast | undefined, template: string): string | null {
  if (!forecast?.summary) return null;
  const { estimated_savings_pln, self_consumption_pct } = forecast.summary;
  if (estimated_savings_pln == null && self_consumption_pct == null) return null;
  return interpolateForecastSummary(
    template,
    (estimated_savings_pln ?? 0).toFixed(1),
    (self_consumption_pct ?? 0).toFixed(0),
  );
}

export function DecisionTimeline({ decisions, onSubmitComment, isSubmittingComment, onApprove, onReject, isApproving, isRejecting }: DecisionTimelineProps) {
  const { t } = useSettings();
  const dt = t.aiAgent.decisions;
  const wiz = t.aiAgent.wizard;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentingSK, setCommentingSK] = useState<string | null>(null);
  const [actionSK, setActionSK] = useState<string | null>(null);

  const handleApprove = async (sk: string) => {
    if (!onApprove) return;
    setActionSK(sk);
    try {
      await onApprove(sk);
      Alert.alert(t.common.success, dt.approveSuccess ?? 'Rules applied successfully');
    } catch {
      Alert.alert(t.common.error, dt.approveFailed ?? 'Failed to apply rules');
    } finally {
      setActionSK(null);
    }
  };

  const handleReject = async (sk: string) => {
    if (!onReject) return;
    Alert.alert(
      dt.rejectConfirmTitle ?? 'Reject Schedule',
      dt.rejectConfirmMsg ?? 'Are you sure you want to reject this schedule?',
      [
        { text: t.common.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: dt.rejectConfirm ?? 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActionSK(sk);
            try {
              await onReject(sk);
            } catch {
              Alert.alert(t.common.error, dt.rejectFailed ?? 'Failed to reject');
            } finally {
              setActionSK(null);
            }
          },
        },
      ],
    );
  };

  const handleSubmitComment = async (sk: string) => {
    if (!commentText.trim()) return;
    await onSubmitComment(sk, commentText.trim());
    setCommentText('');
    setCommentingSK(null);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
  };

  const getAgentLabel = (type: AgentType) => dt[type] || type;
  const forecastSummaryTemplate =
    typeof dt.forecastSummary === 'string'
      ? dt.forecastSummary
      : 'Est. savings: {{savings}} PLN, Self-consumption: {{pct}}%';

  if (decisions.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.header}>
          <Clock size={18} color={Colors.primary} />
          <Text style={s.title}>{dt.title}</Text>
        </View>
        <Text style={s.placeholder}>{dt.noDecisions}</Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Clock size={18} color={Colors.primary} />
        <Text style={s.title}>{dt.title}</Text>
      </View>

      {decisions.map((d) => {
        const isExpanded = expandedId === d.SK;
        const Icon = AGENT_ICONS[d.agent_type] || BrainCircuit;
        const statusColor = STATUS_COLORS[d.status] || Colors.textSecondary;
        const decisionForecastLine = forecastDecisionSummaryLine(d.forecast, forecastSummaryTemplate);

        return (
          <TouchableOpacity
            key={d.SK}
            style={s.decisionItem}
            onPress={() => setExpandedId(isExpanded ? null : d.SK)}
            activeOpacity={0.7}
          >
            <View style={s.decisionHeader}>
              <View style={[s.iconCircle, { backgroundColor: statusColor + '15' }]}>
                <Icon size={14} color={statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.agentLabel}>{getAgentLabel(d.agent_type)}</Text>
                <Text style={s.timestamp}>{formatTime(d.timestamp)}</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: statusColor + '15' }]}>
                <Text style={[s.statusText, { color: statusColor }]}>
                  {dt[`status_${d.status}` as keyof typeof dt] || d.status}
                </Text>
              </View>
              {d.validation_status && (
                <View style={[s.validationDot, { backgroundColor: VALIDATION_COLORS[d.validation_status] }]} />
              )}
              {isExpanded ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
            </View>

            {isExpanded && (
              <View style={s.expandedContent}>
                {d.selected_strategy && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>{dt.strategy}</Text>
                    <Text style={s.strategyTitle}>
                      {d.selected_strategy} — {formatEngineStrategyName(d.forecast?.strategy) ?? strategyTierLabel(d.selected_strategy, wiz)}
                    </Text>
                    <Text style={s.strategyRisk}>
                      {dt.riskLevel}: {strategyTierLabel(d.selected_strategy, wiz)}
                    </Text>
                    {d.strategy_adjustments && Object.keys(d.strategy_adjustments).length > 0 && (
                      <Text style={s.adjustmentsText}>
                        {Object.entries(d.strategy_adjustments)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </Text>
                    )}
                  </View>
                )}

                {(d.validation_status || d.fallback_used) && (
                  <View style={s.metaRow}>
                    {d.validation_status && (
                      <View style={[s.pill, { backgroundColor: VALIDATION_COLORS[d.validation_status] + '18' }]}>
                        <Text style={[s.pillText, { color: VALIDATION_COLORS[d.validation_status] }]}>
                          {dt.validation}: {dt[`validation_${d.validation_status}` as keyof typeof dt] ?? d.validation_status}
                        </Text>
                      </View>
                    )}
                    {d.fallback_used && (
                      <View style={[s.pill, { backgroundColor: '#E0E7FF' }]}>
                        <Text style={[s.pillText, { color: '#4338CA' }]}>{dt.fallbackUsed}</Text>
                      </View>
                    )}
                  </View>
                )}

                {decisionForecastLine ? <Text style={s.forecastLine}>{decisionForecastLine}</Text> : null}

                {d.reasoning && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>{dt.reasoning}</Text>
                    <Text style={s.reasoningText}>{d.reasoning}</Text>
                  </View>
                )}

                {!d.selected_strategy && d.rules_created?.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>{dt.rulesCreated}</Text>
                    {d.rules_created.map((r, i) => (
                      <View key={i} style={s.ruleChip}>
                        <Text style={s.ruleText}>P{r.priority} {r.action} {r.time_window || ''}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {!d.selected_strategy && d.rules_modified?.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>{dt.rulesModified ?? 'Rules Modified'}</Text>
                    {d.rules_modified.map((r, i) => (
                      <View key={i} style={[s.ruleChip, { backgroundColor: '#FFF7ED' }]}>
                        <Text style={[s.ruleText, { color: '#92400E' }]}>
                          {r.id} {r.change ? `— ${r.change}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!d.selected_strategy && d.rules_deleted?.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>{dt.rulesDeleted ?? 'Rules Deleted'}</Text>
                    {d.rules_deleted.map((id, i) => (
                      <View key={i} style={[s.ruleChip, { backgroundColor: '#FEF2F2' }]}>
                        <Text style={[s.ruleText, { color: '#991B1B', textDecorationLine: 'line-through' }]}>{id}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {d.status === 'pending_approval' && onApprove && onReject && (
                  <View style={s.approvalRow}>
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => handleApprove(d.SK)}
                      disabled={!!actionSK}
                      activeOpacity={0.7}
                    >
                      {isApproving && actionSK === d.SK ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Check size={16} color="#fff" />
                          <Text style={s.approveBtnText}>{dt.approve ?? 'Apply Rules'}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => handleReject(d.SK)}
                      disabled={!!actionSK}
                      activeOpacity={0.7}
                    >
                      {isRejecting && actionSK === d.SK ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <>
                          <X size={16} color="#DC2626" />
                          <Text style={s.rejectBtnText}>{dt.reject ?? 'Reject'}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {d.predicted_outcome?.total_savings_pln != null && (
                  <View style={s.savingsRow}>
                    <View style={s.savingsCol}>
                      <Text style={s.savingsLabel}>{dt.predictedSavings}</Text>
                      <Text style={s.savingsValue}>{d.predicted_outcome.total_savings_pln?.toFixed(1)} PLN</Text>
                    </View>
                    {d.actual_outcome?.total_savings_pln != null && (
                      <View style={s.savingsCol}>
                        <Text style={s.savingsLabel}>{dt.actualSavings}</Text>
                        <Text style={s.savingsValue}>{d.actual_outcome.total_savings_pln?.toFixed(1)} PLN</Text>
                      </View>
                    )}
                  </View>
                )}

                {d.customer_comments?.map((c, i) => (
                  <View key={i} style={s.commentBubble}>
                    <MessageSquare size={12} color={Colors.textSecondary} />
                    <Text style={s.commentText}>{c.text}</Text>
                  </View>
                ))}

                {commentingSK === d.SK ? (
                  <View style={s.commentInput}>
                    <TextInput
                      style={s.commentField}
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder={dt.addComment}
                      placeholderTextColor={Colors.textSecondary}
                      multiline
                    />
                    <TouchableOpacity
                      style={s.sendBtn}
                      onPress={() => handleSubmitComment(d.SK)}
                      disabled={isSubmittingComment || !commentText.trim()}
                    >
                      {isSubmittingComment ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Send size={16} color={commentText.trim() ? Colors.primary : Colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.addCommentBtn}
                    onPress={() => { setCommentingSK(d.SK); setCommentText(''); }}
                  >
                    <MessageSquare size={14} color={Colors.primary} />
                    <Text style={s.addCommentText}>{dt.addComment}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  placeholder: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  decisionItem: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginTop: 4 },
  decisionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  agentLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  timestamp: { fontSize: 11, color: Colors.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  validationDot: { width: 8, height: 8, borderRadius: 4 },
  expandedContent: { marginTop: 12, gap: 10, paddingLeft: 42 },
  section: { gap: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasoningText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  strategyTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  strategyRisk: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  adjustmentsText: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontFamily: 'monospace' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  forecastLine: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  ruleChip: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 2 },
  ruleText: { fontSize: 12, color: Colors.text, fontFamily: 'monospace' },
  savingsRow: { flexDirection: 'row', gap: 12 },
  savingsCol: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, padding: 10 },
  savingsLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, marginBottom: 2 },
  savingsValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  commentBubble: { flexDirection: 'row', gap: 8, backgroundColor: '#F0F9FF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  commentText: { fontSize: 12, color: '#0C4A6E', flex: 1, lineHeight: 17 },
  commentInput: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  commentField: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: Colors.text, borderWidth: 1, borderColor: Colors.border, maxHeight: 80 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  addCommentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addCommentText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
  approvalRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 10 },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#FECACA' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});
