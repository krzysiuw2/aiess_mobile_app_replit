# Mobile App Patterns (React Native / Expo)

> Implementation patterns for managing BESS rules in a React Native / Expo app.
> Includes API client, hooks, form conversion, and display helpers.

---

## API Client Setup

```typescript
// lib/aws-schedules.ts

const API_ENDPOINT = process.env.EXPO_PUBLIC_AWS_ENDPOINT || '';
const API_KEY = process.env.EXPO_PUBLIC_AWS_API_KEY || '';

export async function getSchedules(siteId: string): Promise<SchedulesResponse> {
  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'GET',
    headers: { 'x-api-key': API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedules: ${response.status}`);
  }

  return response.json();
}

export async function saveSchedules(
  siteId: string,
  schedules: Record<string, OptimizedScheduleRule[]>,
  options?: {
    mode?: 'automatic' | 'semi-automatic' | 'manual';
    safety?: { soc_min: number; soc_max: number };
  }
): Promise<SaveSchedulesResponse> {
  const body: any = { site_id: siteId, sch: schedules };
  if (options?.mode) body.mode = options.mode;
  if (options?.safety) body.safety = options.safety;

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to save schedules: ${response.status}`);
  }

  return response.json();
}
```

---

## useSchedules Hook

```typescript
// hooks/useSchedules.ts

import { useState, useEffect, useCallback } from 'react';
import { getSchedules, saveSchedules } from '@/lib/aws-schedules';
import type {
  SchedulesResponse,
  OptimizedScheduleRule,
  ScheduleRuleWithPriority,
  Priority,
} from '@/types/rules';

interface UseSchedulesReturn {
  rules: ScheduleRuleWithPriority[];
  rawSchedules: SchedulesResponse | null;
  mode: 'automatic' | 'semi-automatic' | 'manual';
  safety: { soc_min: number; soc_max: number };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createRule: (rule: OptimizedScheduleRule, priority: Priority) => Promise<void>;
  updateRule: (rule: OptimizedScheduleRule, priority: Priority, oldPriority?: Priority) => Promise<void>;
  deleteRule: (ruleId: string, priority: Priority) => Promise<void>;
  toggleRule: (ruleId: string, priority: Priority) => Promise<void>;
}

export function useSchedules(siteId: string | null): UseSchedulesReturn {
  const [rawSchedules, setRawSchedules] = useState<SchedulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!siteId) {
      setRawSchedules(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await getSchedules(siteId);
      setRawSchedules(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setRawSchedules(null);
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const rules = rawSchedules ? flattenRules(rawSchedules.sch) : [];
  const mode = rawSchedules?.mode || 'automatic';
  const safety = {
    soc_min: rawSchedules?.safety?.soc_min ?? 5,
    soc_max: rawSchedules?.safety?.soc_max ?? 100,
  };

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
    const rules = rawSchedules.sch[key] || [];
    const updated = rules.map(rule => {
      if (rule.id !== ruleId) return rule;
      const isActive = rule.act !== false;
      if (isActive) return { ...rule, act: false as const };
      const { act, ...rest } = rule;
      return rest;
    });

    await saveSchedules(siteId, { [key]: updated });
    await fetchSchedules();
  }, [siteId, rawSchedules, fetchSchedules]);

  return {
    rules, rawSchedules, mode, safety,
    isLoading, error,
    refetch: fetchSchedules,
    createRule, updateRule, deleteRule, toggleRule,
  };
}
```

---

## Flatten & Sort Rules

```typescript
// lib/utils/schedules.ts

function flattenRules(sch: SchedulesResponse['sch']): ScheduleRuleWithPriority[] {
  const allRules: ScheduleRuleWithPriority[] = [];

  for (let p = 4; p <= 9; p++) {
    const key = `p_${p}` as keyof typeof sch;
    const rules = sch[key] || [];
    rules.forEach(rule => allRules.push({ ...rule, priority: p as Priority }));
  }

  return allRules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}
```

---

## Form Data Conversion

### Form Data -> Optimized Rule

```typescript
function formDataToOptimizedRule(data: ScheduleRuleFormData): OptimizedScheduleRule {
  const rule: OptimizedScheduleRule = {
    id: data.id,
    a: buildAction(data),
  };

  const conditions = buildConditions(data);
  rule.c = Object.keys(conditions).length > 0 ? conditions : {};

  if (!data.active) rule.act = false;
  if (data.weekdays && data.weekdays.length > 0 && data.weekdays.length < 7) {
    rule.d = data.weekdays;
  }
  if (data.validFrom && data.validFrom > 0) rule.vf = data.validFrom;
  if (data.validUntil && data.validUntil > 0) rule.vu = data.validUntil;

  return rule;
}

function buildAction(data: ScheduleRuleFormData): OptimizedAction {
  const action: OptimizedAction = { t: data.actionType };

  switch (data.actionType) {
    case 'ch':
    case 'dis':
      if (data.power !== undefined) action.pw = data.power;
      if (data.usePid) action.pid = true;
      break;
    case 'sb':
      action.pw = 0;
      break;
    case 'sl':
      if (data.highThreshold !== undefined) action.hth = data.highThreshold;
      if (data.lowThreshold !== undefined) action.lth = data.lowThreshold;
      break;
    case 'ct':
      if (data.targetSoc !== undefined) action.soc = data.targetSoc;
      if (data.maxPower !== undefined) action.maxp = data.maxPower;
      if (data.maxGridPower !== undefined) action.maxg = data.maxGridPower;
      if (data.strategy) action.str = data.strategy;
      if (data.usePid) action.pid = true;
      break;
    case 'dt':
      if (data.targetSoc !== undefined) action.soc = data.targetSoc;
      if (data.maxPower !== undefined) action.maxp = data.maxPower;
      if (data.minGridPower !== undefined) action.ming = data.minGridPower;
      if (data.strategy) action.str = data.strategy;
      if (data.usePid) action.pid = true;
      break;
  }

  return action;
}

function buildConditions(data: ScheduleRuleFormData): OptimizedConditions {
  const c: OptimizedConditions = {};

  if (data.timeStart) c.ts = parseTime(data.timeStart);
  if (data.timeEnd) c.te = parseTime(data.timeEnd);
  if (data.socMin !== undefined) c.sm = data.socMin;
  if (data.socMax !== undefined) c.sx = data.socMax;
  if (data.gridPowerOperator) c.gpo = data.gridPowerOperator;
  if (data.gridPowerValue !== undefined) c.gpv = data.gridPowerValue;
  if (data.gridPowerValueMax !== undefined) c.gpx = data.gridPowerValueMax;

  return c;
}
```

### Optimized Rule -> Form Data

```typescript
function optimizedRuleToFormData(
  rule: OptimizedScheduleRule,
  priority: Priority
): ScheduleRuleFormData {
  return {
    id: rule.id,
    priority,
    actionType: rule.a.t,
    active: rule.act !== false,

    // Action fields
    power: rule.a.pw,
    usePid: rule.a.pid ?? false,
    highThreshold: rule.a.hth,
    lowThreshold: rule.a.lth,
    targetSoc: rule.a.soc,
    maxPower: rule.a.maxp,
    maxGridPower: rule.a.maxg,
    minGridPower: rule.a.ming,
    strategy: rule.a.str,

    // Conditions
    timeStart: rule.c?.ts !== undefined ? formatTime(rule.c.ts) : undefined,
    timeEnd: rule.c?.te !== undefined ? formatTime(rule.c.te) : undefined,
    socMin: rule.c?.sm,
    socMax: rule.c?.sx,
    gridPowerOperator: rule.c?.gpo,
    gridPowerValue: rule.c?.gpv,
    gridPowerValueMax: rule.c?.gpx,

    // Other
    weekdays: Array.isArray(rule.d) ? rule.d : weekdayShorthandToArray(rule.d),
    validFrom: rule.vf,
    validUntil: rule.vu,
  };
}
```

---

## Display Helpers

```typescript
// ─── Time Formatting ─────────────────────────────────────────────

function formatTime(hhmm: number): string {
  const hours = Math.floor(hhmm / 100);
  const minutes = hhmm % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 100 + minutes;
}

// ─── Label Helpers ───────────────────────────────────────────────

function getActionTypeLabel(type: ActionType): string {
  const labels: Record<ActionType, string> = {
    ch: 'Charge', dis: 'Discharge', sb: 'Standby',
    sl: 'Site Limit', ct: 'Charge to Target', dt: 'Discharge to Target',
  };
  return labels[type] || type;
}

function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    4: 'P4 - Reserved', 5: 'P5 - Baseline', 6: 'P6 - Low',
    7: 'P7 - Normal', 8: 'P8 - High', 9: 'P9 - Site Limit',
  };
  return labels[priority] || `P${priority}`;
}

function getStrategyLabel(str: Strategy): string {
  const labels: Record<Strategy, string> = {
    eq: 'Equal Spread', agg: 'Aggressive', con: 'Conservative',
  };
  return labels[str] || str;
}

// ─── Weekday Helpers ─────────────────────────────────────────────

function getDaysLabel(d: string | number[] | undefined): string {
  if (!d) return 'Everyday';

  if (Array.isArray(d)) {
    if (d.length === 0 || d.length === 7) return 'Everyday';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return d.map(i => dayNames[i]).join(', ');
  }

  const shorthand: Record<string, string> = {
    weekdays: 'Mon-Fri', wd: 'Mon-Fri',
    weekend: 'Sat-Sun', we: 'Sat-Sun',
    everyday: 'Everyday', ed: 'Everyday', all: 'Everyday',
  };

  return shorthand[d.toLowerCase()] || d;
}

function weekdayShorthandToArray(d: string | number[] | undefined): number[] {
  if (!d) return [0, 1, 2, 3, 4, 5, 6];
  if (Array.isArray(d)) return d;

  const shorthandMap: Record<string, number[]> = {
    weekdays: [1, 2, 3, 4, 5],
    wd: [1, 2, 3, 4, 5],
    weekend: [0, 6],
    we: [0, 6],
    everyday: [0, 1, 2, 3, 4, 5, 6],
    ed: [0, 1, 2, 3, 4, 5, 6],
    all: [0, 1, 2, 3, 4, 5, 6],
  };

  return shorthandMap[d.toLowerCase()] || [0, 1, 2, 3, 4, 5, 6];
}

// ─── Rule Summary ────────────────────────────────────────────────

function getRuleSummary(rule: OptimizedScheduleRule): string {
  const action = getActionTypeLabel(rule.a.t);
  let detail = '';

  switch (rule.a.t) {
    case 'ch':
    case 'dis':
      detail = `${rule.a.pw} kW`;
      break;
    case 'sl':
      detail = `${rule.a.lth} to ${rule.a.hth} kW`;
      break;
    case 'ct':
    case 'dt':
      detail = `to ${rule.a.soc}%`;
      if (rule.a.maxp) detail += `, max ${rule.a.maxp} kW`;
      break;
  }

  let time = '';
  if (rule.c?.ts !== undefined && rule.c?.te !== undefined) {
    time = ` (${formatTime(rule.c.ts)}-${formatTime(rule.c.te)})`;
  }

  const days = rule.d ? `, ${getDaysLabel(rule.d)}` : '';

  return `${action} ${detail}${time}${days}`;
}
```

---

## Client-Side Validation

```typescript
function validateRule(rule: OptimizedScheduleRule, priority: number): string[] {
  const errors: string[] = [];

  if (!rule.id || rule.id.length === 0) errors.push('Rule ID is required');
  if (rule.id && rule.id.length > 63) errors.push('Rule ID max 63 characters');
  if (priority < 4 || priority > 9) errors.push('Priority must be 4-9');

  // Action validation
  switch (rule.a.t) {
    case 'ch':
    case 'dis':
      if (rule.a.pw === undefined || rule.a.pw < 0) errors.push('Power must be >= 0');
      break;
    case 'sl':
      if (rule.a.hth === undefined) errors.push('High threshold required for site limit');
      if (rule.a.lth === undefined) errors.push('Low threshold required for site limit');
      if (priority !== 9) errors.push('Site limit action only allowed on P9');
      break;
    case 'ct':
    case 'dt':
      if (rule.a.soc === undefined) errors.push('Target SoC required');
      if (rule.a.soc !== undefined && (rule.a.soc < 0 || rule.a.soc > 100)) {
        errors.push('Target SoC must be 0-100');
      }
      break;
  }

  // Condition validation
  if (rule.c?.sm !== undefined && (rule.c.sm < 0 || rule.c.sm > 100)) {
    errors.push('SoC min must be 0-100');
  }
  if (rule.c?.sx !== undefined && (rule.c.sx < 0 || rule.c.sx > 100)) {
    errors.push('SoC max must be 0-100');
  }
  if (rule.c?.sm !== undefined && rule.c?.sx !== undefined && rule.c.sm >= rule.c.sx) {
    errors.push('SoC min must be less than SoC max');
  }

  return errors;
}

function validateShadowSize(rules: OptimizedScheduleRule[]): boolean {
  const json = JSON.stringify(rules);
  const size = new TextEncoder().encode(json).length;
  return size <= 7680;
}
```
