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
import { ArrowLeft, Save, X, Clock, Calendar } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSchedules } from '@/hooks/useSchedules';
import { ActionType, Rule, RuleAction, RuleConditions } from '@/types';
import { formatTime, parseTime } from '@/lib/aws-schedules';

// Simple Time Picker Component (pure JS, works in Expo Go)
interface TimePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (time: string) => void;
  initialTime?: string;
  title: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

function TimePicker({ visible, onClose, onSelect, initialTime, title }: TimePickerProps) {
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
              <Text style={pickerStyles.doneButton}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.pickerRow}>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>Hour</Text>
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
              <Text style={pickerStyles.columnLabel}>Min</Text>
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

// Simple Date Picker Component
interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: string) => void;
  initialDate?: string;
  title: string;
}

function DatePicker({ visible, onClose, onSelect, initialDate, title }: DatePickerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const YEARS = Array.from({ length: 5 }, (_, i) => (currentYear + i).toString());
  const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  const parts = initialDate?.split('-') || [];
  const [year, setYear] = useState(parts[0] || currentYear.toString());
  const [month, setMonth] = useState(parts[1] || '01');
  const [day, setDay] = useState(parts[2] || '01');

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
              <Text style={pickerStyles.doneButton}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.pickerRow}>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>Year</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {YEARS.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[pickerStyles.item, year === y && pickerStyles.itemSelected]}
                    onPress={() => setYear(y)}
                  >
                    <Text style={[pickerStyles.itemText, year === y && pickerStyles.itemTextSelected]}>
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>Month</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {MONTHS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[pickerStyles.item, month === m && pickerStyles.itemSelected]}
                    onPress={() => setMonth(m)}
                  >
                    <Text style={[pickerStyles.itemText, month === m && pickerStyles.itemTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>Day</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {DAYS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[pickerStyles.item, day === d && pickerStyles.itemSelected]}
                    onPress={() => setDay(d)}
                  >
                    <Text style={[pickerStyles.itemText, day === d && pickerStyles.itemTextSelected]}>
                      {d}
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

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  doneButton: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  column: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  columnLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  scrollView: {
    height: 180,
    width: 70,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 8,
  },
  itemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  itemText: {
    fontSize: 20,
    color: Colors.text,
  },
  itemTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  separator: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginHorizontal: 4,
  },
});

const ACTION_TYPES: { type: ActionType; label: string; description: string }[] = [
  { type: 'ch', label: 'Charge', description: 'Fixed power charging' },
  { type: 'dis', label: 'Discharge', description: 'Fixed power discharging' },
  { type: 'sb', label: 'Standby', description: 'No power flow' },
  { type: 'ct', label: 'Charge to SoC', description: 'Charge to target %' },
  { type: 'dt', label: 'Discharge to SoC', description: 'Discharge to target %' },
  // Site Limit (sl) removed - will be in Settings screen
];

// Weekdays with API-compatible keys (Sun, Mon, Tue, etc.)
const WEEKDAYS = [
  { key: 'Sun', label: 'Sun', short: 'S' },
  { key: 'Mon', label: 'Mon', short: 'M' },
  { key: 'Tue', label: 'Tue', short: 'T' },
  { key: 'Wed', label: 'Wed', short: 'W' },
  { key: 'Thu', label: 'Thu', short: 'T' },
  { key: 'Fri', label: 'Fri', short: 'F' },
  { key: 'Sat', label: 'Sat', short: 'S' },
];

// Helper to convert selected days to API format
const daysToApiFormat = (selectedDays: string[]): string | undefined => {
  if (selectedDays.length === 0 || selectedDays.length === 7) {
    return undefined; // All days or no days = don't include
  }
  
  // Check for shortcuts
  const weekdaysSet = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const weekendSet = new Set(['Sat', 'Sun']);
  const selectedSet = new Set(selectedDays);
  
  // Check if exactly weekdays
  if (selectedDays.length === 5 && 
      [...weekdaysSet].every(d => selectedSet.has(d)) &&
      !selectedSet.has('Sat') && !selectedSet.has('Sun')) {
    return 'wd';
  }
  
  // Check if exactly weekend
  if (selectedDays.length === 2 && 
      selectedSet.has('Sat') && selectedSet.has('Sun') &&
      ![...weekdaysSet].some(d => selectedSet.has(d))) {
    return 'we';
  }
  
  // Check for consecutive days (range like Wed-Fri)
  const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sortedIndices = selectedDays.map(d => dayOrder.indexOf(d)).sort((a, b) => a - b);
  
  let isConsecutive = true;
  for (let i = 1; i < sortedIndices.length; i++) {
    if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
      isConsecutive = false;
      break;
    }
  }
  
  if (isConsecutive && selectedDays.length >= 2) {
    const firstDay = dayOrder[sortedIndices[0]];
    const lastDay = dayOrder[sortedIndices[sortedIndices.length - 1]];
    return `${firstDay}-${lastDay}`;
  }
  
  // Single day or non-consecutive: return first day or comma-separated
  if (selectedDays.length === 1) {
    return selectedDays[0];
  }
  
  // Sort by day order and join
  const sorted = selectedDays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  return sorted.join(',');
};

