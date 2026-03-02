# 02 — TypeScript Types & Wire Schema (v1.4.3)

> Copy-paste-ready type definitions and complete field reference for the
> schedule rule system. Use these in the web panel.

---

## Core Enums

```typescript
type ActionType = 'ch' | 'dis' | 'sb' | 'sl' | 'ct' | 'dt';
type GridOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'bt';
type Strategy = 'eq' | 'agg' | 'con';
type WeekdayShorthand = 'weekdays' | 'weekend' | 'everyday' | 'ed' | 'all' | string;
type Priority = 4 | 5 | 6 | 7 | 8 | 9;
type SystemMode = 'automatic' | 'semi-automatic' | 'manual';
```

---

## Rule Interfaces

### Action Block

```typescript
interface OptimizedAction {
  t: ActionType;        // Required — action type
  pw?: number;          // Power (kW) — for ch, dis, sb
  pid?: boolean;        // PID controller — omit if false
  hth?: number;         // High threshold (kW) — for sl
  lth?: number;         // Low threshold (kW) — for sl
  soc?: number;         // Target SoC (%) — for ct, dt
  maxp?: number;        // Max power (kW) — for ct, dt (default: 999)
  maxg?: number;        // Max grid import (kW) — for ct (default: 999999)
  ming?: number;        // Min grid power (kW) — for dt (default: 0)
  str?: Strategy;       // Strategy — for ct, dt (default: 'eq')
}
```

### Conditions Block

```typescript
interface OptimizedConditions {
  ts?: number;          // Time start — HHMM integer (e.g. 2200 = 22:00)
  te?: number;          // Time end — HHMM integer (e.g. 600 = 06:00)
  sm?: number;          // SoC min threshold (%)
  sx?: number;          // SoC max threshold (%)
  gpo?: GridOperator;   // Grid power operator
  gpv?: number;         // Grid power value (kW)
  gpx?: number;         // Grid power max (kW) — only for 'bt' operator
}
```

### Schedule Rule

```typescript
interface OptimizedScheduleRule {
  id: string;                           // Unique ID (1-63 chars)
  s?: 'ai' | 'man';                    // Source metadata (device ignores this)
  a: OptimizedAction;                   // Action block
  c?: OptimizedConditions;              // Conditions ({} = always active)
  act?: boolean;                        // Active flag (omit if true)
  d?: WeekdayShorthand | number[];      // Day filter (omit = every day)
  vf?: number;                          // Valid from (Unix epoch, omit if 0)
  vu?: number;                          // Valid until (Unix epoch, omit if 0)
}
```

### Rule with Priority (UI display)

```typescript
interface ScheduleRuleWithPriority extends OptimizedScheduleRule {
  priority: Priority;
}
```

---

## API Response Types

### GET Response

```typescript
interface SchedulesResponse {
  site_id: string;
  v: string;                                          // Schema version "1.2"
  mode?: SystemMode;
  safety?: {
    soc_min?: number;                                 // Default: 5
    soc_max?: number;                                 // Default: 100
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
```

### POST Response

```typescript
interface SaveSchedulesResponse {
  message: string;
  site_id: string;
  shadow_version: number;
  updated_priorities: string[];
  total_rules: number;
}
```

---

## Form Data Type (for editor UI)

Human-friendly field names for form inputs. Convert to/from `OptimizedScheduleRule` using helpers in `03_API_AND_CRUD.md`.

```typescript
interface ScheduleRuleFormData {
  id: string;
  priority: Priority;
  actionType: ActionType;
  active: boolean;

  // Action parameters
  power?: number;             // kW — ch, dis
  usePid?: boolean;           // PID flag
  highThreshold?: number;     // kW — sl
  lowThreshold?: number;      // kW — sl
  targetSoc?: number;         // % — ct, dt
  maxPower?: number;          // kW — ct, dt
  maxGridPower?: number;      // kW — ct (maxg)
  minGridPower?: number;      // kW — dt (ming)
  strategy?: Strategy;        // ct, dt

  // Conditions
  timeStart?: string;         // "HH:MM" format for <input type="time">
  timeEnd?: string;           // "HH:MM" format
  socMin?: number;            // 0-100
  socMax?: number;            // 0-100
  gridPowerOperator?: GridOperator;
  gridPowerValue?: number;    // kW
  gridPowerValueMax?: number; // kW — for 'bt'

  // Schedule
  weekdays?: number[];        // [0-6] bitmask array (0=Sun, 6=Sat)
  validFrom?: number;         // Unix timestamp
  validUntil?: number;        // Unix timestamp
}
```

---

## Field Mapping (Abbreviated <-> Verbose)

| Abbreviated | Verbose | Context |
|-------------|---------|---------|
| `v` | `version` | Root |
| `sch` | `schedules` | Root |
| `p_4`...`p_9` | `priority_4`...`priority_9` | Schedule container |
| `id` | `rule_id` | Rule |
| `s` | `source` | Rule |
| `a` | `action` | Rule |
| `c` | `conditions` | Rule |
| `act` | `active` | Rule |
| `d` | `weekdays` | Rule |
| `vf` | `valid_from` | Rule |
| `vu` | `valid_until` | Rule |
| `t` | `type` | Action |
| `pw` | `power_kw` | Action |
| `pid` | `use_pid` | Action |
| `hth` | `high_threshold_kw` | Action |
| `lth` | `low_threshold_kw` | Action |
| `soc` | `target_soc` | Action |
| `maxp` | `max_power_kw` | Action |
| `maxg` | `max_grid_power_kw` | Action |
| `ming` | `min_grid_power_kw` | Action |
| `str` | `strategy` | Action |
| `ts` | `time_start` | Conditions |
| `te` | `time_end` | Conditions |
| `sm` | `soc_min` | Conditions |
| `sx` | `soc_max` | Conditions |
| `gpo` | `grid_power_operator` | Conditions |
| `gpv` | `grid_power_value` | Conditions |
| `gpx` | `grid_power_value_max` | Conditions |

---

## Constants

```typescript
const VALID_PRIORITIES: Priority[] = [4, 5, 6, 7, 8, 9];
const MAX_SHADOW_SIZE_BYTES = 7680;  // 7.5KB safe threshold
const AWS_IOT_SHADOW_LIMIT = 8192;   // 8KB hard limit

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  ch: 'Charge', dis: 'Discharge', sb: 'Standby',
  sl: 'Site Limit', ct: 'Charge to Target', dt: 'Discharge to Target',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  4: 'P4 - Reserved', 5: 'P5 - Baseline', 6: 'P6 - Low',
  7: 'P7 - Normal', 8: 'P8 - High', 9: 'P9 - Site Limit',
};

const STRATEGY_LABELS: Record<Strategy, string> = {
  eq: 'Equal Spread', agg: 'Aggressive', con: 'Conservative',
};

const GRID_OPERATOR_LABELS: Record<GridOperator, string> = {
  gt: 'Greater than', lt: 'Less than', gte: 'Greater or equal',
  lte: 'Less or equal', eq: 'Equal to', bt: 'Between',
};
```

---

## Type Guards

```typescript
function isGoalBasedAction(a: OptimizedAction): boolean {
  return a.t === 'ct' || a.t === 'dt';
}

function isSiteLimitAction(a: OptimizedAction): boolean {
  return a.t === 'sl';
}

function isFixedPowerAction(a: OptimizedAction): boolean {
  return a.t === 'ch' || a.t === 'dis' || a.t === 'sb';
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
