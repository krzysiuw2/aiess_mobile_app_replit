import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Calendar,
  CalendarCheck,
  Bot,
  ChevronLeft,
  ChevronRight,
  List,
  CalendarDays,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import {
  getActionTypeLabel,
  formatTime,
  getDaysLabel,
  getRuleSummary,
} from '@/lib/aws-schedules';
import { getMonday, formatWeekRange, formatDayLabel } from '@/lib/schedule-calendar';
import ScheduleWeekGrid from '@/components/schedule/ScheduleWeekGrid';
import ScheduleDayGrid from '@/components/schedule/ScheduleDayGrid';
import type { ScheduleRuleWithPriority } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────

const formatDate = (timestamp: number | undefined): string => {
  if (timestamp === undefined || timestamp === null || timestamp === 0) return '';
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getValidityLabel = (
  vf: number | undefined,
  vu: number | undefined,
  t: { schedules: { permanent: string; from: string; until: string } }
): string => {
  const from = formatDate(vf);
  const until = formatDate(vu);
  if (!from && !until) return t.schedules.permanent;
  if (from && until && from === until) return from;
  if (from && !until) return `${t.schedules.from} ${from}`;
  if (!from && until) return `${t.schedules.until} ${until}`;
  return `${from} - ${until}`;
};

// ─── Rule Card (List View) ──────────────────────────────────────

interface RuleCardProps {
  rule: ScheduleRuleWithPriority;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function RuleCard({ rule, onEdit, onDelete, onToggle }: RuleCardProps) {
  const { t } = useSettings();
  const isActive = rule.act !== false;
  const isAI = rule.s === 'ai';
  const daysLabel = rule.d ? getDaysLabel(rule.d) : t.schedules.everyday;
  const timeRange =
    rule.c?.ts !== undefined && rule.c?.te !== undefined
      ? `${formatTime(rule.c.ts)} - ${formatTime(rule.c.te)}`
      : t.schedules.always;
  const validityLabel = getValidityLabel(rule.vf, rule.vu, t);
  const summary = getRuleSummary(rule);

  return (
    <View style={[styles.ruleCard, !isActive && styles.ruleCardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.ruleId} numberOfLines={1}>{rule.id}</Text>
          <Text style={styles.priorityBadge}>P{rule.priority}</Text>
          {isAI && (
            <View style={styles.aiBadge}>
              <Bot size={12} color="#8b5cf6" />
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          )}
        </View>
        <Switch
          value={isActive}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: Colors.primaryLight }}
          thumbColor={isActive ? Colors.primary : Colors.textSecondary}
          style={styles.toggleSwitch}
        />
      </View>
      <Text style={styles.summaryText}>{summary}</Text>
      <View style={styles.cardContent}>
        <View style={styles.infoRow}>
          <Clock size={14} color={Colors.textSecondary} />
          <Text style={styles.infoValue}>{timeRange}</Text>
        </View>
        <View style={styles.infoRow}>
          <Calendar size={14} color={Colors.textSecondary} />
          <Text style={styles.infoValue}>{daysLabel}</Text>
        </View>
        {validityLabel !== t.schedules.permanent && (
          <View style={styles.infoRow}>
            <CalendarCheck size={14} color={Colors.textSecondary} />
            <Text style={styles.infoValue}>{validityLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Pencil size={16} color={Colors.primary} />
          <Text style={styles.actionButtonText}>{t.common.edit}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete}>
          <Trash2 size={16} color={Colors.error} />
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>{t.common.delete}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Rule Popup (Calendar View) ─────────────────────────────────

interface RulePopupProps {
  rule: ScheduleRuleWithPriority | null;
  onClose: () => void;
  onEdit: (rule: ScheduleRuleWithPriority) => void;
  onDelete: (rule: ScheduleRuleWithPriority) => void;
}

function RulePopup({ rule, onClose, onEdit, onDelete }: RulePopupProps) {
  const { t } = useSettings();
  if (!rule) return null;

  const summary = getRuleSummary(rule);
  const daysLabel = rule.d ? getDaysLabel(rule.d) : t.schedules.everyday;
  const timeRange =
    rule.c?.ts !== undefined && rule.c?.te !== undefined
      ? `${formatTime(rule.c.ts)} - ${formatTime(rule.c.te)}`
      : t.schedules.always;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.popupOverlay} onPress={onClose}>
        <Pressable style={styles.popupCard} onPress={() => {}}>
          <View style={styles.popupHeader}>
            <Text style={styles.popupRuleId} numberOfLines={1}>{rule.id}</Text>
            <Text style={styles.popupPriority}>P{rule.priority}</Text>
            {rule.s === 'ai' && (
              <View style={styles.aiBadge}>
                <Bot size={12} color="#8b5cf6" />
              </View>
            )}
          </View>
          <Text style={styles.popupSummary}>{summary}</Text>
          <Text style={styles.popupDetail}>{timeRange}  ·  {daysLabel}</Text>
          <View style={styles.popupActions}>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupEditBtn]}
              onPress={() => { onClose(); onEdit(rule); }}
            >
              <Pencil size={14} color={Colors.primary} />
              <Text style={styles.popupEditText}>{t.common.edit}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupDeleteBtn]}
              onPress={() => { onClose(); onDelete(rule); }}
            >
              <Trash2 size={14} color={Colors.error} />
              <Text style={styles.popupDeleteText}>{t.common.delete}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────

export default function ScheduleListScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { rules, rawSchedules, isLoading, error, refetch, deleteRule, toggleRule } = useSchedules();
  const { siteConfigComplete } = useSiteConfig();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMode, setCalendarMode] = useState<'week' | 'day'>('week');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [popupRule, setPopupRule] = useState<ScheduleRuleWithPriority | null>(null);

  const scheduleRules = rules.filter(rule => rule.priority !== 9);

  const p9SiteLimit = rawSchedules?.sch?.p_9?.find(r => r.a.t === 'sl');
  const configReady = siteConfigComplete && p9SiteLimit !== undefined;

  useFocusEffect(
    useCallback(() => {
      refetch();
      setWeekStart(getMonday(new Date()));
      setSelectedDay(new Date());
    }, [refetch])
  );

  const handleEditRule = (rule: ScheduleRuleWithPriority) => {
    router.push({
      pathname: '/(tabs)/schedule/[ruleId]',
      params: { ruleId: rule.id, priority: rule.priority.toString() },
    });
  };

  const handleDeleteRule = (rule: ScheduleRuleWithPriority) => {
    Alert.alert(
      t.schedules.deleteRule,
      t.schedules.deleteRuleConfirm.replace('{ruleId}', rule.id),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRule(rule.id, rule.priority);
            } catch {
              Alert.alert(t.common.error, t.schedules.failedToDeleteRule);
            }
          },
        },
      ]
    );
  };

  const handleToggleRule = async (rule: ScheduleRuleWithPriority) => {
    try {
      await toggleRule(rule.id, rule.priority);
    } catch {
      Alert.alert(t.common.error, t.schedules.failedToToggleRule);
    }
  };

  const handleAddRule = () => {
    if (!configReady) {
      Alert.alert(t.settings.siteConfigIncompleteTitle, t.settings.siteConfigIncomplete);
      return;
    }
    router.push({ pathname: '/(tabs)/schedule/[ruleId]', params: { ruleId: 'new' } });
  };

  const navigateWeek = (dir: number) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const navigateDay = (dir: number) => {
    setSelectedDay(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const resetToToday = () => {
    setWeekStart(getMonday(new Date()));
    setSelectedDay(new Date());
  };

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t.common.noDeviceSelected}</Text>
          <Text style={styles.emptySubtitle}>{t.common.selectDeviceHint}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.schedules.title}</Text>
          <Text style={styles.headerSubtitle}>
            {selectedDevice.name} - {scheduleRules.length} {t.schedules.rules}
          </Text>
        </View>
      </View>

      {/* View mode toggle: List / Calendar */}
      <View style={styles.segmentedRow}>
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'list' && styles.segmentBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <List size={14} color={viewMode === 'list' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.segmentText, viewMode === 'list' && styles.segmentTextActive]}>
              {t.schedules.listView}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'calendar' && styles.segmentBtnActive]}
            onPress={() => setViewMode('calendar')}
          >
            <CalendarDays size={14} color={viewMode === 'calendar' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.segmentText, viewMode === 'calendar' && styles.segmentTextActive]}>
              {t.schedules.calendarView}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Calendar sub-controls: Week/Day toggle + navigation */}
      {viewMode === 'calendar' && (
        <View style={styles.calendarControls}>
          <View style={styles.segmentedControlSmall}>
            <TouchableOpacity
              style={[styles.segmentBtnSmall, calendarMode === 'week' && styles.segmentBtnSmallActive]}
              onPress={() => setCalendarMode('week')}
            >
              <Text style={[styles.segmentTextSmall, calendarMode === 'week' && styles.segmentTextSmallActive]}>
                {t.schedules.weekView}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtnSmall, calendarMode === 'day' && styles.segmentBtnSmallActive]}
              onPress={() => setCalendarMode('day')}
            >
              <Text style={[styles.segmentTextSmall, calendarMode === 'day' && styles.segmentTextSmallActive]}>
                {t.schedules.dayView}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.navArrow}
              onPress={() => calendarMode === 'week' ? navigateWeek(-1) : navigateDay(-1)}
            >
              <ChevronLeft size={20} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navLabel} onPress={resetToToday}>
              <Text style={styles.navLabelText} numberOfLines={1}>
                {calendarMode === 'week'
                  ? formatWeekRange(weekStart)
                  : formatDayLabel(selectedDay)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navArrow}
              onPress={() => calendarMode === 'week' ? navigateWeek(1) : navigateDay(1)}
            >
              <ChevronRight size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.schedules.loadingSchedules}</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>{t.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'list' ? (
        scheduleRules.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{t.schedules.noRules}</Text>
            <Text style={styles.emptySubtitle}>{t.schedules.createFirstRule}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          >
            {scheduleRules.map((rule) => (
              <RuleCard
                key={`${rule.priority}-${rule.id}`}
                rule={rule}
                onEdit={() => handleEditRule(rule)}
                onDelete={() => handleDeleteRule(rule)}
                onToggle={() => handleToggleRule(rule)}
              />
            ))}
          </ScrollView>
        )
      ) : calendarMode === 'week' ? (
        <ScheduleWeekGrid
          rules={scheduleRules}
          weekStart={weekStart}
          onRuleTap={setPopupRule}
        />
      ) : (
        <ScheduleDayGrid
          rules={scheduleRules}
          date={selectedDay}
          onRuleTap={setPopupRule}
        />
      )}

      {/* Rule popup */}
      {popupRule && (
        <RulePopup
          rule={popupRule}
          onClose={() => setPopupRule(null)}
          onEdit={handleEditRule}
          onDelete={handleDeleteRule}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAddRule}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  // Segmented control
  segmentedRow: { paddingHorizontal: 16, marginBottom: 8 },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  segmentBtnActive: { backgroundColor: Colors.primary },
  segmentText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  segmentTextActive: { color: '#fff' },

  // Calendar sub-controls
  calendarControls: { paddingHorizontal: 16, marginBottom: 4 },
  segmentedControlSmall: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  segmentBtnSmall: {
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  segmentBtnSmallActive: { backgroundColor: Colors.primary },
  segmentTextSmall: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  segmentTextSmallActive: { color: '#fff' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  navArrow: {
    padding: 8,
    borderRadius: 8,
  },
  navLabel: {
    flex: 1,
    alignItems: 'center',
  },
  navLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },

  // List view
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.textSecondary },
  errorText: { color: Colors.error, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },

  // Rule card
  ruleCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  ruleCardInactive: { opacity: 0.55 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  ruleId: { fontSize: 15, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  priorityBadge: { fontSize: 11, fontWeight: '600', color: Colors.primary, backgroundColor: Colors.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(139, 92, 246, 0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText: { fontSize: 11, fontWeight: '600', color: '#8b5cf6' },
  toggleSwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  summaryText: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 10 },
  cardContent: { gap: 5, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoValue: { fontSize: 12, color: Colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: Colors.primaryLight, borderRadius: 8 },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  deleteButton: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  deleteButtonText: { color: Colors.error },

  // Rule popup
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  popupRuleId: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  popupPriority: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  popupSummary: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  popupDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  popupActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  popupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  popupEditBtn: {
    backgroundColor: Colors.primaryLight,
  },
  popupEditText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  popupDeleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  popupDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
