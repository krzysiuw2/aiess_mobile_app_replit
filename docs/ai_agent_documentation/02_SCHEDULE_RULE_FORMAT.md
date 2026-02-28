# AIESS Energy Core — Schedule Rule Format (v1.4.4)

This document describes the complete v1.4.4 optimized rule format used by the AIESS battery energy storage system. Rules are stored in the AWS IoT Device Shadow (named shadow: `schedule`) and control battery charging/discharging behavior.

---

## Rule Structure

```json
{
  "id": "AI-CHARGE-NIGHT",
  "s": "ai",
  "a": { "t": "ch", "pw": 50 },
  "c": { "ts": 2200, "te": 600 },
  "d": "wd",
  "vf": 1707480000,
  "vu": 1707566400
}
```

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier, 1-63 characters (e.g., `"AI-CHARGE-NIGHT"`, `"SHAVE-SURPLUS"`) |
| `s` | string | Auto | Source: `"ai"` (AI-created) or `"man"` (manual). AI agent always uses `"ai"` — set automatically by the backend |
| `a` | object | Yes | Action definition (what to do) |
| `c` | object | Yes | Conditions (when to activate) |
| `d` | varies | No | Day filter (weekdays, weekend, or specific days) |
| `vf` | integer | No | Valid-from Unix timestamp. Rule is inactive before this time |
| `vu` | integer | No | Valid-until Unix timestamp. Rule auto-expires after this time |

---

## Action Types (field `a`)

### `ch` — Charge (Fixed Power)

Charge the battery at a constant power level.

```json
{"t": "ch", "pw": 50}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | `"ch"` |
| `pw` | number | Power in kW |

### `dis` — Discharge (Fixed Power)

Discharge the battery at a constant power level.

```json
{"t": "dis", "pw": 30}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | `"dis"` |
| `pw` | number | Power in kW |
| `pid` | boolean | Optional. Enable PID controller for grid-following (smooth dynamic adjustment) |

### `sb` — Standby

Put battery in standby mode (zero power).

```json
{"t": "sb", "pw": 0}
```

### `sl` — Site Limit (P9 only)

Hard grid connection limit. Only allowed at priority P9. Used for protecting the grid connection, not for operational optimization.

```json
{"t": "sl", "hth": 70, "lth": -40}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | `"sl"` |
| `hth` | number | High threshold (kW) — max grid import |
| `lth` | number | Low threshold (kW) — max grid export (negative) |

### `ct` — Charge to Target (Goal-Based)

Charge battery to a target SoC percentage. The device calculates optimal power automatically.

```json
{"t": "ct", "soc": 80, "maxp": 125, "str": "eq"}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | `"ct"` |
| `soc` | number | Target SoC percentage |
| `maxp` | number | Maximum charge power (kW, safety limit) |
| `maxg` | number | Optional. Maximum grid import (kW) to prevent overloading |
| `str` | string | Strategy: `"eq"` (equal spread, default), `"agg"` (aggressive), `"con"` (conservative) |

### `dt` — Discharge to Target (Goal-Based)

Discharge battery to a target SoC percentage.

```json
{"t": "dt", "soc": 20, "maxp": 50, "ming": 10, "str": "eq"}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | `"dt"` |
| `soc` | number | Target SoC percentage |
| `maxp` | number | Maximum discharge power (kW) |
| `ming` | number | Minimum grid import (kW). Prevents grid export during discharge. **Always include for dt** (default: 10 kW) |
| `str` | string | Strategy: `"eq"` (equal spread, default), `"agg"` (aggressive), `"con"` (conservative) |

### Strategy Field (`str`)

| Value | Behavior | When to use |
|-------|----------|-------------|
| `"eq"` | Equal spread — device calculates constant power to reach target by deadline. **Default, preferred.** | Most cases. User says "naładuj do 80% do 20:00" |
| `"agg"` | Aggressive — max power immediately, stops when target reached | Urgent requests |
| `"con"` | Conservative — starts slow, ramps up toward deadline | When grid impact should be minimized |

**Key**: For `eq` strategy with a time window, the device calculates: `power = energy_needed / time_remaining`. The AI agent should NOT estimate this — just say "magazyn sam przeliczy optymalną moc."

---

## Conditions (field `c`)

### Time Window

```json
{"ts": 1700, "te": 2100}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | integer | Start time as HHMM integer (e.g., `1700` = 17:00) |
| `te` | integer | End time as HHMM integer (e.g., `2100` = 21:00) |

