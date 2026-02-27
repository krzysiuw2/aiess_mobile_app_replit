import { useState, useEffect, useCallback } from 'react';
import { useDevices } from '@/contexts/DeviceContext';
import {
  getSchedules,
  saveSchedules,
  flattenRules,
} from '@/lib/aws-schedules';
import type {
  OptimizedScheduleRule,
  ScheduleRuleWithPriority,
  SchedulesResponse,
  Priority,
  SystemMode,
} from '@/types';

interface UseSchedulesReturn {
  rules: ScheduleRuleWithPriority[];
  rawSchedules: SchedulesResponse | null;
  mode: SystemMode;
  safety: { soc_min: number; soc_max: number };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createRule: (rule: OptimizedScheduleRule, priority: Priority) => Promise<void>;
  updateRule: (rule: OptimizedScheduleRule, priority: Priority, oldPriority?: Priority) => Promise<void>;
  deleteRule: (ruleId: string, priority: Priority) => Promise<void>;
  toggleRule: (ruleId: string, priority: Priority) => Promise<void>;
  setSafety: (socMin: number, socMax: number) => Promise<void>;
  setMode: (mode: SystemMode) => Promise<void>;
  setSiteLimit: (hth: number, lth: number) => Promise<void>;
}

export function useSchedules(): UseSchedulesReturn {
  const { selectedDevice } = useDevices();
  const [rawSchedules, setRawSchedules] = useState<SchedulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!selectedDevice) {
      setRawSchedules(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await getSchedules(selectedDevice.device_id);
      setRawSchedules(response);
    } catch (err) {
      console.error('[useSchedules] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setRawSchedules(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDevice]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const rules = rawSchedules ? flattenRules(rawSchedules.sch) : [];
  const mode: SystemMode = rawSchedules?.mode || 'automatic';
  const safety = {
    soc_min: rawSchedules?.safety?.soc_min ?? 5,
    soc_max: rawSchedules?.safety?.soc_max ?? 100,
  };

  const siteId = selectedDevice?.device_id;

  const createRule = useCallback(async (rule: OptimizedScheduleRule, priority: Priority) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');

    const key = `p_${priority}` as keyof typeof rawSchedules.sch;
    const existing = rawSchedules.sch[key] || [];
    const merged = [...existing, rule];

    await saveSchedules(siteId, { [key]: merged });
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  const updateRule = useCallback(async (
    rule: OptimizedScheduleRule,
    priority: Priority,
    oldPriority?: Priority
  ) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');

    const updates: Record<string, OptimizedScheduleRule[]> = {};

    if (oldPriority !== undefined && oldPriority !== priority) {
      const oldKey = `p_${oldPriority}` as keyof typeof rawSchedules.sch;
      updates[oldKey] = (rawSchedules.sch[oldKey] || []).filter(r => r.id !== rule.id);
    }

    const newKey = `p_${priority}` as keyof typeof rawSchedules.sch;
    const newRules = (rawSchedules.sch[newKey] || []).filter(r => r.id !== rule.id);
    newRules.push(rule);
    updates[newKey] = newRules;

    await saveSchedules(siteId, updates);
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  const deleteRule = useCallback(async (ruleId: string, priority: Priority) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');

    const key = `p_${priority}` as keyof typeof rawSchedules.sch;
    const filtered = (rawSchedules.sch[key] || []).filter(r => r.id !== ruleId);

    await saveSchedules(siteId, { [key]: filtered });
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  const toggleRule = useCallback(async (ruleId: string, priority: Priority) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');

    const key = `p_${priority}` as keyof typeof rawSchedules.sch;
    const existing = rawSchedules.sch[key] || [];
    const updated = existing.map(rule => {
      if (rule.id !== ruleId) return rule;
      const isActive = rule.act !== false;
      if (isActive) return { ...rule, act: false as const };
      const { act, ...rest } = rule;
      return rest;
    });

    await saveSchedules(siteId, { [key]: updated });
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  const setSafety = useCallback(async (socMin: number, socMax: number) => {
    if (!siteId) throw new Error('No site selected');
    if (socMin >= socMax) throw new Error('soc_min must be less than soc_max');

    await saveSchedules(siteId, {}, { safety: { soc_min: socMin, soc_max: socMax } });
    await fetchSchedules();
  }, [siteId, fetchSchedules]);

  const setMode = useCallback(async (newMode: SystemMode) => {
    if (!siteId) throw new Error('No site selected');

    await saveSchedules(siteId, {}, { mode: newMode });
    await fetchSchedules();
  }, [siteId, fetchSchedules]);

  const setSiteLimit = useCallback(async (hth: number, lth: number) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');

    const existingP9 = rawSchedules.sch.p_9 || [];
    const siteLimitRule: OptimizedScheduleRule = {
      id: existingP9.find(r => r.a.t === 'sl')?.id || 'SITE-LIMIT',
      a: { t: 'sl', hth, lth },
      c: {},
    };

    const otherP9 = existingP9.filter(r => r.a.t !== 'sl');
    await saveSchedules(siteId, { p_9: [...otherP9, siteLimitRule] });
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  return {
    rules,
    rawSchedules,
    mode,
    safety,
    isLoading,
    error,
    refetch: fetchSchedules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    setSafety,
    setMode,
    setSiteLimit,
  };
}
