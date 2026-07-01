import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { useDevices } from '@/contexts/DeviceContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import {
  getSchedules,
  saveSchedules,
  flattenRules,
  getSection,
  putSection,
  ConfigConflictError,
} from '@/lib/aws-schedules';
import type {
  OptimizedScheduleRule,
  ScheduleRuleWithPriority,
  SchedulesResponse,
  Priority,
  SharedSchedulesPayload,
  SharedSiteLimitsPayload,
  SchedulePriorityKey,
} from '@/types';

interface UseSchedulesReturn {
  rules: ScheduleRuleWithPriority[];
  rawSchedules: SchedulesResponse | null;
  safety: { soc_min: number; soc_max: number };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createRule: (rule: OptimizedScheduleRule, priority: Priority) => Promise<void>;
  updateRule: (rule: OptimizedScheduleRule, priority: Priority, oldPriority?: Priority) => Promise<void>;
  deleteRule: (ruleId: string, priority: Priority) => Promise<void>;
  toggleRule: (ruleId: string, priority: Priority) => Promise<void>;
  setSafety: (socMin: number, socMax: number) => Promise<void>;
  setSiteLimit: (hth: number, lth: number) => Promise<void>;
}

// The app's write band. Everything else in shared.schedules must pass
// through the DDB path verbatim (battery-safety invariant).
const CLOUD_KEYS: SchedulePriorityKey[] = ['p_4', 'p_5', 'p_6', 'p_7', 'p_8', 'p_9'];
const PROTECTED_KEYS: SchedulePriorityKey[] = ['p_1', 'p_2', 'p_3', 'p_10', 'p_11'];

type CloudSch = SchedulesResponse['sch'];
/** Given the current cloud-band arrays, return the priorities to replace. */
type UpdatesFactory = (sch: CloudSch) => Partial<Record<SchedulePriorityKey, OptimizedScheduleRule[]>>;

function cloudBand(sch: SharedSchedulesPayload['sch']): CloudSch {
  const out: CloudSch = {};
  for (const key of CLOUD_KEYS) {
    out[key as keyof CloudSch] = sch[key] ?? [];
  }
  return out;
}

/** Assemble a legacy-shape SchedulesResponse from DDB sections so all
 *  downstream UI (flattenRules, rule cards, editor) stays unchanged. */
function assembleResponse(
  siteId: string,
  schedules: SharedSchedulesPayload,
  limits: SharedSiteLimitsPayload,
): SchedulesResponse {
  const count = (keys: SchedulePriorityKey[]) =>
    keys.reduce((n, k) => n + (schedules.sch[k]?.length ?? 0), 0);
  const local = count(['p_1', 'p_2', 'p_3']);
  const cloud = count(CLOUD_KEYS);
  const scada = count(['p_10', 'p_11']);

  return {
    site_id: siteId,
    v: schedules.v,
    safety: {
      soc_min: limits.soc_min_percent,
      soc_max: limits.soc_max_percent,
    },
    sch: cloudBand(schedules.sch),
    metadata: {
      total_rules: local + cloud + scada,
      local_rules: local,
      cloud_rules: cloud,
      scada_safety_rules: scada,
    },
    last_updated: null,
  };
}

