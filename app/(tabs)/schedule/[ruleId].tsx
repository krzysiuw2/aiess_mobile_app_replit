import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  LayoutChangeEvent,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { X, Save, Clock, Calendar, Bot, AlertTriangle, Pencil, Zap, Moon, Sun, Shield } from 'lucide-react-native';
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
  const MONTHS_ARR = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
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
                {MONTHS_ARR.map((m) => (
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

// ─── Power Slider ───────────────────────────────────────────────

interface PowerSliderProps {
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  label: string;
}

function PowerSlider({ value, min, max, onValueChange, label }: PowerSliderProps) {
  const trackWidth = useRef(0);
  const fraction = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e: GestureResponderEvent, _gs: PanResponderGestureState) => {},
      onPanResponderMove: (e: GestureResponderEvent, _gs: PanResponderGestureState) => {
        if (trackWidth.current <= 0) return;
        const x = e.nativeEvent.locationX;
        const frac = Math.max(0, Math.min(1, x / trackWidth.current));
        const stepped = Math.round((frac * (max - min) + min) / 5) * 5;
        onValueChange(Math.max(min, Math.min(max, stepped)));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={sliderStyles.maxLabel}>Max: {max} kW</Text>
      </View>
      <View
        style={sliderStyles.trackContainer}
        onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.trackFill, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[sliderStyles.thumb, { left: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  maxLabel: { fontSize: 12, color: Colors.textSecondary },
  trackContainer: { height: 40, justifyContent: 'center', position: 'relative' },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  thumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, marginLeft: -12, top: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
});

// ─── Grid Range Bar ─────────────────────────────────────────────

interface GridRangeBarProps {
  siteLth: number;
  siteHth: number;
  operator: GridOperator;
  value: number;
  valueMax: number;
  enabled: boolean;
  actionType?: ActionType;
  chargingLabel?: string;
  dischargingLabel?: string;
}

function GridRangeBar({ siteLth, siteHth, operator, value, valueMax, enabled, actionType, chargingLabel = 'Charging', dischargingLabel = 'Discharging' }: GridRangeBarProps) {
  const range = siteHth - siteLth;
  if (range <= 0) return null;

  const toPercent = (v: number) => Math.max(0, Math.min(100, ((v - siteLth) / range) * 100));
  const zeroPercent = toPercent(0);

  let leftPct = 0;
  let widthPct = 0;
  const thresholds: number[] = [];
  if (enabled) {
    if (operator === 'gt') {
      leftPct = toPercent(value);
      widthPct = 100 - leftPct;
      thresholds.push(toPercent(value));
    } else if (operator === 'lt') {
      leftPct = 0;
      widthPct = toPercent(value);
      thresholds.push(toPercent(value));
    } else if (operator === 'bt') {
      leftPct = toPercent(value);
      widthPct = toPercent(valueMax) - leftPct;
      thresholds.push(toPercent(value), toPercent(valueMax));
    }
    widthPct = Math.max(widthPct, 2);
  }

  const actionLabel = actionType
    ? (actionType === 'ch' || actionType === 'ct') ? chargingLabel : dischargingLabel
    : '';
  const showLabel = enabled && widthPct > 15 && !!actionLabel;

  return (
    <View style={rangeBarStyles.container}>
      <View style={[rangeBarStyles.track, !enabled && rangeBarStyles.trackDisabled]}>
        <View style={[rangeBarStyles.exportZone, { width: `${zeroPercent}%` }]} />
        <View style={[rangeBarStyles.importZone, { left: `${zeroPercent}%`, width: `${100 - zeroPercent}%` }]} />
        {enabled && (
          <View style={[rangeBarStyles.activeZone, { left: `${leftPct}%`, width: `${widthPct}%` }]}>
            {showLabel && (
              <Text style={rangeBarStyles.actionLabel} numberOfLines={1}>{actionLabel}</Text>
            )}
          </View>
        )}
        <View style={[rangeBarStyles.zeroMark, { left: `${zeroPercent}%` }]} />
        {enabled && thresholds.map((pct, i) => (
          <View key={i} style={[rangeBarStyles.thresholdMark, { left: `${pct}%` }]} />
        ))}
      </View>
      <View style={rangeBarStyles.labels}>
        <Text style={[rangeBarStyles.labelText, !enabled && rangeBarStyles.labelDisabled]}>{siteLth} kW</Text>
        <Text style={[rangeBarStyles.labelText, { position: 'absolute', left: `${zeroPercent}%`, marginLeft: -6, fontWeight: '600' }, !enabled && rangeBarStyles.labelDisabled]}>0</Text>
        <Text style={[rangeBarStyles.labelText, !enabled && rangeBarStyles.labelDisabled]}>{siteHth} kW</Text>
      </View>
    </View>
  );
}

const rangeBarStyles = StyleSheet.create({
  container: { marginVertical: 12 },
  track: { height: 24, borderRadius: 12, backgroundColor: Colors.border, overflow: 'hidden', position: 'relative' },
  trackDisabled: { opacity: 0.35 },
  exportZone: { position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: 'rgba(239,68,68,0.15)' },
  importZone: { position: 'absolute', top: 0, height: '100%', backgroundColor: 'rgba(34,197,94,0.15)' },
  activeZone: {
    position: 'absolute', top: 0, height: '100%', backgroundColor: 'rgba(59,130,246,0.45)', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  actionLabel: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase' },
  zeroMark: { position: 'absolute', top: 0, width: 2, height: '100%', backgroundColor: Colors.text, opacity: 0.3, marginLeft: -1 },
  thresholdMark: { position: 'absolute', top: -2, width: 2, height: '116%', backgroundColor: Colors.primary, marginLeft: -1, borderRadius: 1 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  labelText: { fontSize: 11, color: Colors.textSecondary },
  labelDisabled: { opacity: 0.4 },
});

// ─── Segmented Control ──────────────────────────────────────────

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
}

function SegmentedControl({ options, selected, onSelect }: SegmentedControlProps) {
  return (
    <View style={segStyles.container}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[segStyles.option, selected === opt.value && segStyles.optionActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[segStyles.optionText, selected === opt.value && segStyles.optionTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: Colors.border, borderRadius: 12, padding: 3 },
  option: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  optionActive: { backgroundColor: Colors.primary },
  optionText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  optionTextActive: { color: '#fff' },
});

// ─── Rule ID Generator ──────────────────────────────────────────

function generateRuleId(
  actionType: ActionType,
  power: string,
  targetSoc: string,
  scheduleMode: 'one-time' | 'recurring',
  oneTimeDate: string,
  startTime: string,
  endTime: string,
  selectedDays: number[],
  prefixes: Record<string, string>,
  monthNames: string[],
  existingIds: string[],
): string {
  const prefix = prefixes[actionType] || actionType.toUpperCase();
  const param = (actionType === 'ct' || actionType === 'dt')
    ? (parseInt(targetSoc) || '80')
    : (parseInt(power) || '50');

  let timePart = '';
  if (scheduleMode === 'one-time') {
    const today = new Date().toISOString().split('T')[0];
    if (oneTimeDate === today) {
      timePart = 'TODAY';
    } else if (oneTimeDate) {
      const d = new Date(oneTimeDate + 'T00:00:00');
      const mon = monthNames[d.getMonth()] || '';
      timePart = `${mon.toUpperCase()}${d.getDate()}`;
    }
  } else {
    if (startTime && endTime) {
      const sh = parseInt(startTime.split(':')[0]);
      const eh = parseInt(endTime.split(':')[0]);
      if (sh >= 22 || eh <= 6) timePart = 'NIGHT';
      else if (sh >= 6 && eh <= 12) timePart = 'MORN';
      else if (sh >= 12 && eh <= 18) timePart = 'AFT';
      else if (sh >= 17 && eh <= 23) timePart = 'EVE';
      else timePart = 'ALLDAY';
    }
    if (selectedDays.length < 7 && selectedDays.length > 0) {
      const wd = [...selectedDays].sort();
      const isWeekdays = wd.length === 5 && [1, 2, 3, 4, 5].every(d => wd.includes(d));
      const isWeekend = wd.length === 2 && [0, 6].every(d => wd.includes(d));
      if (isWeekdays) timePart = timePart ? `${timePart}-WKDY` : 'WKDY';
      else if (isWeekend) timePart = timePart ? `${timePart}-WKND` : 'WKND';
    }
  }

  const base = [prefix, param, timePart].filter(Boolean).join('-');
  let candidate = base;
  let counter = 2;
  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }
  return candidate;
}

// ─── Rule Summary Builder ───────────────────────────────────────

interface SummaryLocale {
  todayLabel: string;
  everydayLabel: string;
  gridLabel: string;
}

function buildRuleSummary(
  form: FormState,
  actionLabels: Record<string, string>,
  dayLabels: string[],
  loc: SummaryLocale,
): string {
  const parts: string[] = [];

  const actionLabel = actionLabels[form.actionType] || form.actionType;
  if (form.actionType === 'ch' || form.actionType === 'dis') {
    parts.push(`${actionLabel} ${form.power || '?'} kW`);
  } else if (form.actionType === 'ct' || form.actionType === 'dt') {
    parts.push(`${actionLabel} ${form.targetSoc || '?'}%`);
  }

  if (form.scheduleMode === 'one-time') {
    const today = new Date().toISOString().split('T')[0];
    const dateLabel = form.oneTimeDate === today ? loc.todayLabel : form.oneTimeDate;
    parts.push(dateLabel);
  } else {
    if (form.selectedDays.length === 7) {
      parts.push(loc.everydayLabel);
    } else if (form.selectedDays.length > 0) {
      const sorted = [...form.selectedDays].sort();
      parts.push(sorted.map(d => dayLabels[d]).join(', '));
    }
  }

  if (form.startTime && form.endTime) {
    parts.push(`${form.startTime}-${form.endTime}`);
  }

  if (form.hasSocCondition && (form.socMin || form.socMax)) {
    parts.push(`SoC ${form.socMin || '?'}%-${form.socMax || '?'}%`);
  }

  if (form.hasGridCondition && form.gridValue) {
    const opLabel = form.gridOperator === 'gt' ? '>' : form.gridOperator === 'lt' ? '<' : '↔';
    if (form.gridOperator === 'bt') {
      parts.push(`${loc.gridLabel} ${form.gridValue}~${form.gridValueMax} kW`);
    } else {
      parts.push(`${loc.gridLabel} ${opLabel} ${form.gridValue} kW`);
    }
  }

  return parts.join(', ') || '...';
}

// ─── Form State ─────────────────────────────────────────────────

interface FormState {
  id: string;
  idManualOverride: boolean;
  priority: Priority;
  active: boolean;
  source: 'ai' | 'man' | undefined;
  actionType: ActionType;

  power: string;
  targetSoc: string;
  maxPower: string;
  maxGrid: string;
  minGrid: string;
  strategy: Strategy;

  scheduleMode: 'one-time' | 'recurring';
  oneTimeDate: string;
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

const todayISO = () => new Date().toISOString().split('T')[0];

const DEFAULT_FORM: FormState = {
  id: '',
  idManualOverride: false,
  priority: 7,
  active: true,
  source: undefined,
  actionType: 'ch',
  power: '50',
  targetSoc: '80',
  maxPower: '50',
  maxGrid: '100',
  minGrid: '0',
  strategy: 'eq',
  scheduleMode: 'one-time',
  oneTimeDate: todayISO(),
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
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showValidFromPicker, setShowValidFromPicker] = useState(false);
  const [showValidUntilPicker, setShowValidUntilPicker] = useState(false);
  const [showOneTimeDatePicker, setShowOneTimeDatePicker] = useState(false);

  const ed = t.schedules.editor;

  const ACTION_TYPES: { type: ActionType; label: string; description: string }[] = [
    { type: 'ch', label: t.schedules.actionTypes.charge, description: ed.chargeDesc },
    { type: 'dis', label: t.schedules.actionTypes.discharge, description: ed.dischargeDesc },
    { type: 'ct', label: ed.chargeToTarget, description: ed.chargeToTargetDesc },
    { type: 'dt', label: ed.dischargeToTarget, description: ed.dischargeToTargetDesc },
  ];

  const STRATEGIES: { value: Strategy; label: string; desc: string }[] = [
    { value: 'eq', label: ed.equalSpread, desc: ed.equalSpreadDesc },
    { value: 'agg', label: ed.aggressive, desc: ed.aggressiveDesc },
    { value: 'con', label: ed.conservative, desc: ed.conservativeDesc },
  ];

  const GRID_OPERATORS: { value: GridOperator; label: string }[] = [
    { value: 'gt', label: ed.above },
    { value: 'lt', label: ed.below },
    { value: 'bt', label: ed.between },
  ];

  const WEEKDAY_BUTTONS = ed.weekdays.map((label: string, index: number) => ({ index, label }));

  const existingIds = useMemo(() => rules.map(r => r.id), [rules]);

  const actionLabels: Record<string, string> = useMemo(() => ({
    ch: t.schedules.actionTypes.charge,
    dis: t.schedules.actionTypes.discharge,
    ct: ed.chargeToTarget,
    dt: ed.dischargeToTarget,
  }), [t]);

  // Auto-generate ID when form fields change
  useEffect(() => {
    if (!isNew || form.idManualOverride) return;
    const newId = generateRuleId(
      form.actionType,
      form.power,
      form.targetSoc,
      form.scheduleMode,
      form.oneTimeDate,
      form.startTime,
      form.endTime,
      form.selectedDays,
      ed.actionPrefixes,
      ed.monthNamesShort,
      existingIds,
    );
    if (newId !== form.id) {
      setForm(prev => ({ ...prev, id: newId }));
    }
  }, [form.actionType, form.power, form.targetSoc, form.scheduleMode, form.oneTimeDate, form.startTime, form.endTime, form.selectedDays, form.idManualOverride, isNew, existingIds]);

  // Auto-fill validity for one-time mode
  useEffect(() => {
    if (form.scheduleMode === 'one-time' && form.oneTimeDate) {
      setForm(prev => ({
        ...prev,
        validFromDate: prev.oneTimeDate,
        validUntilDate: prev.oneTimeDate,
      }));
    }
  }, [form.scheduleMode, form.oneTimeDate]);

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

      const hasWeekdays = fd.weekdays && fd.weekdays.length > 0 && fd.weekdays.length < 7;
      const mode: 'one-time' | 'recurring' = hasWeekdays ? 'recurring' : 'one-time';

      setForm({
        id: fd.id,
        idManualOverride: true,
        priority: fd.priority,
        active: fd.active,
        source: existing.s,
        actionType: fd.actionType,
        power: fd.power?.toString() || '50',
        targetSoc: fd.targetSoc?.toString() || '80',
        maxPower: fd.maxPower?.toString() || '50',
        maxGrid: fd.maxGridPower?.toString() || '100',
        minGrid: fd.minGridPower?.toString() || '0',
        strategy: fd.strategy || 'eq',
        scheduleMode: mode,
        oneTimeDate: mode === 'one-time' ? (tsToDate(fd.validFrom) || todayISO()) : todayISO(),
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

  const applyTemplate = useCallback((label: string, template: Partial<FormState>) => {
    if (activeTemplate === label) {
      setForm({ ...DEFAULT_FORM });
      setActiveTemplate(null);
    } else {
      setForm({ ...DEFAULT_FORM, ...template, idManualOverride: false });
      setActiveTemplate(label);
    }
  }, [activeTemplate]);

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
        fd.usePid = form.hasGridCondition;
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

    if (form.startTime && form.endTime) {
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

    if (form.scheduleMode === 'recurring' && form.selectedDays.length > 0 && form.selectedDays.length < 7) {
      fd.weekdays = form.selectedDays;
    }

    if (form.scheduleMode === 'one-time' && form.oneTimeDate) {
      const d = new Date(form.oneTimeDate + 'T00:00:00');
      if (!isNaN(d.getTime())) fd.validFrom = Math.floor(d.getTime() / 1000);
      const dEnd = new Date(form.oneTimeDate + 'T23:59:59');
      if (!isNaN(dEnd.getTime())) fd.validUntil = Math.floor(dEnd.getTime() / 1000);
    } else {
      if (form.validFromDate) {
        const d = new Date(form.validFromDate + 'T00:00:00');
        if (!isNaN(d.getTime())) fd.validFrom = Math.floor(d.getTime() / 1000);
      }
      if (form.validUntilDate) {
        const d = new Date(form.validUntilDate + 'T23:59:59');
        if (!isNaN(d.getTime())) fd.validUntil = Math.floor(d.getTime() / 1000);
      }
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

  // Validity quick-select helpers for recurring mode
  const setValidityThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    update({
      validFromDate: monday.toISOString().split('T')[0],
      validUntilDate: sunday.toISOString().split('T')[0],
    });
  };

  const setValidityThisMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    update({
      validFromDate: first.toISOString().split('T')[0],
      validUntilDate: last.toISOString().split('T')[0],
    });
  };

  const setValidityThisYear = () => {
    const year = new Date().getFullYear();
    update({
      validFromDate: `${year}-01-01`,
      validUntilDate: `${year}-12-31`,
    });
  };

  const setValidityPermanent = () => {
    update({ validFromDate: '', validUntilDate: '' });
  };

  const activeValidityPreset = useMemo(() => {
    const { validFromDate: vf, validUntilDate: vu } = form;
    if (!vf && !vu) return 'permanent';

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekFrom = monday.toISOString().split('T')[0];
    const weekUntil = sunday.toISOString().split('T')[0];
    if (vf === weekFrom && vu === weekUntil) return 'week';

    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthFrom = first.toISOString().split('T')[0];
    const monthUntil = last.toISOString().split('T')[0];
    if (vf === monthFrom && vu === monthUntil) return 'month';

    const year = now.getFullYear();
    if (vf === `${year}-01-01` && vu === `${year}-12-31`) return 'year';

    if (vf === todayISO() && vu === todayISO()) return 'today';

    return null;
  }, [form.validFromDate, form.validUntilDate]);

  const summaryLocale: SummaryLocale = useMemo(() => ({
    todayLabel: ed.todayButton,
    everydayLabel: t.schedules.everyday,
    gridLabel: t.monitor.grid,
  }), [ed.todayButton, t.schedules.everyday, t.monitor.grid]);

  const summaryText = useMemo(
    () => buildRuleSummary(form, actionLabels, ed.weekdays, summaryLocale),
    [form, actionLabels, ed.weekdays, summaryLocale],
  );

  // ─── Templates ──────────────────────────────────────────────

  const TEMPLATES = useMemo(() => [
    {
      label: ed.peakShaving,
      desc: ed.peakShavingDesc,
      icon: Zap,
      color: '#f59e0b',
      preset: {
        actionType: 'dis' as ActionType,
        power: '50',
        scheduleMode: 'recurring' as const,
        selectedDays: [0, 1, 2, 3, 4, 5, 6],
        hasGridCondition: true,
        gridOperator: 'gt' as GridOperator,
        gridValue: String(siteHth),
        validFromDate: '',
        validUntilDate: '',
        priority: 8 as Priority,
      },
    },
    {
      label: ed.nightCharging,
      desc: ed.nightChargingDesc,
      icon: Moon,
      color: '#6366f1',
      preset: {
        actionType: 'ct' as ActionType,
        targetSoc: '80',
        scheduleMode: 'recurring' as const,
        selectedDays: [0, 1, 2, 3, 4, 5, 6],
        startTime: '22:00',
        endTime: '06:00',
        priority: 7 as Priority,
      },
    },
    {
      label: ed.pvSelfConsumption,
      desc: ed.pvSelfConsumptionDesc,
      icon: Sun,
      color: '#22c55e',
      preset: {
        actionType: 'ch' as ActionType,
        power: '50',
        scheduleMode: 'recurring' as const,
        selectedDays: [0, 1, 2, 3, 4, 5, 6],
        hasGridCondition: true,
        gridOperator: 'lt' as GridOperator,
        gridValue: '0',
        priority: 7 as Priority,
      },
    },
    {
      label: ed.emergencyReserve,
      desc: ed.emergencyReserveDesc,
      icon: Shield,
      color: '#ef4444',
      preset: {
        actionType: 'ct' as ActionType,
        targetSoc: '100',
        scheduleMode: 'one-time' as const,
        oneTimeDate: todayISO(),
        priority: 8 as Priority,
      },
    },
  ], [ed, siteHth]);

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {siteConfig?.automation?.mode === 'automatic' && (
          <View style={styles.autoWarningBanner}>
            <AlertTriangle size={16} color="#92400E" />
            <Text style={styles.autoWarningText}>{t.settings.automationWarning}</Text>
          </View>
        )}

        {/* Source badge */}
        {form.source === 'ai' && (
          <View style={styles.sourceBanner}>
            <Bot size={16} color="#8b5cf6" />
            <Text style={styles.sourceBannerText}>{ed.aiGeneratedRule}</Text>
          </View>
        )}

        {/* ─── Templates ───────────────────────────────── */}
        {isNew && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{ed.templates}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templatesScroll}>
              {TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                const isActive = activeTemplate === tmpl.label;
                return (
                  <TouchableOpacity
                    key={tmpl.label}
                    style={[styles.templateCard, isActive && { borderColor: tmpl.color, borderWidth: 2 }]}
                    onPress={() => applyTemplate(tmpl.label, tmpl.preset as Partial<FormState>)}
                  >
                    <View style={[styles.templateIcon, { backgroundColor: tmpl.color + '18' }]}>
                      <Icon size={20} color={tmpl.color} />
                    </View>
                    <Text style={styles.templateLabel}>{tmpl.label}</Text>
                    <Text style={styles.templateDesc} numberOfLines={2}>{tmpl.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ─── Status: Active / Draft ──────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.ruleStatus}</Text>
          <SegmentedControl
            options={[
              { value: 'active', label: ed.statusActive },
              { value: 'draft', label: ed.statusDraft },
            ]}
            selected={form.active ? 'active' : 'draft'}
            onSelect={(v) => update({ active: v === 'active' })}
          />
          <Text style={styles.hintText}>
            {form.active ? ed.statusActiveHint : ed.statusDraftHint}
          </Text>
        </View>

        {/* ─── Rule ID (auto-generated) ────────────────── */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{ed.ruleIdLabel}</Text>
            {isNew && (
              <TouchableOpacity onPress={() => update({ idManualOverride: !form.idManualOverride })}>
                <View style={styles.editIdButton}>
                  <Pencil size={14} color={Colors.primary} />
                  <Text style={styles.editIdText}>{form.idManualOverride ? ed.ruleIdAutoGenerated : ed.ruleIdEdit}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          {form.idManualOverride || !isNew ? (
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
          ) : (
            <View style={styles.autoIdContainer}>
              <Text style={styles.autoIdText}>{form.id || '...'}</Text>
            </View>
          )}
          {isNew && !form.idManualOverride && (
            <Text style={styles.hintText}>{ed.ruleIdAutoGenerated}</Text>
          )}
        </View>

        {/* ─── Priority ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.schedules.priority}</Text>
          <View style={styles.chipRow}>
            {([6, 7, 8] as Priority[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, form.priority === p && styles.chipActive]}
                onPress={() => update({ priority: p })}
              >
                <Text style={[styles.chipText, form.priority === p && styles.chipTextActive]}>
                  {p === 6 ? ed.low : p === 7 ? ed.normal : ed.high}
                </Text>
              </TouchableOpacity>
            ))}
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
              <PowerSlider
                value={parseFloat(form.power) || 0}
                min={0}
                max={form.actionType === 'ch' ? maxCharge : maxDischarge}
                onValueChange={(v) => update({ power: v.toString() })}
                label={ed.powerKw}
              />
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.textInput}
                  value={form.power}
                  onChangeText={(v) => update({ power: v.replace(/[^0-9.]/g, '') })}
                  onBlur={() => clampField('power', 0, form.actionType === 'ch' ? maxCharge : maxDischarge)}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={Colors.textSecondary}
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
                  <Text style={styles.hintText}>{ed.maxGridImportHint} (max: {siteHth} kW)</Text>
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
                  <Text style={styles.hintText}>{ed.minGridPowerHint} ({siteLth} ~ {siteHth} kW)</Text>
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
                      <Text style={[styles.chipSubtext, form.strategy === s.value && styles.chipTextActive]}>
                        {s.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        {/* ─── Time / Date Condition ────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.timeDateCondition}</Text>

          <SegmentedControl
            options={[
              { value: 'one-time', label: ed.oneTime },
              { value: 'recurring', label: ed.recurring },
            ]}
            selected={form.scheduleMode}
            onSelect={(v) => update({ scheduleMode: v as 'one-time' | 'recurring' })}
          />

          {form.scheduleMode === 'one-time' && (
            <View style={styles.inputGroup}>
              <View style={[styles.rowInputs, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[styles.quickChip, form.oneTimeDate === todayISO() && styles.quickChipActive]}
                  onPress={() => update({ oneTimeDate: todayISO() })}
                >
                  <Text style={[styles.quickChipText, form.oneTimeDate === todayISO() && styles.quickChipTextActive]}>
                    {ed.todayButton}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickerButton, { flex: 1 }]}
                  onPress={() => setShowOneTimeDatePicker(true)}
                >
                  <Calendar size={16} color={Colors.textSecondary} />
                  <Text style={styles.pickerButtonText}>
                    {form.oneTimeDate !== todayISO() ? form.oneTimeDate : ed.pickDate}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {form.scheduleMode === 'recurring' && (
            <View style={[styles.inputGroup, { marginTop: 16 }]}>
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
          )}

          {/* Time pickers (always shown) */}
          <View style={[styles.rowInputs, { marginTop: 12 }]}>
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

          <GridRangeBar
            siteLth={siteLth}
            siteHth={siteHth}
            operator={form.gridOperator}
            value={parseFloat(form.gridValue) || 0}
            valueMax={parseFloat(form.gridValueMax) || 0}
            enabled={form.hasGridCondition}
            actionType={form.actionType}
            chargingLabel={t.monitor.charging}
            dischargingLabel={t.monitor.discharging}
          />

          {form.hasGridCondition && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.operator}</Text>
                <View style={styles.chipRow}>
                  {GRID_OPERATORS.map((op) => (
                    <TouchableOpacity
                      key={op.value}
                      style={[styles.chip, { flex: 1 }, form.gridOperator === op.value && styles.chipActive]}
                      onPress={() => update({ gridOperator: op.value })}
                    >
                      <Text style={[styles.chipText, form.gridOperator === op.value && styles.chipTextActive]}>
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
              <Text style={styles.hintText}>{ed.gridPowerNote}</Text>
            </>
          )}
        </View>

        {/* ─── Validity Period ───────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ed.validityPeriod}</Text>

          {form.scheduleMode === 'one-time' ? (
            <>
              <Text style={styles.hintText}>{ed.autoSetFromDate}</Text>
              <View style={[styles.rowInputs, { marginTop: 12 }]}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.validFrom}</Text>
                  <View style={[styles.pickerButton, styles.pickerDisabled]}>
                    <Calendar size={16} color={Colors.textSecondary} />
                    <Text style={styles.pickerButtonTextDisabled}>{form.validFromDate || '-'}</Text>
                  </View>
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.validUntil}</Text>
                  <View style={[styles.pickerButton, styles.pickerDisabled]}>
                    <Calendar size={16} color={Colors.textSecondary} />
                    <Text style={styles.pickerButtonTextDisabled}>{form.validUntilDate || '-'}</Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hintText}>{ed.permanentByDefault}</Text>
              <View style={[styles.quickSelectRow, { marginTop: 12 }]}>
                <TouchableOpacity style={[styles.quickChip, activeValidityPreset === 'week' && styles.quickChipActive]} onPress={setValidityThisWeek}>
                  <Text style={[styles.quickChipText, activeValidityPreset === 'week' && styles.quickChipTextActive]}>{ed.thisWeekPreset}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.quickChip, activeValidityPreset === 'month' && styles.quickChipActive]} onPress={setValidityThisMonth}>
                  <Text style={[styles.quickChipText, activeValidityPreset === 'month' && styles.quickChipTextActive]}>{ed.thisMonthPreset}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.quickChip, activeValidityPreset === 'year' && styles.quickChipActive]} onPress={setValidityThisYear}>
                  <Text style={[styles.quickChipText, activeValidityPreset === 'year' && styles.quickChipTextActive]}>{ed.thisYearPreset}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.quickChip, activeValidityPreset === 'permanent' && styles.quickChipActive]} onPress={setValidityPermanent}>
                  <Text style={[styles.quickChipText, activeValidityPreset === 'permanent' && styles.quickChipTextActive]}>{ed.permanentPreset}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.rowInputs, { marginTop: 8 }]}>
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
            </>
          )}
        </View>

        {/* ─── Rule Summary ──────────────────────────── */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{ed.ruleSummary}</Text>
          <Text style={styles.summaryId}>{form.id || '...'}</Text>
          <Text style={styles.summaryText}>{summaryText}</Text>
          {!form.active && (
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>{ed.statusDraft}</Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* Pickers */}
      <TimePicker visible={showStartTimePicker} onClose={() => setShowStartTimePicker(false)} onSelect={(time) => update({ startTime: time })} initialTime={form.startTime} title={ed.startTime} doneLabel={t.common.done} hourLabel={ed.hour} minuteLabel={ed.minute} />
      <TimePicker visible={showEndTimePicker} onClose={() => setShowEndTimePicker(false)} onSelect={(time) => update({ endTime: time })} initialTime={form.endTime} title={ed.endTime} doneLabel={t.common.done} hourLabel={ed.hour} minuteLabel={ed.minute} />
      <DatePicker visible={showOneTimeDatePicker} onClose={() => setShowOneTimeDatePicker(false)} onSelect={(d) => update({ oneTimeDate: d })} initialDate={form.oneTimeDate} title={ed.pickDate} doneLabel={t.common.done} yearLabel={ed.year} monthLabel={ed.month} dayLabel={ed.day} />
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

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

  quickSelectRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  quickChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickChipText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  quickChipTextActive: { color: '#fff' },

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
  pickerDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  pickerButtonText: { fontSize: 16, color: Colors.text },
  pickerButtonTextDisabled: { fontSize: 16, color: Colors.textSecondary },
  placeholder: { color: Colors.textSecondary },
  clearLink: { color: Colors.primary, fontSize: 12, marginTop: 4 },

  // Auto-generated ID
  autoIdContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  autoIdText: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
  editIdButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editIdText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  // Templates
  templatesScroll: { marginBottom: 4 },
  templateCard: {
    width: 140,
    padding: 14,
    marginRight: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  templateLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  templateDesc: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  // Summary card
  summaryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  summaryId: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 6, letterSpacing: 0.5 },
  summaryText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  draftBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  draftBadgeText: { fontSize: 12, fontWeight: '600', color: '#92400E' },

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
