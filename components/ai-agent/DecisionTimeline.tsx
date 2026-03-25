import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import {
  Clock, ChevronDown, ChevronUp, MessageSquare, Send, BrainCircuit,
  CalendarDays, Zap, Check, X, BatteryCharging, ArrowDown, Shield,
  Plug, Eye, EyeOff, GitCompare, AlertTriangle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import type {
  AgentDecision, AgentType, StrategyChoice, ValidationStatus,
  StrategyForecast, StrategySummary, ProposedSch, ScheduleRule,
} from '@/types';
import { StrategyComparisonModal } from './StrategyComparisonModal';

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

const PRIORITY_COLORS: Record<number, string> = {
  5: '#6B7280',
  6: '#6B7280',
  7: '#2563EB',
  8: '#EA580C',
};

const ACTION_ICONS: Record<string, typeof BrainCircuit> = {
  ch: BatteryCharging,
  dis: ArrowDown,
  ct: BatteryCharging,
  dt: ArrowDown,
  sb: Shield,
  sl: Plug,
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  ch: 'actionCharge',
  dis: 'actionDischarge',
  ct: 'actionChargeToTarget',
  dt: 'actionDischargeToTarget',
  sb: 'actionStandby',
  sl: 'actionSiteLimit',
};

const GRID_OP_SYMBOLS: Record<string, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  eq: '=',
  bt: '↔',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatEngineStrategyName(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function strategyTierLabel(
  choice: StrategyChoice | undefined,
  wiz: { riskAggressive: string; riskBalanced: string; riskConservative: string },
): string {
  if (choice === 'A') return wiz.riskAggressive;
  if (choice === 'C') return wiz.riskConservative;
  return wiz.riskBalanced;
}

function interpolateForecastSummary(template: string, savings: string, pct: string) {
  return template.replace('{{savings}}', savings).replace('{{pct}}', pct);
}

function forecastDecisionSummaryLine(
  forecast: StrategyForecast | undefined,
  template: string,
): string | null {
  if (!forecast?.summary) return null;
  const { estimated_savings_pln, self_consumption_pct } = forecast.summary;
  if (estimated_savings_pln == null && self_consumption_pct == null) return null;
  return interpolateForecastSummary(
    template,
    (estimated_savings_pln ?? 0).toFixed(1),
    (self_consumption_pct ?? 0).toFixed(0),
  );
}

function collectRulesFromSch(sch?: ProposedSch): { priority: number; rule: ScheduleRule }[] {
  if (!sch) return [];
  const entries: { priority: number; rule: ScheduleRule }[] = [];
  const keys = ['p_5', 'p_6', 'p_7', 'p_8'] as const;
  for (const key of keys) {
    const p = parseInt(key.split('_')[1], 10);
    const rules = sch[key];
    if (Array.isArray(rules)) {
      for (const rule of rules) {
        entries.push({ priority: p, rule });
      }
    }
  }
  return entries;
}

function formatTimeWindow(ts?: string, te?: string, allDayLabel?: string): string {
  if (!ts && !te) return allDayLabel ?? 'All Day';
  return `${ts ?? '00:00'} – ${te ?? '24:00'}`;
}

function formatDays(days: number[] | undefined, everydayLabel: string): string {
  if (!days || days.length === 0 || days.length === 7) return everydayLabel;
  return days.map((d) => DAY_NAMES[d] ?? String(d)).join(', ');
}

function formatGridTrigger(
  gop?: string,
  gpv?: number,
  gpv2?: number,
): string | null {
  if (!gop || gpv == null) return null;
  const sym = GRID_OP_SYMBOLS[gop] ?? gop;
  if (gop === 'bt' && gpv2 != null) return `${gpv} – ${gpv2} kW`;
  return `${sym} ${gpv} kW`;
}

export function DecisionTimeline({
  decisions,
  onSubmitComment,
  isSubmittingComment,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: DecisionTimelineProps) {
  const { t } = useSettings();
  const dt = t.aiAgent.decisions;
  const wiz = t.aiAgent.wizard;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentingSK, setCommentingSK] = useState<string | null>(null);
  const [actionSK, setActionSK] = useState<string | null>(null);
  const [rulesVisibleFor, setRulesVisibleFor] = useState<Set<string>>(new Set());
  const [compareModalSK, setCompareModalSK] = useState<string | null>(null);
  const [rejectingSK, setRejectingSK] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const toggleRules = (sk: string) => {
    setRulesVisibleFor((prev) => {
      const next = new Set(prev);
      if (next.has(sk)) next.delete(sk);
      else next.add(sk);
      return next;
    });
  };

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

  const handleRejectWithReason = async (sk: string) => {
    if (!onReject) return;
    setActionSK(sk);
    try {
      await onReject(sk, rejectReason.trim() || undefined);
    } catch {
      Alert.alert(t.common.error, dt.rejectFailed ?? 'Failed to reject');
    } finally {
      setActionSK(null);
      setRejectingSK(null);
      setRejectReason('');
    }
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

  const getActionLabel = (actionType: string): string => {
    const key = ACTION_LABEL_KEYS[actionType];
    return key ? ((dt as Record<string, string>)[key] ?? actionType) : actionType;
  };

  const compareDecision = useMemo(() => {
    if (!compareModalSK) return null;
    return decisions.find((d) => d.SK === compareModalSK) ?? null;
  }, [compareModalSK, decisions]);

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

  const renderRuleCard = (priority: number, rule: ScheduleRule, index: number) => {
    const actionType = rule.a?.t ?? '';
    const ActionIcon = ACTION_ICONS[actionType] ?? Zap;
    const priorityColor = PRIORITY_COLORS[priority] ?? '#6B7280';
    const timeWindow = formatTimeWindow(rule.c?.ts, rule.c?.te, dt.allDay);
    const days = formatDays(rule.c?.d, dt.everyday);
    const hasSocRange = rule.c?.smin != null || rule.c?.smax != null;
    const gridTrigger = formatGridTrigger(rule.c?.gop, rule.c?.gpv, rule.c?.gpv2);
    const vuMs = typeof rule.vu === 'number' && rule.vu < 1e12 ? rule.vu * 1000 : rule.vu;
    const validUntil = vuMs
      ? new Date(vuMs).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return (
      <View key={rule.id ?? `rule-${priority}-${index}`} style={s.ruleCard}>
        <View style={s.ruleCardHeader}>
          <View style={[s.priorityBadge, { backgroundColor: priorityColor + '18' }]}>
            <Text style={[s.priorityBadgeText, { color: priorityColor }]}>P{priority}</Text>
          </View>
          <ActionIcon size={16} color={Colors.text} />
          <Text style={s.ruleActionLabel} numberOfLines={1}>
            {getActionLabel(actionType)}
          </Text>
          {rule.a?.p != null && (
            <Text style={s.ruleMetaInline}>{rule.a.p} kW</Text>
          )}
          {rule.a?.soc != null && (
            <Text style={s.ruleMetaInline}>SoC {rule.a.soc}%</Text>
          )}
        </View>

        <View style={s.ruleMetaGrid}>
          <View style={s.ruleMetaItem}>
            <Text style={s.ruleMetaLabel}>{dt.ruleTimeWindow}</Text>
            <Text style={s.ruleMetaValue}>{timeWindow}</Text>
          </View>
          <View style={s.ruleMetaItem}>
            <Text style={s.ruleMetaLabel}>{dt.ruleDays}</Text>
            <Text style={s.ruleMetaValue}>{days}</Text>
          </View>
          {hasSocRange && (
            <View style={s.ruleMetaItem}>
              <Text style={s.ruleMetaLabel}>{dt.ruleSocRange}</Text>
              <Text style={s.ruleMetaValue}>
                {rule.c?.smin ?? 0}% – {rule.c?.smax ?? 100}%
              </Text>
            </View>
          )}
          {gridTrigger && (
            <View style={s.ruleMetaItem}>
              <Text style={s.ruleMetaLabel}>{dt.ruleGridTrigger}</Text>
              <Text style={s.ruleMetaValue}>{gridTrigger}</Text>
            </View>
          )}
          {validUntil && (
            <View style={s.ruleMetaItem}>
              <Text style={s.ruleMetaLabel}>{dt.ruleValidUntil}</Text>
              <Text style={s.ruleMetaValue}>{validUntil}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderCommentSection = (d: AgentDecision) => (
    <>
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
              <Send
                size={16}
                color={commentText.trim() ? Colors.primary : Colors.textSecondary}
              />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={s.addCommentBtn}
          onPress={() => {
            setCommentingSK(d.SK);
            setCommentText('');
          }}
        >
          <MessageSquare size={14} color={Colors.primary} />
          <Text style={s.addCommentText}>{dt.addComment}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderPendingDecision = (d: AgentDecision) => {
    const isExpanded = expandedId === d.SK;
    const Icon = AGENT_ICONS[d.agent_type] || BrainCircuit;
    const statusColor = STATUS_COLORS[d.status] || Colors.textSecondary;
    const decisionForecastLine = forecastDecisionSummaryLine(d.forecast, forecastSummaryTemplate);
    const selectedSummary = d.all_strategy_summaries?.find(
      (ss) => ss.letter === d.selected_strategy,
    );
    const allRules = collectRulesFromSch(d.proposed_sch);
    const rulesVisible = rulesVisibleFor.has(d.SK);
    const isRejectingThis = rejectingSK === d.SK;

    return (
      <View key={d.SK} style={s.pendingDecisionItem}>
        <TouchableOpacity
          style={s.decisionHeader}
          onPress={() => setExpandedId(isExpanded ? null : d.SK)}
          activeOpacity={0.7}
        >
          <View style={[s.iconCircle, { backgroundColor: statusColor + '15' }]}>
            <Icon size={14} color={statusColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.agentLabel}>{getAgentLabel(d.agent_type)}</Text>
            <Text style={s.timestamp}>{formatTime(d.timestamp)}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <Text style={[s.statusText, { color: statusColor }]}>
              {(dt as Record<string, string>)[`status_${d.status}`] || d.status}
            </Text>
          </View>
          {isExpanded ? (
            <ChevronUp size={16} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={16} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>

        {selectedSummary && (
          <View style={s.strategySummaryCard}>
            <View style={s.stratSummaryTop}>
              <Text style={s.stratLetter}>{selectedSummary.letter}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.stratSummaryLabel}>{dt.proposedStrategy}</Text>
                <Text style={s.stratName} numberOfLines={2}>
                  {selectedSummary.name ||
                    formatEngineStrategyName(d.forecast?.strategy) ||
                    strategyTierLabel(d.selected_strategy, wiz)}
                </Text>
              </View>
              {selectedSummary.simulation_valid != null && (
                <View
                  style={[
                    s.simBadge,
                    {
                      backgroundColor: selectedSummary.simulation_valid
                        ? '#ECFDF5'
                        : '#FEF2F2',
                    },
                  ]}
                >
                  {selectedSummary.simulation_valid ? (
                    <Check size={12} color="#059669" />
                  ) : (
                    <AlertTriangle size={12} color="#DC2626" />
                  )}
                  <Text
                    style={[
                      s.simBadgeText,
                      {
                        color: selectedSummary.simulation_valid ? '#059669' : '#DC2626',
                      },
                    ]}
                  >
                    {selectedSummary.simulation_valid
                      ? dt.simulationValid
                      : dt.simulationInvalid}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.metricsRow}>
              {selectedSummary.estimated_savings_pln != null && (
                <View style={s.metricBox}>
                  <View style={s.metricValueRow}>
                    <Text style={s.metricNumber}>
                      {selectedSummary.estimated_savings_pln.toFixed(1)}
                    </Text>
                    <Text style={s.metricUnit}> PLN</Text>
                  </View>
                  <Text style={s.metricLabel}>{dt.savings}</Text>
                </View>
              )}
              {selectedSummary.self_consumption_pct != null && (
                <View style={s.metricBox}>
                  <View style={s.metricValueRow}>
                    <Text style={s.metricNumber}>
                      {selectedSummary.self_consumption_pct.toFixed(0)}
                    </Text>
                    <Text style={s.metricUnit}>%</Text>
                  </View>
                  <Text style={s.metricLabel}>{dt.selfConsumption}</Text>
                </View>
              )}
              <View style={s.metricBox}>
                <Text style={s.metricNumber}>{selectedSummary.rule_count}</Text>
                <Text style={s.metricLabel}>{dt.ruleCount}</Text>
              </View>
            </View>

            {d.all_strategy_summaries && d.all_strategy_summaries.length > 1 && (
              <TouchableOpacity
                style={s.compareBtn}
                onPress={() => setCompareModalSK(d.SK)}
                activeOpacity={0.7}
              >
                <GitCompare size={14} color={Colors.primary} />
                <Text style={s.compareBtnText}>{dt.compareStrategies}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!isRejectingThis && onApprove && onReject && (
          <View style={s.pendingApprovalRow}>
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
                  <Check size={18} color="#fff" />
                  <Text style={s.approveBtnText}>{dt.approve}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.rejectBtn}
              onPress={() => {
                setRejectingSK(d.SK);
                setRejectReason('');
              }}
              disabled={!!actionSK}
              activeOpacity={0.7}
            >
              <X size={18} color="#DC2626" />
              <Text style={s.rejectBtnText}>{dt.reject}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isRejectingThis && (
          <View style={s.rejectReasonBox}>
            <Text style={s.rejectReasonTitle}>{dt.rejectReasonTitle}</Text>
            <TextInput
              style={s.rejectReasonInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={dt.rejectReasonPlaceholder}
              placeholderTextColor={Colors.textSecondary}
              multiline
              autoFocus
            />
            <View style={s.rejectReasonActions}>
              <TouchableOpacity
                style={s.rejectCancelBtn}
                onPress={() => {
                  setRejectingSK(null);
                  setRejectReason('');
                }}
                activeOpacity={0.7}
              >
                <Text style={s.rejectCancelText}>{t.common.cancel ?? 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.rejectConfirmBtn}
                onPress={() => handleRejectWithReason(d.SK)}
                disabled={!!actionSK}
                activeOpacity={0.7}
              >
                {isRejecting && actionSK === d.SK ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <X size={14} color="#fff" />
                    <Text style={s.rejectConfirmText}>{dt.rejectWithReason}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {allRules.length > 0 && (
          <>
            <TouchableOpacity
              style={s.rulesToggle}
              onPress={() => toggleRules(d.SK)}
              activeOpacity={0.7}
            >
              {rulesVisible ? (
                <EyeOff size={14} color={Colors.primary} />
              ) : (
                <Eye size={14} color={Colors.primary} />
              )}
              <Text style={s.rulesToggleText}>
                {rulesVisible ? dt.hideRules : dt.showRules} ({allRules.length})
              </Text>
            </TouchableOpacity>

            {rulesVisible && (
              <View style={s.rulesSection}>
                {allRules.map((entry, i) =>
                  renderRuleCard(entry.priority, entry.rule, i),
                )}
              </View>
            )}
          </>
        )}

        {isExpanded && (
          <View style={s.expandedContent}>
            {!selectedSummary && d.selected_strategy && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>{dt.strategy}</Text>
                <Text style={s.strategyTitle}>
                  {d.selected_strategy} —{' '}
                  {formatEngineStrategyName(d.forecast?.strategy) ??
                    strategyTierLabel(d.selected_strategy, wiz)}
                </Text>
                <Text style={s.strategyRisk}>
                  {dt.riskLevel}: {strategyTierLabel(d.selected_strategy, wiz)}
                </Text>
              </View>
            )}

            {d.strategy_adjustments &&
              Object.keys(d.strategy_adjustments).length > 0 && (
                <Text style={s.adjustmentsText}>
                  {Object.entries(d.strategy_adjustments)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </Text>
              )}

            {(d.validation_status || d.fallback_used) && (
              <View style={s.metaRow}>
                {d.validation_status && (
                  <View
                    style={[
                      s.pill,
                      { backgroundColor: VALIDATION_COLORS[d.validation_status] + '18' },
                    ]}
                  >
                    <Text
                      style={[
                        s.pillText,
                        { color: VALIDATION_COLORS[d.validation_status] },
                      ]}
                    >
                      {dt.validation}:{' '}
                      {(dt as Record<string, string>)[
                        `validation_${d.validation_status}`
                      ] ?? d.validation_status}
                    </Text>
                  </View>
                )}
                {d.fallback_used && (
                  <View style={[s.pill, { backgroundColor: '#E0E7FF' }]}>
                    <Text style={[s.pillText, { color: '#4338CA' }]}>
                      {dt.fallbackUsed}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {decisionForecastLine && (
              <Text style={s.forecastLine}>{decisionForecastLine}</Text>
            )}

            {d.reasoning && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>{dt.reasoning}</Text>
                <Text style={s.reasoningText}>{d.reasoning}</Text>
              </View>
            )}

            {d.predicted_outcome?.total_savings_pln != null && (
              <View style={s.savingsRow}>
                <View style={s.savingsCol}>
                  <Text style={s.savingsLabel}>{dt.predictedSavings}</Text>
                  <Text style={s.savingsValue}>
                    {d.predicted_outcome.total_savings_pln?.toFixed(1)} PLN
                  </Text>
                </View>
                {d.actual_outcome?.total_savings_pln != null && (
                  <View style={s.savingsCol}>
                    <Text style={s.savingsLabel}>{dt.actualSavings}</Text>
                    <Text style={s.savingsValue}>
                      {d.actual_outcome.total_savings_pln?.toFixed(1)} PLN
                    </Text>
                  </View>
                )}
              </View>
            )}

            {renderCommentSection(d)}
          </View>
        )}
      </View>
    );
  };

  const renderStandardDecision = (d: AgentDecision) => {
    const isExpanded = expandedId === d.SK;
    const Icon = AGENT_ICONS[d.agent_type] || BrainCircuit;
    const statusColor = STATUS_COLORS[d.status] || Colors.textSecondary;
    const decisionForecastLine = forecastDecisionSummaryLine(
      d.forecast,
      forecastSummaryTemplate,
    );

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
              {(dt as Record<string, string>)[`status_${d.status}`] || d.status}
            </Text>
          </View>
          {d.validation_status && (
            <View
              style={[
                s.validationDot,
                { backgroundColor: VALIDATION_COLORS[d.validation_status] },
              ]}
            />
          )}
          {isExpanded ? (
            <ChevronUp size={16} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={16} color={Colors.textSecondary} />
          )}
        </View>

        {isExpanded && (
          <View style={s.expandedContent}>
            {d.selected_strategy && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>{dt.strategy}</Text>
                <Text style={s.strategyTitle}>
                  {d.selected_strategy} —{' '}
                  {formatEngineStrategyName(d.forecast?.strategy) ??
                    strategyTierLabel(d.selected_strategy, wiz)}
                </Text>
                <Text style={s.strategyRisk}>
                  {dt.riskLevel}: {strategyTierLabel(d.selected_strategy, wiz)}
                </Text>
                {d.strategy_adjustments &&
                  Object.keys(d.strategy_adjustments).length > 0 && (
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
                  <View
                    style={[
                      s.pill,
                      { backgroundColor: VALIDATION_COLORS[d.validation_status] + '18' },
                    ]}
                  >
                    <Text
                      style={[
                        s.pillText,
                        { color: VALIDATION_COLORS[d.validation_status] },
                      ]}
                    >
                      {dt.validation}:{' '}
                      {(dt as Record<string, string>)[
                        `validation_${d.validation_status}`
                      ] ?? d.validation_status}
                    </Text>
                  </View>
                )}
                {d.fallback_used && (
                  <View style={[s.pill, { backgroundColor: '#E0E7FF' }]}>
                    <Text style={[s.pillText, { color: '#4338CA' }]}>
                      {dt.fallbackUsed}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {decisionForecastLine ? (
              <Text style={s.forecastLine}>{decisionForecastLine}</Text>
            ) : null}

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
                    <Text style={s.ruleChipText}>
                      P{r.priority} {r.action} {r.time_window || ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {!d.selected_strategy && d.rules_modified?.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>
                  {dt.rulesModified ?? 'Rules Modified'}
                </Text>
                {d.rules_modified.map((r, i) => (
                  <View
                    key={i}
                    style={[s.ruleChip, { backgroundColor: '#FFF7ED' }]}
                  >
                    <Text style={[s.ruleChipText, { color: '#92400E' }]}>
                      {r.id} {r.change ? `— ${r.change}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {!d.selected_strategy && d.rules_deleted?.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>
                  {dt.rulesDeleted ?? 'Rules Deleted'}
                </Text>
                {d.rules_deleted.map((id, i) => (
                  <View
                    key={i}
                    style={[s.ruleChip, { backgroundColor: '#FEF2F2' }]}
                  >
                    <Text
                      style={[
                        s.ruleChipText,
                        { color: '#991B1B', textDecorationLine: 'line-through' },
                      ]}
                    >
                      {id}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {d.predicted_outcome?.total_savings_pln != null && (
              <View style={s.savingsRow}>
                <View style={s.savingsCol}>
                  <Text style={s.savingsLabel}>{dt.predictedSavings}</Text>
                  <Text style={s.savingsValue}>
                    {d.predicted_outcome.total_savings_pln?.toFixed(1)} PLN
                  </Text>
                </View>
                {d.actual_outcome?.total_savings_pln != null && (
                  <View style={s.savingsCol}>
                    <Text style={s.savingsLabel}>{dt.actualSavings}</Text>
                    <Text style={s.savingsValue}>
                      {d.actual_outcome.total_savings_pln?.toFixed(1)} PLN
                    </Text>
                  </View>
                )}
              </View>
            )}

            {renderCommentSection(d)}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Clock size={18} color={Colors.primary} />
        <Text style={s.title}>{dt.title}</Text>
      </View>

      {decisions.map((d) =>
        d.status === 'pending_approval'
          ? renderPendingDecision(d)
          : renderStandardDecision(d),
      )}

      {compareDecision && (
        <StrategyComparisonModal
          visible={!!compareModalSK}
          onClose={() => setCompareModalSK(null)}
          strategies={compareDecision.all_strategy_summaries ?? []}
          selectedStrategy={compareDecision.selected_strategy}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  placeholder: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  decisionItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  pendingDecisionItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  timestamp: { fontSize: 11, color: Colors.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  validationDot: { width: 8, height: 8, borderRadius: 4 },

  strategySummaryCard: {
    marginTop: 12,
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#D9770640',
  },
  stratSummaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  stratLetter: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    lineHeight: 36,
  },
  stratSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stratName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
    lineHeight: 21,
  },
  simBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  simBadgeText: { fontSize: 10, fontWeight: '700' },

  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primaryLight,
  },
  compareBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  pendingApprovalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  approvalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 13,
  },
  approveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  rejectBtnText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },

  rejectReasonBox: {
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectReasonTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  rejectReasonInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderColor: '#FECACA',
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  rejectReasonActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  rejectCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  rejectConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  rejectConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  rulesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  rulesToggleText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  rulesSection: { gap: 8, marginBottom: 4 },

  ruleCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ruleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  priorityBadgeText: { fontSize: 11, fontWeight: '800' },
  ruleActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  ruleMetaInline: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  ruleMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ruleMetaItem: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ruleMetaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ruleMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },

  expandedContent: { marginTop: 12, gap: 10, paddingLeft: 42 },
  section: { gap: 4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasoningText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  strategyTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  strategyRisk: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  adjustmentsText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  forecastLine: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  ruleChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  ruleChipText: { fontSize: 12, color: Colors.text, fontFamily: 'monospace' },
  savingsRow: { flexDirection: 'row', gap: 12 },
  savingsCol: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
  },
  savingsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  savingsValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  commentBubble: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  commentText: { fontSize: 12, color: '#0C4A6E', flex: 1, lineHeight: 17 },
  commentInput: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  commentField: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  addCommentText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
});
