import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  Easing,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CheckCircle, XCircle, Search, ArrowLeft, Camera, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Colors from '@/constants/colors';
import { useDevices } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Device } from '@/types';

interface DeviceCardProps {
  device: Device;
  isSelected: boolean;
  onPress: () => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function DeviceCard({ device, isSelected, onPress }: DeviceCardProps) {
  const { t } = useSettings();
  const isActive = device.status === 'active';
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSelected) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isSelected, pulseAnim]);

  const animatedBorderColor = isSelected
    ? pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0, 140, 255, 0.25)', 'rgba(0, 140, 255, 0.9)'],
      })
    : '#d1d5db';

  const animatedBgColor = isSelected
    ? pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0, 140, 255, 0.02)', 'rgba(0, 140, 255, 0.06)'],
      })
    : '#ffffff';

  return (
    <AnimatedTouchable
      style={[
        styles.deviceCard,
        { borderColor: animatedBorderColor, backgroundColor: animatedBgColor },
        isSelected && styles.deviceCardSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.deviceName}>{t.devices.device}: {device.name}</Text>
          <Text style={styles.deviceSite}>{t.devices.site}: {device.device_id}</Text>
        </View>
        <View style={[
          styles.statusBadge,
          isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
        ]}>
          {isActive ? (
            <CheckCircle size={16} color={Colors.success} />
          ) : (
            <XCircle size={16} color={Colors.error} />
          )}
          <Text style={styles.statusText}>{t.devices.status}</Text>
        </View>
      </View>

      <Text style={styles.specLabel}>{t.devices.spec}</Text>
      <View style={styles.specRow}>
        <View style={styles.specItem}>
          <Text style={styles.specValue}>
            {device.battery_capacity_kwh}
            <Text style={styles.specUnit}> kWh</Text>
          </Text>
          <Text style={styles.specTitle}>{t.devices.batteryCapacity}</Text>
        </View>
        <View style={styles.specDivider} />
        <View style={styles.specItem}>
          <Text style={styles.specValue}>
            {device.pcs_power_kw}
            <Text style={styles.specUnit}> kW</Text>
          </Text>
          <Text style={styles.specTitle}>{t.devices.batteryPower}</Text>
        </View>
        <View style={styles.specDivider} />
        <View style={styles.specItem}>
          <Text style={styles.specValue}>
            {device.pv_power_kw}
            <Text style={styles.specUnit}> kW</Text>
          </Text>
          <Text style={styles.specTitle}>{t.devices.pvPower}</Text>
        </View>
      </View>
    </AnimatedTouchable>
  );
}

function QRScannerModal({ visible, onClose, onScanned, t }: {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
  t: any;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
    if (visible) {
      setScanned(false);
    }
  }, [visible]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScanned(data);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={scannerStyles.container}>
        <View style={scannerStyles.header}>
          <TouchableOpacity style={scannerStyles.closeButton} onPress={onClose}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={scannerStyles.title}>{t.devices.scanQrTitle}</Text>
          <View style={scannerStyles.closeButton} />
        </View>

        <View style={scannerStyles.cameraContainer}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
          ) : (
            <View style={scannerStyles.permissionContainer}>
              <Camera size={48} color={Colors.textLight} />
              <Text style={scannerStyles.permissionText}>
                {t.devices.cameraPermissionNeeded}
              </Text>
              <TouchableOpacity style={scannerStyles.permissionButton} onPress={requestPermission}>
                <Text style={scannerStyles.permissionButtonText}>{t.devices.grantPermission}</Text>
              </TouchableOpacity>
            </View>
          )}

          {permission?.granted && (
            <View style={scannerStyles.overlay}>
              <View style={scannerStyles.scanFrame}>
                <View style={[scannerStyles.corner, scannerStyles.cornerTL]} />
                <View style={[scannerStyles.corner, scannerStyles.cornerTR]} />
                <View style={[scannerStyles.corner, scannerStyles.cornerBL]} />
                <View style={[scannerStyles.corner, scannerStyles.cornerBR]} />
              </View>
            </View>
          )}
        </View>

        <View style={scannerStyles.footer}>
          <Camera size={20} color={Colors.textSecondary} />
          <Text style={scannerStyles.instruction}>{t.devices.scanQrInstruction}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function DevicesScreen() {
  const { t } = useSettings();
  const { devices, isLoading, selectedDeviceId, selectDevice, isError, error, refreshDevices } = useDevices();
  const [scannerVisible, setScannerVisible] = useState(false);

  const handleDevicePress = async (device: Device) => {
    console.log('[Devices] Selected device:', device.id);
    await selectDevice(device.id);
    router.push('/(tabs)/monitor');
  };

  const handleAddDevice = () => {
    setScannerVisible(true);
  };

  const handleQRScanned = (data: string) => {
    setScannerVisible(false);
    Alert.alert(
      t.devices.qrScanned,
      `${t.devices.qrScannedMessage}: ${data}`,
      [{ text: t.common.ok }]
    );
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
            {error?.message || t.devices.failedToLoadDevices}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshDevices}>
            <Text style={styles.retryButtonText}>{t.common.tryAgain}</Text>
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
          <Text style={styles.emptyTitle}>{t.devices.noDevicesFound}</Text>
          <Text style={styles.emptySubtitle}>{t.devices.noAccessHint}</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addButton} onPress={handleAddDevice}>
            <Camera size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.addButtonText}>{t.devices.addNew}</Text>
          </TouchableOpacity>
        </View>
        <QRScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScanned={handleQRScanned}
          t={t}
        />
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
          <Camera size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>{t.devices.addNew}</Text>
        </TouchableOpacity>
      </View>

      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleQRScanned}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
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
    gap: 14,
  },
  deviceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  deviceCardSelected: {
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deviceSite: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  statusBadgeInactive: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  specLabel: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 10,
    fontWeight: '500' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  specItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  specValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  specUnit: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.textSecondary,
  },
  specTitle: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 3,
  },
  specDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
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
    flexDirection: 'row',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});

const scannerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: Colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 10,
  },
  instruction: {
    fontSize: 15,
    color: '#b0b0c0',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  permissionText: {
    fontSize: 15,
    color: '#b0b0c0',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
