import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ban, TrendingDown, Moon, Shield, Sun, Bot, CheckCircle2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { useSchedules } from '@/hooks/useSchedules';
import type { SiteBehavior } from '@/types';

/**
 * Simple-mode control surface (guide doc 06).
 *
 * Each setting is written to the `behavior` object of site-config as-is —
 * the cloud materializer turns it into a `set_*` rule asynchronously
 * (replace-by-id), so there is zero rule-mapping logic here. The whole
 * behavior object is sent on every save (PUT deep-merges at the top level).
 */

interface DraftState {
  zeroExportEnabled: boolean;
  zeroExportLimit: string;
  peakShaveEnabled: boolean;
  peakShaveThreshold: string;
  offpeakEnabled: boolean;
  offpeakStart: string;
  offpeakEnd: string;
  offpeakTargetSoc: string;
  backupReserveEnabled: boolean;
  backupReserveSoc: string;
  pvSelfEnabled: boolean;
  pvSelfAbsorbOnly: boolean;
  aiOptimizationEnabled: boolean;
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function behaviorToDraft(b: SiteBehavior | undefined): DraftState {
  return {
    zeroExportEnabled: b?.zero_export?.enabled ?? false,
    zeroExportLimit: b?.zero_export?.limit_kw !== undefined ? String(b.zero_export.limit_kw) : '0',
    peakShaveEnabled: b?.peak_shave?.enabled ?? false,
    peakShaveThreshold: b?.peak_shave?.threshold_kw !== undefined ? String(b.peak_shave.threshold_kw) : '',
    offpeakEnabled: b?.offpeak_charge?.enabled ?? false,
    offpeakStart: b?.offpeak_charge?.start ?? '22:00',
    offpeakEnd: b?.offpeak_charge?.end ?? '06:00',
    offpeakTargetSoc: b?.offpeak_charge?.target_soc !== undefined ? String(b.offpeak_charge.target_soc) : '80',
    backupReserveEnabled: b?.backup_reserve?.enabled ?? false,
    backupReserveSoc: b?.backup_reserve?.soc !== undefined ? String(b.backup_reserve.soc) : '20',
    pvSelfEnabled: b?.pv_self_consumption?.enabled ?? false,
    pvSelfAbsorbOnly: b?.pv_self_consumption?.absorb_only ?? false,
    aiOptimizationEnabled: b?.ai_optimization?.enabled ?? false,
  };
}

function draftToBehavior(d: DraftState): SiteBehavior {
  return {
    zero_export: {
      enabled: d.zeroExportEnabled,
      limit_kw: parseFloat(d.zeroExportLimit) || 0,
    },
    peak_shave: {
      enabled: d.peakShaveEnabled,
      ...(d.peakShaveThreshold !== '' ? { threshold_kw: parseFloat(d.peakShaveThreshold) } : {}),
    },
    offpeak_charge: {
      enabled: d.offpeakEnabled,
      start: d.offpeakStart,
      end: d.offpeakEnd,
      target_soc: parseFloat(d.offpeakTargetSoc) || 0,
    },
    backup_reserve: {
      enabled: d.backupReserveEnabled,
      soc: parseFloat(d.backupReserveSoc) || 0,
    },
    pv_self_consumption: {
      enabled: d.pvSelfEnabled,
      absorb_only: d.pvSelfAbsorbOnly,
    },
    ai_optimization: {
      enabled: d.aiOptimizationEnabled,
    },
  };
}

export default function BehaviorSettings() {
  const { t } = useSettings();
  const s = t.schedules.simple;
  const { siteConfig, updateConfig, isLoading, refetch: refetchConfig } = useSiteConfig();
  const { refetch: refetchSchedules } = useSchedules();

  const [draft, setDraft] = useState<DraftState>(() => behaviorToDraft(siteConfig?.behavior));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from server unless the user has unsaved edits.
  useEffect(() => {
    if (!dirty) setDraft(behaviorToDraft(siteConfig?.behavior));
  }, [siteConfig?.behavior, dirty]);

  useEffect(() => () => {
    if (applyTimer.current) clearTimeout(applyTimer.current);
  }, []);

  const update = (patch: Partial<DraftState>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const validate = (): string | null => {
    // Fail-safe skips are silent server-side, so validate up front.
    if (draft.peakShaveEnabled) {
      const th = parseFloat(draft.peakShaveThreshold);
      if (isNaN(th) || th <= 0) return s.validationThreshold;
    }
    if (draft.offpeakEnabled) {
      if (!TIME_RE.test(draft.offpeakStart) || !TIME_RE.test(draft.offpeakEnd)) return s.validationTime;
      const soc = parseFloat(draft.offpeakTargetSoc);
      if (isNaN(soc) || soc < 0 || soc > 100) return s.validationSoc;
    }
    if (draft.backupReserveEnabled) {
      const soc = parseFloat(draft.backupReserveSoc);
      if (isNaN(soc) || soc < 0 || soc > 100) return s.validationSoc;
    }
    if (draft.zeroExportEnabled) {
      const lim = parseFloat(draft.zeroExportLimit);
      if (isNaN(lim) || lim < 0) return s.validationThreshold;
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      Alert.alert(t.common.error, error);
      return;
    }
    try {
      setSaving(true);
      await updateConfig({ behavior: draftToBehavior(draft) });
      setDirty(false);
      // Materialization into set_* rules is async cloud-side; refresh the
      // schedules (Pro view) after a few seconds so the badges appear.
      setApplying(true);
      if (applyTimer.current) clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(async () => {
        await Promise.all([refetchSchedules(), refetchConfig()]);
        setApplying(false);
      }, 5000);
    } catch {
      Alert.alert(t.common.error, s.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !siteConfig) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetchConfig} />}
    >
      <Text style={styles.subtitle}>{s.subtitle}</Text>

      {applying && (
        <View style={styles.applyingBanner}>
          <CheckCircle2 size={16} color={Colors.primary} />
          <Text style={styles.applyingText}>{s.savedRefreshing}</Text>
        </View>
      )}

      {/* Zero export */}
      <BehaviorCard
        icon={<Ban size={20} color="#ef4444" />}
        iconBg="#ef444418"
        title={s.zeroExportTitle}
        desc={s.zeroExportDesc}
        enabled={draft.zeroExportEnabled}
        onToggle={(v) => update({ zeroExportEnabled: v })}
      >
        <Field
          label={s.zeroExportLimit}
          value={draft.zeroExportLimit}
          onChange={(v) => update({ zeroExportLimit: v.replace(/[^0-9.]/g, '') })}
          placeholder="0"
        />
      </BehaviorCard>

      {/* Peak shaving */}
      <BehaviorCard
        icon={<TrendingDown size={20} color="#f59e0b" />}
        iconBg="#f59e0b18"
        title={s.peakShaveTitle}
        desc={s.peakShaveDesc}
        enabled={draft.peakShaveEnabled}
        onToggle={(v) => update({ peakShaveEnabled: v })}
      >
        <Field
          label={s.peakShaveThreshold}
          value={draft.peakShaveThreshold}
          onChange={(v) => update({ peakShaveThreshold: v.replace(/[^0-9.]/g, '') })}
          placeholder="100"
        />
      </BehaviorCard>

      {/* Off-peak charging */}
      <BehaviorCard
        icon={<Moon size={20} color="#6366f1" />}
        iconBg="#6366f118"
        title={s.offpeakChargeTitle}
        desc={s.offpeakChargeDesc}
        enabled={draft.offpeakEnabled}
        onToggle={(v) => update({ offpeakEnabled: v })}
      >
        <View style={styles.fieldRow}>
          <Field
            label={s.offpeakStart}
            value={draft.offpeakStart}
            onChange={(v) => update({ offpeakStart: v.replace(/[^0-9:]/g, '') })}
            placeholder="22:00"
            flex
          />
          <Field
            label={s.offpeakEnd}
            value={draft.offpeakEnd}
            onChange={(v) => update({ offpeakEnd: v.replace(/[^0-9:]/g, '') })}
            placeholder="06:00"
            flex
          />
        </View>
        <Field
          label={s.offpeakTargetSoc}
          value={draft.offpeakTargetSoc}
          onChange={(v) => update({ offpeakTargetSoc: v.replace(/[^0-9]/g, '') })}
          placeholder="80"
        />
      </BehaviorCard>

      {/* Backup reserve */}
      <BehaviorCard
        icon={<Shield size={20} color="#ef4444" />}
        iconBg="#ef444418"
        title={s.backupReserveTitle}
        desc={s.backupReserveDesc}
        enabled={draft.backupReserveEnabled}
        onToggle={(v) => update({ backupReserveEnabled: v })}
      >
        <Field
          label={s.backupReserveSoc}
          value={draft.backupReserveSoc}
          onChange={(v) => update({ backupReserveSoc: v.replace(/[^0-9]/g, '') })}
          placeholder="20"
        />
      </BehaviorCard>

      {/* PV self-consumption */}
      <BehaviorCard
        icon={<Sun size={20} color="#22c55e" />}
        iconBg="#22c55e18"
        title={s.pvSelfConsumptionTitle}
        desc={s.pvSelfConsumptionDesc}
        enabled={draft.pvSelfEnabled}
        onToggle={(v) => update({ pvSelfEnabled: v })}
      >
        <View style={styles.switchLine}>
          <Text style={styles.switchLineLabel}>{s.absorbOnly}</Text>
          <Switch
            value={draft.pvSelfAbsorbOnly}
            onValueChange={(v) => update({ pvSelfAbsorbOnly: v })}
            trackColor={{ false: Colors.border, true: Colors.primaryLight }}
            thumbColor={draft.pvSelfAbsorbOnly ? Colors.primary : Colors.textSecondary}
          />
        </View>
      </BehaviorCard>

      {/* AI optimization (informational in v1.1.0) */}
      <BehaviorCard
        icon={<Bot size={20} color="#8b5cf6" />}
        iconBg="#8b5cf618"
        title={s.aiOptimizationTitle}
        desc={s.aiOptimizationDesc}
        enabled={draft.aiOptimizationEnabled}
        onToggle={(v) => update({ aiOptimizationEnabled: v })}
      >
        <Text style={styles.noteText}>{s.aiOptimizationNote}</Text>
      </BehaviorCard>

      <TouchableOpacity
        style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!dirty || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>{applying ? s.applying : s.save}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Building blocks ────────────────────────────────────────────

interface BehaviorCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}

function BehaviorCard({ icon, iconBg, title, desc, enabled, onToggle, children }: BehaviorCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: Colors.primaryLight }}
          thumbColor={enabled ? Colors.primary : Colors.textSecondary}
        />
      </View>
      {enabled && children && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  flex?: boolean;
}

function Field({ label, value, onChange, placeholder, flex }: FieldProps) {
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numbers-and-punctuation"
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  subtitle: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 },
  applyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  applyingText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.primary },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitles: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardBody: { marginTop: 12, gap: 10 },

  field: { marginBottom: 4 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  switchLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLineLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  noteText: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },

  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
