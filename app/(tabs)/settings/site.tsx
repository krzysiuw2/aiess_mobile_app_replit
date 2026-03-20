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
import { ArrowLeft, Shield, Zap, Info, BatteryCharging, Sun, X, MapPin, Battery, Cpu, SunMedium, Plug, BarChart3, Plus, Minus, Trash2, BrainCircuit, CheckCircle2, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { geocodeSiteAddress } from '@/lib/aws-site-config';
import OnboardingWizard from '@/components/ai-agent/OnboardingWizard';
import type { SiteConfigPvArray } from '@/types';

const BELL_CURVE_BARS = [0.08, 0.18, 0.35, 0.58, 0.78, 0.92, 1.0, 0.95, 0.82, 0.62, 0.38, 0.15];
const BELL_HOURS = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'];

export default function SiteSettingsScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { safety, rawSchedules, isLoading: schedulesLoading, setSafety, setSiteLimit } = useSchedules();
  const { siteConfig, updateConfig, isLoading: configLoading, isUpdating } = useSiteConfig();

  const isLoading = schedulesLoading || configLoading;

  const [socMin, setSocMin] = useState('');
  const [socMax, setSocMax] = useState('');
  const [hth, setHth] = useState('');
  const [lth, setLth] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [maxCharge, setMaxCharge] = useState('');
  const [maxDischarge, setMaxDischarge] = useState('');
  const [sunFollow, setSunFollow] = useState(false);
  const [showSunFollowPopup, setShowSunFollowPopup] = useState(false);
  const [savingSafety, setSavingSafety] = useState(false);
  const [savingSiteLimit, setSavingSiteLimit] = useState(false);
  const [showAiWizard, setShowAiWizard] = useState(false);
  const [peakConfidence, setPeakConfidence] = useState('0.99');

  // Phase 2 state
  const [battManufacturer, setBattManufacturer] = useState('');
  const [battModel, setBattModel] = useState('');
  const [battChemistry, setBattChemistry] = useState('');
  const [battCapacity, setBattCapacity] = useState('');
  const [invManufacturer, setInvManufacturer] = useState('');
  const [invModel, setInvModel] = useState('');
  const [invPower, setInvPower] = useState('');
  const [invCount, setInvCount] = useState('1');
  const [invType, setInvType] = useState('hybrid');
  const [pvTotalPeak, setPvTotalPeak] = useState('');
  const [pvArrays, setPvArrays] = useState<SiteConfigPvArray[]>([]);
  const [gridCapacity, setGridCapacity] = useState('');
  const [gridVoltage, setGridVoltage] = useState('');
  const [gridOperator, setGridOperator] = useState('');
  const [gridContract, setGridContract] = useState('');
  const [gridExportAllowed, setGridExportAllowed] = useState(true);
  const [gridMeteringId, setGridMeteringId] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [locationCountry, setLocationCountry] = useState('PL');
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Tariff fields moved to Financial Settings screen
  const [loadType, setLoadType] = useState('industrial');
  const [loadPeak, setLoadPeak] = useState('');
  const [loadBase, setLoadBase] = useState('');
  const [loadOpStart, setLoadOpStart] = useState('');
  const [loadOpEnd, setLoadOpEnd] = useState('');
  const [loadShift, setLoadShift] = useState('');
  const [loadSeasonal, setLoadSeasonal] = useState('');

  useEffect(() => {
    if (siteConfig) {
      setSiteDescription(siteConfig.general?.description || '');
      setMaxCharge(siteConfig.power_limits?.max_charge_kw?.toString() || '');
      setMaxDischarge(siteConfig.power_limits?.max_discharge_kw?.toString() || '');
      setSunFollow(siteConfig.grid_connection?.export_follows_sun || false);
      // Phase 2
      setBattManufacturer(siteConfig.battery?.manufacturer || '');
      setBattModel(siteConfig.battery?.model || '');
      setBattChemistry(siteConfig.battery?.chemistry || '');
      setBattCapacity(siteConfig.battery?.capacity_kwh?.toString() || '');
      setInvManufacturer(siteConfig.inverter?.manufacturer || '');
      setInvModel(siteConfig.inverter?.model || '');
      setInvPower(siteConfig.inverter?.power_kw?.toString() || '');
      setInvCount(siteConfig.inverter?.count?.toString() || '1');
      setInvType(siteConfig.inverter?.type || 'hybrid');
      setPvTotalPeak(siteConfig.pv_system?.total_peak_kw?.toString() || '');
      setPvArrays(siteConfig.pv_system?.arrays || []);
      setGridCapacity(siteConfig.grid_connection?.capacity_kva?.toString() || '');
      setGridVoltage(siteConfig.grid_connection?.voltage_level || '');
      setGridOperator(siteConfig.grid_connection?.operator || '');
      setGridContract(siteConfig.grid_connection?.contract_type || '');
      setGridExportAllowed(siteConfig.grid_connection?.export_allowed ?? true);
      setGridMeteringId(siteConfig.grid_connection?.metering_point_id || '');
      setLocationAddress(siteConfig.location?.address || '');
      setLocationLat(siteConfig.location?.latitude?.toString() || '');
      setLocationLng(siteConfig.location?.longitude?.toString() || '');
      setLocationCountry(siteConfig.location?.country || 'PL');
      // Tariff loaded in Financial Settings
      setLoadType(siteConfig.load_profile?.type || 'industrial');
      setLoadPeak(siteConfig.load_profile?.typical_peak_kw?.toString() || '');
      setLoadBase(siteConfig.load_profile?.typical_base_kw?.toString() || '');
      setLoadOpStart(siteConfig.load_profile?.operating_hours?.start || '');
      setLoadOpEnd(siteConfig.load_profile?.operating_hours?.end || '');
      setLoadShift(siteConfig.load_profile?.shift_pattern || '');
      setLoadSeasonal(siteConfig.load_profile?.seasonal_notes || '');
      const pc = siteConfig.ai_profile?.peak_confidence;
      setPeakConfidence(
        (typeof pc === 'number' && !Number.isNaN(pc) ? pc : 0.99).toFixed(2),
      );
    }
  }, [siteConfig]);

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

  const handleSaveDescription = async () => {
    if (!siteDescription.trim()) {
      Alert.alert(t.common.error, t.settings.siteConfigIncomplete);
      return;
    }
    try {
      await updateConfig({ general: { description: siteDescription.trim() } });
      Alert.alert(t.common.success, t.settings.siteDescSaved);
    } catch {
      Alert.alert(t.common.error, t.settings.failedSaveSiteConfig);
    }
  };

  const handleSaveDesiredPower = async () => {
    const ch = parseFloat(maxCharge);
    const dis = parseFloat(maxDischarge);
    if (isNaN(ch) || isNaN(dis) || ch <= 0 || dis <= 0) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }
    try {
      await updateConfig({ power_limits: { max_charge_kw: ch, max_discharge_kw: dis } });
      Alert.alert(t.common.success, t.settings.desiredPowerSaved);
    } catch {
      Alert.alert(t.common.error, t.settings.failedSaveSiteConfig);
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
      await updateConfig({ grid_connection: { export_follows_sun: sunFollow } });
      Alert.alert(t.common.success, t.settings.siteLimitsUpdated);
    } catch (err) {
      Alert.alert(t.common.error, t.settings.failedSaveSiteLimits);
    } finally {
      setSavingSiteLimit(false);
    }
  };

  const handleToggleSunFollow = async (v: boolean) => {
    setSunFollow(v);
    try {
      await updateConfig({ grid_connection: { export_follows_sun: v } });
    } catch {
      setSunFollow(!v);
    }
  };

  const handleSaveBattery = async () => {
    try {
      await updateConfig({
        battery: {
          manufacturer: battManufacturer || undefined,
          model: battModel || undefined,
          chemistry: battChemistry || undefined,
          capacity_kwh: parseFloat(battCapacity) || undefined,
        },
      });
      Alert.alert(t.common.success, t.settings.batterySpecsSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const handleSaveInverter = async () => {
    try {
      await updateConfig({
        inverter: {
          manufacturer: invManufacturer || undefined,
          model: invModel || undefined,
          power_kw: parseFloat(invPower) || undefined,
          count: parseInt(invCount) || 1,
          type: invType as any,
        },
      });
      Alert.alert(t.common.success, t.settings.inverterSpecsSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const handleSavePv = async () => {
    try {
      await updateConfig({
        pv_system: {
          total_peak_kw: parseFloat(pvTotalPeak) || undefined,
          arrays: pvArrays.length > 0 ? pvArrays : undefined,
        },
      });
      Alert.alert(t.common.success, t.settings.pvSystemSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const handleSaveGridConnection = async () => {
    try {
      await updateConfig({
        grid_connection: {
          capacity_kva: parseFloat(gridCapacity) || undefined,
          voltage_level: gridVoltage || undefined,
          operator: gridOperator || undefined,
          contract_type: gridContract || undefined,
          export_allowed: gridExportAllowed,
          metering_point_id: gridMeteringId || undefined,
          export_follows_sun: sunFollow,
        },
      });
      Alert.alert(t.common.success, t.settings.gridConnectionSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const handleSaveLocation = async () => {
    try {
      await updateConfig({
        location: {
          address: locationAddress || undefined,
          latitude: parseFloat(locationLat) || undefined,
          longitude: parseFloat(locationLng) || undefined,
          country: locationCountry || undefined,
        },
      });
      Alert.alert(t.common.success, t.settings.locationSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const handleGeocode = async () => {
    if (!locationAddress.trim() || !selectedDevice) return;
    try {
      setIsGeocoding(true);
      const coords = await geocodeSiteAddress(selectedDevice.device_id, locationAddress);
      setLocationLat(coords.latitude.toFixed(6));
      setLocationLng(coords.longitude.toFixed(6));
      Alert.alert(t.common.success, t.settings.geocodeSuccess);
    } catch {
      Alert.alert(t.common.error, t.settings.geocodeFailed);
    } finally {
      setIsGeocoding(false);
    }
  };

  const roundPeakConfidence = (v: number) => Math.round(v * 100) / 100;

  const bumpPeakConfidence = (delta: number) => {
    const cur = parseFloat(peakConfidence);
    const base = Number.isFinite(cur) ? cur : 0.99;
    const next = roundPeakConfidence(Math.min(1, Math.max(0.9, base + delta)));
    setPeakConfidence(next.toFixed(2));
  };

  const handleSavePeakConfidence = async () => {
    const v = parseFloat(peakConfidence);
    if (!Number.isFinite(v)) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }
    const clamped = roundPeakConfidence(Math.min(1, Math.max(0.9, v)));
    if (clamped < 0.9 || clamped > 1) {
      Alert.alert(t.common.error, t.common.pleaseEnterValidNumbers);
      return;
    }
    try {
      await updateConfig({
        ai_profile: {
          ...siteConfig?.ai_profile,
          peak_confidence: clamped,
        },
      });
      setPeakConfidence(clamped.toFixed(2));
      Alert.alert(t.common.success, t.settings.peak_confidence_saved);
    } catch {
      Alert.alert(t.common.error, t.settings.failedSaveSiteConfig);
    }
  };

  const handleSaveLoadProfile = async () => {
    try {
      await updateConfig({
        load_profile: {
          type: loadType as any,
          typical_peak_kw: parseFloat(loadPeak) || undefined,
          typical_base_kw: parseFloat(loadBase) || undefined,
          operating_hours: (loadOpStart && loadOpEnd) ? { start: loadOpStart, end: loadOpEnd } : undefined,
          shift_pattern: loadShift || undefined,
          seasonal_notes: loadSeasonal || undefined,
        },
      });
      Alert.alert(t.common.success, t.settings.loadProfileSaved);
    } catch { Alert.alert(t.common.error, t.settings.failedSaveSiteConfig); }
  };

  const addPvArray = () => {
    setPvArrays(prev => [...prev, { name: `Array ${prev.length + 1}`, peak_kw: 0, tilt_deg: 15, azimuth_deg: 180, tracker: 'fixed', shading_factor: 0.95, monitored: false, efficiency_factor: 1.0 }]);
  };

  const updatePvArray = (index: number, patch: Partial<SiteConfigPvArray>) => {
    setPvArrays(prev => prev.map((a, i) => i === index ? { ...a, ...patch } : a));
  };

  const removePvArray = (index: number) => {
    setPvArrays(prev => prev.filter((_, i) => i !== index));
  };

  const pcsPower = siteConfig?.inverter?.power_kw ?? selectedDevice?.pcs_power_kw;
  const batteryCapacity = siteConfig?.battery?.capacity_kwh ?? selectedDevice?.battery_capacity_kwh;
  const pvPeak = siteConfig?.pv_system?.total_peak_kw ?? selectedDevice?.pv_power_kw;

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
                <Text style={styles.infoValue}>
                  {siteConfig?.location?.address || selectedDevice.location || '-'}
                </Text>
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
                  {pcsPower != null ? `${pcsPower} kW` : '—'}
                </Text>
              </View>
              <View style={styles.datasheetRow}>
                <Text style={styles.datasheetLabel}>{t.settings.datasheetCapacity}</Text>
                <Text style={styles.datasheetValue}>
                  {batteryCapacity != null ? `${batteryCapacity} kWh` : '—'}
                </Text>
              </View>
              <View style={[styles.datasheetRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.datasheetLabel}>{t.settings.datasheetPv}</Text>
                <Text style={styles.datasheetValue}>
                  {pvPeak != null ? `${pvPeak} kWp` : '—'}
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
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t.settings.saveSiteDesc}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* AI Profile Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BrainCircuit size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.aiAgent.aiProfile}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.aiAgent.aiProfileDesc}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.peak_confidence}</Text>
            <Text style={styles.hintText}>{t.settings.peak_confidence_desc}</Text>
            <View style={styles.peakConfidenceRow}>
              <TouchableOpacity
                style={styles.peakConfidenceStep}
                onPress={() => bumpPeakConfidence(-0.01)}
                disabled={isUpdating || parseFloat(peakConfidence) <= 0.9}
              >
                <Minus size={22} color={Colors.text} />
              </TouchableOpacity>
              <TextInput
                style={[styles.textInput, styles.peakConfidenceInput]}
                value={peakConfidence}
                onChangeText={(v) => {
                  const cleaned = v.replace(/[^0-9.]/g, '');
                  setPeakConfidence(cleaned);
                }}
                onBlur={() => {
                  const v = parseFloat(peakConfidence);
                  if (!Number.isFinite(v)) {
                    setPeakConfidence((siteConfig?.ai_profile?.peak_confidence ?? 0.99).toFixed(2));
                    return;
                  }
                  setPeakConfidence(roundPeakConfidence(Math.min(1, Math.max(0.9, v))).toFixed(2));
                }}
                keyboardType="decimal-pad"
                placeholder="0.99"
                placeholderTextColor={Colors.textSecondary}
              />
              <TouchableOpacity
                style={styles.peakConfidenceStep}
                onPress={() => bumpPeakConfidence(0.01)}
                disabled={isUpdating || parseFloat(peakConfidence) >= 1}
              >
                <Plus size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.saveButton, { marginBottom: 12 }]}
            onPress={handleSavePeakConfidence}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t.common.save}</Text>
            )}
          </TouchableOpacity>

          {siteConfig?.ai_profile?.wizard_completed ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 12 }}>
                <CheckCircle2 size={18} color={Colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primary, flex: 1 }}>
                  {t.aiAgent.profileComplete}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {siteConfig.ai_profile.business_type && (
                  <View style={{ backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border }}>
                    <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                      {t.aiAgent.wizard[`type_${siteConfig.ai_profile.business_type}` as keyof typeof t.aiAgent.wizard]}
                    </Text>
                  </View>
                )}
                {siteConfig.ai_profile.risk_tolerance && (
                  <View style={{ backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border }}>
                    <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                      {t.aiAgent.wizard[`risk${siteConfig.ai_profile.risk_tolerance.charAt(0).toUpperCase() + siteConfig.ai_profile.risk_tolerance.slice(1)}` as keyof typeof t.aiAgent.wizard]}
                    </Text>
                  </View>
                )}
                {siteConfig.ai_profile.optimization_goals?.map(g => (
                  <View key={g} style={{ backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border }}>
                    <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                      {t.aiAgent.wizard[`goal${g === 'maximize_arbitrage' ? 'Arbitrage' : g === 'peak_shaving' ? 'PeakShaving' : g === 'pv_self_consumption' ? 'PvSelfConsumption' : 'ReduceBill'}` as keyof typeof t.aiAgent.wizard]}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: Colors.primary + '15', marginTop: 4 }]}
                onPress={() => setShowAiWizard(true)}
              >
                <Text style={[styles.saveButtonText, { color: Colors.primary }]}>{t.aiAgent.editProfile}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12 }}>
                <AlertCircle size={18} color="#D97706" />
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#92400E', flex: 1 }}>
                  {t.aiAgent.profileIncomplete}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => setShowAiWizard(true)}
              >
                <Text style={styles.saveButtonText}>{t.aiAgent.setupProfile}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <OnboardingWizard
          visible={showAiWizard}
          onClose={() => setShowAiWizard(false)}
          initialValues={{
            aiProfile: siteConfig?.ai_profile,
            siteDescription: siteConfig?.general?.description,
          }}
        />

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
              onValueChange={handleToggleSunFollow}
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
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t.settings.saveDesiredPower}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Location & Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.locationAddress}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.locationAddressDesc}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.address}</Text>
            <TextInput style={styles.textInput} value={locationAddress} onChangeText={setLocationAddress} placeholder={t.settings.addressPlaceholder} placeholderTextColor={Colors.textSecondary} />
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.latitude}</Text>
              <TextInput style={styles.textInput} value={locationLat} onChangeText={setLocationLat} keyboardType="decimal-pad" placeholder="50.0647" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.longitude}</Text>
              <TextInput style={styles.textInput} value={locationLng} onChangeText={setLocationLng} keyboardType="decimal-pad" placeholder="19.9450" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.analytics.forecastTab.country}</Text>
            <View style={styles.chipRow}>
              {['PL', 'DE', 'CZ', 'SK'].map(code => (
                <TouchableOpacity
                  key={code}
                  style={[styles.chip3, locationCountry === code && styles.chip3Active]}
                  onPress={() => setLocationCountry(code)}
                >
                  <Text style={[styles.chip3Text, locationCountry === code && styles.chip3TextActive]}>{code}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sectionDescription}>{t.analytics.forecastTab.countryHint}</Text>
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: Colors.warning, marginBottom: 12 }]} onPress={handleGeocode} disabled={isGeocoding || !locationAddress.trim()}>
            {isGeocoding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>{t.settings.autoDetectGps}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveLocation} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.saveLocation}</Text>
          </TouchableOpacity>
        </View>

        {/* Battery Specs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Battery size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>{t.settings.batterySpecs}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.batterySpecsDesc}</Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.manufacturer}</Text>
              <TextInput style={styles.textInput} value={battManufacturer} onChangeText={setBattManufacturer} placeholder="BYD" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.model}</Text>
              <TextInput style={styles.textInput} value={battModel} onChangeText={setBattModel} placeholder="MC-Series" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.chemistry}</Text>
              <TextInput style={styles.textInput} value={battChemistry} onChangeText={setBattChemistry} placeholder="LFP" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.capacityKwh}</Text>
              <TextInput style={styles.textInput} value={battCapacity} onChangeText={v => setBattCapacity(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="568" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveBattery} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.saveBatterySpecs}</Text>
          </TouchableOpacity>
        </View>

        {/* Inverter Specs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Cpu size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.inverterSpecs}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.inverterSpecsDesc}</Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.manufacturer}</Text>
              <TextInput style={styles.textInput} value={invManufacturer} onChangeText={setInvManufacturer} placeholder="SMA" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.model}</Text>
              <TextInput style={styles.textInput} value={invModel} onChangeText={setInvModel} placeholder="Sunny Tripower X 25" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.powerKw}</Text>
              <TextInput style={styles.textInput} value={invPower} onChangeText={v => setInvPower(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="305" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.count}</Text>
              <TextInput style={styles.textInput} value={invCount} onChangeText={v => setInvCount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="1" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveInverter} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.saveInverterSpecs}</Text>
          </TouchableOpacity>
        </View>

        {/* PV System */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SunMedium size={20} color={Colors.warning} />
            <Text style={styles.sectionTitle}>{t.settings.pvSystem}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.pvSystemDesc}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.totalPeakKw}</Text>
            <TextInput style={styles.textInput} value={pvTotalPeak} onChangeText={v => setPvTotalPeak(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="200" placeholderTextColor={Colors.textSecondary} />
          </View>

          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>{t.settings.arrays}</Text>
          {pvArrays.map((arr, idx) => (
            <View key={idx} style={styles.arrayCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <TextInput style={[styles.textInput, { flex: 1, marginRight: 8 }]} value={arr.name || ''} onChangeText={v => updatePvArray(idx, { name: v })} placeholder={t.settings.arrayName} placeholderTextColor={Colors.textSecondary} />
                <TouchableOpacity style={styles.removeArrayBtn} onPress={() => removePvArray(idx)}>
                  <Trash2 size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.peakKw}</Text>
                  <TextInput style={styles.textInput} value={arr.peak_kw?.toString() || ''} onChangeText={v => updatePvArray(idx, { peak_kw: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholderTextColor={Colors.textSecondary} />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.panelCount}</Text>
                  <TextInput style={styles.textInput} value={arr.panel_count?.toString() || ''} onChangeText={v => updatePvArray(idx, { panel_count: parseInt(v) || 0 })} keyboardType="number-pad" placeholderTextColor={Colors.textSecondary} />
                </View>
              </View>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.tiltDeg}</Text>
                  <TextInput style={styles.textInput} value={arr.tilt_deg?.toString() || ''} onChangeText={v => updatePvArray(idx, { tilt_deg: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholderTextColor={Colors.textSecondary} />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.azimuthDeg}</Text>
                  <TextInput style={styles.textInput} value={arr.azimuth_deg?.toString() || ''} onChangeText={v => updatePvArray(idx, { azimuth_deg: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholderTextColor={Colors.textSecondary} />
                </View>
              </View>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.efficiencyFactor}</Text>
                  <TextInput style={styles.textInput} value={arr.efficiency_factor?.toString() || '1.0'} onChangeText={v => updatePvArray(idx, { efficiency_factor: parseFloat(v) || 1.0 })} keyboardType="decimal-pad" placeholderTextColor={Colors.textSecondary} />
                </View>
                <View style={[styles.inputGroup, { flex: 1, justifyContent: 'center' }]}>
                  <Text style={styles.arrayFieldLabel}>{t.settings.monitored}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Switch
                      value={arr.monitored ?? false}
                      onValueChange={v => updatePvArray(idx, { monitored: v })}
                      trackColor={{ false: Colors.border, true: Colors.primary }}
                    />
                    <Text style={{ color: arr.monitored ? Colors.primary : Colors.textSecondary, fontSize: 12 }}>
                      {arr.monitored ? t.monitor.metered : t.monitor.estimated}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }]} onPress={addPvArray}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Plus size={18} color={Colors.primary} />
              <Text style={[styles.saveButtonText, { color: Colors.primary }]}>{t.settings.addArray}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSavePv} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.savePvSystem}</Text>
          </TouchableOpacity>
        </View>

        {/* Grid Connection Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Plug size={20} color={Colors.error} />
            <Text style={styles.sectionTitle}>{t.settings.gridConnection}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.gridConnectionDetailDesc}</Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.capacityKva}</Text>
              <TextInput style={styles.textInput} value={gridCapacity} onChangeText={v => setGridCapacity(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="200" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.voltageLevel}</Text>
              <TextInput style={styles.textInput} value={gridVoltage} onChangeText={setGridVoltage} placeholder="LV" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.gridOperatorName}</Text>
              <TextInput style={styles.textInput} value={gridOperator} onChangeText={setGridOperator} placeholder="Tauron" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.contractType}</Text>
              <TextInput style={styles.textInput} value={gridContract} onChangeText={setGridContract} placeholder="prosumer" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.meteringPointId}</Text>
            <TextInput style={styles.textInput} value={gridMeteringId} onChangeText={setGridMeteringId} placeholder="PL-TAURON-12345" placeholderTextColor={Colors.textSecondary} />
          </View>
          <View style={[styles.switchRow, { marginBottom: 16 }]}>
            <Text style={styles.inputLabel}>{t.settings.exportAllowed}</Text>
            <Switch value={gridExportAllowed} onValueChange={setGridExportAllowed} trackColor={{ false: Colors.border, true: Colors.primaryLight }} thumbColor={gridExportAllowed ? Colors.primary : Colors.textSecondary} />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveGridConnection} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.saveGridConnection}</Text>
          </TouchableOpacity>
        </View>

        {/* Load Profile */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BarChart3 size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.loadProfile}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.loadProfileDesc}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.profileType}</Text>
            <View style={styles.chipRow}>
              {(['industrial', 'commercial', 'residential'] as const).map(lt => (
                <TouchableOpacity key={lt} style={[styles.chip3, loadType === lt && styles.chip3Active]} onPress={() => setLoadType(lt)}>
                  <Text style={[styles.chip3Text, loadType === lt && styles.chip3TextActive]}>
                    {lt === 'industrial' ? t.settings.industrial : lt === 'commercial' ? t.settings.commercial : t.settings.residential}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.typicalPeakKw}</Text>
              <TextInput style={styles.textInput} value={loadPeak} onChangeText={v => setLoadPeak(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="150" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.typicalBaseKw}</Text>
              <TextInput style={styles.textInput} value={loadBase} onChangeText={v => setLoadBase(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="30" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.operatingStart}</Text>
              <TextInput style={styles.textInput} value={loadOpStart} onChangeText={setLoadOpStart} placeholder="06:00" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.operatingEnd}</Text>
              <TextInput style={styles.textInput} value={loadOpEnd} onChangeText={setLoadOpEnd} placeholder="22:00" placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.shiftPattern}</Text>
            <TextInput style={styles.textInput} value={loadShift} onChangeText={setLoadShift} placeholder="two_shift" placeholderTextColor={Colors.textSecondary} />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.seasonalNotes}</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={loadSeasonal} onChangeText={setLoadSeasonal} placeholder="Higher load in summer due to cooling" placeholderTextColor={Colors.textSecondary} multiline numberOfLines={3} />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveLoadProfile} disabled={isUpdating}>
            <Text style={styles.saveButtonText}>{t.settings.saveLoadProfile}</Text>
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
  arrayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 10,
  },
  removeArrayBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
  },
  arrayFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip3: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  chip3Active: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chip3Text: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  chip3TextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  peakConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  peakConfidenceStep: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peakConfidenceInput: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 12,
  },
  touPeriodCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  touPeriodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  touDeleteBtn: {
    padding: 8,
  },
  touSmallLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  touDaysRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  touDayChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  touDayChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  touDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  touDayTextActive: {
    color: '#fff',
  },
  touAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  touAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
});
