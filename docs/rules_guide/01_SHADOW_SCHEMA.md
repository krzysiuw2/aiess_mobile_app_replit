# AWS IoT Shadow Schema Reference

> Complete schema for the AIESS device shadow (named shadow: `schedule`).
> Version: v1.4.3 (optimized format)

---

## Shadow Architecture

```
Mobile App / Web Dashboard
    | (HTTPS POST)
AWS API Gateway (x-api-key auth)
    |
Lambda Function (schedule-manager)
    |
AWS IoT Shadow (named shadow: "schedule")
    | (MQTT, auto-sync)
AIESS Device (EMS daemon)
```

- **Named Shadow**: `schedule` (separate from device telemetry)
- **Region**: `eu-central-1`
- **Size Limit**: 8KB (8192 bytes) per shadow document
- **Format**: Optimized v1.4.2 (abbreviated keys throughout)

---

## Complete Shadow Document Structure

```json
{
  "state": {
    "desired": {
      "v": "1.2",
      "mode": "automatic",
      "safety": {
        "soc_min": 10,
        "soc_max": 90
      },
      "sch": {
        "p_4": [],
        "p_5": [],
        "p_6": [],
        "p_7": [
          {
            "id": "NIGHT-CHARGE-80",
            "s": "man",
            "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
            "c": { "ts": 2300, "te": 600 },
            "d": "weekdays"
          },
          {
            "id": "PEAK-DISCHARGE",
            "s": "ai",
            "a": { "t": "dis", "pw": 50, "pid": true },
            "c": { "ts": 1700, "te": 2100, "gpo": "gt", "gpv": 20 },
            "d": "weekdays"
          }
        ],
        "p_8": [],
        "p_9": [
          {
            "id": "SITE-LIMIT-MAIN",
            "s": "man",
            "a": { "t": "sl", "hth": 70, "lth": -40 },
            "c": {}
          }
        ]
      }
    },
    "reported": {
      "v": "1.2",
      "mode": "automatic",
      "sch": {},
      "status": "synced"
    },
    "delta": {}
  },
  "metadata": {
    "desired": {},
    "reported": {}
  },
  "version": 4275,
  "timestamp": 1736368800
}
```

---

## Root-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `state.desired` | object | Cloud's target configuration (what the device should do) |
| `state.reported` | object | What the device confirms it's doing |
| `state.delta` | object | Auto-generated difference between desired and reported |
| `metadata` | object | Timestamps for each field update |
| `version` | integer | Shadow version (increments with each update) |
| `timestamp` | integer | Unix timestamp of last update |

---

## Desired State Fields (v1.4.3)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `v` | string | Yes | `"1.2"` | Schema version |
| `mode` | string | No | `"automatic"` | Management mode: `automatic`, `semi-automatic`, `manual` |
| `safety` | object | No | `{soc_min: 5, soc_max: 100}` | SoC safety limits (see [04_SAFETY_LIMITS.md](./04_SAFETY_LIMITS.md)) |
| `sch` | object | Yes | `{}` | Schedules container with priority arrays |

### `mode` Values

| Value | Meaning |
|-------|---------|
| `"automatic"` | Full autonomous operation (AI + manual rules active) |
| `"semi-automatic"` | Assisted operation (user confirmation may be required) |
| `"manual"` | Manual control only (schedules may be disabled in UI) |

The `mode` field is for **cloud-side UI control only**. Edge devices should ignore it.

### `safety` Object

| Field | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `soc_min` | number | 0-100 | 5 | Never discharge below this % |
| `soc_max` | number | 0-100 | 100 | Never charge above this % |

Safety limits override **all** rules including P11. See [04_SAFETY_LIMITS.md](./04_SAFETY_LIMITS.md).

---

## Schedule Rule Structure (`OptimizedScheduleRule`)

Each rule inside a `p_X` array has this shape:

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Rule ID | `id` | string | Yes | -- | Unique identifier (1-63 chars) |
| Source | `s` | `'ai'` \| `'man'` | No | `'man'` | Rule source (metadata only, device ignores) |
| Action | `a` | object | Yes | -- | Action configuration (see [02_ACTION_TYPES.md](./02_ACTION_TYPES.md)) |
| Conditions | `c` | object | Semi | `{}` | When to activate (see [03_CONDITIONS_AND_SCHEDULING.md](./03_CONDITIONS_AND_SCHEDULING.md)) |
| Active | `act` | boolean | No | `true` | **Omit if true** (only include if `false`) |
| Weekdays | `d` | string \| number[] | No | All days | Day filter (see [03_CONDITIONS_AND_SCHEDULING.md](./03_CONDITIONS_AND_SCHEDULING.md)) |
| Valid From | `vf` | integer | No | 0 (immediate) | Unix timestamp, **omit if 0** |
| Valid Until | `vu` | integer | No | 0 (forever) | Unix timestamp, **omit if 0** |

**Critical**: Rules do **NOT** have a `p` (priority) field. Priority is inferred from the parent `p_X` array key.

