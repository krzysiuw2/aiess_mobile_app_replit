import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { LiveData } from '@/types';
import { mockDevices, mockLiveData } from '@/mocks/devices';

const SELECTED_DEVICE_KEY = '@aiess_selected_device';

export const [DeviceProvider, useDevices] = createContextHook(() => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      console.log('[Devices] Loading devices');
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockDevices;
    },
  });

  const selectedDeviceQuery = useQuery({
    queryKey: ['selectedDevice'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(SELECTED_DEVICE_KEY);
      console.log('[Devices] Loaded selected device:', stored);
      return stored;
    },
  });

  useEffect(() => {
    if (selectedDeviceQuery.data) {
      setSelectedDeviceId(selectedDeviceQuery.data);
    } else if (devicesQuery.data && devicesQuery.data.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devicesQuery.data[0].id);
    }
  }, [selectedDeviceQuery.data, devicesQuery.data, selectedDeviceId]);

  const selectDevice = useCallback(async (deviceId: string) => {
    console.log('[Devices] Selecting device:', deviceId);
    setSelectedDeviceId(deviceId);
    await AsyncStorage.setItem(SELECTED_DEVICE_KEY, deviceId);
  }, []);

  const selectedDevice = devicesQuery.data?.find(d => d.id === selectedDeviceId) || null;

  return {
    devices: devicesQuery.data || [],
    isLoading: devicesQuery.isLoading,
    selectedDevice,
    selectedDeviceId,
    selectDevice,
  };
});

export const useLiveData = (deviceId: string | null) => {
  return useQuery({
    queryKey: ['liveData', deviceId],
    queryFn: async () => {
      console.log('[LiveData] Fetching live data for device:', deviceId);
      await new Promise(resolve => setTimeout(resolve, 300));
      return {
        ...mockLiveData,
        lastUpdate: new Date(),
      } as LiveData;
    },
    enabled: !!deviceId,
    refetchInterval: 5000,
  });
};
