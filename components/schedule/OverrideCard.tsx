/**
 * OverrideCard — manual-control entry point on the Sterowanie (Control) tab.
 *
 * Self-contained: pulls live data + override state via hooks so the schedule
 * screen doesn't need to know about telemetry. The Monitor tab keeps only the
 * read-only banner (with release, as an immediate safety action); issuing an
 * override happens here. Issue controls are owner/admin only (UI gating,
 * ADR 0009 — the Lambda checks the API key, not the user).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Hand, Bot } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices, useLiveData } from '@/contexts/DeviceContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { useOverride } from '@/hooks/useOverride';
import OverrideBanner from '@/components/monitor/OverrideBanner';
import OverrideSheet from '@/components/monitor/OverrideSheet';

export default function OverrideCard() {
  const { t } = useSettings();
  const { selectedDevice, canIssueOverride } = useDevices();
  const { siteConfig } = useSiteConfig();
  const isFocused = useIsFocused();
  const { data: liveData } = useLiveData(selectedDevice?.device_id ?? null, isFocused);
  const override = useOverride(selectedDevice?.device_id ?? null, liveData);
  const [sheetVisible, setSheetVisible] = useState(false);

  if (!selectedDevice) return null;

  const handleRelease = () => {
    Alert.alert(
      t.override.releaseConfirmTitle,
      t.override.releaseConfirmBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.override.returnToAuto,
          style: 'destructive',
          onPress: async () => {
            try {
              await override.release();
            } catch {
              Alert.alert(t.common.error, t.override.failed);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      {override.active ? (
        <OverrideBanner
          active={override.active}
          liveData={liveData}
          canRelease={canIssueOverride}
          isSubmitting={override.isSubmitting}
          onRelease={handleRelease}
          t={t}
        />
      ) : (
        // Deliberately low-key: manual override is a debugging/trial tool,
        // not a primary action — a quiet utility row, no filled button.
        <View style={styles.row}>
          <Bot size={14} color={Colors.textSecondary} />
          <Text style={styles.stateText} numberOfLines={1}>{t.override.cardAutoState}</Text>
          {canIssueOverride && (
            <TouchableOpacity
              style={styles.takeLink}
              onPress={() => setSheetVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Hand size={12} color={Colors.textSecondary} />
              <Text style={styles.takeLinkText}>{t.override.cardTitle}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <OverrideSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        isSubmitting={override.isSubmitting}
        onIssue={override.issue}
        maxChargeKw={siteConfig?.power_limits?.max_charge_kw}
        maxDischargeKw={siteConfig?.power_limits?.max_discharge_kw}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  stateText: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  takeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  takeLinkText: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
});
