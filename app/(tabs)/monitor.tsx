import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Battery,
  BatteryCharging,
  Zap,
  CheckCircle,
  Gauge,
  Factory,
  Sun,
  Grid3X3,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDevices, useLiveData } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';

export default function MonitorScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  // Pass the site_id (device_id) to InfluxDB, not the UUID
  const { data: liveData, isLoading, isError, error } = useLiveData(selectedDevice?.device_id ?? null);

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.noDeviceText}>Please select a device first</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.monitor.title}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusBar}>
          <View>
            <Text style={styles.statusDeviceName}>
              {t.devices.device}: {selectedDevice.name}
            </Text>
            <Text style={styles.statusSiteId}>
              {t.devices.site}: {selectedDevice.device_id}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{t.devices.status}</Text>
            <CheckCircle size={20} color={Colors.success} />
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <View style={styles.flowDiagram}>
            <View style={styles.batterySection}>
              <View style={styles.batteryIcon}>
                <Battery size={48} color={Colors.text} />
              </View>

              <View style={styles.batteryInfoRow}>
                <View style={styles.infoCard}>
                  <BatteryCharging size={20} color={Colors.text} />
                  <View>
                    <Text style={styles.infoLabel}>{t.monitor.soc}</Text>
                    <Text style={styles.infoValue}>{liveData?.batterySoc ?? 0}%</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <Gauge size={20} color={Colors.text} />
                  <View>
                    <Text style={styles.infoLabel}>{t.monitor.status}</Text>
                    <Text style={styles.infoValue}>{liveData?.batteryStatus ?? 'Unknown'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.powerCard}>
                <Zap size={20} color={Colors.text} />
                <View>
                  <Text style={styles.infoLabel}>{t.monitor.power}</Text>
                  <Text style={styles.infoValue}>
                    {Math.abs(liveData?.batteryPower ?? 0)} kW
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.flowLines}>
              <View style={styles.verticalLine} />
              <View style={styles.inverterIcon}>
                <View style={styles.inverterBox} />
              </View>
              <View style={styles.horizontalLines}>
                <View style={styles.leftLine} />
                <View style={styles.centerLine} />
                <View style={styles.rightLine} />
              </View>
            </View>

            <View style={styles.bottomSection}>
              <View style={styles.bottomCard}>
                <View style={styles.bottomCardIcon}>
                  <Grid3X3 size={28} color={Colors.text} />
                </View>
                <Text style={styles.bottomCardLabel}>{t.monitor.grid}</Text>
                <Text style={styles.bottomCardValue}>
                  {liveData?.gridPower ?? 0} kW
                </Text>
              </View>

              <View style={styles.bottomCard}>
                <View style={styles.bottomCardIcon}>
                  <Factory size={28} color={Colors.text} />
                </View>
                <Text style={styles.bottomCardLabel}>{t.monitor.factory}</Text>
                <Text style={styles.bottomCardValue}>
                  {liveData?.factoryLoad ?? 0} kW
                </Text>
              </View>

              <View style={styles.bottomCard}>
                <View style={styles.bottomCardIcon}>
                  <Sun size={28} color={Colors.text} />
                </View>
                <Text style={styles.bottomCardLabel}>{t.monitor.pv}</Text>
                <Text style={styles.bottomCardValue}>
                  {liveData?.pvPower ?? 0} kW
                </Text>
              </View>
            </View>
          </View>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDeviceText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statusBar: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusDeviceName: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.textOnDark,
  },
  statusSiteId: {
    fontSize: 14,
    color: Colors.textOnDarkSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    color: Colors.textOnDark,
  },
  loadingContainer: {
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowDiagram: {
    alignItems: 'center',
  },
  batterySection: {
    alignItems: 'center',
    width: '100%',
  },
  batteryIcon: {
    marginBottom: 16,
  },
  batteryInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  powerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  flowLines: {
    alignItems: 'center',
    marginVertical: 16,
  },
  verticalLine: {
    width: 2,
    height: 40,
    backgroundColor: Colors.textSecondary,
  },
  inverterIcon: {
    marginVertical: 8,
  },
  inverterBox: {
    width: 60,
    height: 40,
    backgroundColor: Colors.card,
    borderRadius: 8,
  },
  horizontalLines: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    justifyContent: 'center',
    marginTop: 8,
  },
  leftLine: {
    width: 80,
    height: 2,
    backgroundColor: Colors.textSecondary,
    marginTop: 20,
  },
  centerLine: {
    width: 2,
    height: 40,
    backgroundColor: Colors.textSecondary,
  },
  rightLine: {
    width: 80,
    height: 2,
    backgroundColor: Colors.textSecondary,
    marginTop: 20,
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  bottomCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  bottomCardIcon: {
    marginBottom: 8,
  },
  bottomCardLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  bottomCardValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
});
