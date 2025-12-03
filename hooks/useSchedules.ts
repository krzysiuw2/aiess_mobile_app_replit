/**
 * useSchedules Hook
 * 
 * Manages schedule rules data fetching and mutations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Rule } from '@/types';
import { useDevices } from '@/contexts/DeviceContext';
import {
  getSchedules,
  flattenRules,
  saveRule,
  deleteRule,
  SchedulesResponse,
} from '@/lib/aws-schedules';

interface UseSchedulesReturn {
  rules: Rule[];
  rawSchedules: SchedulesResponse['schedules'] | null;
  shadowVersion: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addRule: (rule: Rule) => Promise<void>;
  updateRule: (rule: Rule, oldPriority?: number) => Promise<void>;
  removeRule: (ruleId: string, priority: number) => Promise<void>;
}

export function useSchedules(): UseSchedulesReturn {
  const { selectedDevice } = useDevices();
  const [rules, setRules] = useState<Rule[]>([]);
  const [rawSchedules, setRawSchedules] = useState<SchedulesResponse['schedules'] | null>(null);
  const [shadowVersion, setShadowVersion] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!selectedDevice) {
      setRules([]);
      setRawSchedules(null);
      setShadowVersion(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await getSchedules(selectedDevice.device_id);
      setRawSchedules(response.schedules);
      setShadowVersion(response.shadow_version);
      setRules(flattenRules(response.schedules));
      
      console.log('[useSchedules] Loaded', flattenRules(response.schedules).length, 'rules');
    } catch (err) {
      console.error('[useSchedules] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setRules([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDevice]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const addRule = useCallback(async (rule: Rule) => {
    if (!selectedDevice || !rawSchedules) {
      throw new Error('No device selected');
    }

    await saveRule(selectedDevice.device_id, rule, rawSchedules);
    await fetchSchedules(); // Refetch to get updated shadow version
  }, [selectedDevice, rawSchedules, fetchSchedules]);

  const updateRule = useCallback(async (rule: Rule, oldPriority?: number) => {
    if (!selectedDevice || !rawSchedules) {
      throw new Error('No device selected');
    }

    // Pass old priority if provided (for priority changes)
    await saveRule(selectedDevice.device_id, rule, rawSchedules, oldPriority);
    await fetchSchedules();
  }, [selectedDevice, rawSchedules, fetchSchedules]);

  const removeRule = useCallback(async (ruleId: string, priority: number) => {
    if (!selectedDevice || !rawSchedules) {
      throw new Error('No device selected');
    }

    await deleteRule(selectedDevice.device_id, ruleId, priority, rawSchedules);
    await fetchSchedules();
  }, [selectedDevice, rawSchedules, fetchSchedules]);

  return {
    rules,
    rawSchedules,
    shadowVersion,
    isLoading,
    error,
    refetch: fetchSchedules,
    addRule,
    updateRule,
    removeRule,
  };
}