**CRITICAL**: Goal-based actions (`ct`, `dt`) MUST always include both `ts` and `te`. The device needs `ts` to know when to start calculating power. For "do it now" requests, set `ts` to the current time or 1 minute earlier.

### SoC Range

```json
{"sm": 20, "sx": 80}
```

| Field | Type | Description |
|-------|------|-------------|
| `sm` | integer | Minimum SoC % (rule activates only when SoC >= this) |
| `sx` | integer | Maximum SoC % (rule activates only when SoC <= this) |

### Grid Power Condition

```json
{"gpo": "gt", "gpv": 30}
```

| Field | Type | Description |
|-------|------|-------------|
| `gpo` | string | Operator: `gt`, `lt`, `gte`, `lte`, `eq`, `bt` (between) |
| `gpv` | number | Grid power threshold (kW) |
| `gpx` | number | Upper bound (only for `bt` operator) |

### Combined Conditions

Multiple conditions are combined with AND logic:

```json
{
  "ts": 800, "te": 2200,
  "sm": 40,
  "gpo": "gt", "gpv": 30
}
```

This means: active when time is 08:00–22:00 AND SoC >= 40% AND grid power > 30 kW.

### Critical Distinction: Conditions vs Constraints

| Concept | Location | Behavior | Use for |
|---------|----------|----------|---------|
| Grid **conditions** (`gpo`/`gpv` in `c`) | `c` object | Binary on/off — rule activates/deactivates | Fixed power actions (`ch`, `dis`) |
| Grid **constraints** (`maxg`/`ming` in `a`) | `a` object | Dynamic power adjustment | Goal-based actions (`ct`, `dt`) |

**NEVER put grid conditions in `c` for goal-based actions.** Use `ming`/`maxg` in the action instead.

---

## Priority Levels

Rules are evaluated in priority order. Higher priority wins when multiple rules match.

| Priority | Name | Access | Purpose |
|----------|------|--------|---------|
| P11 | Safety Limits | Read-only | SoC min/max enforcement |
| P10 | System Reserved | Read-only | System-level protection |
| P9 | Site Limit | AI writable | Grid connection hard limits (`sl` action only) |
| P8 | Cloud High | AI writable | Urgent commands, peak shaving with PID |
| P7 | Cloud Normal | AI writable | Standard schedules (**default priority**) |
| P6 | Cloud Low | AI writable | Background optimization |
| P5 | Cloud Baseline | AI writable | Fallback rules |
| P4 | Cloud Reserved | AI writable | Future use |
| P3 | Local High | Read-only | Edge device rules |
| P2 | Local Normal | Read-only | Edge device rules |
| P1 | Local Default | Read-only | Device default standby |

**AI can only write to P4–P9.** P1–P3 and P10–P11 are read-only.

### Priority Usage Patterns

- **P9**: Hard site limits only (e.g., 80 kW connection limit). Never for operational optimization.
- **P8**: Peak shaving with `pid: true`, urgent one-time commands, grid threshold management.
- **P7**: Standard daily schedules, charge/discharge routines. This is the **default**.
- **P6**: Low-priority background optimization (e.g., nighttime preparation).
- **P5**: Fallback rules that apply when nothing else matches.

---

## Day Filters (field `d`)

| Value | Meaning |
|-------|---------|
| (omitted) | Every day |
| `"wd"` | Weekdays only (Mon–Fri) |
| `"we"` | Weekend only (Sat–Sun) |
| `["Mon", "Tue", "Wed"]` | Specific days |

