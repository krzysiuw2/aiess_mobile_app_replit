d# AIESS v1.4.1 Schedules & Rules Complete Guide

> **Purpose**: Definitive schema reference for all applications (daemon, mobile app, AWS Lambda, UI).  
> **Version**: 1.4.1 (Shadow V2 Optimization)  
> **Last Updated**: 2025-11-27

---

## Table of Contents

1. [Overview](#overview)
2. [Priority System](#priority-system)
3. [JSON Structure](#json-structure)
4. [Rule Schema](#rule-schema)
5. [Action Types](#action-types)
6. [Conditions](#conditions)
7. [Weekday Filtering](#weekday-filtering)
8. [Shadow V2 Optimization](#shadow-v2-optimization)
9. [Complete Examples](#complete-examples)
10. [Validation Rules](#validation-rules)
11. [Size Optimization Reference](#size-optimization-reference)

---

## Overview

### What is a Schedule Rule?

A schedule rule defines **when** and **how** the battery energy storage system (BESS) should operate. Each rule specifies:

- **Action**: What to do (charge, discharge, standby, etc.)
- **Conditions**: When to activate (time, SoC, grid power)
- **Priority**: Which rules take precedence

### Rule Evaluation Flow

```
1. Load all active rules
2. Sort by priority (P11 highest → P1 lowest)
3. For each priority level:
   a. Check if conditions are met
   b. If matched → Execute action
   c. If not matched → Check next priority
4. Default: P1 standby (if no other rules match)
```

---

## Priority System

| Priority | Name | Purpose | Source | Override |
|----------|------|---------|--------|----------|
| **P11** | Safety | SoC limits, emergency stops | Local config | Cannot be overridden |
| **P10** | SCADA | Grid operator commands | SCADA/DNP3 | Overrides P1-P9 |
| **P9** | Site Limit | Grid connection agreement | Cloud/Local | Limits all power flow |
| **P8** | Cloud High | Urgent cloud commands | AWS IoT | High priority cloud |
| **P7** | Cloud Normal | Standard schedules | AWS IoT | Normal cloud rules |
| **P6** | Cloud Low | Background optimization | AWS IoT | Low priority cloud |
| **P5** | Cloud Baseline | Fallback cloud rules | AWS IoT | Lowest cloud priority |
| **P4** | Cloud Reserved | Future use | AWS IoT | Reserved |
| **P3** | Local High | User local overrides | Local UI | High local priority |
| **P2** | Local Normal | User local schedules | Local UI | Normal local |
| **P1** | Local Default | Fallback standby | Local | Always present |

### Priority Characteristics

- **P11 (Safety)**: Auto-generated from device config, cannot be modified by users
- **P10 (SCADA)**: Grid operator commands, bypasses P9 site limits
- **P9 (Site Limit)**: Special dual-mode action (see below)
- **P4-P8 (Cloud)**: Managed by AWS IoT Shadow, synced automatically
- **P1-P3 (Local)**: Managed locally, survive cloud disconnection

### Cloud-Updateable Priorities

| Priority Range | Cloud Access | Notes |
|----------------|--------------|-------|
| P1-P3 | ❌ Local only | Device-only, preserved during sync |
| **P4-P9** | ✅ **Cloud updateable** | AWS IoT Shadow can create/update/delete |
| P10-P11 | ❌ Local only | Safety & SCADA, never overwritten |

> **Important**: P9 site limits CAN be sent from the mobile app via AWS IoT Shadow!

---

## P9 Site Limits - Dual Mode Operation

P9 is special - it operates in **TWO MODES** simultaneously:

### Mode 1: Passive Limiter (Capping)

When any P1-P8 rule executes, P9 **caps its power** to not exceed site limits.

```
Example:
- P9 high_threshold: 70 kW
- Current grid: 50 kW
- P7 rule wants to charge: 40 kW
- Expected result: 50 + 40 = 90 kW (exceeds P9!)

P9 Smart Capping:
- Available capacity: 70 - 50 = 20 kW
- Charge capped to: 20 kW ✅
- Final grid: 50 + 20 = 70 kW (within limit)
```

### Mode 2: Active Controller (PID)

When **no other rule is active** AND grid thresholds are violated, P9 **generates PID-controlled commands**.

```
Example:
- P9 high_threshold: 70 kW
- Current grid: 80 kW (exceeded!)
- No P1-P8 rule active

P9 Active Control:
- Generates: DISCHARGE 10 kW
- Uses: PID control (smooth)
- Result: Grid returns to 70 kW ✅
```

### P9 Execution Order

```
1. P11 Safety        → Always enforced (unoverridable)
2. P10 SCADA         → Grid operator commands (BYPASSES P9!)
3. P8-P4 Cloud Rules → Checked with P9 capping applied
4. ⚡ P9 ACTIVE      → If thresholds violated & no P8-P4 matched
5. P3-P1 Local Rules → Checked with P9 capping applied
6. P1 Standby        → Default fallback (if P9 within limits)
```

### P9 Behavior Matrix

| Scenario | P9 Mode | Action |
|----------|---------|--------|
| P7 charging 50kW, grid 50kW, threshold 70kW | **Capping** | Caps charge to 20kW |
| No rule active, grid 80kW, threshold 70kW | **Active** | PID discharge 10kW |
| No rule active, grid -50kW, low threshold -40kW | **Active** | PID charge 10kW |
| P10 SCADA command active | **Bypassed** | SCADA overrides P9 |
| Grid within thresholds, no rule | **Inactive** | Falls through to P1 standby |

### P9 Active Controller Details

When P9 generates active commands:

| Grid Condition | P9 Response | PID |
|----------------|-------------|-----|
| Grid > high_threshold | DISCHARGE to reduce grid | ✅ Enabled |
| Grid < low_threshold | CHARGE to increase grid | ✅ Enabled |
| Within thresholds | No action | - |

The active controller uses **PID mode** (`use_pid: true`) for smooth grid tracking.

### P9 Rule Example

```json
// Send this via AWS IoT Shadow or mobile app
{
  "id": "SITE-LIMIT-FARM",
  "a": {"t": "sl", "hth": 70, "lth": -40},
  "c": {},
  "p": 9
}
```

This single rule will:
1. **Cap** all P1-P8 rules to stay within ±70/-40 kW
2. **Actively control** grid when thresholds are violated (with PID)

### When NOT to Use P9 Active Mode

If you only want **capping without active control**, you can:
- Set very wide thresholds (e.g., `hth: 9999, lth: -9999`)
- Or use P8 rules for specific threshold behaviors

---

## JSON Structure

### File Location

```
Production: /var/lib/aiess/schedules.json
Development: ./config/defaults/schedules.json
```

### Root Structure

#### Verbose Format

```json
{
  "version": "1.2",
  "schedules": {
    "priority_1": [ /* array of rules */ ],
    "priority_2": [ /* array of rules */ ],
    ...
    "priority_11": [ /* array of rules */ ]
  }
}
```

#### Optimized Format (Shadow V2)

```json
{
  "v": "1.2",
  "sch": {
    "p_1": [ /* array of rules */ ],
    "p_2": [ /* array of rules */ ],
    ...
    "p_11": [ /* array of rules */ ]
  }
}
```

#### Root Key Mapping

| Verbose | Optimized | Description |
|---------|-----------|-------------|
| `version` | `v` | Schema version |
| `schedules` | `sch` | Schedules container |
| `priority_X` | `p_X` | Priority level array |

> **Note**: The C parser accepts both formats for backward compatibility.

---

## Rule Schema

### Verbose Format (Human-Readable)

```json
{
  "rule_id": "string (1-63 chars, required)",
  "priority": "integer (1-11, required)",
  "action": {
    "type": "string (required)",
    /* action-specific fields */
  },
  "conditions": {
    /* optional condition blocks */
  },
  "active": "boolean (optional, default: true)",
  "weekdays": ["Mon", "Tue", ...] | "shorthand",
  "valid_from": "unix timestamp (optional, default: 0 = immediate)",
  "valid_until": "unix timestamp (optional, default: 0 = permanent)",
  "uploaded_at": "unix timestamp (optional, default: 0)"
}
```

### Optimized Format (Shadow V2)

```json
{
  "id": "string",
  "p": "integer",
  "a": { /* abbreviated action */ },
  "c": { /* flattened conditions */ },
  "act": "boolean (only if false)",
  "d": "weekday shorthand or array",
  "vf": "valid_from (only if non-zero)",
  "vu": "valid_until (only if non-zero)"
}
```

### Field Reference

| Verbose Key | Optimized Key | Type | Required | Default |
|-------------|---------------|------|----------|---------|
| `rule_id` | `id` | string | ✅ | - |
| `priority` | `p` | integer | ✅ | - |
| `action` | `a` | object | ✅ | - |
| `conditions` | `c` | object | ⚠️ | `{}` |
| `active` | `act` | boolean | ❌ | `true` |
| `weekdays` | `d` | array/string | ❌ | all days |
| `valid_from` | `vf` | integer | ❌ | `0` |
| `valid_until` | `vu` | integer | ❌ | `0` |
| `uploaded_at` | _(omit)_ | integer | ❌ | `0` |

**Note**: In optimized format, omit fields with default values to save space.

---

## Action Types

### 1. Charge (`charge` / `ch`)

Fixed power battery charging.

#### Verbose Schema

```json
{
  "action": {
    "type": "charge",
    "power_kw": 50.0
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "ch",
    "pw": 50.0
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Description |
|-------|---------|-----------|------|----------|-------------|
| Type | `type` | `t` | string | ✅ | `"charge"` or `"ch"` |
| Power | `power_kw` | `pw` | float | ✅ | Charge power in kW (≥0) |
| PID Mode | `use_pid` | `pid` | boolean | ❌ | Use PID control (default: `false`) |

#### Behavior

- **Direct mode** (`use_pid: false`, default): Send exact power command to EMS
- **PID mode** (`use_pid: true`): Use PID controller to reach grid setpoint (for threshold-based rules)
- **Power 999**: Special marker for "use device maximum power"

> **Note**: For simple charge/discharge commands, PID is OFF by default. The command "charge 50 kW" means exactly 50 kW. Only P9 site limits will constrain this. Enable PID only for grid-following behavior (threshold rules).

---

### 2. Discharge (`discharge` / `dis`)

Fixed power battery discharging.

#### Verbose Schema

```json
{
  "action": {
    "type": "discharge",
    "power_kw": 50.0
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "dis",
    "pw": 50.0
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Description |
|-------|---------|-----------|------|----------|-------------|
| Type | `type` | `t` | string | ✅ | `"discharge"` or `"dis"` |
| Power | `power_kw` | `pw` | float | ✅ | Discharge power in kW (≥0) |
| PID Mode | `use_pid` | `pid` | boolean | ❌ | Use PID control (default: `false`) |

> **Note**: Same as charge - PID is OFF by default. "Discharge 50 kW" means exactly 50 kW sent to EMS.

---

### 3. Standby (`standby` / `sb`)

No power flow (idle state).

#### Verbose Schema

```json
{
  "action": {
    "type": "standby",
    "power_kw": 0,
    "use_pid": false
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "sb",
    "pw": 0
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Description |
|-------|---------|-----------|------|----------|-------------|
| Type | `type` | `t` | string | ✅ | `"standby"` or `"sb"` |
| Power | `power_kw` | `pw` | float | ✅ | Always `0` |

---

### 4. Site Limit (`site_limit` / `sl`)

Grid connection power limits (**P9 only**). Constrains power flow to stay within grid connection agreement.

> **📖 See Also**: [P9 Site Limits - Dual Mode Operation](#p9-site-limits---dual-mode-operation) for complete behavior details.

#### Verbose Schema

```json
{
  "action": {
    "type": "site_limit",
    "high_threshold_kw": 100.0,
    "low_threshold_kw": -50.0
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "sl",
    "hth": 100.0,
    "lth": -50.0
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Description |
|-------|---------|-----------|------|----------|-------------|
| Type | `type` | `t` | string | ✅ | `"site_limit"` or `"sl"` |
| High Threshold | `high_threshold_kw` | `hth` | float | ✅ | Max import from grid (kW) |
| Low Threshold | `low_threshold_kw` | `lth` | float | ✅ | Max export to grid (kW, negative) |

#### Dual-Mode Behavior

P9 operates in **two modes simultaneously**:

| Mode | Trigger | Action | PID |
|------|---------|--------|-----|
| **Passive Capping** | P1-P8 rule executing | Limits rule power to stay within thresholds | N/A |
| **Active Control** | Thresholds violated, no rule active | Generates charge/discharge to reach threshold | ✅ Enabled |

#### Threshold Logic

| Condition | P9 Response |
|-----------|-------------|
| Grid > `high_threshold_kw` | Discharge battery (reduce import) |
| Grid < `low_threshold_kw` | Charge battery (reduce export) |
| Between thresholds | No intervention |

#### Example

```
high_threshold_kw: 70   → If grid > 70 kW import, discharge battery
low_threshold_kw: -40   → If grid > 40 kW export, charge battery
```

**Capping Example**:
```
Grid: 50 kW, P7 wants to charge 40 kW, P9 high: 70 kW
→ Available: 70 - 50 = 20 kW
→ P7 charge capped to 20 kW
```

**Active Control Example**:
```
Grid: 80 kW, no rule active, P9 high: 70 kW
→ P9 generates: DISCHARGE 10 kW (with PID)
→ Grid returns to 70 kW
```

#### Cloud Updateable

✅ **P9 can be sent from AWS IoT Shadow / mobile app!**

```json
// Send via cloud to update site limits
{"id": "SITE-LIMIT", "a": {"t": "sl", "hth": 70, "lth": -40}, "c": {}, "p": 9}
```

---

### 5. Charge to Target (`charge_to_target` / `ct`)

Goal-based charging to reach target SoC by end of time window.

#### Verbose Schema

```json
{
  "action": {
    "type": "charge_to_target",
    "target_soc": 80,
    "max_power_kw": 50,
    "max_grid_power_kw": 100,
    "strategy": "equal_spread",
    "use_pid": false
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "ct",
    "soc": 80,
    "maxp": 50,
    "maxg": 100,
    "str": "eq"
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Default | Description |
|-------|---------|-----------|------|----------|---------|-------------|
| Type | `type` | `t` | string | ✅ | - | `"charge_to_target"` or `"ct"` |
| Target SoC | `target_soc` | `soc` | float | ✅ | - | Target battery % (0-100) |
| Max Power | `max_power_kw` | `maxp` | float | ❌ | 999 | Max charge power (kW) |
| Max Grid | `max_grid_power_kw` | `maxg` | float | ❌ | 999999 | Max grid import (kW) |
| Strategy | `strategy` | `str` | string | ❌ | `"equal_spread"` | Charging strategy |
| PID Mode | `use_pid` | `pid` | boolean | ❌ | `false` | Use PID control |

#### Strategy Options

| Strategy | Verbose | Optimized | Description |
|----------|---------|-----------|-------------|
| Equal Spread | `equal_spread` | `eq` | Spread power evenly over time window |
| Aggressive | `aggressive` | `agg` | Charge as fast as possible at start |
| Conservative | `conservative` | `con` | Charge slowly, accelerate at end |

#### Immediate Mode (No Conditions)

If no `conditions` block is provided, the rule operates in **immediate max power mode**:
- Charges at `max_power_kw` immediately
- Ignores time constraints
- Continues until `target_soc` reached

---

### 6. Discharge to Target (`discharge_to_target` / `dt`)

Goal-based discharging to reach target SoC by end of time window.

#### Verbose Schema

```json
{
  "action": {
    "type": "discharge_to_target",
    "target_soc": 20,
    "max_power_kw": 50,
    "min_grid_power_kw": 0,
    "strategy": "equal_spread",
    "use_pid": false
  }
}
```

#### Optimized Schema

```json
{
  "a": {
    "t": "dt",
    "soc": 20,
    "maxp": 50,
    "ming": 0,
    "str": "eq"
  }
}
```

#### Fields

| Field | Verbose | Optimized | Type | Required | Default | Description |
|-------|---------|-----------|------|----------|---------|-------------|
| Type | `type` | `t` | string | ✅ | - | `"discharge_to_target"` or `"dt"` |
| Target SoC | `target_soc` | `soc` | float | ✅ | - | Target battery % (0-100) |
| Max Power | `max_power_kw` | `maxp` | float | ❌ | 999 | Max discharge power (kW) |
| Min Grid | `min_grid_power_kw` | `ming` | float | ❌ | 0 | Min grid power to maintain (kW) |
| Strategy | `strategy` | `str` | string | ❌ | `"equal_spread"` | Discharge strategy |
| PID Mode | `use_pid` | `pid` | boolean | ❌ | `false` | Use PID control |

---

## Conditions

Conditions determine **when** a rule activates. All conditions are optional. If no conditions are specified:
- Regular actions (`charge`, `discharge`, `standby`, `site_limit`): **Required** - rule won't parse
- Goal-based actions (`charge_to_target`, `discharge_to_target`): **Immediate mode** - always active

### Condition Block Structure

#### Verbose Format

```json
{
  "conditions": {
    "time": {
      "start": "HH:MM",
      "end": "HH:MM"
    },
    "soc": {
      "min": 0,
      "max": 100
    },
    "grid_power": {
      "operator": "greater_than",
      "value": 20,
      "value_max": 50
    }
  }
}
```

#### Optimized Format (Flattened)

```json
{
  "c": {
    "ts": 1400,
    "te": 1600,
    "sm": 0,
    "sx": 100,
    "gpo": "gt",
    "gpv": 20,
    "gpx": 50
  }
}
```

---

### Time Condition

Activates rule during specific time window.

#### Verbose

```json
{
  "time": {
    "start": "14:00",
    "end": "18:00"
  }
}
```

#### Optimized (Compact Integer)

```json
{
  "ts": 1400,
  "te": 1800
}
```

| Field | Verbose | Optimized | Type | Description |
|-------|---------|-----------|------|-------------|
| Start | `time.start` | `ts` | string/int | Start time ("HH:MM" or HHMM) |
| End | `time.end` | `te` | string/int | End time ("HH:MM" or HHMM) |

#### Time Format

| Format | Example | Value |
|--------|---------|-------|
| String | `"14:00"` | 2:00 PM |
| Integer | `1400` | 2:00 PM |
| String | `"09:30"` | 9:30 AM |
| Integer | `930` | 9:30 AM |

#### Overnight Spanning

```json
{
  "ts": 2200,
  "te": 600
}
```
This means: 22:00 → 06:00 (next day)

---

### SoC Condition

Activates rule when battery SoC is within range.

#### Verbose

```json
{
  "soc": {
    "min": 20,
    "max": 80
  }
}
```

#### Optimized (Flattened)

```json
{
  "sm": 20,
  "sx": 80
}
```

| Field | Verbose | Optimized | Type | Range | Description |
|-------|---------|-----------|------|-------|-------------|
| Min SoC | `soc.min` | `sm` | float | 0-100 | Minimum battery % |
| Max SoC | `soc.max` | `sx` | float | 0-100 | Maximum battery % |

#### Example Use Cases

```json
// Only discharge when battery is above 30%
{ "sm": 30, "sx": 100 }

// Only charge when battery is below 80%
{ "sm": 0, "sx": 80 }

// Active in specific range
{ "sm": 40, "sx": 60 }
```

---

### Grid Power Condition

Activates rule based on grid power measurement.

#### Verbose

```json
{
  "grid_power": {
    "operator": "greater_than",
    "value": 20,
    "value_max": 50
  }
}
```

#### Optimized (Flattened)

```json
{
  "gpo": "gt",
  "gpv": 20,
  "gpx": 50
}
```

| Field | Verbose | Optimized | Type | Description |
|-------|---------|-----------|------|-------------|
| Operator | `grid_power.operator` | `gpo` | string | Comparison operator |
| Value | `grid_power.value` | `gpv` | float | Threshold value (kW) |
| Value Max | `grid_power.value_max` | `gpx` | float | Upper bound for "between" |

#### Operators

| Operator | Verbose | Optimized | Description |
|----------|---------|-----------|-------------|
| Greater Than | `greater_than` | `gt` | Grid > value |
| Less Than | `less_than` | `lt` | Grid < value |
| Greater or Equal | `greater_than_or_equal` | `gte` | Grid ≥ value |
| Less or Equal | `less_than_or_equal` | `lte` | Grid ≤ value |
| Equal | `equal` | `eq` | Grid = value |
| Between | `between` | `bt` | value ≤ Grid ≤ value_max |

#### Example Use Cases

```json
// Discharge when importing > 20 kW
{ "gpo": "gt", "gpv": 20 }

// Charge when exporting (grid < 0)
{ "gpo": "lt", "gpv": 0 }

// Active when grid between 10-50 kW
{ "gpo": "bt", "gpv": 10, "gpx": 50 }
```

---

## Weekday Filtering

Restricts rule to specific days of the week.

### Verbose Format (Array)

```json
{
  "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri"]
}
```

### Optimized Formats

#### Named Shorthand

| Shorthand | Days | Bitmask |
|-----------|------|---------|
| `weekdays` or `wd` | Mon-Fri | 0x3E |
| `weekend` or `we` | Sat-Sun | 0x41 |
| `everyday` or `ed` or `all` | All days | 0x7F |

#### Day Range

| Range | Days | Bitmask |
|-------|------|---------|
| `mon-wed` | Mon, Tue, Wed | 0x0E |
| `thu-sat` | Thu, Fri, Sat | 0x70 |
| `fri-sun` | Fri, Sat, Sun | 0x61 |
| `sat-mon` | Sat, Sun, Mon (wrap) | 0x43 |

### Bitmask Reference

| Day | Bit | Value |
|-----|-----|-------|
| Sunday | 0 | 0x01 |
| Monday | 1 | 0x02 |
| Tuesday | 2 | 0x04 |
| Wednesday | 3 | 0x08 |
| Thursday | 4 | 0x10 |
| Friday | 5 | 0x20 |
| Saturday | 6 | 0x40 |

### Case Sensitivity

All formats are **case-insensitive**:
- `"Mon"`, `"mon"`, `"MON"` all work
- `"Mon-Fri"`, `"mon-fri"`, `"MON-FRI"` all work

### Default Behavior

If `weekdays` is omitted, rule is active **every day** (bitmask 0x7F).

---

## Shadow V2 Optimization

### Overview

Shadow V2 reduces JSON size by ~50% to fit more rules in AWS IoT Shadow's 8KB limit.

### Optimization Strategies

| Strategy | Description | Savings |
|----------|-------------|---------|
| **S2** | Weekday shorthand | ~40 bytes/rule |
| **S3** | Parameter abbreviation | ~80 bytes/rule |
| **S4** | Omit default values | ~35 bytes/rule |
| **S5** | Compact time (integer) | ~6 bytes/rule |
| **S6** | Flatten conditions | ~10 bytes/rule |

### Key Abbreviations Reference

#### Top-Level Fields

| Verbose | Optimized |
|---------|-----------|
| `rule_id` | `id` |
| `action` | `a` |
| `conditions` | `c` |
| `priority` | `p` |
| `active` | `act` |
| `weekdays` | `d` |
| `valid_from` | `vf` |
| `valid_until` | `vu` |

#### Action Fields

| Verbose | Optimized |
|---------|-----------|
| `type` | `t` |
| `power_kw` | `pw` |
| `use_pid` | `pid` |
| `high_threshold_kw` | `hth` |
| `low_threshold_kw` | `lth` |
| `target_soc` | `soc` |
| `strategy` | `str` |
| `max_power_kw` | `maxp` |
| `max_grid_power_kw` | `maxg` |
| `min_grid_power_kw` | `ming` |

#### Action Types

| Verbose | Optimized |
|---------|-----------|
| `charge` | `ch` |
| `discharge` | `dis` |
| `standby` | `sb` |
| `site_limit` | `sl` |
| `charge_to_target` | `ct` |
| `discharge_to_target` | `dt` |

#### Strategy

| Verbose | Optimized |
|---------|-----------|
| `equal_spread` | `eq` |
| `aggressive` | `agg` |
| `conservative` | `con` |

#### Operators

| Verbose | Optimized |
|---------|-----------|
| `greater_than` | `gt` |
| `less_than` | `lt` |
| `greater_than_or_equal` | `gte` |
| `less_than_or_equal` | `lte` |
| `equal` | `eq` |
| `between` | `bt` |

#### Flattened Condition Keys

| Verbose Path | Optimized |
|--------------|-----------|
| `conditions.time.start` | `ts` |
| `conditions.time.end` | `te` |
| `conditions.soc.min` | `sm` |
| `conditions.soc.max` | `sx` |
| `conditions.grid_power.operator` | `gpo` |
| `conditions.grid_power.value` | `gpv` |
| `conditions.grid_power.value_max` | `gpx` |

---

## Complete Examples

### When to Use PID

| Rule Type | PID | Reason |
|-----------|-----|--------|
| Direct charge/discharge (`50 kW`) | `false` (default) | Exact power command |
| Grid-following (threshold rules) | `true` | Smooth grid tracking |
| Site limits (P9) | N/A (uses internal PID) | Automatic |
| Goal-based (charge_to_target) | `false` (default) | Calculated power |

---

### Example 1: Grid-Following Discharge with PID

This rule uses PID because it has a `grid_power` condition - it needs to smoothly track the grid.

#### Verbose

```json
{
  "rule_id": "DISCHARGE-PEAK-EVENING",
  "action": {
    "type": "discharge",
    "power_kw": 50.0,
    "use_pid": true
  },
  "conditions": {
    "time": {
      "start": "17:00",
      "end": "21:00"
    },
    "grid_power": {
      "operator": "greater_than",
      "value": 20
    }
  },
  "priority": 7,
  "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri"]
}
```

#### Optimized

```json
{
  "id": "DISCHARGE-PEAK-EVENING",
  "a": {"t": "dis", "pw": 50.0, "pid": true},
  "c": {"ts": 1700, "te": 2100, "gpo": "gt", "gpv": 20},
  "p": 7,
  "d": "weekdays"
}
```

> **Note**: `pid: true` is required here because this rule tracks grid power (>20 kW threshold).

---

### Example 2: Goal-Based Charge (Off-Peak)

#### Verbose

```json
{
  "rule_id": "NIGHT-CHARGE-80",
  "action": {
    "type": "charge_to_target",
    "target_soc": 80,
    "max_power_kw": 25,
    "max_grid_power_kw": 50,
    "strategy": "equal_spread"
  },
  "conditions": {
    "time": {
      "start": "23:00",
      "end": "06:00"
    }
  },
  "priority": 7,
  "active": true
}
```

#### Optimized

```json
{
  "id": "NIGHT-CHARGE-80",
  "a": {"t": "ct", "soc": 80, "maxp": 25, "maxg": 50},
  "c": {"ts": 2300, "te": 600},
  "p": 7
}
```

---

### Example 3: Site Limit (P9)

#### Verbose

```json
{
  "rule_id": "SITE-LIMIT-MAIN",
  "action": {
    "type": "site_limit",
    "high_threshold_kw": 100,
    "low_threshold_kw": -50
  },
  "conditions": {},
  "priority": 9,
  "active": true
}
```

#### Optimized

```json
{
  "id": "SITE-LIMIT-MAIN",
  "a": {"t": "sl", "hth": 100, "lth": -50},
  "c": {},
  "p": 9
}
```

---

### Example 4: SoC-Based Charging (Emergency Low Battery)

Direct charge command - no PID (default behavior).

#### Verbose

```json
{
  "rule_id": "EMERGENCY-LOW-CHARGE",
  "action": {
    "type": "charge",
    "power_kw": 10
  },
  "conditions": {
    "soc": {
      "min": 0,
      "max": 10
    }
  },
  "priority": 5
}
```

#### Optimized

```json
{
  "id": "EMERGENCY-LOW-CHARGE",
  "a": {"t": "ch", "pw": 10},
  "c": {"sm": 0, "sx": 10},
  "p": 5
}
```

> **Note**: No `pid` field needed - direct control is the default.

---

### Example 5: Complex Rule with ALL Conditions (Including Validity Period)

This example shows ALL possible fields including `valid_from` and `valid_until`.

**Validity Period**: November 2025 only (Unix timestamps)
- `valid_from`: 1730419200 (Nov 1, 2025 00:00:00 UTC)
- `valid_until`: 1733011199 (Nov 30, 2025 23:59:59 UTC)

#### Verbose

```json
{
  "rule_id": "SMART-DISCHARGE-NOV25",
  "action": {
    "type": "discharge",
    "power_kw": 999,
    "use_pid": true
  },
  "conditions": {
    "time": {
      "start": "17:00",
      "end": "21:00"
    },
    "soc": {
      "min": 30,
      "max": 100
    },
    "grid_power": {
      "operator": "greater_than",
      "value": 15
    }
  },
  "priority": 6,
  "active": true,
  "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "valid_from": 1730419200,
  "valid_until": 1733011199
}
```

#### Optimized

```json
{
  "id": "SMART-DISCHARGE-NOV25",
  "a": {"t": "dis", "pw": 999, "pid": true},
  "c": {"ts": 1700, "te": 2100, "sm": 30, "sx": 100, "gpo": "gt", "gpv": 15},
  "p": 6,
  "d": "weekdays",
  "vf": 1730419200,
  "vu": 1733011199
}
```

> **Note**: This rule is ONLY active during November 2025. Before Nov 1 or after Nov 30, it will be skipped.

---

### Example 6: Weekend Different Schedule

#### Optimized

```json
{
  "id": "WEEKEND-SLOW-CHARGE",
  "a": {"t": "ch", "pw": 15, "pid": false},
  "c": {"ts": 1000, "te": 1600},
  "p": 7,
  "d": "weekend"
}
```

---

### Example 7: Specific Days (Mon-Wed)

#### Optimized

```json
{
  "id": "EARLY-WEEK-DISCHARGE",
  "a": {"t": "dis", "pw": 40},
  "c": {"ts": 1800, "te": 2000},
  "p": 7,
  "d": "mon-wed"
}
```

---

### Example 8: Immediate Goal-Based (No Conditions)

#### Optimized

```json
{
  "id": "EMERGENCY-CHARGE-NOW",
  "a": {"t": "ct", "soc": 90, "maxp": 100},
  "p": 8
}
```

Note: No `c` field = immediate mode, charges at max power until 90% SoC.

---

### Example 9: Default Standby (P1)

Every system should have this as a fallback:

#### Optimized

```json
{
  "id": "local_default_standby",
  "a": {"t": "sb", "pw": 0},
  "c": {},
  "p": 1
}
```

---

## Validation Rules

### Required Fields

| Field | Required For |
|-------|--------------|
| `id` / `rule_id` | All rules |
| `p` / `priority` | All rules |
| `a.t` / `action.type` | All rules |
| `a.pw` / `action.power_kw` | charge, discharge, standby |
| `a.hth`, `a.lth` | site_limit |
| `a.soc` / `target_soc` | charge_to_target, discharge_to_target |
| `c` / `conditions` | charge, discharge, standby (NOT goal-based) |

### Value Ranges

| Field | Range |
|-------|-------|
| `priority` | 1-11 |
| `rule_id` | 1-63 characters |
| `power_kw` | ≥ 0 |
| `target_soc` | 0-100 |
| `soc.min`, `soc.max` | 0-100 |
| `time.start`, `time.end` | 0-2359 or "00:00"-"23:59" |
| `weekdays` bitmask | 0x01-0x7F |

### Business Rules

1. **P9 only**: `site_limit` action type
2. **Weekdays default**: If omitted, active all days (0x7F)
3. **Active default**: If omitted, rule is active (`true`)
4. **Goal-based immediate**: If no conditions, operates at max power immediately
5. **Time spanning**: End < Start means overnight (e.g., 22:00-06:00)

---

## Size Optimization Reference

### Optimization Strategies Summary

| Strategy | Description | Savings |
|----------|-------------|---------|
| **S1** | Root structure abbreviation (`v`, `sch`, `p_X`) | ~80 bytes fixed |
| **S2** | Weekday shorthand | ~40 bytes/rule |
| **S3** | Parameter abbreviation | ~80 bytes/rule |
| **S4** | Omit default values | ~35 bytes/rule |
| **S5** | Compact time (integer) | ~6 bytes/rule |
| **S6** | Flatten conditions | ~10 bytes/rule |

### Size Comparison

| Rule Type | Verbose | Optimized | Savings |
|-----------|---------|-----------|---------|
| Simple charge/discharge | ~250 bytes | ~100 bytes | 60% |
| With time + weekdays | ~350 bytes | ~130 bytes | 63% |
| Goal-based with limits | ~400 bytes | ~150 bytes | 62% |
| Site limit (P9) | ~200 bytes | ~80 bytes | 60% |
| **Root structure overhead** | ~150 bytes | ~70 bytes | 53% |

### Capacity Estimates

| Format | Avg Rule Size | Root Overhead | 8KB Capacity |
|--------|---------------|---------------|--------------|
| Verbose | ~300 bytes | ~150 bytes | ~26 rules |
| Optimized | ~120 bytes | ~70 bytes | ~66 rules |

### Optimization Checklist

When creating optimized rules:

- [ ] Use abbreviated root keys (`v`, `sch`, `p_X`)
- [ ] Use abbreviated field names (`id`, `a`, `c`, `p`, `d`)
- [ ] Use abbreviated action types (`ch`, `dis`, `sb`, `sl`, `ct`, `dt`)
- [ ] Use compact time format (integer 1400 not string "14:00")
- [ ] Use flattened conditions (`ts`, `te`, `sm`, `sx`, `gpo`, `gpv`)
- [ ] Use weekday shorthand (`weekdays`, `weekend`, `mon-fri`)
- [ ] Omit `active` if true (default)
- [ ] Omit `valid_from` if 0 (default)
- [ ] Omit `valid_until` if 0 (default)
- [ ] Omit `uploaded_at` entirely
- [ ] Omit `pid` if false (default) - only include `pid: true` for threshold/grid-following rules

---

## Rule Expiration & Cleanup

### Validity Period

Rules can have optional validity periods using `valid_from` and `valid_until` (Unix timestamps):

| Field | Verbose | Optimized | Default | Behavior |
|-------|---------|-----------|---------|----------|
| Valid From | `valid_from` | `vf` | 0 (immediate) | Rule ignored before this time |
| Valid Until | `valid_until` | `vu` | 0 (permanent) | Rule ignored after this time |

### Device Behavior (Skip Only)

The device does **NOT** delete expired rules. It simply **skips** them during evaluation:

```c
// In find_best_rule_with_enhancement()
if (rule->valid_until > 0 && now > rule->valid_until) continue;  // Skip expired
```

**Why no local deletion?**
- Avoids sync conflicts with AWS IoT Shadow
- Lambda can archive before deletion
- Clean audit trail

### Cloud Cleanup (AWS Lambda - Required)

Rule cleanup **must** be handled by AWS Lambda:

| Device | Lambda |
|--------|--------|
| Skips expired rules | Deletes expired rules |
| No archiving | Archives to DynamoDB/S3 |
| No audit trail | Full audit trail |
| Rules persist in shadow | Shadow stays clean |

**Recommended Lambda Workflow**:

1. **Schedule**: Run daily via CloudWatch Events
2. **Query**: Check all device shadows for expired rules
3. **Archive**: Move expired rules to DynamoDB/S3 with metadata
4. **Delete**: Update device shadow to remove expired rules
5. **Notify**: Send SNS notification for audit trail

```python
# Example Lambda pseudocode
def cleanup_expired_rules():
    for device in get_all_devices():
        shadow = get_device_shadow(device)
        expired = find_expired_rules(shadow)
        
        if expired:
            archive_to_dynamodb(device, expired)
            remove_from_shadow(device, expired)
            send_notification(device, expired)
```

> **Note**: Local cleanup handles immediate memory management. Lambda handles long-term archiving and cloud sync.

---

## Appendix: Full schedules.json Template

### Verbose Format (Human-Readable)

```json
{
  "version": "1.2",
  "schedules": {
    "priority_1": [
      {"rule_id": "local_default_standby", "action": {"type": "standby", "power_kw": 0}, "conditions": {}, "priority": 1}
    ],
    "priority_2": [],
    "priority_3": [],
    "priority_4": [],
    "priority_5": [],
    "priority_6": [],
    "priority_7": [],
    "priority_8": [],
    "priority_9": [],
    "priority_10": [],
    "priority_11": []
  }
}
```

### Optimized Format (Shadow V2)

```json
{
  "v": "1.2",
  "sch": {
    "p_1": [
      {"id": "local_default_standby", "a": {"t": "sb", "pw": 0}, "c": {}, "p": 1}
    ],
    "p_2": [],
    "p_3": [],
    "p_4": [],
    "p_5": [],
    "p_6": [],
    "p_7": [],
    "p_8": [],
    "p_9": [],
    "p_10": [],
    "p_11": []
  }
}
```

> **Note**: Both formats are accepted by the C parser. Use optimized format for AWS IoT Shadow to maximize rule capacity.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.4.1 | 2025-11-27 | Shadow V2 optimization, day ranges |
| 1.4.0 | 2025-11-24 | Goal-based rules (charge/discharge_to_target) |
| 1.3.x | 2025-11 | Site limits, PID control |
| 1.2.x | 2025-10 | Initial schedule system |

---

**Document Maintainer**: AIESS Development Team  
**Repository**: `/apps/aiess/development/aiess-v1.2/`  
**Related Files**:
- `aiess_v1.2/src/schedule_parser.c` - C parser implementation
- `aiess_v1.2/python/shadow_v2_optimizer.py` - Python optimizer
- `aiess_v1.2/python/static/js/app.js` - JavaScript optimizer


