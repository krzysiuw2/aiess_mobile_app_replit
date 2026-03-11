import React, { useState, useEffect } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { X, Save, Clock, Calendar, Bot, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSchedules } from '@/hooks/useSchedules';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import {
  formDataToOptimizedRule,
  optimizedRuleToFormData,
  validateRule,
} from '@/lib/aws-schedules';
import type {
  ActionType,
  Priority,
  Strategy,
  GridOperator,
  ScheduleRuleFormData,
} from '@/types';

// ─── Time Picker ────────────────────────────────────────────────

interface TimePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (time: string) => void;
  initialTime?: string;
  title: string;
  doneLabel: string;
  hourLabel: string;
  minuteLabel: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

function TimePicker({ visible, onClose, onSelect, initialTime, title, doneLabel, hourLabel, minuteLabel }: TimePickerProps) {
  const [hour, setHour] = useState(initialTime?.split(':')[0] || '12');
  const [minute, setMinute] = useState(initialTime?.split(':')[1] || '00');

  const handleConfirm = () => {
    onSelect(`${hour}:${minute}`);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide">
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>{title}</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={pickerStyles.doneButton}>{doneLabel}</Text>
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.pickerRow}>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{hourLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[pickerStyles.item, hour === h && pickerStyles.itemSelected]}
                    onPress={() => setHour(h)}
                  >
                    <Text style={[pickerStyles.itemText, hour === h && pickerStyles.itemTextSelected]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={pickerStyles.separator}>:</Text>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{minuteLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[pickerStyles.item, minute === m && pickerStyles.itemSelected]}
                    onPress={() => setMinute(m)}
                  >
                    <Text style={[pickerStyles.itemText, minute === m && pickerStyles.itemTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Date Picker ────────────────────────────────────────────────

interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: string) => void;
  initialDate?: string;
  title: string;
  doneLabel: string;
  yearLabel: string;
  monthLabel: string;
  dayLabel: string;
}

function DatePicker({ visible, onClose, onSelect, initialDate, title, doneLabel, yearLabel, monthLabel, dayLabel }: DatePickerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const YEARS = Array.from({ length: 5 }, (_, i) => (currentYear + i).toString());
  const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  const todayMonth = (now.getMonth() + 1).toString().padStart(2, '0');
  const todayDay = now.getDate().toString().padStart(2, '0');

  const parts = initialDate?.split('-') || [];
  const [year, setYear] = useState(parts[0] || currentYear.toString());
  const [month, setMonth] = useState(parts[1] || todayMonth);
  const [day, setDay] = useState(parts[2] || todayDay);

  const handleConfirm = () => {
    onSelect(`${year}-${month}-${day}`);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide">
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>{title}</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={pickerStyles.doneButton}>{doneLabel}</Text>
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.pickerRow}>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{yearLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {YEARS.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[pickerStyles.item, year === y && pickerStyles.itemSelected]}
                    onPress={() => setYear(y)}
                  >
                    <Text style={[pickerStyles.itemText, year === y && pickerStyles.itemTextSelected]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{monthLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {MONTHS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[pickerStyles.item, month === m && pickerStyles.itemSelected]}
                    onPress={() => setMonth(m)}
                  >
                    <Text style={[pickerStyles.itemText, month === m && pickerStyles.itemTextSelected]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{dayLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {DAYS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[pickerStyles.item, day === d && pickerStyles.itemSelected]}
                    onPress={() => setDay(d)}
                  >
                    <Text style={[pickerStyles.itemText, day === d && pickerStyles.itemTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  container: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontWeight: '600', color: Colors.text },
  doneButton: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  pickerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  column: { alignItems: 'center', marginHorizontal: 8 },
  columnLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  scrollView: { height: 180, width: 70 },
  item: { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderRadius: 8 },
  itemSelected: { backgroundColor: Colors.primaryLight },
  itemText: { fontSize: 20, color: Colors.text },
  itemTextSelected: { color: Colors.primary, fontWeight: '700' },
  separator: { fontSize: 28, fontWeight: '700', color: Colors.text, marginHorizontal: 4 },
});

// ─── Form State (UI-friendly strings) ──────────────────────────

interface FormState {
  id: string;
  priority: Priority;
  active: boolean;
  source: 'ai' | 'man' | undefined;
  actionType: ActionType;

  power: string;
  usePid: boolean;
  targetSoc: string;
  maxPower: string;
  maxGrid: string;
  minGrid: string;
  strategy: Strategy;

  hasTimeCondition: boolean;
  startTime: string;
  endTime: string;
  selectedDays: number[];

  hasSocCondition: boolean;
  socMin: string;
  socMax: string;

  hasGridCondition: boolean;
  gridOperator: GridOperator;
  gridValue: string;
  gridValueMax: string;

  validFromDate: string;
  validUntilDate: string;
}

const DEFAULT_FORM: FormState = {
  id: '',
  priority: 7,
  active: true,
  source: undefined,
  actionType: 'ch',
  power: '50',
  usePid: false,
  targetSoc: '80',
  maxPower: '50',
  maxGrid: '100',
  minGrid: '0',
  strategy: 'eq',
  hasTimeCondition: false,
  startTime: '',
  endTime: '',
  selectedDays: [0, 1, 2, 3, 4, 5, 6],
  hasSocCondition: false,
  socMin: '',
  socMax: '',
  hasGridCondition: false,
  gridOperator: 'gt',
  gridValue: '',
  gridValueMax: '',
  validFromDate: '',
  validUntilDate: '',
};

// ─── Main Component ─────────────────────────────────────────────

export default function RuleBuilderScreen() {
  const { t } = useSettings();
  const { ruleId, priority } = useLocalSearchParams<{ ruleId: string; priority?: string }>();
  const { rules, rawSchedules, safety, createRule, updateRule } = useSchedules();
  const { siteConfig, siteConfigComplete } = useSiteConfig();
  const isNew = ruleId === 'new';

  const p9SiteLimit = rawSchedules?.sch?.p_9?.find(r => r.a.t === 'sl');
  const siteHth = p9SiteLimit?.a.hth ?? 9999;
  const siteLth = p9SiteLimit?.a.lth ?? -9999;

  const maxCharge = siteConfig?.power_limits?.max_charge_kw ?? 9999;
  const maxDischarge = siteConfig?.power_limits?.max_discharge_kw ?? 9999;

  const configReady = siteConfigComplete && p9SiteLimit !== undefined;

  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val));

  const clampField = (field: keyof FormState, min: number, max: number) => {
    const raw = parseFloat(form[field] as string);
    if (isNaN(raw)) return;
    const clamped = clamp(raw, min, max);
    if (clamped !== raw) update({ [field]: clamped.toString() } as Partial<FormState>);
  };

  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [originalPriority, setOriginalPriority] = useState<Priority | undefined>(undefined);

  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showValidFromPicker, setShowValidFromPicker] = useState(false);
  const [showValidUntilPicker, setShowValidUntilPicker] = useState(false);

  const ed = t.schedules.editor;

  const ACTION_TYPES: { type: ActionType; label: string; description: string }[] = [
    { type: 'ch', label: t.schedules.actionTypes.charge, description: ed.chargeDesc },
    { type: 'dis', label: t.schedules.actionTypes.discharge, description: ed.dischargeDesc },
    { type: 'sb', label: t.schedules.actionTypes.standby, description: ed.standbyDesc },
    { type: 'ct', label: ed.chargeToTarget, description: ed.chargeToTargetDesc },
    { type: 'dt', label: ed.dischargeToTarget, description: ed.dischargeToTargetDesc },
  ];

  const STRATEGIES: { value: Strategy; label: string }[] = [
    { value: 'eq', label: ed.equalSpread },
    { value: 'agg', label: ed.aggressive },
    { value: 'con', label: ed.conservative },
  ];

  const GRID_OPERATORS: { value: GridOperator; label: string }[] = [
    { value: 'gt', label: ed.operators.gt },
    { value: 'lt', label: ed.operators.lt },
    { value: 'gte', label: ed.operators.gte },
    { value: 'lte', label: ed.operators.lte },
    { value: 'eq', label: ed.operators.eq },
    { value: 'bt', label: ed.operators.bt },
  ];

  const WEEKDAY_BUTTONS = ed.weekdays.map((label: string, index: number) => ({ index, label }));

  // Load existing rule
  useEffect(() => {
    if (!isNew && ruleId && rules.length > 0) {
      const p = parseInt(priority || '0') as Priority;
      const existing = rules.find(r => r.id === ruleId && r.priority === p);
      if (!existing) return;

      setOriginalPriority(existing.priority);

      const fd = optimizedRuleToFormData(existing, existing.priority);

      const tsToDate = (ts: number | undefined): string => {
        if (!ts) return '';
        return new Date(ts * 1000).toISOString().split('T')[0];
      };

      setForm({
        id: fd.id,
        priority: fd.priority,
        active: fd.active,
        source: existing.s,
        actionType: fd.actionType,
        power: fd.power?.toString() || '50',
        usePid: fd.usePid || false,
        targetSoc: fd.targetSoc?.toString() || '80',
        maxPower: fd.maxPower?.toString() || '50',
        maxGrid: fd.maxGridPower?.toString() || '100',
        minGrid: fd.minGridPower?.toString() || '0',
        strategy: fd.strategy || 'eq',
        hasTimeCondition: fd.timeStart !== undefined,
        startTime: fd.timeStart || '',
        endTime: fd.timeEnd || '',
        selectedDays: fd.weekdays || [0, 1, 2, 3, 4, 5, 6],
        hasSocCondition: fd.socMin !== undefined || fd.socMax !== undefined,
        socMin: fd.socMin?.toString() || '',
        socMax: fd.socMax?.toString() || '',
        hasGridCondition: fd.gridPowerOperator !== undefined,
        gridOperator: fd.gridPowerOperator || 'gt',
        gridValue: fd.gridPowerValue?.toString() || '',
        gridValueMax: fd.gridPowerValueMax?.toString() || '',
        validFromDate: tsToDate(fd.validFrom),
        validUntilDate: tsToDate(fd.validUntil),
      });
    }
  }, [isNew, ruleId, priority, rules]);

  const update = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const toggleDay = (index: number) => {
    update({
      selectedDays: form.selectedDays.includes(index)
        ? form.selectedDays.filter(d => d !== index)
        : [...form.selectedDays, index],
    });
  };

  const buildFormData = (): ScheduleRuleFormData => {
    const fd: ScheduleRuleFormData = {
      id: form.id.trim().toUpperCase(),
      priority: form.priority,
      actionType: form.actionType,
      active: form.active,
    };

    switch (form.actionType) {
      case 'ch':
      case 'dis':
        fd.power = parseFloat(form.power) || 0;
        fd.usePid = form.usePid;
        break;
      case 'ct':
        fd.targetSoc = parseFloat(form.targetSoc) || 80;
        fd.maxPower = parseFloat(form.maxPower) || undefined;
        fd.maxGridPower = parseFloat(form.maxGrid) || undefined;
        fd.strategy = form.strategy;
        break;
      case 'dt':
        fd.targetSoc = parseFloat(form.targetSoc) || 20;
        fd.maxPower = parseFloat(form.maxPower) || undefined;
        fd.minGridPower = parseFloat(form.minGrid) || undefined;
        fd.strategy = form.strategy;
        break;
    }

    if (form.hasTimeCondition && form.startTime && form.endTime) {
      fd.timeStart = form.startTime;
      fd.timeEnd = form.endTime;
    }

    if (form.hasSocCondition) {
      if (form.socMin) fd.socMin = parseFloat(form.socMin);
      if (form.socMax) fd.socMax = parseFloat(form.socMax);
    }

    if (form.hasGridCondition && form.gridValue) {
      fd.gridPowerOperator = form.gridOperator;
      fd.gridPowerValue = parseFloat(form.gridValue);
      if (form.gridOperator === 'bt' && form.gridValueMax) {
        fd.gridPowerValueMax = parseFloat(form.gridValueMax);
      }
    }

    if (form.selectedDays.length > 0 && form.selectedDays.length < 7) {
      fd.weekdays = form.selectedDays;
    }

    if (form.validFromDate) {
      const d = new Date(form.validFromDate + 'T00:00:00');
      if (!isNaN(d.getTime())) fd.validFrom = Math.floor(d.getTime() / 1000);
    }
    if (form.validUntilDate) {
      const d = new Date(form.validUntilDate + 'T23:59:59');
      if (!isNaN(d.getTime())) fd.validUntil = Math.floor(d.getTime() / 1000);
    }

    return fd;
  };

  const handleSave = async () => {
    if (!configReady) {
      Alert.alert(t.settings.siteConfigIncompleteTitle, t.settings.siteConfigIncomplete);
      return;
    }
    if (!form.id.trim()) {
      Alert.alert(t.common.error, ed.ruleIdRequired);
      return;
    }
    if (form.id.length > 63) {
      Alert.alert(t.common.error, ed.ruleIdTooLong);
      return;
    }

    const fd = buildFormData();
    const rule = formDataToOptimizedRule(fd);
    const errors = validateRule(rule, fd.priority);
    if (errors.length > 0) {
      Alert.alert(ed.validationError, errors.join('\n'));
      return;
    }

    try {
      setIsSaving(true);
      if (isNew) {
        await createRule(rule, fd.priority);
      } else {
        const priorityChanged = originalPriority !== undefined && originalPriority !== fd.priority;
        await updateRule(rule, fd.priority, priorityChanged ? originalPriority : undefined);
      }
      Alert.alert(t.common.success, isNew ? ed.ruleCreated : ed.ruleUpdated, [
        { text: t.common.ok, onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t.common.error, ed.failedToSaveRule);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(ed.discardChanges, ed.unsavedChangesLost, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.discard, style: 'destructive', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleDiscard}>
          <X size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isNew ? ed.newRule : ed.editRule}</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerButton, styles.saveHeaderButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      {siteConfig?.automation?.mode === 'automatic' && (
        <View style={styles.autoWarningBanner}>
          <AlertTriangle size={16} color="#92400E" />
          <Text style={styles.autoWarningText}>{t.settings.automationWarning}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Source badge */}
        {form.source === 'ai' && (
          <View style={styles.sourceBanner}>
            <Bot size={16} color="#8b5cf6" />
            <Text style={styles.sourceBannerText}>{ed.aiGeneratedRule}</Text>
          </View>
        )}

        {/* ─── Basic Info ────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.basicInfo}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{ed.ruleIdLabel}</Text>
            <TextInput
              style={styles.textInput}
              value={form.id}
              onChangeText={(text) => update({ id: text.toUpperCase().replace(/[^A-Z0-9\-_]/g, '') })}
              placeholder={ed.ruleIdPlaceholder}
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
              maxLength={63}
              editable={isNew}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.schedules.priority}</Text>
            <View style={styles.chipRow}>
              {([5, 6, 7, 8] as Priority[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, form.priority === p && styles.chipActive]}
                  onPress={() => update({ priority: p })}
                >
                  <Text style={[styles.chipText, form.priority === p && styles.chipTextActive]}>
                    P{p}
                  </Text>
                  <Text style={[styles.chipSubtext, form.priority === p && styles.chipTextActive]}>
                    {p === 5 ? ed.base : p === 6 ? ed.low : p === 7 ? ed.norm : ed.high}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.inputLabel}>{t.schedules.active}</Text>
              <Text style={styles.hintText}>{ed.ruleEvaluatedWhenActive}</Text>
            </View>
            <Switch
              value={form.active}
              onValueChange={(v) => update({ active: v })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={form.active ? Colors.primary : Colors.textSecondary}
            />
          </View>
        </View>

        {/* ─── Action Type ───────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.actionType}</Text>
          <View style={styles.actionGrid}>
            {ACTION_TYPES.map((a) => (
              <TouchableOpacity
                key={a.type}
                style={[styles.actionCard, form.actionType === a.type && styles.actionCardActive]}
                onPress={() => update({ actionType: a.type })}
              >
                <Text style={[styles.actionCardText, form.actionType === a.type && styles.actionCardTextActive]}>
                  {a.label}
                </Text>
                <Text style={[styles.actionCardDesc, form.actionType === a.type && styles.actionCardTextActive]}>
                  {a.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ─── Action Parameters ─────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.parameters}</Text>

          {(form.actionType === 'ch' || form.actionType === 'dis') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.powerKw}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.power}
                  onChangeText={(v) => update({ power: v.replace(/[^0-9.]/g, '') })}
                  onBlur={() => clampField('power', 0, form.actionType === 'ch' ? maxCharge : maxDischarge)}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.hintText}>
                  {ed.use999ForMax} (max: {form.actionType === 'ch' ? maxCharge : maxDischarge} kW)
                </Text>
              </View>

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.inputLabel}>{ed.pidControl}</Text>
                  <Text style={styles.hintText}>{ed.pidControlHint}</Text>
                </View>
                <Switch
                  value={form.usePid}
                  onValueChange={(v) => update({ usePid: v })}
                  trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                  thumbColor={form.usePid ? Colors.primary : Colors.textSecondary}
                />
              </View>
            </>
          )}

          {(form.actionType === 'ct' || form.actionType === 'dt') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.targetSoc}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.targetSoc}
                  onChangeText={(v) => update({ targetSoc: v.replace(/[^0-9]/g, '') })}
                  onBlur={() => clampField('targetSoc', safety.soc_min, safety.soc_max)}
                  keyboardType="number-pad"
                  placeholder="80"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.hintText}>
                  {safety.soc_min}% ~ {safety.soc_max}%
                </Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.maxPowerKw}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.maxPower}
                  onChangeText={(v) => update({ maxPower: v.replace(/[^0-9.]/g, '') })}
                  onBlur={() => clampField('maxPower', 0, form.actionType === 'ct' ? maxCharge : maxDischarge)}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.hintText}>
                  max: {form.actionType === 'ct' ? maxCharge : maxDischarge} kW
                </Text>
              </View>

              {form.actionType === 'ct' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{ed.maxGridImport}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.maxGrid}
                    onChangeText={(v) => update({ maxGrid: v.replace(/[^0-9.]/g, '') })}
                    onBlur={() => clampField('maxGrid', 0, siteHth)}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <Text style={styles.hintText}>
                    {ed.maxGridImportHint} (max: {siteHth} kW)
                  </Text>
                </View>
              )}

              {form.actionType === 'dt' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{ed.minGridPower}</Text>
                  <View style={styles.signedInputRow}>
                    <TouchableOpacity
                      style={styles.signToggle}
                      onPress={() => {
                        const v = form.minGrid;
                        update({ minGrid: v.startsWith('-') ? v.slice(1) : '-' + v });
                      }}
                    >
                      <Text style={styles.signToggleText}>±</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={form.minGrid}
                      onChangeText={(v) => update({ minGrid: v.replace(/[^0-9.\-]/g, '') })}
                      onBlur={() => clampField('minGrid', siteLth, siteHth)}
                      keyboardType="numbers-and-punctuation"
                      placeholder="0"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                  <Text style={styles.hintText}>
                    {ed.minGridPowerHint} ({siteLth} ~ {siteHth} kW)
                  </Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.strategy}</Text>
                <View style={styles.chipRow}>
                  {STRATEGIES.map((s) => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.chip, { flex: 1 }, form.strategy === s.value && styles.chipActive]}
                      onPress={() => update({ strategy: s.value })}
                    >
                      <Text style={[styles.chipText, form.strategy === s.value && styles.chipTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {form.actionType === 'sb' && (
            <Text style={styles.noParamsText}>{ed.noParamsStandby}</Text>
          )}
        </View>

        {/* ─── Time Conditions ───────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.timeCondition}</Text>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.inputLabel}>{ed.enableTimeWindow}</Text>
              <Text style={styles.hintText}>{ed.timeWindowHint}</Text>
            </View>
            <Switch
              value={form.hasTimeCondition}
              onValueChange={(v) => update({ hasTimeCondition: v })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={form.hasTimeCondition ? Colors.primary : Colors.textSecondary}
            />
          </View>

          {form.hasTimeCondition && (
            <>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.start}</Text>
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setShowStartTimePicker(true)}>
                    <Clock size={16} color={Colors.textSecondary} />
                    <Text style={[styles.pickerButtonText, !form.startTime && styles.placeholder]}>
                      {form.startTime || t.common.select}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.end}</Text>
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setShowEndTimePicker(true)}>
                    <Clock size={16} color={Colors.textSecondary} />
                    <Text style={[styles.pickerButtonText, !form.endTime && styles.placeholder]}>
                      {form.endTime || t.common.select}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.activeDays}</Text>
                <View style={styles.quickSelectRow}>
                  <TouchableOpacity style={styles.quickChip} onPress={() => update({ selectedDays: [1, 2, 3, 4, 5] })}>
                    <Text style={styles.quickChipText}>{ed.monFri}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickChip} onPress={() => update({ selectedDays: [0, 6] })}>
                    <Text style={styles.quickChipText}>{ed.satSun}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickChip} onPress={() => update({ selectedDays: [0, 1, 2, 3, 4, 5, 6] })}>
                    <Text style={styles.quickChipText}>{ed.all}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.daysRow}>
                  {WEEKDAY_BUTTONS.map((d: { index: number; label: string }) => (
                    <TouchableOpacity
                      key={d.index}
                      style={[styles.dayBtn, form.selectedDays.includes(d.index) && styles.dayBtnActive]}
                      onPress={() => toggleDay(d.index)}
                    >
                      <Text style={[styles.dayBtnText, form.selectedDays.includes(d.index) && styles.dayBtnTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        {/* ─── SoC Condition ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.socCondition}</Text>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.inputLabel}>{ed.enableSocRange}</Text>
              <Text style={styles.hintText}>{ed.socRangeHint}</Text>
            </View>
            <Switch
              value={form.hasSocCondition}
              onValueChange={(v) => update({ hasSocCondition: v })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={form.hasSocCondition ? Colors.primary : Colors.textSecondary}
            />
          </View>

          {form.hasSocCondition && (
            <>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.minSoc}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.socMin}
                    onChangeText={(v) => update({ socMin: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('socMin', safety.soc_min, safety.soc_max)}
                    keyboardType="number-pad"
                    placeholder={safety.soc_min.toString()}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.maxSoc}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.socMax}
                    onChangeText={(v) => update({ socMax: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('socMax', safety.soc_min, safety.soc_max)}
                    keyboardType="number-pad"
                    placeholder={safety.soc_max.toString()}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              <Text style={styles.hintText}>
                {ed.socRangeHint} ({safety.soc_min}% ~ {safety.soc_max}%)
              </Text>
            </>
          )}
        </View>

        {/* ─── Grid Power Condition ──────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.gridPowerCondition}</Text>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.inputLabel}>{ed.enableGridTrigger}</Text>
              <Text style={styles.hintText}>{ed.gridTriggerHint}</Text>
            </View>
            <Switch
              value={form.hasGridCondition}
              onValueChange={(v) => update({ hasGridCondition: v })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={form.hasGridCondition ? Colors.primary : Colors.textSecondary}
            />
          </View>

          {form.hasGridCondition && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.operator}</Text>
                <View style={styles.operatorGrid}>
                  {GRID_OPERATORS.map((op) => (
                    <TouchableOpacity
                      key={op.value}
                      style={[styles.operatorChip, form.gridOperator === op.value && styles.chipActive]}
                      onPress={() => update({ gridOperator: op.value })}
                    >
                      <Text style={[styles.operatorChipText, form.gridOperator === op.value && styles.chipTextActive]}>
                        {op.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.valueKw}</Text>
                  <View style={styles.signedInputRow}>
                    <TouchableOpacity
                      style={styles.signToggle}
                      onPress={() => {
                        const v = form.gridValue;
                        update({ gridValue: v.startsWith('-') ? v.slice(1) : '-' + v });
                      }}
                    >
                      <Text style={styles.signToggleText}>±</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={form.gridValue}
                      onChangeText={(v) => update({ gridValue: v.replace(/[^0-9.\-]/g, '') })}
                      onBlur={() => clampField('gridValue', siteLth, siteHth)}
                      keyboardType="numbers-and-punctuation"
                      placeholder="0"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                </View>
                {form.gridOperator === 'bt' && (
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{ed.maxValueKw}</Text>
                    <View style={styles.signedInputRow}>
                      <TouchableOpacity
                        style={styles.signToggle}
                        onPress={() => {
                          const v = form.gridValueMax;
                          update({ gridValueMax: v.startsWith('-') ? v.slice(1) : '-' + v });
                        }}
                      >
                        <Text style={styles.signToggleText}>±</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        value={form.gridValueMax}
                        onChangeText={(v) => update({ gridValueMax: v.replace(/[^0-9.\-]/g, '') })}
                        onBlur={() => clampField('gridValueMax', siteLth, siteHth)}
                        keyboardType="numbers-and-punctuation"
                        placeholder="50"
                        placeholderTextColor={Colors.textSecondary}
                      />
                    </View>
                  </View>
                )}
              </View>
              <Text style={styles.hintText}>
                {ed.gridPowerNote}
              </Text>
            </>
          )}
        </View>

        {/* ─── Validity Period ───────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.validityPeriod}</Text>
          <Text style={styles.hintText}>{ed.permanentHint}</Text>

          <View style={[styles.rowInputs, { marginTop: 12 }]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{ed.validFrom}</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowValidFromPicker(true)}>
                <Calendar size={16} color={Colors.textSecondary} />
                <Text style={[styles.pickerButtonText, !form.validFromDate && styles.placeholder]}>
                  {form.validFromDate || ed.selectDate}
                </Text>
              </TouchableOpacity>
              {form.validFromDate !== '' && (
                <TouchableOpacity onPress={() => update({ validFromDate: '' })}>
                  <Text style={styles.clearLink}>{t.common.clear}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{ed.validUntil}</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowValidUntilPicker(true)}>
                <Calendar size={16} color={Colors.textSecondary} />
                <Text style={[styles.pickerButtonText, !form.validUntilDate && styles.placeholder]}>
                  {form.validUntilDate || ed.selectDate}
                </Text>
              </TouchableOpacity>
              {form.validUntilDate !== '' && (
                <TouchableOpacity onPress={() => update({ validUntilDate: '' })}>
                  <Text style={styles.clearLink}>{t.common.clear}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Pickers */}
      <TimePicker visible={showStartTimePicker} onClose={() => setShowStartTimePicker(false)} onSelect={(time) => update({ startTime: time })} initialTime={form.startTime} title={ed.startTime} doneLabel={t.common.done} hourLabel={ed.hour} minuteLabel={ed.minute} />
      <TimePicker visible={showEndTimePicker} onClose={() => setShowEndTimePicker(false)} onSelect={(time) => update({ endTime: time })} initialTime={form.endTime} title={ed.endTime} doneLabel={t.common.done} hourLabel={ed.hour} minuteLabel={ed.minute} />
      <DatePicker visible={showValidFromPicker} onClose={() => setShowValidFromPicker(false)} onSelect={(d) => update({ validFromDate: d })} initialDate={form.validFromDate} title={ed.validFrom} doneLabel={t.common.done} yearLabel={ed.year} monthLabel={ed.month} dayLabel={ed.day} />
      <DatePicker visible={showValidUntilPicker} onClose={() => setShowValidUntilPicker(false)} onSelect={(d) => update({ validUntilDate: d })} initialDate={form.validUntilDate} title={ed.validUntil} doneLabel={t.common.done} yearLabel={ed.year} monthLabel={ed.month} dayLabel={ed.day} />

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>{isNew ? ed.createRule : ed.saveChanges}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
          <Text style={styles.discardButtonText}>{t.common.cancel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  autoWarningBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, marginHorizontal: 16, marginBottom: 4, padding: 12 },
  autoWarningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  saveHeaderButton: { backgroundColor: Colors.primary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  sourceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  sourceBannerText: { fontSize: 13, fontWeight: '600', color: '#8b5cf6' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hintText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rowInputs: { flexDirection: 'row', gap: 12 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  chipSubtext: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  chipTextActive: { color: '#fff' },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCard: {
    width: '48%',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionCardText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  actionCardDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  actionCardTextActive: { color: '#fff' },

  noParamsText: { color: Colors.textSecondary, fontStyle: 'italic' },

  quickSelectRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickChipText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  daysRow: { flexDirection: 'row', gap: 6 },
  dayBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  dayBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayBtnText: { fontSize: 12, fontWeight: '500', color: Colors.text },
  dayBtnTextActive: { color: '#fff' },

  operatorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  operatorChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  operatorChipText: { fontSize: 13, fontWeight: '500', color: Colors.text },

  signedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signToggle: {
    width: 40,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signToggleText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  pickerButtonText: { fontSize: 16, color: Colors.text },
  placeholder: { color: Colors.textSecondary },
  clearLink: { color: Colors.primary, fontSize: 12, marginTop: 4 },

  footer: { flexDirection: 'row', padding: 16, gap: 12 },
  confirmButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  discardButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  discardButtonText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
});
