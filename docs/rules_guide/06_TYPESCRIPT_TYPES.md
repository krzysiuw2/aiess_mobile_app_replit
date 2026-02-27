# TypeScript Type Definitions

> Copy-paste-ready type definitions for the BESS schedule rule system.
> Based on `src/types/shadow-optimized.ts` from the panel app.

---

## Core Types

```typescript
// ─── Action Types ────────────────────────────────────────────────
type ActionType = 'ch' | 'dis' | 'sb' | 'sl' | 'ct' | 'dt';

// ─── Grid Power Operators ────────────────────────────────────────
type GridOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'bt';

// ─── Strategy Types ──────────────────────────────────────────────
type Strategy = 'eq' | 'agg' | 'con';

// ─── Weekday Shorthand ──────────────────────────────────────────
type WeekdayShorthand = 'weekdays' | 'weekend' | 'everyday' | 'ed' | 'all' | string;

// ─── Priority (Cloud-updateable range) ──────────────────────────
type Priority = 4 | 5 | 6 | 7 | 8 | 9;
```

---

## Rule Types

```typescript
// ─── Action Block ────────────────────────────────────────────────
interface OptimizedAction {
  t: ActionType;           // Action type
  pw?: number;             // Power kW (for ch, dis, sb)
  pid?: boolean;           // PID mode (omit if false)
  hth?: number;            // High threshold kW (for sl)
  lth?: number;            // Low threshold kW (for sl)
  soc?: number;            // Target SoC % (for ct, dt)
  maxp?: number;           // Max power kW (for ct, dt; default: 999)
  maxg?: number;           // Max grid import kW (for ct; default: 999999)
  ming?: number;           // Min grid power kW (for dt; default: 0)
  str?: Strategy;          // Strategy (for ct, dt; default: 'eq')
}

// ─── Conditions Block ────────────────────────────────────────────
interface OptimizedConditions {
  ts?: number;             // Time start (HHMM integer, e.g., 800 = 8:00 AM)
  te?: number;             // Time end (HHMM integer)
  sm?: number;             // SoC min %
  sx?: number;             // SoC max %
  gpo?: GridOperator;      // Grid power operator
  gpv?: number;            // Grid power value (kW)
  gpx?: number;            // Grid power value max (for 'bt' operator)
}

// ─── Schedule Rule ───────────────────────────────────────────────
// NOTE: No 'p' field -- priority is inferred from parent p_X array
interface OptimizedScheduleRule {
  id: string;                      // Rule ID (1-63 chars)
  s?: 'ai' | 'man';               // Source: AI or manual (default: 'man')
  a: OptimizedAction;              // Action block
  c?: OptimizedConditions;         // Conditions (empty {} = immediate/always)
  act?: boolean;                   // Active flag (omit if true)
  d?: WeekdayShorthand | number[]; // Weekdays (shorthand or bitmask array)
  vf?: number;                     // Valid from (Unix timestamp, omit if 0)
  vu?: number;                     // Valid until (Unix timestamp, omit if 0)
}

// ─── Rule with Priority Attached (for UI display) ───────────────
interface ScheduleRuleWithPriority extends OptimizedScheduleRule {
  priority: Priority;
}
```

---

## Shadow Types

```typescript
// ─── Shadow State ────────────────────────────────────────────────
interface OptimizedShadowState {
  v: string;            // Schema version (e.g., "1.2")
  mode?: 'automatic' | 'semi-automatic' | 'manual';
  safety?: {
    soc_min?: number;   // Min SoC % (0-100, default: 5)
    soc_max?: number;   // Max SoC % (0-100, default: 100)
  };
  sch: {
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
  };
}

// ─── Complete Shadow Document ────────────────────────────────────
interface OptimizedDeviceShadow {
  state: {
    desired?: OptimizedShadowState;
    reported?: OptimizedShadowState;
    delta?: Partial<OptimizedShadowState>;
  };
  metadata?: {
    desired?: Record<string, any>;
    reported?: Record<string, any>;
  };
  version: number;
  timestamp: number;
}
```

---

## API Response Types

```typescript
// ─── GET /schedules/{siteId} Response ───────────────────────────
interface SchedulesResponse {
  site_id: string;
  v: string;
  mode?: 'automatic' | 'semi-automatic' | 'manual';
  safety?: {
    soc_min?: number;
    soc_max?: number;
  };
  sch: {
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
  };
  metadata: {
    total_rules: number;
    local_rules: number;
    cloud_rules: number;
    scada_safety_rules: number;
  };
  last_updated: number | null;
}

// ─── POST /schedules/{siteId} Response ──────────────────────────
interface SaveSchedulesResponse {
  message: string;
  shadow_version: number;
  updated_priorities: number[];
  total_rules: number;
}
```

---

## Form Data Type (UI-Friendly)

