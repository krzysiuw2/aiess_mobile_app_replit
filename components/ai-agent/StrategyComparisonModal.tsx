import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { X, CheckCircle2, XCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import type { StrategySummary } from '@/types/ai-agent';

const LETTERS = ['A', 'B', 'C'] as const;

export interface StrategyComparisonModalProps {
  visible: boolean;
  onClose: () => void;
  strategies: StrategySummary[];
  selectedStrategy?: 'A' | 'B' | 'C';
}

function riskColor(risk: string): string {
  const r = risk.toLowerCase();
  if (r.includes('aggressive') || r.includes('high')) return '#DC2626';
  if (r.includes('balanced') || r.includes('medium')) return '#D97706';
  if (r.includes('conservative') || r.includes('low')) return '#059669';
  return Colors.textSecondary;
}

function formatDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
    return '—';
  }
  return String(value);
}

export function StrategyComparisonModal({
  visible,
  onClose,
  strategies,
  selectedStrategy,
}: StrategyComparisonModalProps) {
  const { t } = useSettings();
  const dt = t.aiAgent.decisions;
  const { width: windowWidth } = useWindowDimensions();

  const byLetter = useMemo(() => {
    const m = new Map<(typeof LETTERS)[number], StrategySummary>();
    for (const s of strategies) {
      m.set(s.letter, s);
    }
    return m;
  }, [strategies]);

  const columnMinWidth = Math.min(118, Math.max(100, (windowWidth - 48) / 3.2));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback>
            <View style={s.sheet}>
              <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>
              {dt.comparisonTitle}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={dt.close}>
              <X size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={s.columnsScroll}
            bounces={false}
            nestedScrollEnabled
          >
            {LETTERS.map((letter) => {
              const strat = byLetter.get(letter);
              const isSelected = selectedStrategy === letter;
              const risk = strat?.risk ?? '';
              const rc = strat ? riskColor(risk) : Colors.textSecondary;

              return (
                <View
                  key={letter}
                  style={[
                    s.column,
                    { minWidth: columnMinWidth },
                    isSelected && s.columnSelected,
                  ]}
                >
                  {isSelected && (
                    <View style={s.selectedBadge}>
                      <Text style={s.selectedBadgeText}>{dt.selected}</Text>
                    </View>
                  )}

                  <View style={s.columnHeader}>
                    <Text style={s.letter}>{letter}</Text>
                    <Text style={s.strategyName} numberOfLines={2}>
                      {strat?.name ?? '—'}
                    </Text>
                  </View>

                  <View style={[s.riskPill, strat ? { backgroundColor: rc + '18' } : null]}>
                    <Text style={[s.riskText, { color: strat ? rc : Colors.textSecondary }]} numberOfLines={1}>
                      {strat ? `${dt.risk}: ${strat.risk}` : '—'}
                    </Text>
                  </View>

                  <MetricRow label={dt.savings} value={strat?.estimated_savings_pln != null ? `${strat.estimated_savings_pln.toFixed(1)} PLN` : undefined} />
                  <MetricRow
                    label={dt.selfConsumption}
                    value={strat?.self_consumption_pct != null ? `${strat.self_consumption_pct.toFixed(0)}%` : undefined}
                  />
                  <MetricRow
                    label={dt.peakImport}
                    value={strat?.peak_grid_import_kw != null ? `${strat.peak_grid_import_kw.toFixed(1)} kW` : undefined}
                  />
                  <MetricRow label={dt.socEnd} value={strat?.soc_end != null ? `${strat.soc_end.toFixed(0)}%` : undefined} />
                  <MetricRow label={dt.ruleCount} value={strat != null ? String(strat.rule_count) : undefined} />

                  <View style={s.simRow}>
                    {strat ? (
                      <>
                        {strat.simulation_valid ? (
                          <CheckCircle2 size={16} color="#059669" />
                        ) : (
                          <XCircle size={16} color="#DC2626" />
                        )}
                        <Text
                          style={[
                            s.simText,
                            { color: strat.simulation_valid ? '#059669' : '#DC2626' },
                          ]}
                          numberOfLines={2}
                        >
                          {strat.simulation_valid ? dt.simulationValid : dt.simulationInvalid}
                        </Text>
                      </>
                    ) : (
                      <Text style={s.simTextMuted}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function MetricRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={s.metricValue} numberOfLines={2}>
        {formatDash(value)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    maxHeight: '88%',
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 12,
  },
  columnsScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 10,
    paddingBottom: 4,
  },
  column: {
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  columnSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  selectedBadge: {
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  columnHeader: {
    marginBottom: 10,
  },
  letter: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  strategyName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 4,
    lineHeight: 17,
  },
  riskPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: Colors.borderLight,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricRow: {
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  simText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  simTextMuted: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
