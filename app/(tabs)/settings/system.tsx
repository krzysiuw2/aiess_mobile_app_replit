import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSchedules } from '@/hooks/useSchedules';
import type { SystemMode } from '@/types';

export default function SystemSettingsScreen() {
  const { t } = useSettings();
  const { mode, isLoading, setMode } = useSchedules();

  const MODES: { value: SystemMode; label: string; description: string }[] = [
    { value: 'automatic', label: t.settings.automatic, description: t.settings.automaticDesc },
    { value: 'semi-automatic', label: t.settings.semiAutomatic, description: t.settings.semiAutomaticDesc },
    { value: 'manual', label: t.settings.manual, description: t.settings.manualDesc },
  ];
  const [saving, setSaving] = useState(false);

  const handleModeChange = async (newMode: SystemMode) => {
    if (newMode === mode) return;

    try {
      setSaving(true);
      await setMode(newMode);
      Alert.alert(t.common.success, `${t.settings.systemModeSet} ${newMode}`);
    } catch (err) {
      Alert.alert(t.common.error, t.settings.failedUpdateMode);
    } finally {
      setSaving(false);
    }
  };

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.operatingMode}</Text>
          <Text style={styles.sectionDescription}>
            {t.settings.operatingModeDesc}
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : (
            <View style={styles.modeList}>
              {MODES.map((m) => {
                const isSelected = m.value === mode;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.modeCard, isSelected && styles.modeCardActive]}
                    onPress={() => handleModeChange(m.value)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <View style={styles.modeCardHeader}>
                      <Text style={[styles.modeLabel, isSelected && styles.modeLabelActive]}>
                        {m.label}
                      </Text>
                      {isSelected && (
                        saving ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <CheckCircle size={20} color={Colors.primary} />
                        )
                      )}
                    </View>
                    <Text style={[styles.modeDescription, isSelected && styles.modeDescriptionActive]}>
                      {m.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modeList: {
    gap: 12,
  },
  modeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  modeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  modeLabelActive: {
    color: Colors.primary,
  },
  modeDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modeDescriptionActive: {
    color: Colors.primary,
  },
});
