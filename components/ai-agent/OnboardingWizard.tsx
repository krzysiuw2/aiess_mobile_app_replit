import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Factory,
  Building2,
  Briefcase,
  Home,
  Wheat,
  Clock,
  CalendarDays,
  Target,
  ShieldCheck,
  Gauge,
  MessageSquare,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import type { SiteConfigAiProfile, OptimizationGoal } from '@/types/ai-agent';

interface OnboardingWizardProps {
  visible: boolean;
  onClose: () => void;
  initialValues?: {
    aiProfile?: SiteConfigAiProfile;
    siteDescription?: string;
  };
}

const TOTAL_STEPS = 8;

type BusinessType = NonNullable<SiteConfigAiProfile['business_type']>;
type ShiftCount = NonNullable<SiteConfigAiProfile['shift_count']>;
type OperatingDays = NonNullable<SiteConfigAiProfile['operating_days']>;
type WeekendPattern = NonNullable<SiteConfigAiProfile['weekend_pattern']>;
type RiskTolerance = NonNullable<SiteConfigAiProfile['risk_tolerance']>;

const BUSINESS_TYPES: { value: BusinessType; iconName: string }[] = [
  { value: 'industrial', iconName: 'Factory' },
  { value: 'commercial', iconName: 'Building2' },
  { value: 'office', iconName: 'Briefcase' },
  { value: 'residential', iconName: 'Home' },
  { value: 'agricultural', iconName: 'Wheat' },
];

const SHIFT_OPTIONS: { value: ShiftCount; labelKey: string }[] = [
  { value: 1, labelKey: 'shift1' },
  { value: 2, labelKey: 'shift2' },
  { value: 3, labelKey: 'shift3' },
  { value: 0, labelKey: 'shiftContinuous' },
];

const OPERATING_DAYS_OPTIONS: { value: OperatingDays; labelKey: string }[] = [
  { value: 'mon_fri', labelKey: 'daysMonFri' },
  { value: 'mon_sat', labelKey: 'daysMonSat' },
  { value: 'everyday', labelKey: 'daysEveryday' },
];

const WEEKEND_OPTIONS: { value: WeekendPattern; labelKey: string }[] = [
  { value: 'much_less', labelKey: 'weekendMuchLess' },
  { value: 'slightly_less', labelKey: 'weekendSlightlyLess' },
  { value: 'same', labelKey: 'weekendSame' },
  { value: 'more', labelKey: 'weekendMore' },
];

const GOAL_OPTIONS: { value: OptimizationGoal; labelKey: string }[] = [
  { value: 'maximize_arbitrage', labelKey: 'goalArbitrage' },
  { value: 'peak_shaving', labelKey: 'goalPeakShaving' },
  { value: 'pv_self_consumption', labelKey: 'goalPvSelfConsumption' },
  { value: 'reduce_bill', labelKey: 'goalReduceBill' },
];

const RISK_OPTIONS: { value: RiskTolerance; labelKey: string; descKey: string }[] = [
  { value: 'conservative', labelKey: 'riskConservative', descKey: 'riskConservativeDesc' },
  { value: 'balanced', labelKey: 'riskBalanced', descKey: 'riskBalancedDesc' },
  { value: 'aggressive', labelKey: 'riskAggressive', descKey: 'riskAggressiveDesc' },
];

function getIcon(name: string, color: string) {
  const size = 24;
  const props = { size, color };
  switch (name) {
    case 'Factory': return <Factory {...props} />;
    case 'Building2': return <Building2 {...props} />;
    case 'Briefcase': return <Briefcase {...props} />;
    case 'Home': return <Home {...props} />;
    case 'Wheat': return <Wheat {...props} />;
    default: return <Factory {...props} />;
  }
}

