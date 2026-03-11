import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchLiveData } from '@/lib/influxdb';
import { useAuth } from '@/contexts/AuthContext';
import { Device, LiveData } from '@/types';

const SELECTED_DEVICE_KEY = '@aiess_selected_device';

export const [DeviceProvider, useDevices] = createContextHook(() => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Fetch devices from Supabase
  const devicesQuery = useQuery({
    queryKey: ['devices', user?.id],
    queryFn: async ({ signal }) => {
      if (!user?.id) {
        console.log('[Devices] No user, returning empty array');
        return [];
      }

      console.log('[Devices] Fetching devices for user:', user.id);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      let data: any;
      let error: any;
      try {
        const result = await supabase
          .from('devices')
          .select(`
            id,
            device_id,
            name,
            status,
            device_type,
            location,
            battery_capacity_kwh,
            pcs_power_kw,
            pv_power_kw,
            device_users!inner (
              user_id,
              role
            )
          `)
          .eq('device_users.user_id', user.id)
          .order('name')
          .abortSignal(controller.signal);
        data = result.data;
        error = result.error;
      } finally {
        clearTimeout(timeout);
      }

      if (error) {
        console.error('[Devices] Error fetching devices:', error);
        throw error;
      }

      console.log('[Devices] Fetched', data?.length || 0, 'devices');
      
      const devices: Device[] = (data || []).map((d: any) => ({
        id: d.id,
        device_id: d.device_id,
        name: d.name,
        status: d.status,
        device_type: d.device_type,
        location: d.location,
        battery_capacity_kwh: d.battery_capacity_kwh ? Number(d.battery_capacity_kwh) : null,
        pcs_power_kw: d.pcs_power_kw ? Number(d.pcs_power_kw) : null,
        pv_power_kw: d.pv_power_kw ? Number(d.pv_power_kw) : null,
      }));

      return devices;
    },
    enabled: isAuthenticated && !!user?.id,
    staleTime: 1000 * 60 * 5,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
    refetchOnReconnect: true,
  });

  // Load previously selected device from storage
  const selectedDeviceQuery = useQuery({
    queryKey: ['selectedDevice'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(SELECTED_DEVICE_KEY);
      console.log('[Devices] Loaded selected device from storage:', stored);
      return stored;
    },
  });

  // Set selected device on initial load only
  useEffect(() => {
    if (selectedDeviceId) return;
    const devices = devicesQuery.data;
    const storedDeviceId = selectedDeviceQuery.data;

    if (storedDeviceId && devices?.some(d => d.id === storedDeviceId)) {
      setSelectedDeviceId(storedDeviceId);
    } else if (devices && devices.length > 0) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [selectedDeviceQuery.data, devicesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear devices when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedDeviceId(null);
      queryClient.removeQueries({ queryKey: ['devices'] });
    }
  }, [isAuthenticated, queryClient]);

  const selectDevice = useCallback(async (deviceId: string) => {
    console.log('[Devices] Selecting device:', deviceId);
    setSelectedDeviceId(deviceId);
    await AsyncStorage.setItem(SELECTED_DEVICE_KEY, deviceId);
  }, []);

  const refreshDevices = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['devices', user?.id] });
  }, [queryClient, user?.id]);

  const selectedDevice = devicesQuery.data?.find(d => d.id === selectedDeviceId) || null;

  return {
    devices: devicesQuery.data || [],
    isLoading: devicesQuery.isLoading,
    isError: devicesQuery.isError,
    error: devicesQuery.error,
    selectedDevice,
    selectedDeviceId,
    selectDevice,
    refreshDevices,
  };
});

// Hook for live data from InfluxDB
export const useLiveData = (siteId: string | null) => {
  return useQuery({
    queryKey: ['liveData', siteId],
    queryFn: async (): Promise<LiveData> => {
      if (!siteId) {
        throw new Error('No site ID provided');
      }
      
      console.log('[LiveData] Fetching live data for site:', siteId);
      
      try {
        const liveData = await fetchLiveData(siteId);
        if (!liveData) {
          throw new Error('No data returned from InfluxDB');
        }
        return liveData;
      } catch (error) {
        // Log transient network errors as warnings instead of errors
        // React Query will handle retries automatically
        if (error instanceof Error && error.message.includes('503')) {
          console.warn('[LiveData] Transient network error (will retry):', error.message);
        } else {
          console.error('[LiveData] Error fetching data:', error);
        }
        throw error;
      }
    },
    enabled: !!siteId,
    refetchInterval: 5000, // 5 seconds auto-refresh
    retry: 2,
    retryDelay: 1000,
  });
};
