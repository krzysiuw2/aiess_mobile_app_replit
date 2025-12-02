import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CheckCircle, XCircle, Search, ArrowLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDevices } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Device } from '@/types';

interface DeviceCardProps {
  device: Device;
  isSelected: boolean;
  onPress: () => void;
}

function DeviceCard({ device, isSelected, onPress }: DeviceCardProps) {
  const { t } = useSettings();
  const isActive = device.status === 'active';

  return (
    <TouchableOpacity
      style={[styles.deviceCard, isSelected && styles.deviceCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.deviceName}>{t.devices.device}: {device.name}</Text>
          <Text style={styles.deviceSite}>{t.devices.site}: {device.device_id}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{t.devices.status}</Text>
          {isActive ? (
            <CheckCircle size={20} color={Colors.success} />
          ) : (
            <XCircle size={20} color={Colors.error} />
          )}
        </View>
      </View>

      <Text style={styles.specLabel}>{t.devices.spec}</Text>
      <View style={styles.specRow}>
        <View style={styles.specItem}>
          <Text style={styles.specValue}>{device.battery_capacity_kwh} kWh</Text>
          <Text style={styles.specTitle}>{t.devices.batteryCapacity}</Text>
        </View>
        <View style={styles.specDivider} />
        <View style={styles.specItem}>
          <Text style={styles.specValue}>{device.pcs_power_kw} kW</Text>
          <Text style={styles.specTitle}>{t.devices.batteryPower}</Text>
        </View>
        <View style={styles.specDivider} />
        <View style={styles.specItem}>
          <Text style={styles.specValue}>{device.pv_power_kw} kW</Text>
          <Text style={styles.specTitle}>{t.devices.pvPower}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DevicesScreen() {
  const { t } = useSettings();
  const { devices, isLoading, selectedDeviceId, selectDevice, isError, error, refreshDevices } = useDevices();

  const handleDevicePress = async (device: Device) => {
    console.log('[Devices] Selected device:', device.id);
    await selectDevice(device.id);
    router.push('/(tabs)/monitor');
  };

  const handleAddDevice = () => {
    Alert.alert(t.common.comingSoon, 'Add new device feature will be available soon');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <XCircle size={64} color={Colors.error} />
          <Text style={styles.emptyTitle}>{t.common.error}</Text>
          <Text style={styles.emptySubtitle}>
            {error?.message || 'Failed to load devices'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshDevices}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (devices.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIcon} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t.devices.title}</Text>
            <Text style={styles.headerSubtitle}>{t.devices.subtitle}</Text>
          </View>
          <View style={styles.headerIcon} />
        </View>
        <View style={styles.emptyContainer}>
          <Search size={64} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No Devices Found</Text>
          <Text style={styles.emptySubtitle}>
            You don't have access to any devices yet.{'\n'}
            Contact your administrator to get access.
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addButton} onPress={handleAddDevice}>
            <Text style={styles.addButtonText}>{t.devices.addNew}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.devices.title}</Text>
          <Text style={styles.headerSubtitle}>{t.devices.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Search size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isSelected={device.id === selectedDeviceId}
            onPress={() => handleDevicePress(device)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddDevice}>
          <Text style={styles.addButtonText}>{t.devices.addNew}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  deviceCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  deviceCardSelected: {
    borderColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.textOnDark,
  },
  deviceSite: {
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
  specLabel: {
    fontSize: 14,
    color: Colors.textOnDarkSecondary,
    marginBottom: 8,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  specItem: {
    flex: 1,
  },
  specValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textOnDark,
  },
  specTitle: {
    fontSize: 12,
    color: Colors.textOnDarkSecondary,
    marginTop: 2,
  },
  specDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 12,
  },
  footer: {
    padding: 16,
    paddingBottom: 8,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