interface FormData {
  id: string;
  priority: number;
  active: boolean;
  actionType: ActionType;
  // Action params
  power: string;
  targetSoc: string;
  maxPower: string;
  maxGrid: string;
  minGrid: string;
  highThreshold: string;
  lowThreshold: string;
  // Conditions
  hasTimeCondition: boolean;
  startTime: string;
  endTime: string;
  selectedDays: string[];
  // Validity period
  validFrom: string;  // YYYY-MM-DD format or empty
  validUntil: string; // YYYY-MM-DD format or empty
}

export default function RuleBuilderScreen() {
  const { t } = useSettings();
  const { ruleId, priority } = useLocalSearchParams<{ ruleId: string; priority?: string }>();
  const { rules, addRule, updateRule, isLoading: schedulesLoading } = useSchedules();
  const isNew = ruleId === 'new';

  const [formData, setFormData] = useState<FormData>({
    id: '',
    priority: 7,
    active: true,
    actionType: 'ch',
    power: '50',
    targetSoc: '80',
    maxPower: '50',
    maxGrid: '100',
    minGrid: '0',
    highThreshold: '70',
    lowThreshold: '-40',
    hasTimeCondition: false,
    startTime: '',  // Empty - user must fill in
    endTime: '',    // Empty - user must fill in
    selectedDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], // All days (using day names)
    validFrom: '',  // Empty = no start date limit
    validUntil: '', // Empty = no end date limit
  });

  const [isSaving, setIsSaving] = useState(false);
  const [originalPriority, setOriginalPriority] = useState<number | undefined>(undefined);
  
  // Picker states
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showValidFromPicker, setShowValidFromPicker] = useState(false);
  const [showValidUntilPicker, setShowValidUntilPicker] = useState(false);
  

  // Load existing rule data
  useEffect(() => {
    if (!isNew && ruleId && rules.length > 0) {
      const existingRule = rules.find(r => r.id === ruleId && r.p === parseInt(priority || '0'));
      if (existingRule) {
        // Days field "d" is at RULE level, not inside conditions!
        const daysValue = existingRule.d || existingRule.c?.d;
        let days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Default all days (using names)
        
        if (daysValue) {
          if (typeof daysValue === 'string') {
            const lowerValue = daysValue.toLowerCase();
            
            // Named shortcuts
            if (lowerValue === 'weekdays' || lowerValue === 'wd') {
              days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            } else if (lowerValue === 'weekend' || lowerValue === 'we') {
              days = ['Sat', 'Sun'];
            } else if (lowerValue === 'everyday' || lowerValue === 'ed' || lowerValue === 'all') {
              days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            } else if (daysValue.includes('-')) {
              // Range like "Wed-Fri"
              const [start, end] = daysValue.split('-');
              const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const startIdx = dayOrder.findIndex(d => d.toLowerCase() === start.toLowerCase());
              const endIdx = dayOrder.findIndex(d => d.toLowerCase() === end.toLowerCase());
              if (startIdx >= 0 && endIdx >= 0) {
                days = [];
                for (let i = startIdx; i <= endIdx; i++) {
                  days.push(dayOrder[i]);
                }
              }
            } else if (daysValue.includes(',')) {
              // Comma-separated
              days = daysValue.split(',').map(d => {
                const dayMap: Record<string, string> = {
                  'sun': 'Sun', 'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed',
                  'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat',
                };
                return dayMap[d.trim().toLowerCase()] || d.trim();
              });
            } else {
              // Single day like "Thu"
              const dayMap: Record<string, string> = {
                'sun': 'Sun', 'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed',
                'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat',
              };
              const mapped = dayMap[lowerValue];
              if (mapped) days = [mapped];
            }
          } else if (Array.isArray(daysValue)) {
            days = daysValue;
          }
        }
        
        // Store original priority for handling priority changes
        setOriginalPriority(existingRule.p);
        
        // Format validity dates from Unix timestamp to YYYY-MM-DD
        const formatDateFromTimestamp = (ts: number | undefined): string => {
          if (!ts) return '';
          const date = new Date(ts * 1000);
          return date.toISOString().split('T')[0]; // YYYY-MM-DD
        };
        
        setFormData({
          id: existingRule.id,
          priority: existingRule.p,
          active: existingRule.act !== false,
          actionType: existingRule.a.t,
          power: String(existingRule.a.pw || 50),
          targetSoc: String(existingRule.a.soc || 80),
          maxPower: String(existingRule.a.maxp || 50),
          maxGrid: String(existingRule.a.maxg || 100),
          minGrid: String(existingRule.a.ming || 0),
          highThreshold: String(existingRule.a.hth || 70),
          lowThreshold: String(existingRule.a.lth || -40),
          hasTimeCondition: existingRule.c?.ts !== undefined,
          startTime: existingRule.c?.ts ? formatTime(existingRule.c.ts) : '',
          endTime: existingRule.c?.te ? formatTime(existingRule.c.te) : '',
          selectedDays: days,
          validFrom: formatDateFromTimestamp(existingRule.vf),
          validUntil: formatDateFromTimestamp(existingRule.vu),
        });
      }
    }
  }, [isNew, ruleId, priority, rules]);

  const toggleDay = (dayKey: string) => {
    setFormData(prev => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(dayKey)
        ? prev.selectedDays.filter(d => d !== dayKey)
        : [...prev.selectedDays, dayKey],
    }));
  };

  const selectWeekdays = () => {
    setFormData(prev => ({ ...prev, selectedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }));
  };

  const selectWeekend = () => {
    setFormData(prev => ({ ...prev, selectedDays: ['Sat', 'Sun'] }));
  };

  const selectEveryday = () => {
    setFormData(prev => ({ ...prev, selectedDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }));
  };

  const buildRule = (): Rule => {
    const action: RuleAction = { t: formData.actionType };
    
    switch (formData.actionType) {
      case 'ch':
      case 'dis':
        action.pw = parseFloat(formData.power) || 0;
        break;
      case 'sb':
        action.pw = 0;
        break;
      case 'ct':
        action.soc = parseFloat(formData.targetSoc) || 80;
        action.maxp = parseFloat(formData.maxPower) || 50;
        action.maxg = parseFloat(formData.maxGrid) || 100;
        break;
      case 'dt':
        action.soc = parseFloat(formData.targetSoc) || 20;
        action.maxp = parseFloat(formData.maxPower) || 50;
        action.ming = parseFloat(formData.minGrid) || 0;
        break;
    }

    const conditions: RuleConditions = {};
    
    // Only add ts/te if BOTH are filled in (not empty, not null)
    if (formData.hasTimeCondition && formData.startTime && formData.endTime) {
      conditions.ts = parseTime(formData.startTime);
      conditions.te = parseTime(formData.endTime);
    }

    const rule: Rule = {
      id: formData.id.trim().toUpperCase(),
      p: formData.priority,
      a: action,
    };

    // Only add conditions if there are any
    if (Object.keys(conditions).length > 0) {
      rule.c = conditions;
    }

    // Days field goes at RULE level - use smart format (Thu, wd, we, Wed-Fri, etc.)
    const daysApiFormat = daysToApiFormat(formData.selectedDays);
    if (daysApiFormat) {
      rule.d = daysApiFormat;
    }

    if (!formData.active) {
      rule.act = false;
    }

    // Validity dates at RULE level (Unix timestamps)
    // Parse YYYY-MM-DD to Unix timestamp (start of day for vf, end of day for vu)
    if (formData.validFrom) {
      const date = new Date(formData.validFrom + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        rule.vf = Math.floor(date.getTime() / 1000);
      }
    }
    if (formData.validUntil) {
      const date = new Date(formData.validUntil + 'T23:59:59');
      if (!isNaN(date.getTime())) {
        rule.vu = Math.floor(date.getTime() / 1000);
      }
    }

    return rule;
  };

  const handleConfirm = async () => {
    if (!formData.id.trim()) {
      Alert.alert(t.common.error, 'Rule ID is required');
      return;
    }

    if (formData.id.length > 63) {
      Alert.alert(t.common.error, 'Rule ID must be 63 characters or less');
      return;
    }

    try {
      setIsSaving(true);
      const rule = buildRule();
      
      console.log('[RuleBuilder] Saving rule:', JSON.stringify(rule, null, 2));
      
      if (isNew) {
        await addRule(rule);
      } else {
        // Pass original priority if it changed (for cross-priority moves)
        const priorityChanged = originalPriority !== undefined && originalPriority !== rule.p;
        await updateRule(rule, priorityChanged ? originalPriority : undefined);
      }
      
      Alert.alert('Success', `Rule ${isNew ? 'created' : 'updated'} successfully`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('[RuleBuilder] Save error:', err);
      Alert.alert(t.common.error, 'Failed to save rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard Changes?',
      'Any unsaved changes will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]
    );
  };


  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleDiscard}>
          <X size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isNew ? 'New Rule' : 'Edit Rule'}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.headerButton, styles.saveButton]} 
          onPress={handleConfirm}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Save size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Rule ID *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.id}
              onChangeText={(text) => setFormData({ ...formData, id: text.toUpperCase().replace(/[^A-Z0-9-_]/g, '') })}
              placeholder="MY-RULE-NAME"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
              maxLength={63}
              editable={isNew}
            />
            <Text style={styles.inputHint}>1-63 chars, uppercase letters, numbers, dashes</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {[5, 6, 7, 8].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityButton,
                    formData.priority === p && styles.priorityButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, priority: p })}
                >
                  <Text style={[
                      styles.priorityText,
                      formData.priority === p && styles.priorityTextActive,
                  ]}>
                    P{p}
                  </Text>
                  <Text style={[
                    styles.prioritySubtext,
                    formData.priority === p && styles.priorityTextActive,
                  ]}>
                    {p === 5 ? 'Low' : p === 6 ? 'Med' : p === 7 ? 'Norm' : 'High'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.inputLabel}>Active</Text>
              <Text style={styles.inputHint}>Rule will be evaluated when active</Text>
            </View>
            <Switch
              value={formData.active}
              onValueChange={(value) => setFormData({ ...formData, active: value })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={formData.active ? Colors.primary : Colors.textSecondary}
            />
          </View>
        </View>

        {/* Action Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Type</Text>
          <View style={styles.actionGrid}>
            {ACTION_TYPES.map((action) => (
              <TouchableOpacity
                key={action.type}
                style={[
                  styles.actionCard,
                  formData.actionType === action.type && styles.actionCardActive,
                ]}
                onPress={() => setFormData({ ...formData, actionType: action.type })}
              >
                <Text style={[
                    styles.actionText,
                    formData.actionType === action.type && styles.actionTextActive,
                ]}>
                  {action.label}
                </Text>
                <Text style={[
                  styles.actionDescription,
                  formData.actionType === action.type && styles.actionTextActive,
                ]}>
                  {action.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Action Parameters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parameters</Text>
          
          {(formData.actionType === 'ch' || formData.actionType === 'dis') && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Power (kW)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.power}
                onChangeText={(text) => setFormData({ ...formData, power: text.replace(/[^0-9.]/g, '') })}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          )}

          {(formData.actionType === 'ct' || formData.actionType === 'dt') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target SoC (%)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.targetSoc}
                  onChangeText={(text) => setFormData({ ...formData, targetSoc: text.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="80"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Max Power (kW)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.maxPower}
                  onChangeText={(text) => setFormData({ ...formData, maxPower: text.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              {formData.actionType === 'ct' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Max Grid Import (kW)</Text>
                <TextInput
                  style={styles.textInput}
                    value={formData.maxGrid}
                    onChangeText={(text) => setFormData({ ...formData, maxGrid: text.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={Colors.textSecondary}
                />
              </View>
              )}
              {formData.actionType === 'dt' && (
              <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Min Grid Power (kW)</Text>
                <TextInput
                  style={styles.textInput}
                    value={formData.minGrid}
                    onChangeText={(text) => setFormData({ ...formData, minGrid: text.replace(/[^0-9.-]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              )}
            </>
          )}


          {formData.actionType === 'sb' && (
            <Text style={styles.noParamsText}>No parameters needed for Standby</Text>
          )}
        </View>

        {/* Time Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time Conditions (Optional)</Text>
            
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.inputLabel}>Enable Time Window</Text>
                <Text style={styles.inputHint}>Rule active only during specified hours</Text>
              </View>
              <Switch
                value={formData.hasTimeCondition}
                onValueChange={(value) => setFormData({ ...formData, hasTimeCondition: value })}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={formData.hasTimeCondition ? Colors.primary : Colors.textSecondary}
              />
            </View>

            {formData.hasTimeCondition && (
              <>
                <View style={styles.timeRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Start Time</Text>
                    <TouchableOpacity 
                      style={styles.pickerButton}
                      onPress={() => setShowStartTimePicker(true)}
                    >
                      <Clock size={18} color={Colors.textSecondary} />
                      <Text style={[
                        styles.pickerButtonText,
                        !formData.startTime && styles.pickerButtonPlaceholder
                      ]}>
                        {formData.startTime || 'Select time'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>End Time</Text>
                    <TouchableOpacity 
                      style={styles.pickerButton}
                      onPress={() => setShowEndTimePicker(true)}
                    >
                      <Clock size={18} color={Colors.textSecondary} />
                      <Text style={[
                        styles.pickerButtonText,
                        !formData.endTime && styles.pickerButtonPlaceholder
                      ]}>
                        {formData.endTime || 'Select time'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Active Days</Text>
                  <View style={styles.quickSelectRow}>
                    <TouchableOpacity style={styles.quickSelectButton} onPress={selectWeekdays}>
                      <Text style={styles.quickSelectText}>Mon-Fri</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickSelectButton} onPress={selectWeekend}>
                      <Text style={styles.quickSelectText}>Sat-Sun</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickSelectButton} onPress={selectEveryday}>
                      <Text style={styles.quickSelectText}>Everyday</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.daysRow}>
                    {WEEKDAYS.map((day) => (
                      <TouchableOpacity
                        key={day.key}
                        style={[
                          styles.dayButton,
                          formData.selectedDays.includes(day.key) && styles.dayButtonActive,
                        ]}
                        onPress={() => toggleDay(day.key)}
                      >
                        <Text style={[
                          styles.dayText,
                          formData.selectedDays.includes(day.key) && styles.dayTextActive,
                        ]}>
                          {day.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
              </View>
            </>
          )}
          </View>

        {/* Validity Period */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Validity Period (Optional)</Text>
          <Text style={styles.inputHint}>Leave empty for permanent/immediate validity</Text>
          
          <View style={styles.timeRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Valid From</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowValidFromPicker(true)}
              >
                <Calendar size={18} color={Colors.textSecondary} />
                <Text style={[
                  styles.pickerButtonText,
                  !formData.validFrom && styles.pickerButtonPlaceholder
                ]}>
                  {formData.validFrom || 'Select date'}
                </Text>
              </TouchableOpacity>
              {formData.validFrom && (
                <TouchableOpacity onPress={() => setFormData({ ...formData, validFrom: '' })}>
                  <Text style={styles.clearLink}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Valid Until</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowValidUntilPicker(true)}
              >
                <Calendar size={18} color={Colors.textSecondary} />
                <Text style={[
                  styles.pickerButtonText,
                  !formData.validUntil && styles.pickerButtonPlaceholder
                ]}>
                  {formData.validUntil || 'Select date'}
                </Text>
              </TouchableOpacity>
              {formData.validUntil && (
                <TouchableOpacity onPress={() => setFormData({ ...formData, validUntil: '' })}>
                  <Text style={styles.clearLink}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Rule Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rule Preview</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewText}>
              {JSON.stringify(buildRule(), null, 2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Time Pickers (Pure JS - works in Expo Go) */}
      <TimePicker
        visible={showStartTimePicker}
        onClose={() => setShowStartTimePicker(false)}
        onSelect={(time) => setFormData({ ...formData, startTime: time })}
        initialTime={formData.startTime}
        title="Start Time"
      />
      <TimePicker
        visible={showEndTimePicker}
        onClose={() => setShowEndTimePicker(false)}
        onSelect={(time) => setFormData({ ...formData, endTime: time })}
        initialTime={formData.endTime}
        title="End Time"
      />

      {/* Date Pickers (Pure JS - works in Expo Go) */}
      <DatePicker
        visible={showValidFromPicker}
        onClose={() => setShowValidFromPicker(false)}
        onSelect={(date) => setFormData({ ...formData, validFrom: date })}
        initialDate={formData.validFrom}
        title="Valid From"
      />
      <DatePicker
        visible={showValidUntilPicker}
        onClose={() => setShowValidUntilPicker(false)}
        onSelect={(date) => setFormData({ ...formData, validUntil: date })}
        initialDate={formData.validUntil}
        title="Valid Until"
      />

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.confirmButton} 
          onPress={handleConfirm}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>
              {isNew ? 'Create Rule' : 'Save Changes'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
          <Text style={styles.discardButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  inputHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
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
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  priorityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  prioritySubtext: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  priorityTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionCard: {
    width: '48%',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  actionDescription: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionTextActive: {
    color: '#fff',
  },
  noParamsText: {
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickSelectButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
  },
  quickSelectText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  dayButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  dayTextActive: {
    color: '#fff',
  },
  previewCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
  },
  previewText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: Colors.textOnDark,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  confirmButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  discardButton: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  discardButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
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
  pickerButtonText: {
    fontSize: 16,
    color: Colors.text,
  },
  pickerButtonPlaceholder: {
    color: Colors.textSecondary,
  },
  clearLink: {
    color: Colors.primary,
    fontSize: 12,
    marginTop: 4,
  },
});


