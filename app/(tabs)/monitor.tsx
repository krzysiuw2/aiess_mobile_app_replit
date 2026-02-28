import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, WifiOff, RefreshCw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDevices, useLiveData } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';
import EnergyFlowWithFallback from '@/components/EnergyFlowWithFallback';

export default function MonitorScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { data: liveData, isLoading, isError, error, refetch } = useLiveData(selectedDevice?.device_id ?? null);

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <AlertCircle size={48} color={Colors.textSecondary} />
          <Text style={styles.noDeviceText}>{t.monitor.selectDeviceFirst}</Text>
          <Text style={styles.noDeviceHint}>{t.monitor.goToDevicesTab}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.monitor.title}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Device Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusDeviceName}>{selectedDevice.name}</Text>
            <Text style={styles.statusSiteId}>{selectedDevice.device_id}</Text>
          </View>
          <View style={[styles.statusBadge, isError && styles.statusBadgeError]}>
            {isError ? (
              <>
                <WifiOff size={14} color={Colors.error} />
                <Text style={styles.statusTextError}>{t.monitor.offline}</Text>
              </>
            ) : (
              <>
                <CheckCircle size={14} color={Colors.success} />
                <Text style={styles.statusText}>{t.monitor.online}</Text>
              </>
            )}
          </View>
        </View>

        {/* Main Content */}
        {isLoading && !liveData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t.monitor.loadingLiveData}</Text>
          </View>
        ) : isError && !liveData ? (
          <View style={styles.errorContainer}>
            <WifiOff size={48} color={Colors.error} />
            <Text style={styles.errorTitle}>{t.monitor.connectionError}</Text>
            <Text style={styles.errorText}>
              {error?.message || t.monitor.unableToFetchLiveData}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <RefreshCw size={16} color="#fff" />
              <Text style={styles.retryText}>{t.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <EnergyFlowWithFallback liveData={liveData} t={t} />
        )}
      </View>
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 8,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
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
  statusBar: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusDeviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textOnDark,
  },
  statusSiteId: {
    fontSize: 13,
    color: Colors.textOnDarkSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 5,
  },
  statusBadgeError: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.success,
  },
  statusTextError: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
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
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