For use in React Native form components with human-readable field names:

```typescript
interface ScheduleRuleFormData {
  id: string;
  priority: Priority;
  actionType: ActionType;
  active: boolean;

  // Action fields
  power?: number;
  usePid?: boolean;
  highThreshold?: number;
  lowThreshold?: number;
  targetSoc?: number;
  maxPower?: number;
  maxGridPower?: number;
  minGridPower?: number;
  strategy?: Strategy;

  // Conditions
  timeStart?: string;         // "HH:MM" format for form inputs
  timeEnd?: string;           // "HH:MM" format
  socMin?: number;
  socMax?: number;
  gridPowerOperator?: GridOperator;
  gridPowerValue?: number;
  gridPowerValueMax?: number;

  // Other
  weekdays?: number[];        // Bitmask array (0=Sun, 6=Sat)
  validFrom?: number;         // Unix timestamp
  validUntil?: number;        // Unix timestamp
}
```

---

## Constants

```typescript
const CLOUD_PRIORITY_RANGE = { MIN: 4, MAX: 9 } as const;
const VALID_PRIORITIES: Priority[] = [4, 5, 6, 7, 8, 9];
const MAX_SHADOW_SIZE_BYTES = 7680;  // 7.5KB threshold
const AWS_IOT_SHADOW_LIMIT = 8192;  // 8KB hard limit

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  ch: 'Charge',
  dis: 'Discharge',
  sb: 'Standby',
  sl: 'Site Limit',
  ct: 'Charge to Target',
  dt: 'Discharge to Target',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  4: 'P4 - Reserved',
  5: 'P5 - Baseline',
  6: 'P6 - Low',
  7: 'P7 - Normal',
  8: 'P8 - High',
  9: 'P9 - Site Limit',
};

const STRATEGY_LABELS: Record<Strategy, string> = {
  eq: 'Equal Spread',
  agg: 'Aggressive',
  con: 'Conservative',
};

const GRID_OPERATOR_LABELS: Record<GridOperator, string> = {
  gt: 'Greater than',
  lt: 'Less than',
  gte: 'Greater or equal',
  lte: 'Less or equal',
  eq: 'Equal to',
  bt: 'Between',
};
```

---

## Field Mapping (Optimized <-> Verbose)

```typescript
const FIELD_MAPPING = {
  // Root
  v: 'version',
  sch: 'schedules',

  // Priority
  p_4: 'priority_4', p_5: 'priority_5', p_6: 'priority_6',
  p_7: 'priority_7', p_8: 'priority_8', p_9: 'priority_9',

  // Rule fields
  id: 'rule_id', a: 'action', c: 'conditions',
  act: 'active', d: 'weekdays', vf: 'valid_from', vu: 'valid_until',

  // Action types
  ch: 'charge', dis: 'discharge', sb: 'standby',
  sl: 'site_limit', ct: 'charge_to_target', dt: 'discharge_to_target',

  // Action fields
  t: 'type', pw: 'power_kw', pid: 'use_pid',
  hth: 'high_threshold_kw', lth: 'low_threshold_kw',
  soc: 'target_soc', maxp: 'max_power_kw',
  maxg: 'max_grid_power_kw', ming: 'min_grid_power_kw', str: 'strategy',

  // Condition fields
  ts: 'time_start', te: 'time_end',
  sm: 'soc_min', sx: 'soc_max',
  gpo: 'grid_power_operator', gpv: 'grid_power_value', gpx: 'grid_power_value_max',

  // Strategy
  eq: 'equal_spread', agg: 'aggressive', con: 'conservative',

  // Grid operators
  gt: 'greater_than', lt: 'less_than', gte: 'greater_than_or_equal',
  lte: 'less_than_or_equal', bt: 'between',
} as const;
```

---

## Type Guards

```typescript
function isChargeAction(a: OptimizedAction): boolean {
  return a.t === 'ch';
}

function isDischargeAction(a: OptimizedAction): boolean {
  return a.t === 'dis';
}

function isGoalBasedAction(a: OptimizedAction): boolean {
  return a.t === 'ct' || a.t === 'dt';
}

function isSiteLimitAction(a: OptimizedAction): boolean {
  return a.t === 'sl';
}

function isValidPriority(p: number): p is Priority {
  return p >= 4 && p <= 9;
}

function isRuleActive(rule: OptimizedScheduleRule): boolean {
  return rule.act !== false;
}

function isRuleExpired(rule: OptimizedScheduleRule): boolean {
  if (!rule.vu || rule.vu === 0) return false;
  return Date.now() / 1000 > rule.vu;
}

function isRuleNotYetValid(rule: OptimizedScheduleRule): boolean {
  if (!rule.vf || rule.vf === 0) return false;
  return Date.now() / 1000 < rule.vf;
}
```
