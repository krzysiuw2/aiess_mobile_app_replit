import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Copy,
  Star,
  Zap,
  Settings2,
  SlidersHorizontal,
  History,
  BatteryMedium,
  Gauge,
  Cpu,
  Target,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { useFavorites } from '@/hooks/useFavorites';
import {
  getRuleSummary,
  getRuleDetailLines,
  type RuleDetailLine,
  type RuleDetailLabels,
  type RuleDetailIcon,
} from '@/lib/aws-schedules';
import { getMonday, formatWeekRange, formatDayLabel } from '@/lib/schedule-calendar';
import ScheduleWeekGrid from '@/components/schedule/ScheduleWeekGrid';
import ScheduleDayGrid from '@/components/schedule/ScheduleDayGrid';
import BehaviorSettings from '@/components/schedule/BehaviorSettings';
import ScheduleHistorySheet from '@/components/schedule/ScheduleHistorySheet';
import type { ScheduleRuleWithPriority, ReadOnlyScheduleRule, Strategy } from '@/types';
import type { RuleFavorite } from '@/lib/rule-favorites';

// ─── Helpers ────────────────────────────────────────────────────

const DETAIL_ICON_MAP: Record<RuleDetailIcon, React.ComponentType<{ size?: number; color?: string }>> = {
  clock: Clock,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  zap: Zap,
  battery: BatteryMedium,
  gauge: Gauge,
  cpu: Cpu,
  target: Target,
};

const MAX_COLLAPSED_LINES = 4;

function buildDetailLabels(t: ReturnType<typeof useSettings>['t']): RuleDetailLabels {
  const ed = t.schedules.editor;
  return {
    always: t.schedules.always,
    everyday: t.schedules.everyday,
    permanent: t.schedules.permanent,
    from: t.schedules.from,
    until: t.schedules.until,
    gridLabel: t.schedules.gridLabel,
    socLabel: t.schedules.socLabel,
    strategyLabel: t.schedules.strategyLabel,
    pidLabel: t.schedules.pidLabel,
    maxGridLabel: t.schedules.maxGridLabel,
    minGridLabel: t.schedules.minGridLabel,
    maxPowerLabel: t.schedules.maxPowerLabel,
    targetLabel: t.schedules.targetLabel,
    strategies: {
      eq: ed.equalSpread,
      agg: ed.aggressive,
      con: ed.conservative,
    } as Record<Strategy, string>,
    limitLabel: t.schedules.limitLabel,
    softLabel: t.schedules.softLabel,
    targetGridLabel: t.schedules.targetGridLabel,
    socWindowLabel: t.schedules.socWindowLabel,
    holdLabel: t.schedules.holdLabel,
    hysteresisLabel: t.schedules.hysteresisLabel,
    monthDaysLabel: t.schedules.monthDaysLabel,
    recurrenceLabel: t.schedules.recurrenceLabel,
    recurrences: t.schedules.recurrences,
  };
}

