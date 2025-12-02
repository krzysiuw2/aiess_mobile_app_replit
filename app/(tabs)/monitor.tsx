import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, WifiOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDevices, useLiveData } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';
import EnergyFlowDiagram from '@/components/EnergyFlowDiagram';

export default function MonitorScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  // Pass the site_id (device_id) to InfluxDB, not the UUID
  const { data: liveData, isLoading, isError, error, refetch, isRefetching } = useLiveData(selectedDevice?.device_id ?? null);

  const handleRefresh = () => {
    refetch();
  };

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <AlertCircle size={48} color={Colors.textSecondary} />
          <Text style={styles.noDeviceText}>Please select a device first</Text>
          <Text style={styles.noDeviceHint}>Go to Devices tab to select one</Text>
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
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Device Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusDeviceName}>{selectedDevice.name}</Text>
            <Text style={styles.statusSiteId}>{selectedDevice.device_id}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            isError && styles.statusBadgeError
          ]}>
            {isError ? (
              <>
                <WifiOff size={16} color={Colors.error} />
                <Text style={styles.statusTextError}>Offline</Text>
              </>
            ) : (
              <>
                <CheckCircle size={16} color={Colors.success} />
                <Text style={styles.statusText}>Online</Text>
              </>
            )}
          </View>
        </View>

        {/* Last Update Indicator */}
        {liveData?.lastUpdate && (
          <View style={styles.lastUpdateContainer}>
            <Text style={styles.lastUpdateText}>
              Last update: {liveData.lastUpdate.toLocaleTimeString()}
            </Text>
            <View style={styles.autoRefreshBadge}>
              <View style={styles.autoRefreshDot} />
              <Text style={styles.autoRefreshText}>Auto-refresh 5s</Text>
            </View>
          </View>
        )}

        {/* Main Content */}
        {isLoading && !liveData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading live data...</Text>
          </View>
        ) : isError && !liveData ? (
          <View style={styles.errorContainer}>
            <WifiOff size={48} color={Colors.error} />
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorText}>
              {error?.message || 'Unable to fetch live data'}
            </Text>
            <Text style={styles.errorHint}>Pull down to retry</Text>
          </View>
        ) : (
          <EnergyFlowDiagram liveData={liveData} t={t} />
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
    fontWeight: '600',
    color: Colors.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  noDeviceText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  noDeviceHint: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  statusBar: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusDeviceName: {
    fontSize: 18,
    fontWeight: '600',
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
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusBadgeError: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.success,
  },
  statusTextError: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.error,
  },
  lastUpdateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  lastUpdateText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  autoRefreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoRefreshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  autoRefreshText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  loadingContainer: {
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.error,
  },
  errorText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 8,
  },
});
