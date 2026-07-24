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
import { X, Save, Clock, Calendar, Bot, AlertTriangle, Pencil, Zap, Moon, Sun, Shield, History } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import {
  formDataToOptimizedRule,
  optimizedRuleToFormData,
  validateRule,
  unixToLocalDateStr,
  localDateStrToUnix,
  isGuardrailAction,
  GUARDRAIL_BAND,
} from '@/lib/aws-schedules';
import { evaluatePolarity, type PolarityWarning } from '@/lib/rule-polarity';
import { getFavoriteById } from '@/lib/rule-favorites';
import ScheduleHistorySheet from '@/components/schedule/ScheduleHistorySheet';
import TimePicker, { pickerStyles } from '@/components/common/TimePicker';
import type {
  ActionType,
  Priority,
  Strategy,
  GridOperator,
  Recurrence,
  Firmness,
  OptimizedScheduleRule,
  ScheduleRuleFormData,
} from '@/types';

// ─── Date Picker ────────────────────────────────────────────────
// (TimePicker was extracted to components/common/TimePicker.tsx and is
// imported above together with the shared pickerStyles.)

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

// ─── Power Slider ───────────────────────────────────────────────

interface PowerSliderProps {
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  label: string;
}

function PowerSlider({ value, min, max, onValueChange, label }: PowerSliderProps) {
  const trackRef = useRef<View>(null);
  const trackWidth = useRef(0);
  const trackPageX = useRef(0);
  const fraction = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  // PanResponder is created once below, so read live min/max/onValueChange
  // from refs to avoid a stale closure over the first render's props (e.g.
  // switching charge/discharge changes `max` without remounting).
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onValueChangeRef = useRef(onValueChange);
  minRef.current = min;
  maxRef.current = max;
  onValueChangeRef.current = onValueChange;

  const measureTrack = useCallback(() => {
    // Absolute (page) coordinates, not layout width alone — needed so drag
    // math below is anchored to the screen, independent of scroll position.
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackPageX.current = x;
      trackWidth.current = width;
    });
  }, []);

  const updateFromPageX = useCallback((pageX: number) => {
    if (trackWidth.current <= 0) return;
    const lo = minRef.current;
    const hi = maxRef.current;
    // Use pageX (absolute screen position) rather than locationX: locationX
    // is reported relative to whichever nested view is under the touch, and
    // the 24px thumb overlapping the track made it jump to the edges whenever
    // the drag started on/over the thumb itself.
    const x = pageX - trackPageX.current;
    const frac = Math.max(0, Math.min(1, x / trackWidth.current));
    const stepped = Math.round((frac * (hi - lo) + lo) / 5) * 5;
    onValueChangeRef.current(Math.max(lo, Math.min(hi, stepped)));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        // Re-measure in case the track scrolled since the last onLayout.
        measureTrack();
        updateFromPageX(e.nativeEvent.pageX);
      },
      onPanResponderMove: (e: GestureResponderEvent, _gs: PanResponderGestureState) => {
        updateFromPageX(e.nativeEvent.pageX);
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
        ref={trackRef}
        style={sliderStyles.trackContainer}
        onLayout={(e: LayoutChangeEvent) => {
          trackWidth.current = e.nativeEvent.layout.width;
          measureTrack();
        }}
        {...panResponder.panHandlers}
      >
        <View style={sliderStyles.track} pointerEvents="none">
          <View style={[sliderStyles.trackFill, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[sliderStyles.thumb, { left: `${fraction * 100}%` }]} pointerEvents="none" />
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
  limitKw: string,
  targetGridKw: string,
  holdSocLow: string,
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
  const param =
    (actionType === 'ct' || actionType === 'dt') ? (parseInt(targetSoc) || '80')
    : (actionType === 'bx' || actionType === 'bi') ? (parseInt(limitKw) || 0)
    : actionType === 'sc' ? (parseInt(targetGridKw) || 0)
    : actionType === 'hs' ? (parseInt(holdSocLow) || '20')
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
  } else if (form.actionType === 'bx' || form.actionType === 'bi') {
    const lim = parseFloat(form.limitKw) || 0;
    parts.push(lim > 0 ? `${actionLabel} ≤ ${lim} kW` : actionLabel);
  } else if (form.actionType === 'sc') {
    parts.push(`${actionLabel} → ${form.targetGridKw || '0'} kW`);
  } else if (form.actionType === 'hs') {
    parts.push(`${actionLabel} ${form.holdSocLow || '?'}%${form.holdSocHigh ? `-${form.holdSocHigh}%` : ''}`);
  }

  if (form.scheduleMode === 'one-time') {
    const today = new Date().toISOString().split('T')[0];
    const dateLabel = form.oneTimeDate === today ? loc.todayLabel : form.oneTimeDate;
    parts.push(dateLabel);
  } else if (form.recurrence === 'monthly') {
    if (form.monthDays.length > 0) {
      parts.push([...form.monthDays].sort((a, b) => a - b).join(', '));
    }
  } else if (form.recurrence === 'daily') {
    parts.push(loc.everydayLabel);
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

  // bx / bi (guardrails)
  limitKw: string;
  firmness: Firmness;
  // sc (self-consumption)
  targetGridKw: string;
  deadBandKw: string;
  scMaxChargeKw: string;
  scMaxDischargeKw: string;
  scSocMin: string;
  scSocMax: string;
  // hs (hold SoC)
  holdSocLow: string;
  holdSocHigh: string;
  hysteresis: string;
  // Recurrence
  recurrence: Recurrence;
  monthDays: number[];
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
  limitKw: '0',
  firmness: 'firm',
  targetGridKw: '0',
  deadBandKw: '',
  scMaxChargeKw: '',
  scMaxDischargeKw: '',
  scSocMin: '',
  scSocMax: '',
  holdSocLow: '20',
  holdSocHigh: '80',
  hysteresis: '',
  recurrence: 'weekly',
  monthDays: [],
};

// ─── Main Component ─────────────────────────────────────────────

export default function RuleBuilderScreen() {
  const { t } = useSettings();
  const { ruleId, priority, fromId, fromPriority, fromFavId } = useLocalSearchParams<{
    ruleId: string;
    priority?: string;
    fromId?: string;
    fromPriority?: string;
    fromFavId?: string;
  }>();
  const { selectedDevice } = useDevices();
  const { rules, rawSchedules, safety, createRule, updateRule } = useSchedules();
  const { siteConfig, siteConfigComplete } = useSiteConfig();
  const isNew = ruleId === 'new';
  const isDuplicateFromRule = isNew && !!fromId;
  const isFromFavorite = isNew && !!fromFavId;

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
  const [duplicateBanner, setDuplicateBanner] = useState<string | null>(null);

  const [showHistorySheet, setShowHistorySheet] = useState(false);
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
    { type: 'sc', label: t.schedules.actionTypes.selfConsumption, description: ed.selfConsumptionDesc },
    { type: 'hs', label: t.schedules.actionTypes.holdSoc, description: ed.holdSocDesc },
    { type: 'bx', label: t.schedules.actionTypes.blockExport, description: ed.blockExportDesc },
    { type: 'bi', label: t.schedules.actionTypes.blockImport, description: ed.blockImportDesc },
  ];

  const isGuardrail = isGuardrailAction(form.actionType);

  // Polarity matrix (guide doc 07 §5): grey out latching operators, surface
  // warn-level combos inline. Mirrors the Lambda's 400/warnings behaviour.
  const polarity = useMemo(() => evaluatePolarity(form.actionType, {
    gridOperator: form.hasGridCondition ? form.gridOperator : undefined,
    hasSocMin: form.hasSocCondition && form.socMin !== '',
    hasSocMax: form.hasSocCondition && form.socMax !== '',
  }), [form.actionType, form.hasGridCondition, form.gridOperator, form.hasSocCondition, form.socMin, form.socMax]);

  const polarityWarningText: Record<PolarityWarning, string> = {
    bangBang: ed.warnBangBang,
    hsGridGate: ed.warnHsGrid,
    socLatch: ed.warnSocLatch,
  };

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
    bx: t.schedules.actionTypes.blockExport,
    bi: t.schedules.actionTypes.blockImport,
    sc: t.schedules.actionTypes.selfConsumption,
    hs: t.schedules.actionTypes.holdSoc,
  }), [t]);

  // Auto-generate ID when form fields change
  useEffect(() => {
    if (!isNew || form.idManualOverride) return;
    const newId = generateRuleId(
      form.actionType,
      form.power,
      form.targetSoc,
      form.limitKw,
      form.targetGridKw,
      form.holdSocLow,
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
  }, [form.actionType, form.power, form.targetSoc, form.limitKw, form.targetGridKw, form.holdSocLow, form.scheduleMode, form.oneTimeDate, form.startTime, form.endTime, form.selectedDays, form.idManualOverride, isNew, existingIds]);

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

  // Switching to recurring mode should default "Okres ważności" to Stała
  // (permanent) rather than leaving it on the leftover one-time date set by
  // the effect above. Only clears when the dates still look auto-filled
  // (both equal oneTimeDate), so an intentionally-set validity window on an
  // existing rule is left untouched.
  useEffect(() => {
    if (
      form.scheduleMode === 'recurring' &&
      form.validFromDate !== '' &&
      form.validFromDate === form.oneTimeDate &&
      form.validUntilDate === form.oneTimeDate
    ) {
      setForm(prev => ({ ...prev, validFromDate: '', validUntilDate: '' }));
    }
  }, [form.scheduleMode, form.validFromDate, form.validUntilDate, form.oneTimeDate]);

  const buildFormStateFromRule = useCallback((
    rule: OptimizedScheduleRule,
    p: Priority,
    options: { keepId: boolean; keepActive: boolean; keepSource: boolean },
  ): FormState => {
    const fd = optimizedRuleToFormData(rule, p);
    const hasWeekdays = fd.weekdays && fd.weekdays.length > 0 && fd.weekdays.length < 7;
    const hasMonthDays = fd.monthDays && fd.monthDays.length > 0;
    const mode: 'one-time' | 'recurring' =
      fd.recurrence === 'once' ? 'one-time'
      : (hasWeekdays || hasMonthDays || (fd.recurrence !== undefined)) ? 'recurring'
      : 'one-time';
    const recurrence: Recurrence =
      fd.recurrence && fd.recurrence !== 'once' ? fd.recurrence
      : hasMonthDays ? 'monthly'
      : hasWeekdays ? 'weekly'
      : 'daily';

    return {
      id: options.keepId ? fd.id : '',
      idManualOverride: options.keepId,
      priority: fd.priority,
      active: options.keepActive ? fd.active : true,
      source: options.keepSource ? rule.s : undefined,
      actionType: fd.actionType,
      power: fd.power?.toString() || '50',
      targetSoc: fd.targetSoc?.toString() || '80',
      maxPower: fd.maxPower?.toString() || '50',
      maxGrid: fd.maxGridPower?.toString() || '100',
      minGrid: fd.minGridPower?.toString() || '0',
      strategy: fd.strategy || 'eq',
      scheduleMode: mode,
      oneTimeDate: mode === 'one-time' ? (unixToLocalDateStr(fd.validFrom) || todayISO()) : todayISO(),
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
      validFromDate: unixToLocalDateStr(fd.validFrom),
      validUntilDate: unixToLocalDateStr(fd.validUntil),
      limitKw: fd.limitKw?.toString() || '0',
      firmness: fd.firmness || 'firm',
      targetGridKw: fd.targetGridKw?.toString() || '0',
      deadBandKw: fd.deadBandKw?.toString() || '',
      scMaxChargeKw: fd.scMaxChargeKw?.toString() || '',
      scMaxDischargeKw: fd.scMaxDischargeKw?.toString() || '',
      scSocMin: fd.scSocMin?.toString() || '',
      scSocMax: fd.scSocMax?.toString() || '',
      holdSocLow: fd.holdSocLow?.toString() || '20',
      holdSocHigh: fd.holdSocHigh?.toString() || '80',
      hysteresis: fd.hysteresis?.toString() || '',
      recurrence,
      monthDays: fd.monthDays || [],
    };
  }, []);

  // Load existing rule (edit mode)
  useEffect(() => {
    if (!isNew && ruleId && rules.length > 0) {
      const p = parseInt(priority || '0') as Priority;
      const existing = rules.find(r => r.id === ruleId && r.priority === p);
      if (!existing) return;

      setOriginalPriority(existing.priority);
      setForm(buildFormStateFromRule(existing, existing.priority, {
        keepId: true,
        keepActive: true,
        keepSource: true,
      }));
    }
  }, [isNew, ruleId, priority, rules, buildFormStateFromRule]);

  // Duplicate from existing rule (new + fromId)
  useEffect(() => {
    if (!isDuplicateFromRule || !fromId || rules.length === 0) return;
    const p = parseInt(fromPriority || '0') as Priority;
    const source = rules.find(r => r.id === fromId && r.priority === p);
    if (!source) return;
    setForm(buildFormStateFromRule(source, source.priority, {
      keepId: false,
      keepActive: true,
      keepSource: false,
    }));
    setDuplicateBanner(ed.duplicatingFrom.replace('{sourceId}', fromId));
  }, [isDuplicateFromRule, fromId, fromPriority, rules, buildFormStateFromRule, ed.duplicatingFrom]);

  // Duplicate from favorite snapshot (new + fromFavId)
  useEffect(() => {
    if (!isFromFavorite || !fromFavId || !selectedDevice) return;
    let cancelled = false;
    (async () => {
      const fav = await getFavoriteById(selectedDevice.device_id, fromFavId);
      if (cancelled || !fav) return;
      setForm(buildFormStateFromRule(fav.rule, fav.priority, {
        keepId: false,
        keepActive: true,
        keepSource: false,
      }));
      const labelText = fav.label || fav.rule.id;
      setDuplicateBanner(ed.duplicatingFromFavorite.replace('{label}', labelText));
    })();
    return () => { cancelled = true; };
  }, [isFromFavorite, fromFavId, selectedDevice, buildFormStateFromRule, ed.duplicatingFromFavorite]);

  const update = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  // If an action-type change makes the currently selected grid operator a
  // blocked latch, snap to the first valid one so stale state can't be saved.
  useEffect(() => {
    if (!form.hasGridCondition) return;
    if (polarity.allGridGatesBlocked) return;
    if (polarity.blockedOperators.includes(form.gridOperator)) {
      const fallback = (['gt', 'lt', 'bt'] as GridOperator[]).find(op => !polarity.blockedOperators.includes(op));
      if (fallback) update({ gridOperator: fallback });
    }
  }, [polarity, form.gridOperator, form.hasGridCondition]);

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
      // Guardrail rules always live in the fixed Guardrails band — the slot
      // picker is hidden for them and priority does not apply.
      priority: isGuardrail ? GUARDRAIL_BAND : form.priority,
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
      case 'bx':
      case 'bi':
        fd.limitKw = parseFloat(form.limitKw) || 0;
        fd.firmness = form.firmness;
        break;
      case 'sc':
        fd.targetGridKw = parseFloat(form.targetGridKw) || 0;
        if (form.deadBandKw) fd.deadBandKw = parseFloat(form.deadBandKw);
        if (form.scMaxChargeKw) fd.scMaxChargeKw = parseFloat(form.scMaxChargeKw);
        if (form.scMaxDischargeKw !== '') fd.scMaxDischargeKw = parseFloat(form.scMaxDischargeKw);
        if (form.scSocMin) fd.scSocMin = parseFloat(form.scSocMin);
        if (form.scSocMax) fd.scSocMax = parseFloat(form.scSocMax);
        break;
      case 'hs':
        fd.holdSocLow = parseFloat(form.holdSocLow) || 0;
        if (form.holdSocHigh) fd.holdSocHigh = parseFloat(form.holdSocHigh);
        if (form.hysteresis) fd.hysteresis = parseFloat(form.hysteresis);
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

    // Grid gates are structurally invalid on sc (the tracking loop fights
    // them) — never emit one even if stale state lingers in the form.
    if (form.hasGridCondition && form.gridValue && form.actionType !== 'sc') {
      fd.gridPowerOperator = form.gridOperator;
      fd.gridPowerValue = parseFloat(form.gridValue);
      if (form.gridOperator === 'bt' && form.gridValueMax) {
        fd.gridPowerValueMax = parseFloat(form.gridValueMax);
      }
    }

    if (form.scheduleMode === 'one-time') {
      // rc:once — the cloud stamps vu from the window when absent (F16);
      // we still send the explicit day window from the date picker below.
      fd.recurrence = 'once';
    } else {
      fd.recurrence = form.recurrence;
      if (form.recurrence === 'weekly' && form.selectedDays.length > 0 && form.selectedDays.length < 7) {
        fd.weekdays = form.selectedDays;
      }
      if (form.recurrence === 'monthly' && form.monthDays.length > 0) {
        fd.monthDays = [...form.monthDays].sort((a, b) => a - b);
      }
    }

    if (form.scheduleMode === 'one-time' && form.oneTimeDate) {
      const start = localDateStrToUnix(form.oneTimeDate, false);
      if (start !== undefined) fd.validFrom = start;
      const end = localDateStrToUnix(form.oneTimeDate, true);
      if (end !== undefined) fd.validUntil = end;
    } else {
      if (form.validFromDate) {
        const start = localDateStrToUnix(form.validFromDate, false);
        if (start !== undefined) fd.validFrom = start;
      }
      if (form.validUntilDate) {
        const end = localDateStrToUnix(form.validUntilDate, true);
        if (end !== undefined) fd.validUntil = end;
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

    const proceedSave = async () => {
      try {
        setIsSaving(true);
        let warnings: string[] | undefined;
        if (isNew) {
          warnings = await createRule(rule, fd.priority);
        } else {
          const priorityChanged = originalPriority !== undefined && originalPriority !== fd.priority;
          warnings = await updateRule(rule, fd.priority, priorityChanged ? originalPriority : undefined);
        }
        if (warnings && warnings.length > 0) {
          Alert.alert(ed.savedWithWarnings, warnings.join('\n'), [
            { text: t.common.ok, onPress: () => router.back() },
          ]);
        } else {
          Alert.alert(t.common.success, isNew ? ed.ruleCreated : ed.ruleUpdated, [
            { text: t.common.ok, onPress: () => router.back() },
          ]);
        }
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : ed.failedToSaveRule;
        Alert.alert(t.common.error, msg);
      } finally {
        setIsSaving(false);
      }
    };

    // Safety: backend (EventBridge) will auto-delete rules whose vu is in the past.
    // Warn the user before silently triggering that cleanup.
    if (fd.validUntil !== undefined && fd.validUntil * 1000 < Date.now()) {
      Alert.alert(
        ed.expiryInPastWarning,
        ed.expiryInPastConfirm,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: ed.saveAnyway, style: 'destructive', onPress: proceedSave },
        ],
      );
      return;
    }

    await proceedSave();
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
        {!isNew && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowHistorySheet(true)}
            accessibilityLabel={t.schedules.history.ruleHistory}
          >
            <History size={20} color={Colors.text} />
          </TouchableOpacity>
        )}
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

        {/* Duplicate-from banner */}
        {duplicateBanner && (
          <View style={styles.duplicateBanner}>
            <Pencil size={14} color={Colors.primary} />
            <Text style={styles.duplicateBannerText}>{duplicateBanner}</Text>
          </View>
        )}

        {/* Materialized-from-Settings warning (set_* rules, replace-by-id) */}
        {!isNew && form.id.toLowerCase().startsWith('set_') && (
          <View style={styles.autoWarningBanner}>
            <AlertTriangle size={16} color="#92400E" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.autoWarningText, { fontWeight: '700' }]}>{ed.fromSettingsTitle}</Text>
              <Text style={styles.autoWarningText}>{ed.fromSettingsWarning}</Text>
            </View>
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

        {/* ─── Priority (hidden for guardrail types — fixed band) ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.schedules.priority}</Text>
          {isGuardrail ? (
            <Text style={styles.hintText}>{ed.guardrailNote}</Text>
          ) : (
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
          )}
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

          {(form.actionType === 'bx' || form.actionType === 'bi') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.limitKw}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.limitKw}
                  onChangeText={(v) => update({ limitKw: v.replace(/[^0-9.]/g, '') })}
                  onBlur={() => clampField('limitKw', 0, siteHth)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.hintText}>
                  {form.actionType === 'bx' ? ed.limitKwHintBx : ed.limitKwHintBi}
                </Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.firmness}</Text>
                <SegmentedControl
                  options={[
                    { value: 'firm', label: ed.firm },
                    { value: 'soft', label: ed.soft },
                  ]}
                  selected={form.firmness}
                  onSelect={(v) => update({ firmness: v as Firmness })}
                />
                <Text style={styles.hintText}>{ed.firmnessHint}</Text>
              </View>
            </>
          )}

          {form.actionType === 'sc' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.targetGridKw}</Text>
                <View style={styles.signedInputRow}>
                  <TouchableOpacity
                    style={styles.signToggle}
                    onPress={() => {
                      const v = form.targetGridKw;
                      update({ targetGridKw: v.startsWith('-') ? v.slice(1) : '-' + v });
                    }}
                  >
                    <Text style={styles.signToggleText}>±</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={form.targetGridKw}
                    onChangeText={(v) => update({ targetGridKw: v.replace(/[^0-9.\-]/g, '') })}
                    onBlur={() => clampField('targetGridKw', siteLth, siteHth)}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <Text style={styles.hintText}>{ed.targetGridHint}</Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.deadBandKw}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.deadBandKw}
                  onChangeText={(v) => update({ deadBandKw: v.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.scMaxChargeKw}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.scMaxChargeKw}
                    onChangeText={(v) => update({ scMaxChargeKw: v.replace(/[^0-9.]/g, '') })}
                    onBlur={() => clampField('scMaxChargeKw', 0, maxCharge)}
                    keyboardType="decimal-pad"
                    placeholder={String(maxCharge)}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.scMaxDischargeKw}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.scMaxDischargeKw}
                    onChangeText={(v) => update({ scMaxDischargeKw: v.replace(/[^0-9.]/g, '') })}
                    onBlur={() => clampField('scMaxDischargeKw', 0, maxDischarge)}
                    keyboardType="decimal-pad"
                    placeholder={String(maxDischarge)}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{ed.absorbOnly}</Text>
                  <Text style={styles.hintText}>{ed.absorbOnlyHint}</Text>
                </View>
                <Switch
                  value={form.scMaxDischargeKw === '0'}
                  onValueChange={(v) => update({ scMaxDischargeKw: v ? '0' : '' })}
                  trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                  thumbColor={form.scMaxDischargeKw === '0' ? Colors.primary : Colors.textSecondary}
                />
              </View>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.scSocWindow} min %</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.scSocMin}
                    onChangeText={(v) => update({ scSocMin: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('scSocMin', 0, 100)}
                    keyboardType="number-pad"
                    placeholder={safety.soc_min.toString()}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.scSocWindow} max %</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.scSocMax}
                    onChangeText={(v) => update({ scSocMax: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('scSocMax', 0, 100)}
                    keyboardType="number-pad"
                    placeholder={safety.soc_max.toString()}
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
            </>
          )}

          {form.actionType === 'hs' && (
            <>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.holdSocLow}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.holdSocLow}
                    onChangeText={(v) => update({ holdSocLow: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('holdSocLow', 0, 100)}
                    keyboardType="number-pad"
                    placeholder="20"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{ed.holdSocHigh}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.holdSocHigh}
                    onChangeText={(v) => update({ holdSocHigh: v.replace(/[^0-9]/g, '') })}
                    onBlur={() => clampField('holdSocHigh', 0, 100)}
                    keyboardType="number-pad"
                    placeholder="80"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.hysteresisPct}</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.hysteresis}
                  onChangeText={(v) => update({ hysteresis: v.replace(/[^0-9.]/g, '') })}
                  onBlur={() => clampField('hysteresis', 0, 50)}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.hintText}>{ed.holdSocHint}</Text>
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
              <Text style={styles.hintText}>{ed.rcOnceHint}</Text>
            </View>
          )}

          {form.scheduleMode === 'recurring' && (
            <>
              <View style={[styles.inputGroup, { marginTop: 16 }]}>
                <Text style={styles.inputLabel}>{ed.recurrenceLabel}</Text>
                <SegmentedControl
                  options={[
                    { value: 'daily', label: ed.rcDaily },
                    { value: 'weekly', label: ed.rcWeekly },
                    { value: 'monthly', label: ed.rcMonthly },
                  ]}
                  selected={form.recurrence}
                  onSelect={(v) => update({ recurrence: v as Recurrence })}
                />
              </View>

              {form.recurrence === 'weekly' && (
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
              )}

              {form.recurrence === 'monthly' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{ed.monthDays}</Text>
                  <View style={styles.monthDaysGrid}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                      const selected = form.monthDays.includes(d);
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.monthDayBtn, selected && styles.dayBtnActive]}
                          onPress={() => update({
                            monthDays: selected
                              ? form.monthDays.filter(x => x !== d)
                              : [...form.monthDays, d],
                          })}
                        >
                          <Text style={[styles.dayBtnText, selected && styles.dayBtnTextActive]}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
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
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>{ed.enableGridTrigger}</Text>
              <Text style={styles.hintText}>
                {polarity.allGridGatesBlocked ? ed.polarityGridBlockedSc : ed.gridTriggerHint}
              </Text>
            </View>
            <Switch
              value={form.hasGridCondition && !polarity.allGridGatesBlocked}
              disabled={polarity.allGridGatesBlocked}
              onValueChange={(v) => update({ hasGridCondition: v })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={form.hasGridCondition && !polarity.allGridGatesBlocked ? Colors.primary : Colors.textSecondary}
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

          {form.hasGridCondition && !polarity.allGridGatesBlocked && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{ed.operator}</Text>
                <View style={styles.chipRow}>
                  {GRID_OPERATORS.map((op) => {
                    const blocked = polarity.blockedOperators.includes(op.value);
                    return (
                      <TouchableOpacity
                        key={op.value}
                        style={[
                          styles.chip,
                          { flex: 1 },
                          form.gridOperator === op.value && !blocked && styles.chipActive,
                          blocked && styles.chipBlocked,
                        ]}
                        disabled={blocked}
                        onPress={() => update({ gridOperator: op.value })}
                      >
                        <Text style={[
                          styles.chipText,
                          form.gridOperator === op.value && !blocked && styles.chipTextActive,
                          blocked && styles.chipTextBlocked,
                        ]}>
                          {op.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {polarity.blockedOperators.some(op => GRID_OPERATORS.some(g => g.value === op)) && (
                  <Text style={styles.hintText}>{ed.polarityBlockedOperator}</Text>
                )}
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

        {/* ─── Polarity warnings (warn-level, non-blocking) ───── */}
        {polarity.warnings.length > 0 && (
          <View style={styles.section}>
            {polarity.warnings.map((w) => (
              <View key={w} style={styles.warningChip}>
                <AlertTriangle size={14} color="#92400E" />
                <Text style={styles.warningChipText}>{polarityWarningText[w]}</Text>
              </View>
            ))}
          </View>
        )}

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

      {/* Per-rule history (read-only audit trail) */}
      {!isNew && (
        <ScheduleHistorySheet
          visible={showHistorySheet}
          onClose={() => setShowHistorySheet(false)}
          ruleId={form.id}
        />
      )}

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
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  duplicateBannerText: { fontSize: 13, fontWeight: '600', color: Colors.primary, flex: 1 },

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
  chipBlocked: { opacity: 0.35 },
  chipTextBlocked: { color: Colors.textSecondary },
  warningChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  warningChipText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
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
  monthDaysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthDayBtn: {
    width: 40,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
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
