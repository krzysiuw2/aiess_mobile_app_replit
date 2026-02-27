import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Shield, Zap, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';

export default function SiteSettingsScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { safety, rawSchedules, isLoading, setSafety, setSiteLimit } = useSchedules();

  const [socMin, setSocMin] = useState('');
  const [socMax, setSocMax] = useState('');
  const [hth, setHth] = useState('');
  const [lth, setLth] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [savingSafety, setSavingSafety] = useState(false);
  const [savingSiteLimit, setSavingSiteLimit] = useState(false);

  useEffect(() => {
    if (safety) {
      setSocMin(safety.soc_min.toString());
      setSocMax(safety.soc_max.toString());
    }
  }, [safety]);

  useEffect(() => {
    if (rawSchedules?.sch?.p_9) {
      const slRule = rawSchedules.sch.p_9.find(r => r.a.t === 'sl');
      if (slRule) {
        setHth(slRule.a.hth?.toString() || '');
        setLth(slRule.a.lth?.toString() || '');
      }
    }
  }, [rawSchedules]);

  const handleSaveSafety = async () => {
    const min = parseFloat(socMin);
    const max = parseFloat(socMax);

    if (isNaN(min) || isNaN(max)) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }
    if (min < 0 || min > 100 || max < 0 || max > 100) {
      Alert.alert(t.common.error, t.settings.valuesBetween0And100);
      return;
    }
    if (min >= max) {
      Alert.alert(t.common.error, t.settings.minSocLessThanMax);
      return;
    }

    try {
      setSavingSafety(true);
      await setSafety(min, max);
      Alert.alert(t.common.success, t.settings.safetyLimitsUpdated);
    } catch (err) {
      Alert.alert(t.common.error, t.settings.failedSaveSafety);
    } finally {
      setSavingSafety(false);
    }
  };

  const handleSaveSiteLimit = async () => {
    const high = parseFloat(hth);
    const low = parseFloat(lth);

    if (isNaN(high) || isNaN(low)) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }

    try {
      setSavingSiteLimit(true);
      await setSiteLimit(high, low);
      Alert.alert(t.common.success, t.settings.siteLimitsUpdated);
    } catch (err) {
      Alert.alert(t.common.error, t.settings.failedSaveSiteLimits);
    } finally {
      setSavingSiteLimit(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.settings.siteSettings}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.siteSettings}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Device Info */}
        {selectedDevice && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Info size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>{t.settings.deviceInfo}</Text>
            </View>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.settings.deviceName}</Text>
                <Text style={styles.infoValue}>{selectedDevice.name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.settings.siteId}</Text>
                <Text style={styles.infoValue}>{selectedDevice.device_id}</Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.infoLabel}>{t.settings.location}</Text>
                <Text style={styles.infoValue}>{selectedDevice.location || '-'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Site Description (placeholder) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Info size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.siteDescription}</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={siteDescription}
            onChangeText={setSiteDescription}
            placeholder={t.settings.siteDescPlaceholder}
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={4}
            editable={false}
          />
          <Text style={styles.hintText}>{t.settings.siteDescHint}</Text>
        </View>

        {/* Safety SoC Limits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={20} color={Colors.warning} />
            <Text style={styles.sectionTitle}>{t.settings.safetySocLimits}</Text>
          </View>
          <Text style={styles.sectionDescription}>
            {t.settings.safetyDesc}
          </Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.minSoc}</Text>
              <TextInput
                style={styles.textInput}
                value={socMin}
                onChangeText={setSocMin}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.maxSoc}</Text>
              <TextInput
                style={styles.textInput}
                value={socMax}
                onChangeText={setSocMax}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveSafety}
            disabled={savingSafety}
          >
            {savingSafety ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t.settings.saveSafetyLimits}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* P9 Site Limit */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={20} color={Colors.error} />
            <Text style={styles.sectionTitle}>{t.settings.gridConnectionLimits}</Text>
          </View>
          <Text style={styles.sectionDescription}>
            {t.settings.gridConnectionDesc}
          </Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.maxImport}</Text>
              <TextInput
                style={styles.textInput}
                value={hth}
                onChangeText={setHth}
                keyboardType="numeric"
                placeholder="70"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.maxExport}</Text>
              <TextInput
                style={styles.textInput}
                value={lth}
                onChangeText={setLth}
                keyboardType="numeric"
                placeholder="-40"
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.hintText}>{t.settings.negativeExport}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveSiteLimit}
            disabled={savingSiteLimit}
          >
            {savingSiteLimit ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t.settings.saveSiteLimits}</Text>
            )}
          </TouchableOpacity>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hintText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
