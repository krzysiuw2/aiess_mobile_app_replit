import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getManifest, getSection } from '@/lib/aws-schedules';
import type { SharedIdentityPayload, SharedSiteLimitsPayload } from '@/types';

/**
 * Read-only device info panel sourced from the DDB config plane
 * (manifest + shared.identity + shared.site_limits). Renders nothing
 * unless the `use_ddb_config_plane` flag is on.
 */
export default function DeviceConfigPanel() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const useDdb = useFeatureFlag('use_ddb_config_plane');
  const siteId = selectedDevice?.device_id;

  const query = useQuery({
    queryKey: ['deviceConfigPanel', siteId],
    queryFn: async () => {
      if (!siteId) return null;
      const [manifest, identity, limits] = await Promise.all([
        getManifest(siteId),
        getSection<SharedIdentityPayload>(siteId, 'shared.identity'),
        getSection<SharedSiteLimitsPayload>(siteId, 'shared.site_limits'),
      ]);
      return { manifest, identity: identity.payload, limits: limits.payload };
    },
    enabled: useDdb && !!siteId,
    staleTime: 5 * 60_000,
  });

  if (!useDdb || !siteId) return null;

  const rows: { label: string; value: string | undefined }[] = query.data
    ? [
        { label: t.settings.deviceFwVersion, value: query.data.identity.fw_version },
        { label: t.settings.deviceEmsVendor, value: query.data.identity.ems_vendor },
        { label: t.settings.deviceSerial, value: query.data.identity.serial_id },
        {
          label: t.settings.deviceSystemMode,
          value: query.data.identity.system_mode?.replace('_', '-'),
        },
        {
          label: t.settings.deviceGridBand,
          value:
            query.data.limits.import_kw_max !== undefined || query.data.limits.export_kw_max !== undefined
              ? `${query.data.limits.export_kw_max ?? '—'} / ${query.data.limits.import_kw_max ?? '—'} kW`
              : undefined,
        },
        {
          label: t.settings.deviceConfigSections,
          value: String(query.data.manifest.sections?.length ?? 0),
        },
      ]
    : [];

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Cpu size={20} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{t.settings.deviceInfoTitle}</Text>
      </View>
      <Text style={styles.sectionDescription}>{t.settings.deviceInfoDesc}</Text>

      {query.isLoading && <ActivityIndicator size="small" color={Colors.primary} />}
      {query.isError && <Text style={styles.errorText}>{t.common.failedToLoad}</Text>}

      {query.data && (
        <View style={styles.card}>
          {rows.filter(r => r.value !== undefined).map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
  },
});
