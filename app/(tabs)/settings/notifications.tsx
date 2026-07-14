import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Bell, BellOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import {
  getPushPreference,
  setPushPreference,
  registerForPushNotifications,
  unregisterPushToken,
} from '@/lib/push-notifications';
import {
  ALERT_CATALOG,
  AlertType,
  AlertRule,
  fetchAlertRules,
  fetchAlertPrefs,
  saveAlertRule,
  saveAlertPref,
} from '@/lib/alerts';

export default function NotificationsSettingsScreen() {
  const { t } = useSettings();
  const { user } = useAuth();
  const { selectedDevice } = useDevices();
  const { siteConfig } = useSiteConfig();
  const siteId = selectedDevice?.device_id ?? null;

  // UI-ONLY gating per ADR 0009: thresholds are site-level, so only
  // owner/admin may edit them; RLS on alert_rules enforces the same server-side.
  const canEditRules =
    selectedDevice?.role === 'owner' || selectedDevice?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [prefs, setPrefs] = useState<Map<AlertType, boolean>>(new Map());
  const [rules, setRules] = useState<Map<AlertType, AlertRule>>(new Map());
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [push, userPrefs, siteRules] = await Promise.all([
          getPushPreference(),
          user?.id ? fetchAlertPrefs(user.id) : Promise.resolve(new Map<AlertType, boolean>()),
          siteId ? fetchAlertRules(siteId) : Promise.resolve(new Map<AlertType, AlertRule>()),
        ]);
        if (cancelled) return;
        setPushEnabled(push);
        setPrefs(userPrefs);
        setRules(siteRules);
      } catch (err) {
        console.warn('[Notifications] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, siteId]);

  const handlePushToggle = async (enabled: boolean) => {
    setPushEnabled(enabled);
    await setPushPreference(enabled);
    if (!user?.id) return;
    if (enabled) {
      await registerForPushNotifications(user.id);
    } else {
      await unregisterPushToken(user.id);
    }
  };

  const handlePrefToggle = async (type: AlertType, enabled: boolean) => {
    if (!user?.id) return;
    setPrefs((prev) => new Map(prev).set(type, enabled));
    try {
      await saveAlertPref(user.id, type, enabled);
    } catch (err) {
      console.warn('[Notifications] pref save failed:', err);
      setPrefs((prev) => new Map(prev).set(type, !enabled));
    }
  };

  const ruleFor = useCallback(
    (type: AlertType): { enabled: boolean; threshold: number | null } => {
      const rule = rules.get(type);
      const cat = ALERT_CATALOG.find((c) => c.type === type)!;
      let threshold = rule ? rule.threshold : cat.threshold?.default ?? null;
      // Seed the grid import threshold from the site's P9 import limit.
      if (
        type === 'grid_import_high' &&
        threshold === null &&
        siteConfig?.grid_connection?.import_limit_kw
      ) {
        threshold = siteConfig.grid_connection.import_limit_kw;
      }
      return { enabled: rule ? rule.enabled : cat.defaultEnabled, threshold };
    },
    [rules, siteConfig],
  );

  const handleRuleToggle = async (type: AlertType, enabled: boolean) => {
    if (!siteId || !canEditRules) return;
    const current = ruleFor(type);
    const next: AlertRule = { site_id: siteId, alert_type: type, enabled, threshold: current.threshold };
    setRules((prev) => new Map(prev).set(type, next));
    try {
      await saveAlertRule(next);
    } catch (err) {
      console.warn('[Notifications] rule save failed:', err);
      setRules((prev) => new Map(prev).set(type, { ...next, enabled: !enabled }));
      Alert.alert(t.common.error, t.settings.notificationsSaveError);
    }
  };

  const handleThresholdCommit = async (type: AlertType) => {
    if (!siteId || !canEditRules) return;
    const draft = thresholdDrafts[type];
    if (draft === undefined) return;
    const cat = ALERT_CATALOG.find((c) => c.type === type)!;
    const parsed = parseFloat(draft.replace(',', '.'));
    if (isNaN(parsed) || !cat.threshold || parsed < cat.threshold.min || parsed > cat.threshold.max) {
      // Reset the draft to the stored value on invalid input.
      setThresholdDrafts((prev) => {
        const copy = { ...prev };
        delete copy[type];
        return copy;
      });
      return;
    }
    const current = ruleFor(type);
    const next: AlertRule = { site_id: siteId, alert_type: type, enabled: current.enabled, threshold: parsed };
    setRules((prev) => new Map(prev).set(type, next));
    setThresholdDrafts((prev) => {
      const copy = { ...prev };
      delete copy[type];
      return copy;
    });
    try {
      await saveAlertRule(next);
    } catch (err) {
      console.warn('[Notifications] threshold save failed:', err);
      Alert.alert(t.common.error, t.settings.notificationsSaveError);
    }
  };

  const alertLabels = t.settings.alertTypes as Record<
    AlertType,
    { title: string; desc: string }
  >;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.notificationsTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Master toggle */}
          <View style={styles.section}>
            <View style={styles.masterRow}>
              {pushEnabled ? (
                <Bell size={22} color={Colors.primary} />
              ) : (
                <BellOff size={22} color={Colors.textSecondary} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.masterTitle}>{t.settings.pushNotifications}</Text>
                <Text style={styles.masterDesc}>{t.settings.pushNotificationsDesc}</Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                trackColor={{ true: Colors.primary }}
              />
            </View>
          </View>

          {/* Per-alert-type preferences */}
          <View style={[styles.section, !pushEnabled && styles.sectionDisabled]}>
            <Text style={styles.sectionTitle}>{t.settings.alertsSection}</Text>
            <Text style={styles.sectionDescription}>{t.settings.alertsSectionDesc}</Text>

            {ALERT_CATALOG.map((cat) => {
              const label = alertLabels[cat.type];
              const prefEnabled = prefs.get(cat.type) ?? true;
              const rule = ruleFor(cat.type);
              const draft = thresholdDrafts[cat.type];
              return (
                <View key={cat.type} style={styles.alertCard}>
                  <View style={styles.alertRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{label?.title ?? cat.type}</Text>
                      <Text style={styles.alertDesc}>{label?.desc ?? ''}</Text>
                    </View>
                    <Switch
                      value={prefEnabled}
                      onValueChange={(v) => handlePrefToggle(cat.type, v)}
                      disabled={!pushEnabled}
                      trackColor={{ true: Colors.primary }}
                    />
                  </View>

                  {cat.telemetry && (
                    <View style={styles.ruleRow}>
                      <View style={styles.ruleToggle}>
                        <Text style={styles.ruleLabel}>{t.settings.alertSiteEnabled}</Text>
                        <Switch
                          value={rule.enabled}
                          onValueChange={(v) => handleRuleToggle(cat.type, v)}
                          disabled={!canEditRules || !pushEnabled}
                          trackColor={{ true: Colors.primaryLight }}
                          thumbColor={rule.enabled ? Colors.primary : undefined}
                        />
                      </View>
                      {cat.threshold && (
                        <View style={styles.thresholdBox}>
                          <Text style={styles.ruleLabel}>{t.settings.alertThreshold}</Text>
                          <View style={styles.thresholdInputRow}>
                            <TextInput
                              style={[
                                styles.thresholdInput,
                                !canEditRules && styles.thresholdInputDisabled,
                              ]}
                              value={draft !== undefined ? draft : rule.threshold?.toString() ?? ''}
                              onChangeText={(text) =>
                                setThresholdDrafts((prev) => ({ ...prev, [cat.type]: text }))
                              }
                              onBlur={() => handleThresholdCommit(cat.type)}
                              editable={canEditRules && pushEnabled}
                              keyboardType="numeric"
                              returnKeyType="done"
                              placeholder="—"
                              placeholderTextColor={Colors.textSecondary}
                            />
                            <Text style={styles.thresholdUnit}>{cat.threshold.unit}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {!canEditRules && (
              <Text style={styles.roleHint}>{t.settings.alertsRoleHint}</Text>
            )}
          </View>
        </ScrollView>
      )}
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
  loadingContainer: {
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
  sectionDisabled: {
    opacity: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  masterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  masterDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  alertCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  alertDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 12,
  },
  ruleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  thresholdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thresholdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  thresholdInput: {
    minWidth: 64,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.text,
    textAlign: 'right',
  },
  thresholdInputDisabled: {
    opacity: 0.6,
  },
  thresholdUnit: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  roleHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
