import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle, Clock, Calendar, CalendarDays, Play, BrainCircuit, Zap, Shield } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { useSchedules } from '@/hooks/useSchedules';
import { useQueryClient } from '@tanstack/react-query';
import { triggerAgentRun } from '@/lib/aws-agent';
import type { SystemMode, SiteConfigAutomation } from '@/types';

const INTRADAY_OPTIONS = [15, 30, 60];
const DAILY_HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
const WEEKLY_DAYS = [0, 1, 2, 3, 4, 5, 6]; // Sun..Sat

export default function SystemSettingsScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { siteConfig, updateConfig, isLoading } = useSiteConfig();
  const { rawSchedules } = useSchedules();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null);

  const dayLabels: Record<number, string> = useMemo(() => ({
    0: t.settings.daySun, 1: t.settings.dayMon, 2: t.settings.dayTue,
    3: t.settings.dayWed, 4: t.settings.dayThu, 5: t.settings.dayFri, 6: t.settings.daySat,
  }), [t]);

  const isDynamicTariff = siteConfig?.tariff?.type === 'dynamic';

  const auto: Required<SiteConfigAutomation> = useMemo(() => ({
    mode: siteConfig?.automation?.mode ?? 'manual',
    enabled: siteConfig?.automation?.enabled ?? false,
    intraday_interval_min: siteConfig?.automation?.intraday_interval_min ?? (isDynamicTariff ? 15 : 60),
    daily_time: siteConfig?.automation?.daily_time ?? '11:00',
    weekly_day: siteConfig?.automation?.weekly_day ?? 0,
    weekly_time: siteConfig?.automation?.weekly_time ?? '11:00',
    use_custom_fallback_rules: siteConfig?.automation?.use_custom_fallback_rules ?? false,
  }), [siteConfig, isDynamicTariff]);

  const p9HthKw = useMemo(() => {
    const sl = rawSchedules?.sch?.p_9?.find(r => r.a.t === 'sl');
    return sl?.a.hth;
  }, [rawSchedules]);

  const effectiveImportKw = useMemo(() => {
    const fin = siteConfig?.financial;
    const cands: number[] = [];
    const moc = fin?.moc_zamowiona_after_bess_kw ?? fin?.moc_zamowiona_before_bess_kw;
    if (moc != null && moc > 0) cands.push(moc);
    const kva = siteConfig?.grid_connection?.capacity_kva;
    if (kva != null && kva > 0) cands.push(kva);
    const imp = siteConfig?.grid_connection?.import_limit_kw;
    if (imp != null && imp > 0) cands.push(imp);
    if (cands.length > 0) return Math.min(...cands);
    if (p9HthKw != null && p9HthKw > 0) return p9HthKw;
    return 70;
  }, [siteConfig, p9HthKw]);

  const saveAutomation = useCallback(async (patch: Partial<SiteConfigAutomation>) => {
    try {
      setSaving(true);
      await updateConfig({ automation: { ...auto, ...patch } });
    } catch {
      Alert.alert(t.common.error, t.settings.failedSaveAutomation);
    } finally {
      setSaving(false);
    }
  }, [auto, updateConfig, t]);

  const handleModeChange = useCallback(async (newMode: SystemMode) => {
    if (newMode === auto.mode) return;
    const automationEnabled = newMode === 'automatic' || newMode === 'semi-automatic';
    try {
      setSaving(true);
      await updateConfig({ automation: { ...auto, mode: newMode, enabled: automationEnabled } });
      Alert.alert(t.common.success, `${t.settings.systemModeSet} ${newMode}`);
    } catch {
      Alert.alert(t.common.error, t.settings.failedUpdateMode);
    } finally {
      setSaving(false);
    }
  }, [auto, updateConfig, t]);

  const MODES: { value: SystemMode; label: string; description: string }[] = [
    { value: 'automatic', label: t.settings.automatic, description: t.settings.automaticDesc },
    { value: 'semi-automatic', label: t.settings.semiAutomatic, description: t.settings.semiAutomaticDesc },
    { value: 'manual', label: t.settings.manual, description: t.settings.manualDesc },
  ];

  const recommendedIntraday = isDynamicTariff ? 15 : 60;
  const recommendedDailyTime = '11:00';
  const recommendedWeeklyDay = 0;
  const recommendedWeeklyTime = '11:00';

  const showAutomation = auto.mode === 'automatic' || auto.mode === 'semi-automatic';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.systemSettings}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Section 1: Operating Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.operatingMode}</Text>
          <Text style={styles.sectionDescription}>{t.settings.operatingModeDesc}</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : (
            <View style={styles.modeList}>
              {MODES.map((m) => {
                const isSelected = m.value === auto.mode;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.modeCard, isSelected && styles.modeCardActive]}
                    onPress={() => handleModeChange(m.value)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <View style={styles.modeCardHeader}>
                      <Text style={[styles.modeLabel, isSelected && styles.modeLabelActive]}>{m.label}</Text>
                      {isSelected && (
                        saving ? <ActivityIndicator size="small" color={Colors.primary} /> : <CheckCircle size={20} color={Colors.primary} />
                      )}
                    </View>
                    <Text style={[styles.modeDescription, isSelected && styles.modeDescriptionActive]}>{m.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {!isLoading && (
          <View style={styles.section}>
            <View style={styles.fallbackSectionHeader}>
              <Shield size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>{t.settings.fallback_rules}</Text>
            </View>
            <Text style={styles.sectionDescription}>{t.settings.fallback_rules_desc}</Text>

            <View style={styles.fallbackCard}>
              <Text style={styles.fallbackCardTitle}>{t.settings.zero_export_protection}</Text>
              <Text style={styles.fallbackCardBody}>{t.settings.fallback_rule_zero_desc}</Text>
            </View>
            <View style={styles.fallbackCard}>
              <Text style={styles.fallbackCardTitle}>{t.settings.peak_shave_protection}</Text>
              <Text style={styles.fallbackCardBody}>
                {t.settings.fallback_rule_peak_desc.replace('{kw}', String(effectiveImportKw))}
              </Text>
            </View>
            <View style={styles.fallbackCard}>
              <Text style={styles.fallbackCardTitle}>{t.settings.standby_fallback}</Text>
              <Text style={styles.fallbackCardBody}>{t.settings.fallback_rule_standby_desc}</Text>
            </View>

            <View style={styles.fallbackToggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.intervalTitle}>{t.settings.custom_fallback}</Text>
              </View>
              <Switch
                value={auto.use_custom_fallback_rules}
                onValueChange={(v) => saveAutomation({ use_custom_fallback_rules: v })}
                disabled={saving}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={auto.use_custom_fallback_rules ? Colors.primary : Colors.textSecondary}
              />
            </View>
            {auto.use_custom_fallback_rules && (
              <TouchableOpacity
                style={styles.fallbackScheduleLink}
                onPress={() => router.push('/(tabs)/schedule')}
                activeOpacity={0.7}
              >
                <Text style={styles.fallbackScheduleLinkText}>{t.tabs.schedule}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Section 2: AI Automation (only for automatic/semi-automatic) */}
        {showAutomation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.settings.aiAutomation}</Text>
            <Text style={styles.sectionDescription}>{t.settings.aiAutomationDesc}</Text>

            <View style={styles.intervalsContainer}>
              {/* Intraday interval */}
                <View style={styles.intervalCard}>
                  <View style={styles.intervalHeader}>
                    <Clock size={18} color={Colors.primary} />
                    <Text style={styles.intervalTitle}>{t.settings.intradayInterval}</Text>
                  </View>
                  <Text style={styles.intervalDesc}>{t.settings.intradayIntervalDesc}</Text>
                  <View style={styles.segmentedRow}>
                    {INTRADAY_OPTIONS.map((mins) => {
                      const selected = auto.intraday_interval_min === mins;
                      const isRec = mins === recommendedIntraday;
                      return (
                        <TouchableOpacity
                          key={mins}
                          style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
                          onPress={() => saveAutomation({ intraday_interval_min: mins })}
                          disabled={saving}
                        >
                          <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                            {mins} {t.settings.minutesSuffix}
                          </Text>
                          {isRec && <Text style={styles.recBadge}>{t.settings.recommended}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Daily plan time */}
                <View style={styles.intervalCard}>
                  <View style={styles.intervalHeader}>
                    <Calendar size={18} color={Colors.primary} />
                    <Text style={styles.intervalTitle}>{t.settings.dailyPlanTime}</Text>
                  </View>
                  <Text style={styles.intervalDesc}>{t.settings.dailyPlanTimeDesc}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                    <View style={styles.hourRow}>
                      {DAILY_HOURS.map((h) => {
                        const selected = auto.daily_time === h;
                        const isRec = h === recommendedDailyTime;
                        return (
                          <TouchableOpacity
                            key={h}
                            style={[styles.hourChip, selected && styles.hourChipActive, isRec && !selected && styles.hourChipRec]}
                            onPress={() => saveAutomation({ daily_time: h })}
                            disabled={saving}
                          >
                            <Text style={[styles.hourText, selected && styles.hourTextActive]}>{h}</Text>
                            {isRec && <Text style={styles.recBadgeSmall}>{t.settings.recommended}</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Weekly plan */}
                <View style={styles.intervalCard}>
                  <View style={styles.intervalHeader}>
                    <CalendarDays size={18} color={Colors.primary} />
                    <Text style={styles.intervalTitle}>{t.settings.weeklyPlan}</Text>
                  </View>
                  <Text style={styles.intervalDesc}>{t.settings.weeklyPlanDesc}</Text>
                  <View style={styles.dayRow}>
                    {WEEKLY_DAYS.map((d) => {
                      const selected = auto.weekly_day === d;
                      const isRec = d === recommendedWeeklyDay;
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.dayChip, selected && styles.dayChipActive, isRec && !selected && styles.dayChipRec]}
                          onPress={() => saveAutomation({ weekly_day: d })}
                          disabled={saving}
                        >
                          <Text style={[styles.dayText, selected && styles.dayTextActive]}>{dayLabels[d]}</Text>
                          {isRec && <Text style={styles.recBadgeSmall}>{t.settings.recommended}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                    <View style={styles.hourRow}>
                      {DAILY_HOURS.map((h) => {
                        const selected = auto.weekly_time === h;
                        const isRec = h === recommendedWeeklyTime;
                        return (
                          <TouchableOpacity
                            key={h}
                            style={[styles.hourChip, selected && styles.hourChipActive, isRec && !selected && styles.hourChipRec]}
                            onPress={() => saveAutomation({ weekly_time: h })}
                            disabled={saving}
                          >
                            <Text style={[styles.hourText, selected && styles.hourTextActive]}>{h}</Text>
                            {isRec && <Text style={styles.recBadgeSmall}>{t.settings.recommended}</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
            </View>
          </View>
        )}

        {/* Section 3: Manual Agent Trigger */}
        {showAutomation && selectedDevice?.device_id && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.aiAgent?.manualTrigger ?? 'Manual Agent Trigger'}</Text>
            <Text style={styles.sectionDescription}>{t.aiAgent?.manualTriggerDesc ?? 'Run an AI agent manually for testing or immediate optimization.'}</Text>

            <View style={styles.triggerRow}>
              {([
                { type: 'weekly' as const, label: t.aiAgent?.decisions?.weekly ?? 'Weekly', icon: CalendarDays, color: '#7C3AED' },
                { type: 'daily' as const, label: t.aiAgent?.decisions?.daily ?? 'Daily', icon: BrainCircuit, color: Colors.primary },
                { type: 'intraday' as const, label: t.aiAgent?.decisions?.intraday ?? 'Intraday', icon: Zap, color: '#D97706' },
              ]).map(({ type, label, icon: Icon, color }) => {
                const isTriggering = triggeringAgent === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.triggerBtn, { borderColor: color + '40' }]}
                    disabled={!!triggeringAgent}
                    activeOpacity={0.7}
                    onPress={async () => {
                      setTriggeringAgent(type);
                      try {
                        await triggerAgentRun(selectedDevice.device_id, type);
                        queryClient.invalidateQueries({ queryKey: ['agentState'] });
                        queryClient.invalidateQueries({ queryKey: ['agentDecisions'] });
                        queryClient.invalidateQueries({ queryKey: ['agentNotifications'] });
                        Alert.alert(t.common.success, `${label} agent triggered`);
                      } catch {
                        Alert.alert(t.common.error, `Failed to trigger ${type} agent`);
                      } finally {
                        setTriggeringAgent(null);
                      }
                    }}
                  >
                    {isTriggering ? (
                      <ActivityIndicator size="small" color={color} />
                    ) : (
                      <Icon size={20} color={color} />
                    )}
                    <Text style={[styles.triggerLabel, { color }]}>{label}</Text>
                    <Play size={14} color={color} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sectionDescription: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  modeList: { gap: 12 },
  modeCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: Colors.border },
  modeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  modeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modeLabel: { fontSize: 16, fontWeight: '600', color: Colors.text },
  modeLabelActive: { color: Colors.primary },
  modeDescription: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  modeDescriptionActive: { color: Colors.primary },
  intervalsContainer: { gap: 16 },
  intervalCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  intervalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  intervalTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  intervalDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
  segmentedRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary },
  hourScroll: { marginTop: 4 },
  hourRow: { flexDirection: 'row', gap: 6 },
  hourChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  hourChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  hourText: { fontSize: 13, color: Colors.textSecondary },
  hourTextActive: { fontWeight: '600', color: Colors.primary },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  dayChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  dayText: { fontSize: 13, color: Colors.textSecondary },
  dayTextActive: { fontWeight: '600', color: Colors.primary },
  dayChipRec: { borderColor: '#D97706', borderStyle: 'dashed' },
  hourChipRec: { borderColor: '#D97706', borderStyle: 'dashed' },
  recBadge: { fontSize: 9, color: '#D97706', fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  recBadgeSmall: { fontSize: 8, color: '#D97706', fontWeight: '600', marginTop: 1, textTransform: 'uppercase' },
  triggerRow: { gap: 10 },
  triggerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5 },
  triggerLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  fallbackSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fallbackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  fallbackCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  fallbackCardBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  fallbackToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fallbackScheduleLink: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  fallbackScheduleLinkText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
});