function DetailLines({ lines, expanded }: { lines: RuleDetailLine[]; expanded: boolean }) {
  const visible = expanded ? lines : lines.slice(0, MAX_COLLAPSED_LINES);
  return (
    <View style={styles.cardContent}>
      {visible.map((line, idx) => {
        const Icon = DETAIL_ICON_MAP[line.iconKey] || Clock;
        return (
          <View key={`${line.iconKey}-${idx}`} style={styles.infoRow}>
            <Icon size={14} color={Colors.textSecondary} />
            <Text style={styles.infoValue}>{line.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Rule Card (List View) ──────────────────────────────────────

interface RuleCardProps {
  rule: ScheduleRuleWithPriority;
  detailLabels: RuleDetailLabels;
  isFavorited: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  /** Deep link back to the Simple-mode toggle for materialized set_* rules. */
  onSettingsBadgePress?: () => void;
}

function RuleCard({ rule, detailLabels, isFavorited, onEdit, onDelete, onToggle, onDuplicate, onToggleFavorite, onSettingsBadgePress }: RuleCardProps) {
  const { t } = useSettings();
  const isActive = rule.act !== false;
  const isAI = rule.s === 'ai';
  const isFromSettings = rule.id.toLowerCase().startsWith('set_');
  const summary = getRuleSummary(rule);
  const detailLines = useMemo(() => getRuleDetailLines(rule, detailLabels), [rule, detailLabels]);
  const [expanded, setExpanded] = useState(false);
  const hasMore = detailLines.length > MAX_COLLAPSED_LINES;

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
          {isFromSettings && (
            <TouchableOpacity style={styles.settingsBadge} onPress={onSettingsBadgePress}>
              <SlidersHorizontal size={11} color={Colors.primary} />
              <Text style={styles.settingsBadgeText}>{t.schedules.fromSettingsBadge}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onToggleFavorite}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityLabel={isFavorited ? t.schedules.removeFromFavorites : t.schedules.addToFavorites}
          >
            <Star
              size={18}
              color={isFavorited ? '#f59e0b' : Colors.textSecondary}
              fill={isFavorited ? '#f59e0b' : 'transparent'}
            />
          </TouchableOpacity>
          <Switch
            value={isActive}
            onValueChange={onToggle}
            trackColor={{ false: Colors.border, true: Colors.primaryLight }}
            thumbColor={isActive ? Colors.primary : Colors.textSecondary}
            style={styles.toggleSwitch}
          />
        </View>
      </View>
      <Text style={styles.summaryText}>{summary}</Text>
      <DetailLines lines={detailLines} expanded={expanded} />
      {hasMore && (
        <TouchableOpacity style={styles.expandToggle} onPress={() => setExpanded(v => !v)}>
          {expanded
            ? <ChevronUp size={14} color={Colors.primary} />
            : <ChevronDown size={14} color={Colors.primary} />}
          <Text style={styles.expandToggleText}>
            {expanded
              ? t.schedules.showLessDetails
              : `${t.schedules.showMoreDetails} (+${detailLines.length - MAX_COLLAPSED_LINES})`}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Pencil size={16} color={Colors.primary} />
          <Text style={styles.actionButtonText}>{t.common.edit}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.duplicateButton]} onPress={onDuplicate}>
          <Copy size={16} color={Colors.primary} />
          <Text style={styles.actionButtonText}>{t.schedules.duplicate}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete}>
          <Trash2 size={16} color={Colors.error} />
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>{t.common.delete}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Read-Only Rule Card (P1-P3 local / P10-P11 SCADA) ─────────

function ReadOnlyRuleCard({ rule, detailLabels }: { rule: ReadOnlyScheduleRule; detailLabels: RuleDetailLabels }) {
  const { t } = useSettings();
  const isActive = rule.act !== false;
  const summary = getRuleSummary(rule);
  const detailLines = useMemo(() => getRuleDetailLines(rule, detailLabels), [rule, detailLabels]);
  const [expanded, setExpanded] = useState(false);
  const hasMore = detailLines.length > MAX_COLLAPSED_LINES;

  return (
    <View style={[styles.ruleCard, styles.readOnlyCard, !isActive && styles.ruleCardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.ruleId} numberOfLines={1}>{rule.id}</Text>
          <Text style={styles.priorityBadge}>P{rule.priority}</Text>
          <View style={styles.readOnlyBadge}>
            <Lock size={11} color={Colors.textSecondary} />
            <Text style={styles.readOnlyBadgeText}>{t.schedules.readOnlyBadge}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.summaryText}>{summary}</Text>
      <DetailLines lines={detailLines} expanded={expanded} />
      {hasMore && (
        <TouchableOpacity style={styles.expandToggle} onPress={() => setExpanded(v => !v)}>
          {expanded
            ? <ChevronUp size={14} color={Colors.primary} />
            : <ChevronDown size={14} color={Colors.primary} />}
          <Text style={styles.expandToggleText}>
            {expanded
              ? t.schedules.showLessDetails
              : `${t.schedules.showMoreDetails} (+${detailLines.length - MAX_COLLAPSED_LINES})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Favorite Card ──────────────────────────────────────────────

interface FavoriteCardProps {
  favorite: RuleFavorite;
  detailLabels: RuleDetailLabels;
  onUse: () => void;
  onRename: () => void;
  onRemove: () => void;
}

function FavoriteCard({ favorite, detailLabels, onUse, onRename, onRemove }: FavoriteCardProps) {
  const { t } = useSettings();
  const summary = getRuleSummary(favorite.rule);
  const detailLines = useMemo(
    () => getRuleDetailLines(favorite.rule, detailLabels),
    [favorite.rule, detailLabels],
  );
  const [expanded, setExpanded] = useState(false);
  const hasMore = detailLines.length > MAX_COLLAPSED_LINES;
  const displayLabel = favorite.label || favorite.rule.id;

  return (
    <View style={styles.ruleCard}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Star size={16} color="#f59e0b" fill="#f59e0b" />
          <Text style={styles.ruleId} numberOfLines={1}>{displayLabel}</Text>
          <Text style={styles.priorityBadge}>P{favorite.priority}</Text>
        </View>
      </View>
      {favorite.label && favorite.label !== favorite.rule.id && (
        <Text style={styles.favoriteSourceId} numberOfLines={1}>{favorite.rule.id}</Text>
      )}
      <Text style={styles.summaryText}>{summary}</Text>
      <DetailLines lines={detailLines} expanded={expanded} />
      {hasMore && (
        <TouchableOpacity style={styles.expandToggle} onPress={() => setExpanded(v => !v)}>
          {expanded
            ? <ChevronUp size={14} color={Colors.primary} />
            : <ChevronDown size={14} color={Colors.primary} />}
          <Text style={styles.expandToggleText}>
            {expanded
              ? t.schedules.showLessDetails
              : `${t.schedules.showMoreDetails} (+${detailLines.length - MAX_COLLAPSED_LINES})`}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { flex: 1 }]} onPress={onUse}>
          <Plus size={16} color={Colors.primary} />
          <Text style={styles.actionButtonText}>{t.schedules.useAsNewRule}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconActionButton} onPress={onRename}>
          <Pencil size={16} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconActionButton, styles.deleteButton]} onPress={onRemove}>
          <Trash2 size={16} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Rename Favorite Modal ──────────────────────────────────────

interface RenameModalProps {
  favorite: RuleFavorite | null;
  onClose: () => void;
  onSave: (label: string) => void;
}

function RenameModal({ favorite, onClose, onSave }: RenameModalProps) {
  const { t } = useSettings();
  const [value, setValue] = useState(favorite?.label || favorite?.rule.id || '');

  if (!favorite) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.popupOverlay} onPress={onClose}>
        <Pressable style={styles.popupCard} onPress={() => {}}>
          <Text style={styles.renameTitle}>{t.schedules.renameFavorite}</Text>
          <TextInput
            style={styles.renameInput}
            value={value}
            onChangeText={setValue}
            placeholder={t.schedules.favoriteLabelPlaceholder}
            placeholderTextColor={Colors.textSecondary}
            autoFocus
            maxLength={64}
          />
          <View style={styles.popupActions}>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupDeleteBtn]}
              onPress={onClose}
            >
              <Text style={styles.popupDeleteText}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupEditBtn]}
              onPress={() => onSave(value.trim())}
            >
              <Text style={styles.popupEditText}>{t.common.save}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Rule Popup (Calendar View) ─────────────────────────────────

interface RulePopupProps {
  rule: ScheduleRuleWithPriority | null;
  detailLabels: RuleDetailLabels;
  onClose: () => void;
  onEdit: (rule: ScheduleRuleWithPriority) => void;
  onDelete: (rule: ScheduleRuleWithPriority) => void;
  onDuplicate: (rule: ScheduleRuleWithPriority) => void;
}

function RulePopup({ rule, detailLabels, onClose, onEdit, onDelete, onDuplicate }: RulePopupProps) {
  const { t } = useSettings();
  const detailLines = useMemo(
    () => (rule ? getRuleDetailLines(rule, detailLabels) : []),
    [rule, detailLabels],
  );
  if (!rule) return null;

  const summary = getRuleSummary(rule);

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
          <DetailLines lines={detailLines} expanded />
          <View style={styles.popupActions}>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupEditBtn]}
              onPress={() => { onClose(); onEdit(rule); }}
            >
              <Pencil size={14} color={Colors.primary} />
              <Text style={styles.popupEditText}>{t.common.edit}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.popupBtn, styles.popupEditBtn]}
              onPress={() => { onClose(); onDuplicate(rule); }}
            >
              <Copy size={14} color={Colors.primary} />
              <Text style={styles.popupEditText}>{t.schedules.duplicate}</Text>
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

const SURFACE_MODE_KEY = '@aiess/schedule_surface_mode';

export default function ScheduleListScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { rules, readOnlyRules, rawSchedules, isLoading, error, refetch, deleteRule, toggleRule } = useSchedules();
  const { siteConfigComplete } = useSiteConfig();
  const {
    favorites,
    refetch: refetchFavorites,
    addFavorite,
    removeFavorite,
    renameFavorite,
    findFavorite,
    isFavorited,
  } = useFavorites();

  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'favorites'>('list');
  const [calendarMode, setCalendarMode] = useState<'week' | 'day'>('week');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [popupRule, setPopupRule] = useState<ScheduleRuleWithPriority | null>(null);
  const [renameTarget, setRenameTarget] = useState<RuleFavorite | null>(null);

  // Simple/Pro is a per-user LOCAL presentation preference (guide doc 06) —
  // not per-site and not a security boundary. Default: Simple.
  const [surfaceMode, setSurfaceMode] = useState<'simple' | 'pro'>('simple');
  const [surfaceModeLoaded, setSurfaceModeLoaded] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SURFACE_MODE_KEY)
      .then((v) => { if (v === 'pro' || v === 'simple') setSurfaceMode(v); })
      .finally(() => setSurfaceModeLoaded(true));
  }, []);

  const switchSurfaceMode = (mode: 'simple' | 'pro') => {
    setSurfaceMode(mode);
    AsyncStorage.setItem(SURFACE_MODE_KEY, mode).catch(() => {});
  };

  const scheduleRules = rules.filter(rule => rule.priority !== 9);
  const detailLabels = useMemo(() => buildDetailLabels(t), [t]);

  const p9SiteLimit = rawSchedules?.sch?.p_9?.find(r => r.a.t === 'sl');
  const configReady = siteConfigComplete && p9SiteLimit !== undefined;

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchFavorites();
      setWeekStart(getMonday(new Date()));
      setSelectedDay(new Date());
    }, [refetch, refetchFavorites])
  );

  const handleEditRule = (rule: ScheduleRuleWithPriority) => {
    router.push({
      pathname: '/(tabs)/schedule/[ruleId]',
      params: { ruleId: rule.id, priority: rule.priority.toString() },
    });
  };

  const handleDuplicateRule = (rule: ScheduleRuleWithPriority) => {
    if (!configReady) {
      Alert.alert(t.settings.siteConfigIncompleteTitle, t.settings.siteConfigIncomplete);
      return;
    }
    router.push({
      pathname: '/(tabs)/schedule/[ruleId]',
      params: {
        ruleId: 'new',
        fromId: rule.id,
        fromPriority: rule.priority.toString(),
      },
    });
  };

  const handleUseFavorite = (favorite: RuleFavorite) => {
    if (!configReady) {
      Alert.alert(t.settings.siteConfigIncompleteTitle, t.settings.siteConfigIncomplete);
      return;
    }
    router.push({
      pathname: '/(tabs)/schedule/[ruleId]',
      params: { ruleId: 'new', fromFavId: favorite.favId },
    });
  };

  const handleToggleFavorite = async (rule: ScheduleRuleWithPriority) => {
    const existing = findFavorite(rule.id, rule.priority);
    try {
      if (existing) {
        await removeFavorite(existing.favId);
      } else {
        const { priority, ...ruleSnapshot } = rule;
        await addFavorite(ruleSnapshot, rule.priority, rule.id);
      }
    } catch {
      Alert.alert(t.common.error, t.common.error);
    }
  };

  const handleRenameFavorite = (favorite: RuleFavorite) => {
    setRenameTarget(favorite);
  };

  const handleConfirmRename = async (label: string) => {
    if (!renameTarget) return;
    try {
      await renameFavorite(renameTarget.favId, label || renameTarget.rule.id);
    } catch {
      // ignore
    }
    setRenameTarget(null);
  };

  const handleRemoveFavorite = (favorite: RuleFavorite) => {
    Alert.alert(
      t.schedules.removeFavorite,
      t.schedules.confirmRemoveFavorite,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFavorite(favorite.favId);
            } catch {
              // ignore
            }
          },
        },
      ],
    );
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
        <Text style={styles.headerTitle}>
          {surfaceMode === 'simple' ? t.schedules.simple.title : t.schedules.title}
        </Text>
        <Text style={styles.headerSubtitle}>
          {surfaceMode === 'simple'
            ? selectedDevice.name
            : `${selectedDevice.name} - ${scheduleRules.length} ${t.schedules.rules}`}
        </Text>
      </View>

      {/* Simple/Pro toggle row (own row — long PL title overflowed beside it) */}
      <View style={styles.modeRow}>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, surfaceMode === 'simple' && styles.modeBtnActive]}
            onPress={() => switchSurfaceMode('simple')}
          >
            <SlidersHorizontal size={13} color={surfaceMode === 'simple' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, surfaceMode === 'simple' && styles.modeBtnTextActive]}>
              {t.schedules.simple.simpleTab}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, surfaceMode === 'pro' && styles.modeBtnActive]}
            onPress={() => switchSurfaceMode('pro')}
          >
            <Settings2 size={13} color={surfaceMode === 'pro' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, surfaceMode === 'pro' && styles.modeBtnTextActive]}>
              {t.schedules.simple.proTab}
            </Text>
          </TouchableOpacity>
        </View>
        {surfaceMode === 'pro' && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setHistoryVisible(true)}
            accessibilityLabel={t.schedules.history.title}
          >
            <History size={18} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Simple mode: behavior control surface */}
      {surfaceModeLoaded && surfaceMode === 'simple' && <BehaviorSettings />}

      {/* Pro mode: full rules list/calendar/favorites */}
      {surfaceModeLoaded && surfaceMode === 'pro' && (
      <>
      {/* View mode toggle: List / Calendar / Favorites */}
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
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'favorites' && styles.segmentBtnActive]}
            onPress={() => setViewMode('favorites')}
          >
            <Star
              size={14}
              color={viewMode === 'favorites' ? '#fff' : Colors.textSecondary}
              fill={viewMode === 'favorites' ? '#fff' : 'transparent'}
            />
            <Text style={[styles.segmentText, viewMode === 'favorites' && styles.segmentTextActive]}>
              {t.schedules.favoritesView}
              {favorites.length > 0 ? ` (${favorites.length})` : ''}
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
        scheduleRules.length === 0 && readOnlyRules.length === 0 ? (
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
                detailLabels={detailLabels}
                isFavorited={isFavorited(rule.id, rule.priority)}
                onEdit={() => handleEditRule(rule)}
                onDelete={() => handleDeleteRule(rule)}
                onToggle={() => handleToggleRule(rule)}
                onDuplicate={() => handleDuplicateRule(rule)}
                onToggleFavorite={() => handleToggleFavorite(rule)}
                onSettingsBadgePress={() => switchSurfaceMode('simple')}
              />
            ))}
            {readOnlyRules.length > 0 && (
              <>
                <View style={styles.readOnlySectionHeader}>
                  <Lock size={13} color={Colors.textSecondary} />
                  <Text style={styles.readOnlySectionTitle}>{t.schedules.readOnlySection}</Text>
                </View>
                <Text style={styles.readOnlySectionHint}>{t.schedules.readOnlyHint}</Text>
                {readOnlyRules.map((rule) => (
                  <ReadOnlyRuleCard
                    key={`ro-${rule.priority}-${rule.id}`}
                    rule={rule}
                    detailLabels={detailLabels}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )
      ) : viewMode === 'favorites' ? (
        favorites.length === 0 ? (
          <View style={styles.centered}>
            <Star size={36} color={Colors.textSecondary} />
            <Text style={[styles.emptyTitle, { marginTop: 12 }]}>{t.schedules.noFavorites}</Text>
            <Text style={styles.emptySubtitle}>{t.schedules.noFavoritesHint}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetchFavorites} />}
          >
            {favorites.map((favorite) => (
              <FavoriteCard
                key={favorite.favId}
                favorite={favorite}
                detailLabels={detailLabels}
                onUse={() => handleUseFavorite(favorite)}
                onRename={() => handleRenameFavorite(favorite)}
                onRemove={() => handleRemoveFavorite(favorite)}
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
          detailLabels={detailLabels}
          onClose={() => setPopupRule(null)}
          onEdit={handleEditRule}
          onDelete={handleDeleteRule}
          onDuplicate={handleDuplicateRule}
        />
      )}

      {/* Rename favorite modal */}
      <RenameModal
        favorite={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={handleConfirmRename}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAddRule}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>
      </>
      )}

      {/* Site-wide activity feed (history) */}
      <ScheduleHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  historyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  modeBtnActive: { backgroundColor: Colors.primary },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  modeBtnTextActive: { color: '#fff' },

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
  readOnlyCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  readOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(100, 116, 139, 0.12)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  readOnlyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  readOnlySectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 2 },
  readOnlySectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  readOnlySectionHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleId: { fontSize: 15, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  priorityBadge: { fontSize: 11, fontWeight: '600', color: Colors.primary, backgroundColor: Colors.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(139, 92, 246, 0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText: { fontSize: 11, fontWeight: '600', color: '#8b5cf6' },
  settingsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  settingsBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  toggleSwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  summaryText: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 10 },
  cardContent: { gap: 5, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoValue: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  expandToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, marginTop: -4 },
  expandToggleText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  cardActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, flexWrap: 'wrap' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: Colors.primaryLight, borderRadius: 8 },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  duplicateButton: { backgroundColor: Colors.primaryLight },
  iconActionButton: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: Colors.primaryLight, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  deleteButton: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  deleteButtonText: { color: Colors.error },
  favoriteSourceId: { fontSize: 11, color: Colors.textSecondary, marginTop: -4, marginBottom: 8 },
  renameTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  renameInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
    marginBottom: 16,
  },

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
