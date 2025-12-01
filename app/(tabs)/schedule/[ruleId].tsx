import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Search } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { ActionType } from '@/types';

const ACTION_TYPES: { type: ActionType; label: string }[] = [
  { type: 'ch', label: 'Charge' },
  { type: 'dis', label: 'Discharge' },
  { type: 'sb', label: 'Standby' },
  { type: 'ct', label: 'Charge to SoC' },
  { type: 'dt', label: 'Discharge to SoC' },
  { type: 'sl', label: 'Site Limit' },
];

export default function RuleBuilderScreen() {
  const { t } = useSettings();
  const { ruleId } = useLocalSearchParams<{ ruleId: string }>();
  const isNew = ruleId === 'new';

  const [formData, setFormData] = useState({
    id: isNew ? '' : ruleId,
    priority: 7,
    active: true,
    actionType: 'ch' as ActionType,
    power: 100,
    targetSoc: 50,
    maxPower: 30,
    maxGrid: 25,
  });

  const handleConfirm = () => {
    if (!formData.id.trim()) {
      Alert.alert(t.common.error, 'Rule ID is required');
      return;
    }
    Alert.alert('Success', 'Rule saved successfully');
    router.back();
  };

  const handleDiscard = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.schedules.title}</Text>
          <Text style={styles.headerSubtitle}>{t.schedules.ruleBuilder}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Search size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.schedules.ruleId}</Text>
            <TextInput
              style={styles.textInput}
              value={formData.id}
              onChangeText={(text) => setFormData({ ...formData, id: text.toUpperCase() })}
              placeholder="RULE-NAME"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.schedules.priority}</Text>
            <View style={styles.priorityRow}>
              {[4, 5, 6, 7, 8].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityButton,
                    formData.priority === p && styles.priorityButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, priority: p })}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      formData.priority === p && styles.priorityTextActive,
                    ]}
                  >
                    P{p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.inputLabel}>{t.schedules.active}</Text>
            <Switch
              value={formData.active}
              onValueChange={(value) => setFormData({ ...formData, active: value })}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={formData.active ? Colors.primary : Colors.textSecondary}
            />
          </View>
        </View>

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
                <Text
                  style={[
                    styles.actionText,
                    formData.actionType === action.type && styles.actionTextActive,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parameters</Text>
          
          {(formData.actionType === 'ch' || formData.actionType === 'dis') && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Power (kW)</Text>
              <TextInput
                style={styles.textInput}
                value={String(formData.power)}
                onChangeText={(text) => setFormData({ ...formData, power: parseInt(text) || 0 })}
                keyboardType="numeric"
              />
            </View>
          )}

          {(formData.actionType === 'ct' || formData.actionType === 'dt') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target SoC (%)</Text>
                <TextInput
                  style={styles.textInput}
                  value={String(formData.targetSoc)}
                  onChangeText={(text) => setFormData({ ...formData, targetSoc: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.schedules.maxPower} (kW)</Text>
                <TextInput
                  style={styles.textInput}
                  value={String(formData.maxPower)}
                  onChangeText={(text) => setFormData({ ...formData, maxPower: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.schedules.maxGrid} (kW)</Text>
                <TextInput
                  style={styles.textInput}
                  value={String(formData.maxGrid)}
                  onChangeText={(text) => setFormData({ ...formData, maxGrid: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>{t.common.confirm}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
          <Text style={styles.discardButtonText}>{t.common.discard}</Text>
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
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    paddingVertical: 10,
    borderRadius: 8,
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
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  priorityTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionCard: {
    width: '31%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  actionCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  actionTextActive: {
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  discardButton: {
    flex: 1,
    backgroundColor: Colors.error,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  discardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