export function useSchedules(): UseSchedulesReturn {
  const { selectedDevice } = useDevices();
  const { t } = useSettings();
  const useDdb = useFeatureFlag('use_ddb_config_plane');
  const [rawSchedules, setRawSchedules] = useState<SchedulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const conflictMessage = useRef(t.schedules.conflictReloaded);
  conflictMessage.current = t.schedules.conflictReloaded;

  const siteId = selectedDevice?.device_id;

  const fetchSchedules = useCallback(async () => {
    if (!selectedDevice) {
      setRawSchedules(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      if (useDdb) {
        const [schedSec, limitsSec] = await Promise.all([
          getSection<SharedSchedulesPayload>(selectedDevice.device_id, 'shared.schedules'),
          getSection<SharedSiteLimitsPayload>(selectedDevice.device_id, 'shared.site_limits'),
        ]);
        setRawSchedules(assembleResponse(selectedDevice.device_id, schedSec.payload, limitsSec.payload));
      } else {
        const response = await getSchedules(selectedDevice.device_id);
        setRawSchedules(response);
      }
    } catch (err) {
      console.error('[useSchedules] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setRawSchedules(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDevice, useDdb]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const rules = useMemo(() => rawSchedules ? flattenRules(rawSchedules.sch) : [], [rawSchedules]);
  const safety = useMemo(() => ({
    soc_min: rawSchedules?.safety?.soc_min ?? 5,
    soc_max: rawSchedules?.safety?.soc_max ?? 100,
  }), [rawSchedules]);

  /**
   * DDB write path: fetch shared.schedules → apply the factory to the
   * cloud band (P4–P9) → PUT the whole payload with If-Match. Priorities
   * outside the band are carried through verbatim and asserted unchanged
   * before every PUT. On 412 the section is refetched and the user's edit
   * re-applied once.
   */
  const writeSchedulesViaDdb = useCallback(async (updatesFor: UpdatesFactory) => {
    if (!siteId) throw new Error('No site selected');

    const attempt = async () => {
      const sec = await getSection<SharedSchedulesPayload>(siteId, 'shared.schedules');
      const updates = updatesFor(cloudBand(sec.payload.sch));

      const badKeys = Object.keys(updates).filter(
        (k) => !CLOUD_KEYS.includes(k as SchedulePriorityKey),
      );
      if (badKeys.length > 0) {
        throw new Error(`Refusing to write outside P4-P9: ${badKeys.join(', ')}`);
      }

      const newSch: SharedSchedulesPayload['sch'] = { ...sec.payload.sch, ...updates };
      for (const key of PROTECTED_KEYS) {
        if (JSON.stringify(newSch[key] ?? null) !== JSON.stringify(sec.payload.sch[key] ?? null)) {
          throw new Error(`Protected priority ${key} would be modified; aborting write`);
        }
      }

      await putSection<SharedSchedulesPayload>(
        siteId,
        'shared.schedules',
        { ...sec.payload, sch: newSch },
        sec.etag,
      );
    };

    try {
      await attempt();
    } catch (err) {
      if (err instanceof ConfigConflictError) {
        Alert.alert(conflictMessage.current);
        await attempt();
      } else {
        throw err;
      }
    }
    await fetchSchedules();
  }, [siteId, fetchSchedules]);

  /** Legacy write path: partial whole-priority-array POST to /schedules. */
  const writeSchedulesLegacy = useCallback(async (updatesFor: UpdatesFactory) => {
    if (!siteId || !rawSchedules) throw new Error('No site selected');
    const updates = updatesFor(rawSchedules.sch);
    await saveSchedules(siteId, updates as Record<string, OptimizedScheduleRule[]>);
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  const writeSchedules = useDdb ? writeSchedulesViaDdb : writeSchedulesLegacy;

  const createRule = useCallback(async (rule: OptimizedScheduleRule, priority: Priority) => {
    const key = `p_${priority}` as SchedulePriorityKey;
    await writeSchedules((sch) => ({
      [key]: [...(sch[key as keyof CloudSch] ?? []), rule],
    }));
  }, [writeSchedules]);

  const updateRule = useCallback(async (
    rule: OptimizedScheduleRule,
    priority: Priority,
    oldPriority?: Priority
  ) => {
    await writeSchedules((sch) => {
      const updates: Partial<Record<SchedulePriorityKey, OptimizedScheduleRule[]>> = {};

      if (oldPriority !== undefined && oldPriority !== priority) {
        const oldKey = `p_${oldPriority}` as keyof CloudSch;
        updates[oldKey] = (sch[oldKey] ?? []).filter(r => r.id !== rule.id);
      }

      const newKey = `p_${priority}` as keyof CloudSch;
      const newRules = (sch[newKey] ?? []).filter(r => r.id !== rule.id);
      newRules.push(rule);
      updates[newKey] = newRules;

      return updates;
    });
  }, [writeSchedules]);

  const deleteRule = useCallback(async (ruleId: string, priority: Priority) => {
    const key = `p_${priority}` as keyof CloudSch;
    await writeSchedules((sch) => ({
      [key]: (sch[key] ?? []).filter(r => r.id !== ruleId),
    }));
  }, [writeSchedules]);

  const toggleRule = useCallback(async (ruleId: string, priority: Priority) => {
    const key = `p_${priority}` as keyof CloudSch;
    await writeSchedules((sch) => ({
      [key]: (sch[key] ?? []).map(rule => {
        if (rule.id !== ruleId) return rule;
        const isActive = rule.act !== false;
        if (isActive) return { ...rule, act: false as const };
        const { act, ...rest } = rule;
        return rest;
      }),
    }));
  }, [writeSchedules]);

  const setSafety = useCallback(async (socMin: number, socMax: number) => {
    if (!siteId) throw new Error('No site selected');
    if (socMin >= socMax) throw new Error('soc_min must be less than soc_max');

    if (useDdb) {
      const attempt = async () => {
        const sec = await getSection<SharedSiteLimitsPayload>(siteId, 'shared.site_limits');
        // Only touch the SoC band; import/export limits pass through verbatim.
        const payload: SharedSiteLimitsPayload = {
          ...sec.payload,
          soc_min_percent: socMin,
          soc_max_percent: socMax,
        };
        await putSection<SharedSiteLimitsPayload>(siteId, 'shared.site_limits', payload, sec.etag);
      };
      try {
        await attempt();
      } catch (err) {
        if (err instanceof ConfigConflictError) {
          Alert.alert(conflictMessage.current);
          await attempt();
        } else {
          throw err;
        }
      }
    } else {
      await saveSchedules(siteId, {}, { safety: { soc_min: socMin, soc_max: socMax } });
    }
    await fetchSchedules();
  }, [siteId, useDdb, fetchSchedules]);

  const setSiteLimit = useCallback(async (hth: number, lth: number) => {
    await writeSchedules((sch) => {
      const existingP9 = sch.p_9 ?? [];
      const siteLimitRule: OptimizedScheduleRule = {
        id: existingP9.find(r => r.a.t === 'sl')?.id || 'SITE-LIMIT',
        a: { t: 'sl', hth, lth },
        c: {},
      };
      const otherP9 = existingP9.filter(r => r.a.t !== 'sl');
      return { p_9: [...otherP9, siteLimitRule] };
    });
  }, [writeSchedules]);

  return {
    rules,
    rawSchedules,
    safety,
    isLoading,
    error,
    refetch: fetchSchedules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    setSafety,
    setSiteLimit,
  };
}