---

## Validity Windows

| Field | Type | Description |
|-------|------|-------------|
| `vf` | integer | Valid-from Unix timestamp — rule inactive before this time |
| `vu` | integer | Valid-until Unix timestamp — rule auto-expires after this |

When `vu` is set, an EventBridge one-time scheduler is created to automatically clean up the expired rule from the shadow after expiry.

---

## Shadow Structure

Rules are stored in the IoT Device Shadow under the `desired` section:

```json
{
  "desired": {
    "sch": {
      "p_4": [],
      "p_5": [],
      "p_6": [],
      "p_7": [
        {"id": "AI-CHARGE-NIGHT", "a": {"t": "ch", "pw": 50}, "c": {"ts": 2200, "te": 600}, "s": "ai"}
      ],
      "p_8": [
        {"id": "SHAVE-SURPLUS", "a": {"t": "dis", "pw": 40, "pid": true}, "c": {"gpo": "gt", "gpv": 30, "sm": 40}, "s": "ai"}
      ],
      "p_9": [
        {"id": "SITE-LIMIT-80KW", "a": {"t": "sl", "hth": 80, "lth": -40}, "c": {}, "s": "man"}
      ]
    },
    "mode": "automatic",
    "safety": {"soc_min": 5, "soc_max": 100}
  }
}
```

---

## Natural Language → Rule Examples

### "Naładuj baterię do 80% do godziny 20:00"

```json
{
  "priority": 7,
  "rule": {
    "id": "AI-CT-80-BY-2000",
    "a": {"t": "ct", "soc": 80, "maxp": 125, "str": "eq"},
    "c": {"ts": 1430, "te": 2000}
  }
}
```

### "Utrzymaj pobór poniżej 30 kW w godzinach szczytu"

```json
{
  "priority": 8,
  "rule": {
    "id": "AI-SHAVE-30KW",
    "a": {"t": "dis", "pw": 40, "pid": true},
    "c": {"ts": 800, "te": 2200, "gpo": "gt", "gpv": 30, "sm": 40},
    "d": "wd"
  }
}
```

### "Rozładuj do 20% do końca dnia"

```json
{
  "priority": 7,
  "rule": {
    "id": "AI-DT-20-EOD",
    "a": {"t": "dt", "soc": 20, "maxp": 50, "ming": 10, "str": "eq"},
    "c": {"ts": 1430, "te": 2359}
  }
}
```

### "Nie pozwól żeby sieć przekroczyła 80 kW" (hard limit)

```json
{
  "priority": 9,
  "rule": {
    "id": "SITE-LIMIT-80KW",
    "a": {"t": "sl", "hth": 80, "lth": -40},
    "c": {}
  }
}
```

### "Włącz standby"

```json
{
  "priority": 8,
  "rule": {
    "id": "AI-STANDBY-NOW",
    "a": {"t": "sb", "pw": 0},
    "c": {}
  }
}
```

---

## Peak Shaving Pattern (Important)

When the user asks to "keep grid below X kW" or similar operational threshold:

**Use P8 discharge with PID**, NOT P9 site_limit:

```json
{
  "priority": 8,
  "rule": {
    "id": "AI-PEAK-SHAVE",
    "a": {"t": "dis", "pw": 50, "pid": true},
    "c": {"gpo": "gt", "gpv": 30, "sm": 40}
  }
}
```

P9 site_limit (`sl`) is reserved for **hard contractual grid connection limits** only — not for operational optimization or soft thresholds.

---

## EventBridge Auto-Cleanup

When a rule has a `vu` (valid_until) timestamp, the `aiess-update-schedules` Lambda automatically creates a one-time EventBridge Scheduler event that fires at the `vu` time to:

1. Re-read the shadow
2. Remove the expired rule
3. Update the shadow with remaining rules

This ensures expired rules are cleaned up even if the edge device doesn't explicitly remove them.
