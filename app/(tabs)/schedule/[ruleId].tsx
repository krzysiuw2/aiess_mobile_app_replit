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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Save, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSchedules } from '@/hooks/useSchedules';
import { ActionType, Rule, RuleAction, RuleConditions } from '@/types';
import { formatTime, parseTime } from '@/lib/aws-schedules';

const ACTION_TYPES: { type: ActionType; label: string; description: string }[] = [
  { type: 'ch', label: 'Charge', description: 'Fixed power charging' },
  { type: 'dis', label: 'Discharge', description: 'Fixed power discharging' },
  { type: 'sb', label: 'Standby', description: 'No power flow' },
  { type: 'ct', label: 'Charge to SoC', description: 'Charge to target %' },
  { type: 'dt', label: 'Discharge to SoC', description: 'Discharge to target %' },
  { type: 'sl', label: 'Site Limit', description: 'Grid power limits (P9)' },
];

const WEEKDAYS = [
  { key: '0', label: 'Sun', short: 'S' },
  { key: '1', label: 'Mon', short: 'M' },
  { key: '2', label: 'Tue', short: 'T' },
  { key: '3', label: 'Wed', short: 'W' },
  { key: '4', label: 'Thu', short: 'T' },
  { key: '5', label: 'Fri', short: 'F' },
  { key: '6', label: 'Sat', short: 'S' },
];

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
    startTime: '08:00',
    endTime: '18:00',
    selectedDays: ['1', '2', '3', '4', '5', '6', '0'], // All days
  });

  const [isSaving, setIsSaving] = useState(false);

  // Load existing rule data
  useEffect(() => {
    if (!isNew && ruleId && rules.length > 0) {
      const existingRule = rules.find(r => r.id === ruleId && r.p === parseInt(priority || '0'));
      if (existingRule) {
        const days = existingRule.c?.d 
          ? existingRule.c.d.split('') 
          : ['1', '2', '3', '4', '5', '6', '0'];
        
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
          startTime: existingRule.c?.ts ? formatTime(existingRule.c.ts) : '08:00',
          endTime: existingRule.c?.te ? formatTime(existingRule.c.te) : '18:00',
          selectedDays: days,
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
    setFormData(prev => ({ ...prev, selectedDays: ['1', '2', '3', '4', '5'] }));
  };

  const selectWeekend = () => {
    setFormData(prev => ({ ...prev, selectedDays: ['0', '6'] }));
  };

  const selectEveryday = () => {
    setFormData(prev => ({ ...prev, selectedDays: ['0', '1', '2', '3', '4', '5', '6'] }));
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
      case 'sl':
        action.hth = parseFloat(formData.highThreshold) || 70;
        action.lth = parseFloat(formData.lowThreshold) || -40;
        break;
    }

    const conditions: RuleConditions = {};
    
    if (formData.hasTimeCondition) {
      conditions.ts = parseTime(formData.startTime);
      conditions.te = parseTime(formData.endTime);
    }
    
    if (formData.selectedDays.length < 7 && formData.selectedDays.length > 0) {
      conditions.d = formData.selectedDays.sort().join('');
    }

    const rule: Rule = {
      id: formData.id.trim().toUpperCase(),
      p: formData.actionType === 'sl' ? 9 : formData.priority,
      a: action,
      c: Object.keys(conditions).length > 0 ? conditions : undefined,
    };

    if (!formData.active) {
      rule.act = false;
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
        await updateRule(rule);
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

  // Force P9 for Site Limit
  useEffect(() => {
    if (formData.actionType === 'sl' && formData.priority !== 9) {
      setFormData(prev => ({ ...prev, priority: 9 }));
    }
  }, [formData.actionType]);

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

          {formData.actionType !== 'sl' && (
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
          )}

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

          {formData.actionType === 'sl' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>High Threshold (kW)</Text>
                <Text style={styles.inputHint}>Max grid import - discharge battery if exceeded</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.highThreshold}
                  onChangeText={(text) => setFormData({ ...formData, highThreshold: text.replace(/[^0-9.-]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="70"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Low Threshold (kW)</Text>
                <Text style={styles.inputHint}>Max grid export (negative) - charge battery if exceeded</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.lowThreshold}
                  onChangeText={(text) => setFormData({ ...formData, lowThreshold: text.replace(/[^0-9.-]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="-40"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </>
          )}

          {formData.actionType === 'sb' && (
            <Text style={styles.noParamsText}>No parameters needed for Standby</Text>
          )}
        </View>

        {/* Time Conditions */}
        {formData.actionType !== 'sl' && (
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
                    <TextInput
                      style={styles.textInput}
                      value={formData.startTime}
                      onChangeText={(text) => setFormData({ ...formData, startTime: text })}
                      placeholder="08:00"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>End Time</Text>
                    <TextInput
                      style={styles.textInput}
                      value={formData.endTime}
                      onChangeText={(text) => setFormData({ ...formData, endTime: text })}
                      placeholder="18:00"
                      placeholderTextColor={Colors.textSecondary}
                    />
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
        )}

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
});


