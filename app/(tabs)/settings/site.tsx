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
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Shield, Zap, Info, BatteryCharging, Sun, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';

const BELL_CURVE_BARS = [0.08, 0.18, 0.35, 0.58, 0.78, 0.92, 1.0, 0.95, 0.82, 0.62, 0.38, 0.15];
const BELL_HOURS = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'];

export default function SiteSettingsScreen() {
  const { t, settings, setSiteConfig } = useSettings();
  const { selectedDevice } = useDevices();
  const { safety, rawSchedules, isLoading, setSafety, setSiteLimit } = useSchedules();

  const [socMin, setSocMin] = useState('');
  const [socMax, setSocMax] = useState('');
  const [hth, setHth] = useState('');
  const [lth, setLth] = useState('');
  const [siteDescription, setSiteDescription] = useState(settings.siteDescription || '');
  const [maxCharge, setMaxCharge] = useState(settings.maxChargePower?.toString() || '');
  const [maxDischarge, setMaxDischarge] = useState(settings.maxDischargePower?.toString() || '');
  const [sunFollow, setSunFollow] = useState(settings.gridExportFollowsSun || false);
  const [showSunFollowPopup, setShowSunFollowPopup] = useState(false);
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

  const handleSaveDescription = () => {
    if (!siteDescription.trim()) {
      Alert.alert(t.common.error, t.settings.siteConfigIncomplete);
      return;
    }
    setSiteConfig({ siteDescription: siteDescription.trim() });
    Alert.alert(t.common.success, t.settings.siteDescSaved);
  };

  const handleSaveDesiredPower = () => {
    const ch = parseFloat(maxCharge);
    const dis = parseFloat(maxDischarge);
    if (isNaN(ch) || isNaN(dis) || ch <= 0 || dis <= 0) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }
    setSiteConfig({ maxChargePower: ch, maxDischargePower: dis });
    Alert.alert(t.common.success, t.settings.desiredPowerSaved);
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

        {/* Site Description */}
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
          />
          <Text style={styles.hintText}>{t.settings.siteDescHint}</Text>

          {/* Auto-generated datasheet block */}
          {selectedDevice && (
            <View style={styles.datasheetCard}>
              <Text style={styles.datasheetTitle}>{t.settings.datasheetTitle}</Text>
              <View style={styles.datasheetRow}>
                <Text style={styles.datasheetLabel}>{t.settings.datasheetPower}</Text>
                <Text style={styles.datasheetValue}>
                  {selectedDevice.pcs_power_kw != null ? `${selectedDevice.pcs_power_kw} kW` : '—'}
                </Text>
              </View>
              <View style={styles.datasheetRow}>
                <Text style={styles.datasheetLabel}>{t.settings.datasheetCapacity}</Text>
                <Text style={styles.datasheetValue}>
                  {selectedDevice.battery_capacity_kwh != null ? `${selectedDevice.battery_capacity_kwh} kWh` : '—'}
                </Text>
              </View>
              <View style={[styles.datasheetRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.datasheetLabel}>{t.settings.datasheetPv}</Text>
                <Text style={styles.datasheetValue}>
                  {selectedDevice.pv_power_kw != null ? `${selectedDevice.pv_power_kw} kWp` : '—'}
                </Text>
              </View>
              <Text style={styles.datasheetHint}>{t.settings.datasheetAutoNote}</Text>
            </View>
          )}

          {/* Sun-follow prompt injection */}
          {sunFollow && (
            <View style={[styles.sunFollowNote, { marginTop: 12 }]}>
              <Sun size={14} color={Colors.warning} />
              <Text style={styles.sunFollowNoteText}>
                {t.settings.sunFollowDescSuffix.replace('{power}', Math.abs(parseFloat(lth) || 0).toString())}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, { marginTop: 12 }]}
            onPress={handleSaveDescription}
          >
            <Text style={styles.saveButtonText}>{t.settings.saveSiteDesc}</Text>
          </TouchableOpacity>
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
                placeholder="-1"
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.hintText}>{t.settings.negativeExport}</Text>
            </View>
          </View>

          {/* Sun-follow export toggle */}
          <View style={styles.sunFollowRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sun size={16} color={Colors.warning} />
                <Text style={styles.inputLabel}>{t.settings.sunFollowExport}</Text>
              </View>
              <Text style={styles.hintText}>{t.settings.sunFollowExportHint}</Text>
              <TouchableOpacity onPress={() => setShowSunFollowPopup(true)}>
                <Text style={styles.readMoreLink}>{t.settings.sunFollowReadMore}</Text>
              </TouchableOpacity>
            </View>
            <Switch
              value={sunFollow}
              onValueChange={(v) => {
                setSunFollow(v);
                setSiteConfig({ gridExportFollowsSun: v });
              }}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={sunFollow ? Colors.primary : Colors.textSecondary}
            />
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

        {/* Desired Power Limits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BatteryCharging size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.desiredPowerLimits}</Text>
          </View>
          <Text style={styles.sectionDescription}>
            {t.settings.desiredPowerDesc}
          </Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.maxChargePower}</Text>
              <TextInput
                style={styles.textInput}
                value={maxCharge}
                onChangeText={(v) => setMaxCharge(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.maxDischargePower}</Text>
              <TextInput
                style={styles.textInput}
                value={maxDischarge}
                onChangeText={(v) => setMaxDischarge(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveDesiredPower}
          >
            <Text style={styles.saveButtonText}>{t.settings.saveDesiredPower}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Sun-follow info popup */}
      <Modal visible={showSunFollowPopup} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupContainer}>
            <View style={styles.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Sun size={22} color={Colors.warning} />
                <Text style={styles.popupTitle}>{t.settings.sunFollowPopupTitle}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSunFollowPopup(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Bell curve chart */}
            <View style={styles.chartContainer}>
              <View style={styles.chartBars}>
                {BELL_CURVE_BARS.map((h, i) => (
                  <View key={i} style={styles.chartBarWrapper}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: h * 100,
                          backgroundColor: h > 0.85 ? Colors.warning : h > 0.5 ? '#fbbf24' : '#fde68a',
                        },
                      ]}
                    />
                    <Text style={styles.chartLabel}>{BELL_HOURS[i]}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartCaption}>Export power (kW) vs. hour of day</Text>
            </View>

            <Text style={styles.popupBody}>{t.settings.sunFollowPopupBody}</Text>

            <TouchableOpacity
              style={styles.popupCloseButton}
              onPress={() => setShowSunFollowPopup(false)}
            >
              <Text style={styles.popupCloseText}>{t.settings.sunFollowPopupClose}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  datasheetCard: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  datasheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  datasheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  datasheetLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  datasheetValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  datasheetHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  readMoreLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  sunFollowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sunFollowNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 28,
  },
  sunFollowNoteText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '500',
    lineHeight: 17,
  },
  popupOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  popupContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  popupBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  popupCloseButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  popupCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chartContainer: {
    marginBottom: 20,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    gap: 4,
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  chartBar: {
    width: '80%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 8,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  chartCaption: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
