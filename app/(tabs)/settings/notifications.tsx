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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Bell, BellOff, Moon, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import TimePicker from '@/components/common/TimePicker';
import {
  getPushPreference,
  setPushPreference,
  registerForPushNotifications,
  unregisterPushToken,
  getOsPermissionStatus,
} from '@/lib/push-notifications';
import {
  ALERT_CATALOG,
  AlertType,
  AlertRule,
  NotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  fetchAlertRules,
  fetchAlertPrefs,
  saveAlertRule,
  saveAlertPref,
  fetchNotificationPrefs,
  saveNotificationPrefs,
} from '@/lib/alerts';

const minToHHMM = (min: number): string =>
  `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;

const hhmmToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

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
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });
  const [showQuietStartPicker, setShowQuietStartPicker] = useState(false);
  const [showQuietEndPicker, setShowQuietEndPicker] = useState(false);
  const [osPermissionDenied, setOsPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [push, userPrefs, siteRules, quietPrefs] = await Promise.all([
          getPushPreference(),
          user?.id ? fetchAlertPrefs(user.id) : Promise.resolve(new Map<AlertType, boolean>()),
          siteId ? fetchAlertRules(siteId) : Promise.resolve(new Map<AlertType, AlertRule>()),
          user?.id
            ? fetchNotificationPrefs(user.id)
            : Promise.resolve({ ...DEFAULT_NOTIFICATION_PREFS }),
        ]);
        if (cancelled) return;
        setPushEnabled(push);
        setPrefs(userPrefs);
        setRules(siteRules);
        setNotifPrefs(quietPrefs);
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

  // Re-check the OS permission whenever the screen gains focus, so the
  // warning banner updates after the user returns from system settings.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const status = await getOsPermissionStatus();
        if (!cancelled) setOsPermissionDenied(status === 'denied');
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

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

  const persistQuietPrefs = async (next: NotificationPrefs, prev: NotificationPrefs) => {
    if (!user?.id) return;
    setNotifPrefs(next);
    try {
      await saveNotificationPrefs(user.id, next);
    } catch (err) {
      console.warn('[Notifications] quiet hours save failed:', err);
      setNotifPrefs(prev);
      Alert.alert(t.common.error, t.settings.notificationsSaveError);
    }
  };

  const handleQuietToggle = (enabled: boolean) => {
    // Capture the device timezone on save so the server evaluates the window
    // in the user's local time.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    persistQuietPrefs({ ...notifPrefs, quiet_hours_enabled: enabled, timezone }, notifPrefs);
  };

  const handleQuietTimeSelect = (field: 'quiet_start_min' | 'quiet_end_min', hhmm: string) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    persistQuietPrefs({ ...notifPrefs, [field]: hhmmToMin(hhmm), timezone }, notifPrefs);
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
      // Seed the grid export threshold from the site's P9 export limit.
      if (
        type === 'grid_export_high' &&
        threshold === null &&
        siteConfig?.grid_connection?.export_limit_kw
      ) {
        threshold = Math.abs(siteConfig.grid_connection.export_limit_kw);
      }
      // Seed the contracted demand power threshold from financial settings.
      if (type === 'moc_zamowiona_high' && threshold === null) {
        const fin = siteConfig?.financial;
        const moc = fin?.moc_zamowiona_after_bess_kw ?? fin?.moc_zamowiona_before_bess_kw;
        if (moc && moc > 0) threshold = moc;
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
          {/* OS permission mismatch: preference is on but the system permission
              was revoked, so pushes would silently fail on this device. */}
          {pushEnabled && osPermissionDenied && (
            <TouchableOpacity style={styles.permissionBanner} onPress={() => Linking.openSettings()}>
              <AlertTriangle size={20} color={Colors.warning} />
              <Text style={styles.permissionBannerText}>{t.settings.pushPermissionWarning}</Text>
              <Text style={styles.permissionBannerAction}>{t.settings.openSettings}</Text>
            </TouchableOpacity>
          )}

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

          {/* Quiet hours */}
          <View style={[styles.section, !pushEnabled && styles.sectionDisabled]}>
            <View style={styles.masterRow}>
              <Moon
                size={22}
                color={notifPrefs.quiet_hours_enabled ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.masterTitle}>{t.settings.quietHours}</Text>
                <Text style={styles.masterDesc}>{t.settings.quietHoursDesc}</Text>
              </View>
              <Switch
                value={notifPrefs.quiet_hours_enabled}
                onValueChange={handleQuietToggle}
                disabled={!pushEnabled}
                trackColor={{ true: Colors.primary }}
              />
            </View>
            {notifPrefs.quiet_hours_enabled && (
              <View style={styles.quietTimesRow}>
                <TouchableOpacity
                  style={styles.quietTimeBox}
                  onPress={() => setShowQuietStartPicker(true)}
                  disabled={!pushEnabled}
                >
                  <Text style={styles.quietTimeLabel}>{t.settings.quietFrom}</Text>
                  <Text style={styles.quietTimeValue}>{minToHHMM(notifPrefs.quiet_start_min)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quietTimeBox}
                  onPress={() => setShowQuietEndPicker(true)}
                  disabled={!pushEnabled}
                >
                  <Text style={styles.quietTimeLabel}>{t.settings.quietUntil}</Text>
                  <Text style={styles.quietTimeValue}>{minToHHMM(notifPrefs.quiet_end_min)}</Text>
                </TouchableOpacity>
              </View>
            )}
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

      <TimePicker
        visible={showQuietStartPicker}
        onClose={() => setShowQuietStartPicker(false)}
        onSelect={(time) => handleQuietTimeSelect('quiet_start_min', time)}
        initialTime={minToHHMM(notifPrefs.quiet_start_min)}
        title={t.settings.quietFrom}
        doneLabel={t.common.done}
        hourLabel={t.schedules.editor.hour}
        minuteLabel={t.schedules.editor.minute}
      />
      <TimePicker
        visible={showQuietEndPicker}
        onClose={() => setShowQuietEndPicker(false)}
        onSelect={(time) => handleQuietTimeSelect('quiet_end_min', time)}
        initialTime={minToHHMM(notifPrefs.quiet_end_min)}
        title={t.settings.quietUntil}
        doneLabel={t.common.done}
        hourLabel={t.schedules.editor.hour}
        minuteLabel={t.schedules.editor.minute}
      />
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
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  permissionBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  permissionBannerAction: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  quietTimesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quietTimeBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quietTimeLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  quietTimeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
});