---

## Field Mapping: Optimized to Verbose

### Root Keys

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `v` | `version` | Schema version |
| `sch` | `schedules` | Schedules container |
| `p_4` ... `p_9` | `priority_4` ... `priority_9` | Priority arrays |

### Rule Fields

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `id` | `rule_id` | Rule identifier |
| `a` | `action` | Action block |
| `c` | `conditions` | Conditions block |
| `act` | `active` | Active flag |
| `d` | `weekdays` | Day filter |
| `vf` | `valid_from` | Validity start |
| `vu` | `valid_until` | Validity end |

### Action Fields

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `t` | `type` | Action type |
| `pw` | `power_kw` | Power in kW |
| `pid` | `use_pid` | PID control flag |
| `hth` | `high_threshold_kw` | Max import (site limit) |
| `lth` | `low_threshold_kw` | Max export (site limit) |
| `soc` | `target_soc` | Target SoC % |
| `maxp` | `max_power_kw` | Max power limit |
| `maxg` | `max_grid_power_kw` | Max grid import |
| `ming` | `min_grid_power_kw` | Min grid power |
| `str` | `strategy` | Charging/discharging strategy |

### Action Types

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `ch` | `charge` | Fixed power charge |
| `dis` | `discharge` | Fixed power discharge |
| `sb` | `standby` | No power flow |
| `sl` | `site_limit` | Grid connection limits |
| `ct` | `charge_to_target` | Goal-based charge |
| `dt` | `discharge_to_target` | Goal-based discharge |

### Condition Fields

| Optimized | Verbose Path | Description |
|-----------|-------------|-------------|
| `ts` | `conditions.time.start` | Time start (HHMM integer) |
| `te` | `conditions.time.end` | Time end (HHMM integer) |
| `sm` | `conditions.soc.min` | SoC minimum % |
| `sx` | `conditions.soc.max` | SoC maximum % |
| `gpo` | `conditions.grid_power.operator` | Grid power operator |
| `gpv` | `conditions.grid_power.value` | Grid power value (kW) |
| `gpx` | `conditions.grid_power.value_max` | Grid power max (kW, for `bt`) |

### Strategy Types

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `eq` | `equal_spread` | Spread power evenly over time |
| `agg` | `aggressive` | Charge/discharge fast at start |
| `con` | `conservative` | Start slow, accelerate at end |

### Grid Operators

| Optimized | Verbose | Description |
|-----------|---------|-------------|
| `gt` | `greater_than` | Grid > value |
| `lt` | `less_than` | Grid < value |
| `gte` | `greater_than_or_equal` | Grid >= value |
| `lte` | `less_than_or_equal` | Grid <= value |
| `eq` | `equal` | Grid == value |
| `bt` | `between` | value <= Grid <= value_max |

---

## 8KB Shadow Size Limit

AWS IoT Shadow has a hard **8KB (8192 bytes)** limit per shadow document.

### Capacity Estimates

| Format | Avg Rule Size | Approx. Capacity |
|--------|---------------|-------------------|
| Verbose | ~300 bytes | ~26 rules |
| **Optimized** | **~120 bytes** | **~66 rules** |

### Size Optimization Checklist

- Use abbreviated keys (`sch`, `p_X`, `a`, `c`, `t`, `pw`, `ts`, etc.)
- **Omit `p` field** from rules (inferred from `p_X` array)
- Omit `act` when `true` (default)
- Omit `vf` when `0` (default)
- Omit `vu` when `0` (default)
- Omit `pid` when `false` (default)
- Omit `s` when `'man'` (default, metadata-only)
- Use weekday shorthand (`"weekdays"` not `["Mon","Tue","Wed","Thu","Fri"]`)
- Use HHMM integers (`1800` not `"18:00"`)
- Omit empty priority arrays

### Size Validation

Before saving, validate payload size:

```typescript
function validateShadowSize(payload: object): boolean {
  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  return size <= 7680; // 7.5KB threshold (leaves room for metadata)
}
```

---

## Version Control

Every shadow update increments the `version` number:

```
GET  → { ..., version: 4275 }
POST → Lambda updates shadow
GET  → { ..., version: 4276 }
```

Use version tracking for:
- **Conflict detection**: Know if rules changed while you were editing
- **Optimistic updates**: Show local changes immediately, verify on next GET
- **Audit trail**: Track modification history

---

## AWS IoT Shadow Merge Behavior

AWS IoT Shadow performs **recursive merging** of nested objects. This means:

- Sending `{ sch: { p_7: [...] } }` updates **only P7**, leaving other priorities untouched
- Sending `{ safety: { soc_min: 10 } }` updates **only soc_min**, leaving soc_max untouched
- To **delete** a key, set it to `null`

**Warning**: Never mix verbose (`schedules`, `priority_X`) and optimized (`sch`, `p_X`) formats in the same shadow. This creates permanent redundancy and wastes the 8KB budget.