export default function OnboardingWizard({ visible, onClose, initialValues }: OnboardingWizardProps) {
  const { t } = useSettings();
  const { updateConfig } = useSiteConfig();
  const w = t.aiAgent.wizard;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [businessType, setBusinessType] = useState<BusinessType>(
    initialValues?.aiProfile?.business_type ?? 'industrial'
  );
  const [shiftCount, setShiftCount] = useState<ShiftCount>(
    initialValues?.aiProfile?.shift_count ?? 1
  );
  const [opStart, setOpStart] = useState(
    initialValues?.aiProfile?.operating_hours?.start ?? '06:00'
  );
  const [opEnd, setOpEnd] = useState(
    initialValues?.aiProfile?.operating_hours?.end ?? '22:00'
  );
  const [opDays, setOpDays] = useState<OperatingDays>(
    initialValues?.aiProfile?.operating_days ?? 'mon_fri'
  );
  const [weekendPattern, setWeekendPattern] = useState<WeekendPattern>(
    initialValues?.aiProfile?.weekend_pattern ?? 'much_less'
  );
  const [goals, setGoals] = useState<OptimizationGoal[]>(
    initialValues?.aiProfile?.optimization_goals ?? ['reduce_bill']
  );
  const [backupReserve, setBackupReserve] = useState(
    initialValues?.aiProfile?.backup_reserve_percent?.toString() ?? ''
  );
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>(
    initialValues?.aiProfile?.risk_tolerance ?? 'balanced'
  );
  const [freeText, setFreeText] = useState(
    initialValues?.siteDescription ?? ''
  );

  const toggleGoal = useCallback((goal: OptimizationGoal) => {
    setGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  }, []);

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return !!businessType;
      case 1: return shiftCount !== undefined;
      case 2: return !!opStart && !!opEnd && !!opDays;
      case 3: return !!weekendPattern;
      case 4: return goals.length > 0;
      case 5: return backupReserve !== '';
      case 6: return !!riskTolerance;
      case 7: return true;
      default: return false;
    }
  }, [step, businessType, shiftCount, opStart, opEnd, opDays, weekendPattern, goals, backupReserve, riskTolerance]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const aiProfile: SiteConfigAiProfile = {
        business_type: businessType,
        shift_count: shiftCount,
        operating_hours: { start: opStart, end: opEnd },
        operating_days: opDays,
        weekend_pattern: weekendPattern,
        optimization_goals: goals,
        goal_priority_order: goals,
        backup_reserve_percent: backupReserve.trim() !== '' ? parseInt(backupReserve, 10) : 0,
        risk_tolerance: riskTolerance,
        wizard_completed: true,
        wizard_completed_at: new Date().toISOString(),
      };

      const patch: Record<string, unknown> = { ai_profile: aiProfile };
      if (freeText.trim()) {
        patch.general = { description: freeText.trim() };
      }

      await updateConfig(patch as any);
      onClose();
    } catch {
      // Error handled by mutation
    } finally {
      setSaving(false);
    }
  }, [businessType, shiftCount, opStart, opEnd, opDays, weekendPattern, goals, backupReserve, riskTolerance, freeText, updateConfig, onClose]);

  const goNext = () => {
    if (step === TOTAL_STEPS - 1) {
      handleSave();
    } else {
      setStep(s => s + 1);
    }
  };

  const goBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.businessTypeTitle}</Text>
            <Text style={s.stepDesc}>{w.businessTypeDesc}</Text>
            <View style={s.optionsGrid}>
              {BUSINESS_TYPES.map(bt => {
                const selected = businessType === bt.value;
                return (
                  <TouchableOpacity
                    key={bt.value}
                    style={[s.optionCard, selected && s.optionCardActive]}
                    onPress={() => setBusinessType(bt.value)}
                  >
                    {getIcon(bt.iconName, selected ? Colors.primary : Colors.textSecondary)}
                    <Text style={[s.optionLabel, selected && s.optionLabelActive]}>
                      {w[`type_${bt.value}` as keyof typeof w]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 1:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.shiftTitle}</Text>
            <Text style={s.stepDesc}>{w.shiftDesc}</Text>
            <View style={s.optionsList}>
              {SHIFT_OPTIONS.map(opt => {
                const selected = shiftCount === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.listOption, selected && s.listOptionActive]}
                    onPress={() => setShiftCount(opt.value)}
                  >
                    <Clock size={18} color={selected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[s.listOptionText, selected && s.listOptionTextActive]}>
                      {w[opt.labelKey as keyof typeof w]}
                    </Text>
                    {selected && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.operatingTitle}</Text>
            <Text style={s.stepDesc}>{w.operatingDesc}</Text>
            <View style={s.timeRow}>
              <View style={s.timeField}>
                <Text style={s.fieldLabel}>{w.startTime}</Text>
                <TextInput
                  style={s.timeInput}
                  value={opStart}
                  onChangeText={setOpStart}
                  placeholder="06:00"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={s.timeField}>
                <Text style={s.fieldLabel}>{w.endTime}</Text>
                <TextInput
                  style={s.timeInput}
                  value={opEnd}
                  onChangeText={setOpEnd}
                  placeholder="22:00"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>{w.operatingDays}</Text>
            <View style={s.optionsList}>
              {OPERATING_DAYS_OPTIONS.map(opt => {
                const selected = opDays === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.listOption, selected && s.listOptionActive]}
                    onPress={() => setOpDays(opt.value)}
                  >
                    <CalendarDays size={18} color={selected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[s.listOptionText, selected && s.listOptionTextActive]}>
                      {w[opt.labelKey as keyof typeof w]}
                    </Text>
                    {selected && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.weekendTitle}</Text>
            <Text style={s.stepDesc}>{w.weekendDesc}</Text>
            <View style={s.optionsList}>
              {WEEKEND_OPTIONS.map(opt => {
                const selected = weekendPattern === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.listOption, selected && s.listOptionActive]}
                    onPress={() => setWeekendPattern(opt.value)}
                  >
                    <Text style={[s.listOptionText, selected && s.listOptionTextActive]}>
                      {w[opt.labelKey as keyof typeof w]}
                    </Text>
                    {selected && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 4:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.goalsTitle}</Text>
            <Text style={s.stepDesc}>{w.goalsDesc}</Text>
            <View style={s.optionsList}>
              {GOAL_OPTIONS.map(opt => {
                const selected = goals.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.listOption, selected && s.listOptionActive]}
                    onPress={() => toggleGoal(opt.value)}
                  >
                    <Target size={18} color={selected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[s.listOptionText, selected && s.listOptionTextActive]}>
                      {w[opt.labelKey as keyof typeof w]}
                    </Text>
                    {selected && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 5:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.reserveTitle}</Text>
            <Text style={s.stepDesc}>{w.reserveDesc}</Text>
            <View style={s.sliderRow}>
              <ShieldCheck size={20} color={Colors.primary} />
              <TextInput
                style={s.reserveInput}
                value={backupReserve}
                onChangeText={setBackupReserve}
                keyboardType="numeric"
                maxLength={2}
              />
              <Text style={s.reserveUnit}>%</Text>
            </View>
            <Text style={s.reserveHint}>{w.reserveHint}</Text>
          </View>
        );

      case 6:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.riskTitle}</Text>
            <Text style={s.stepDesc}>{w.riskDesc}</Text>
            <View style={s.optionsList}>
              {RISK_OPTIONS.map(opt => {
                const selected = riskTolerance === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.listOption, selected && s.listOptionActive, { flexDirection: 'column', alignItems: 'flex-start' }]}
                    onPress={() => setRiskTolerance(opt.value)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Gauge size={18} color={selected ? Colors.primary : Colors.textSecondary} />
                      <Text style={[s.listOptionText, selected && s.listOptionTextActive]}>
                        {w[opt.labelKey as keyof typeof w]}
                      </Text>
                      {selected && <Check size={18} color={Colors.primary} />}
                    </View>
                    <Text style={s.riskDescText}>
                      {w[opt.descKey as keyof typeof w]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 7:
        return (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{w.freeTextTitle}</Text>
            <Text style={s.stepDesc}>{w.freeTextDesc}</Text>
            <TextInput
              style={s.freeTextInput}
              value={freeText}
              onChangeText={setFreeText}
              placeholder={w.freeTextPlaceholder}
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>{w.title}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <X size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Progress */}
          <View style={s.progressRow}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View
                key={i}
                style={[
                  s.progressDot,
                  i <= step && s.progressDotActive,
                  i === step && s.progressDotCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={s.stepCounter}>{step + 1} / {TOTAL_STEPS}</Text>

          {/* Content */}
          <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {renderStep()}
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            {step > 0 ? (
              <TouchableOpacity style={s.backBtn} onPress={goBack}>
                <ChevronLeft size={18} color={Colors.text} />
                <Text style={s.backBtnText}>{w.back}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <TouchableOpacity
              style={[s.nextBtn, !canProceed && s.nextBtnDisabled]}
              onPress={goNext}
              disabled={!canProceed || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={s.nextBtnText}>
                    {step === TOTAL_STEPS - 1 ? w.save : w.next}
                  </Text>
                  {step < TOTAL_STEPS - 1 && <ChevronRight size={18} color="#fff" />}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 0 },
  container: { width: '100%', height: '88%', backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  progressDotActive: { backgroundColor: Colors.primary + '40' },
  progressDotCurrent: { backgroundColor: Colors.primary },
  stepCounter: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginBottom: 4 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 30, flexGrow: 1 },
  stepContent: { paddingTop: 8 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  stepDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 20 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionCard: { width: '47%', backgroundColor: Colors.background, borderRadius: 14, padding: 16, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', gap: 8 },
  optionCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  optionLabelActive: { color: Colors.primary },
  optionsList: { gap: 8 },
  listOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.background, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: Colors.border },
  listOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  listOptionText: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },
  listOptionTextActive: { color: Colors.primary },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  timeInput: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.background, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.border },
  reserveInput: { fontSize: 28, fontWeight: '700', color: Colors.primary, width: 60, textAlign: 'center' },
  reserveUnit: { fontSize: 20, fontWeight: '600', color: Colors.textSecondary },
  reserveHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 17 },
  riskDescText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 17 },
  freeTextInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border, minHeight: 140, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 12, flex: 1 },
  backBtnText: { fontSize: 14, fontWeight: '500', color: Colors.text },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
