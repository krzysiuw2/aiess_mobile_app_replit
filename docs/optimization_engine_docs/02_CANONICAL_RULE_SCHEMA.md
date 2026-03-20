# Canonical Rule Schema Reference

> **Purpose**: The single source of truth for the schedule rule format used across ALL systems: optimization engine, Schedules API, IoT Shadow, mobile app, and edge device.
> **Format**: Compact (S3/S6) — this is the canonical wire and storage format.
> **Last Updated**: 2026-03-19

---

## 1. Root Structure

```json
{
  "v": "1.2",
  "mode": "automatic",
  "sch": {
    "p_5": [],
    "p_6": [],
    "p_7": [],
    "p_8": [],
    "p_9": []
  }
}
```

| Key | Full Name | Type | Required | Description |
|-----|-----------|------|----------|-------------|
| `v` | `version` | string | Yes | Schema version, e.g. `"1.2"` |
| `mode` | — | string | No | `"automatic"` / `"semi-automatic"` / `"manual"`. Cloud-side only, edge ignores. Default: `"automatic"` |
| `safety` | — | object | No | `{ "soc_min": 10, "soc_max": 90 }`. Hot-reloadable SoC limits. |
| `sch` | `schedules` | object | Yes | Container for priority arrays |
| `p_X` | `priority_X` | array | No | Array of rules at priority X (1-11) |

---

## 2. Rule Structure

```json
{
  "id": "RULE-ID",
  "s": "ai",
  "a": { ... },
  "c": { ... },
  "d": [1, 2, 3, 4, 5],
  "act": true,
  "vf": 0,
  "vu": 0,
  "ua": 0
}
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `id` | `rule_id` | string (1-63 chars) | Yes | — | Unique rule identifier |
| `s` | `source` | string | No | — | `"ai"` for AI-generated, `"man"` for manual. Metadata only. |
| `a` | `action` | object | Yes | — | What to do when conditions match |
| `c` | `conditions` | object | Yes | `{}` | When to activate (AND logic). Empty = always active. |
| `d` | `weekdays` | various | No | all days | Day filter (see Weekday Formats below) |
| `act` | `active` | boolean | No | `true` | `false` = disabled/draft. Omit when `true`. |
| `vf` | `valid_from` | integer (unix) | No | `0` | Rule becomes active at this timestamp. `0` = immediately. |
| `vu` | `valid_until` | integer (unix) | **Mandatory for cloud rules** | `0` | Rule expires at this timestamp. `0` = never. Cloud rules (P5-P8) from the optimization engine MUST set this. |
| `ua` | `uploaded_at` | integer (unix) | No | `0` | When rule was uploaded. Used for tie-breaking (newest wins at same priority). |

### Priority Assignment

The `p` (priority) field is NOT included in the rule object. Priority is implicit from the array the rule belongs to:

```json
{ "sch": { "p_7": [ { "id": "MY-RULE", ... } ] } }
```

This rule is priority 7 because it's in the `p_7` array.

---

## 3. Action Object

### 3.1 Charge (`ch`)

Fixed-power charge command.

```json
{ "a": { "t": "ch", "pw": 50, "pid": true } }
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"ch"` (or `"charge"`) |
| `pw` | `power_kw` | number (>=0) | Yes | — | Target charge power in kW |
| `pid` | `use_pid` | boolean | No | `true` | Use PID smoothing. Recommended `true` for all rules. |

### 3.2 Discharge (`dis`)

Fixed-power discharge command.

```json
{ "a": { "t": "dis", "pw": 50, "pid": true } }
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"dis"` (or `"discharge"`) |
| `pw` | `power_kw` | number (>=0) | Yes | — | Target discharge power in kW |
| `pid` | `use_pid` | boolean | No | `true` | Use PID smoothing |

### 3.3 Standby (`sb`)

Stop all charge/discharge.

```json
{ "a": { "t": "sb", "pw": 0 } }
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"sb"` (or `"standby"`) |
| `pw` | `power_kw` | number | No | `0` | Always 0 for standby |
| `pid` | `use_pid` | boolean | No | `false` | N/A for standby |

### 3.4 Site Limit (`sl`)

Dual-mode grid threshold (P9 only). Set by user/installer via mobile app.

```json
{ "a": { "t": "sl", "hth": 70, "lth": -40 } }
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"sl"` (or `"site_limit"`) |
| `hth` | `high_threshold_kw` | number | Yes | — | Max grid import (kW). Grid never exceeds this. |
| `lth` | `low_threshold_kw` | number | Yes | — | Min grid power (kW). Negative = max export allowed. e.g. `-40` means allow up to 40 kW export. |

**Dual-mode behavior:**
- **Passive capping**: All P1-P8 rules are capped so grid stays within `lth` to `hth`.
- **Active PID**: When no P1-P8 rule matches AND grid is outside thresholds, P9 generates a PID-controlled charge (grid < lth) or discharge (grid > hth).

**Note**: The optimization engine does NOT generate `site_limit` rules. These are configured by the user/installer via the mobile app.

### 3.5 Charge to Target (`ct`)

Goal-based charge to a target SoC percentage.

```json
{
  "a": {
    "t": "ct",
    "soc": 80,
    "str": "eq",
    "maxp": 50,
    "maxg": 150,
    "ming": -999999
  }
}
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"ct"` (or `"charge_to_target"`) |
| `soc` | `target_soc` | number (0-100) | Yes | — | Target SoC percentage |
| `str` | `strategy` | string | No | `"eq"` | `"eq"` (equal_spread), `"agg"` (aggressive/front-loaded), `"con"` (conservative/back-loaded) |
| `maxp` | `max_power_kw` | number | No | device max | Maximum charge power. The engine dynamically adjusts actual power below this. |
| `pw` | `power_kw` | number | No | — | If provided, used as power (not dynamically calculated). Useful for immediate mode without time conditions. |
| `pid` | `use_pid` | boolean | No | `false` | Default `false` for goal-based (direct control for fast response). Set `true` for PID smoothing. |
| `maxg` | `max_grid_power_kw` | number | No | `999999` | Max grid import during charge. Prevents adding to peak load. |
| `ming` | `min_grid_power_kw` | number | No | `-FLT_MAX` | NOT typically used for charge actions. |

**How it works at runtime**: Each second, the schedule engine calls `calculate_dynamic_power()`:

1. Compute `energy_delta = (target_soc - current_soc) / 100 * battery_capacity_kwh`
2. Compute `hours_remaining` from current time to rule's time end condition
3. Compute `required_power = energy_delta / hours_remaining`
4. Apply strategy multiplier:
   - `equal_spread`: 1.0 (constant power)
   - `aggressive`: 1.5 at start → 0.5 at end (front-loaded)
   - `conservative`: 0.5 at start → 1.5 at end (back-loaded)
5. Clamp to `maxp`
6. If `current_soc >= target_soc`: return 0 (target reached, fall through to lower priority)

### 3.6 Discharge to Target (`dt`)

Goal-based discharge to a target SoC percentage.

```json
{
  "a": {
    "t": "dt",
    "soc": 40,
    "str": "eq",
    "maxp": 50,
    "ming": 10
  }
}
```

| Key | Full Name | Type | Required | Default | Description |
|-----|-----------|------|----------|---------|-------------|
| `t` | `type` | string | Yes | — | `"dt"` (or `"discharge_to_target"`) |
| `soc` | `target_soc` | number (0-100) | Yes | — | Target SoC percentage |
| `str` | `strategy` | string | No | `"eq"` | Same as `ct` |
| `maxp` | `max_power_kw` | number | No | device max | Maximum discharge power |
| `pw` | `power_kw` | number | No | — | Fixed power override (skips dynamic calculation) |
| `pid` | `use_pid` | boolean | No | `false` | Same as `ct` |
| `ming` | `min_grid_power_kw` | number | No | `-FLT_MAX` | **Critical for discharge**: minimum grid power during discharge. `ming: 10` means grid import never drops below 10 kW (prevents unwanted export from discharge). `ming: -20` means allow up to 20 kW export. |
| `maxg` | `max_grid_power_kw` | number | No | `999999` | NOT typically used for discharge actions. |

**`ming` is the key safety parameter for discharge rules.** Without it, discharging can push the grid negative (exporting), which may violate grid agreements. Production rules use `ming: 10` to `ming: 20` to maintain minimum import.

---

## 4. Condition Object

All conditions are ANDed. If multiple conditions are specified, ALL must be true for the rule to activate.

### 4.1 Time Condition

```json
{ "c": { "ts": 600, "te": 2100 } }
```

| Key | Full Name | Type | Description |
|-----|-----------|------|-------------|
| `ts` | time start | integer (HHMM) or string ("HH:MM") | Start time in 24h format |
| `te` | time end | integer (HHMM) or string ("HH:MM") | End time in 24h format |

**Overnight support**: If `ts > te` (e.g., `ts: 2300, te: 600`), the rule spans midnight.

**Integer format**: `600` = 06:00, `1400` = 14:00, `2100` = 21:00. Preferred for compact format.

### 4.2 SoC Condition

```json
{ "c": { "sm": 10, "sx": 80 } }
```

| Key | Full Name | Type | Range | Description |
|-----|-----------|------|-------|-------------|
| `sm` | soc_min | number | 0-100 | Minimum SoC for rule to activate |
| `sx` | soc_max | number | 0-100 | Maximum SoC for rule to activate |

Rule activates when `sm <= current_soc <= sx`.

### 4.3 Grid Power Condition

```json
{ "c": { "gpo": "lt", "gpv": 0 } }
```

| Key | Full Name | Type | Description |
|-----|-----------|------|-------------|
| `gpo` | grid power operator | string | Comparison operator |
| `gpv` | grid power value | number (kW) | Threshold value |
| `gpx` | grid power value_max | number (kW) | Upper bound for `bt` (between) |

**Operators:**

| Abbrev | Full | Meaning | Example |
|--------|------|---------|---------|
| `gt` | `greater_than` | grid > value | `gpo: "gt", gpv: 70` → grid > 70 kW |
| `lt` | `less_than` | grid < value | `gpo: "lt", gpv: 0` → grid < 0 kW (exporting) |
| `gte` | `greater_than_or_equal` | grid >= value | |
| `lte` | `less_than_or_equal` | grid <= value | |
| `bt` | `between` | value <= grid <= value_max | `gpo: "bt", gpv: -10, gpx: 50` |

**Grid power uses 30-second average** (compensated grid = measured_grid + pcs_power). This prevents the PID from triggering on its own battery feedback.

### 4.4 Combined Conditions

All conditions are ANDed:

```json
{
  "c": {
    "ts": 600, "te": 2100,
    "sm": 10, "sx": 80,
    "gpo": "lt", "gpv": 0
  }
}
```

This rule activates when: time is 06:00-21:00 AND SoC is 10-80% AND grid < 0 kW.

### 4.5 Empty Conditions

```json
{ "c": {} }
```

An empty condition object means the rule is **always active** (no conditions to check). Used for P9 site limits and P1 default standby.

---

## 5. Weekday Formats

The `d` field supports multiple formats for flexibility:

| Format | Example | Meaning |
|--------|---------|---------|
| Number array | `[1, 2, 3, 4, 5]` | Mon-Fri (0=Sun, 1=Mon, ..., 6=Sat) |
| String array | `["Mon", "Tue", "Fri"]` | Case-insensitive |
| Shorthand | `"wkd"` or `"weekdays"` | Mon-Fri |
| Shorthand | `"we"` or `"weekend"` | Sat-Sun |
| Shorthand | `"ed"` or `"everyday"` or `"all"` | All days |
| Range | `"mon-fri"` | Monday through Friday |
| Range | `"sat-sun"` | Saturday and Sunday |
| Omitted | (field absent) | All days (same as `"ed"`) |

**Recommended**: Use number arrays `[0-6]` for optimization engine output (compact, unambiguous).

---

## 6. Conditions vs Action Parameters: Grid Constraints

This is a common source of confusion. There are two separate grid-related concepts:

### Condition: `gpo`/`gpv` — "When should this rule activate?"

```json
{ "c": { "gpo": "lt", "gpv": 0 } }
```

This is a **trigger condition**. The rule only activates when grid power is below 0 kW. If grid goes above 0, the rule deactivates and the engine evaluates lower priorities.

### Action: `ming`/`maxg` — "What grid limits apply while this rule is executing?"

```json
{ "a": { "t": "dt", "soc": 40, "maxp": 50, "ming": 10 } }
```

This is an **execution constraint**. While this discharge rule is active, the schedule engine ensures grid power never drops below 10 kW. If discharging would push grid below 10 kW, the discharge power is reduced or blocked.

### Key difference

- **Condition** (`gpo`/`gpv`): Controls whether the rule matches at all. Binary: yes/no.
- **Action constraint** (`ming`/`maxg`): Controls power level after the rule has matched. Continuous: adjusts power.

### Example: PV surplus capture with grid export limit

```json
{
  "id": "PV-SURPLUS",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "gpo": "lt", "gpv": -5 }
}
```

- **Condition**: Activate when grid < -5 kW (exporting more than 5 kW)
- **Action**: Charge at up to 50 kW with PID
- **P9 capping**: P9 `lth: -40` ensures grid never goes below -40 kW, so battery only absorbs the excess above 40 kW export

No `maxg` needed here because the PID controller + P9 capping handles the grid limit automatically.

---

## 7. Production Examples with Annotations

These are the rules currently running on the production edge device, annotated for documentation.

### Complete `schedules.json`

```json
{
  "v": "1.2",
  "sch": {
    "p_7": [
      {
        "id": "LAD-50",
        "a": { "t": "ch", "pw": 50, "pid": true },
        "c": { "ts": 500, "te": 2100, "gpo": "lt", "gpv": 0 },
        "d": [1, 2, 3, 4, 5]
      },
      {
        "id": "LAD-50-WKND",
        "a": { "t": "ch", "pw": 50, "pid": true },
        "c": { "gpo": "lt", "gpv": -5 },
        "d": [0, 6]
      },
      {
        "id": "WEEKLY-DIS",
        "a": { "t": "dt", "soc": 40, "str": "eq", "maxp": 50, "ming": 20 },
        "c": { "ts": 600, "te": 1100 },
        "d": [1, 2, 3, 4, 5]
      },
      {
        "id": "WEEKLY-DIS-EV",
        "a": { "t": "dt", "soc": 40, "str": "eq", "maxp": 50, "ming": 10 },
        "c": { "ts": 1400, "te": 2100 },
        "d": [1, 2, 3, 4]
      },
      {
        "id": "RDC-2-ALLDAY",
        "a": { "t": "dt", "soc": 2, "str": "eq", "maxp": 50, "ming": 10 },
        "c": { "ts": 1400, "te": 2100 },
        "d": [5]
      },
      {
        "id": "WEEKND-DIS",
        "a": { "t": "dis", "pw": 20, "pid": true },
        "c": { "gpo": "gt", "gpv": 2 },
        "act": false
      }
    ],
    "p_9": [
      {
        "id": "R1",
        "a": { "t": "sl", "hth": 70, "lth": -40 },
        "c": {}
      }
    ]
  }
}
```

### Rule-by-Rule Breakdown

| Rule ID | Priority | Intent | Days | When | Action | Grid Safety |
|---------|----------|--------|------|------|--------|-------------|
| `R1` | P9 | Grid protection | All | Always | Site limit: import <=70, export <=40 | Passive capping + active PID |
| `LAD-50` | P7 | PV surplus capture | Mon-Fri | 05:00-21:00, grid < 0 | Charge 50 kW (PID) | P9 caps at -40 kW |
| `LAD-50-WKND` | P7 | PV surplus capture | Sat-Sun | Always, grid < -5 | Charge 50 kW (PID) | P9 caps at -40 kW |
| `WEEKLY-DIS` | P7 | Morning arbitrage | Mon-Fri | 06:00-11:00 | Discharge to 40% SoC | min grid 20 kW |
| `WEEKLY-DIS-EV` | P7 | Evening arbitrage | Mon-Thu | 14:00-21:00 | Discharge to 40% SoC | min grid 10 kW |
| `RDC-2-ALLDAY` | P7 | Friday empty battery | Fri | 14:00-21:00 | Discharge to 2% SoC | min grid 10 kW |
| `WEEKND-DIS` | P7 | Weekend discharge | (inactive) | Grid > 2 kW | Discharge 20 kW | — |

---

## 8. Rules the Optimization Engine Generates

The optimization engine generates rules for **P6, P7, and P8 only**. The intent-to-priority mapping is configurable per site (see `06_PRIORITY_AND_FALLBACK.md`), with defaults:

| Intent | Default Priority | Description |
|--------|-----------------|-------------|
| `peak_shaving` | P8 | Discharge when grid approaches moc_zamowiona |
| `arbitrage` | P7 | Charge cheap / discharge expensive based on TGE prices |
| `pv_optimization` | P6 | Capture PV surplus, weekend multi-day planning |

### Example: Optimization Engine Output for a Weekday

```json
{
  "sch": {
    "p_8": [
      {
        "id": "opt-ps-1",
        "s": "ai",
        "a": { "t": "dis", "pw": 50, "pid": true },
        "c": { "gpo": "gt", "gpv": 65, "sm": 15, "sx": 95 },
        "vu": 1742511600
      }
    ],
    "p_7": [
      {
        "id": "opt-arb-c1",
        "s": "ai",
        "a": { "t": "ct", "soc": 75, "str": "eq", "maxp": 50, "maxg": 65 },
        "c": { "ts": 200, "te": 600 },
        "d": "wkd",
        "vu": 1742511600
      },
      {
        "id": "opt-arb-d1",
        "s": "ai",
        "a": { "t": "dt", "soc": 30, "str": "eq", "maxp": 50, "ming": 10 },
        "c": { "ts": 1700, "te": 2100 },
        "d": "wkd",
        "vu": 1742511600
      }
    ],
    "p_6": [
      {
        "id": "opt-pv-1",
        "s": "ai",
        "a": { "t": "ch", "pw": 50, "pid": true },
        "c": { "gpo": "lt", "gpv": -2, "sm": 5, "sx": 90 },
        "d": "wkd",
        "vu": 1742511600
      }
    ]
  }
}
```

**Key observations:**

- Every rule has `vu` (valid_until) — mandatory for cloud rules
- Every rule has `s: "ai"` — source tag for tracking
- Peak shaving at P8 (highest operational priority) — always active, defensive
- Arbitrage at P7 — charge at night, discharge in evening
- PV surplus at P6 — catch any surplus not predicted by forecast
- All discharge rules have `ming` — prevent unwanted export
- Charge-to-target has `maxg: 65` — don't exceed P9 high threshold minus safety margin during charge

---

## 9. Abbreviation Quick Reference

### Root Level

| Compact | Full | Type |
|---------|------|------|
| `v` | `version` | string |
| `sch` | `schedules` | object |
| `p_X` | `priority_X` | array |

### Rule Level

| Compact | Full | Type |
|---------|------|------|
| `id` | `rule_id` | string |
| `s` | `source` | string |
| `a` | `action` | object |
| `c` | `conditions` | object |
| `d` | `weekdays` | various |
| `act` | `active` | boolean |
| `vf` | `valid_from` | integer |
| `vu` | `valid_until` | integer |
| `ua` | `uploaded_at` | integer |

### Action Fields

| Compact | Full | Type |
|---------|------|------|
| `t` | `type` | string |
| `pw` | `power_kw` | number |
| `pid` | `use_pid` | boolean |
| `hth` | `high_threshold_kw` | number |
| `lth` | `low_threshold_kw` | number |
| `soc` | `target_soc` | number |
| `str` | `strategy` | string |
| `maxp` | `max_power_kw` | number |
| `maxg` | `max_grid_power_kw` | number |
| `ming` | `min_grid_power_kw` | number |

### Action Types

| Compact | Full |
|---------|------|
| `ch` | `charge` |
| `dis` | `discharge` |
| `sb` | `standby` |
| `sl` | `site_limit` |
| `ct` | `charge_to_target` |
| `dt` | `discharge_to_target` |

### Strategies

| Compact | Full | Behavior |
|---------|------|----------|
| `eq` | `equal_spread` | Constant power throughout window |
| `agg` | `aggressive` | Front-loaded: 1.5x at start → 0.5x at end |
| `con` | `conservative` | Back-loaded: 0.5x at start → 1.5x at end |

### Grid Operators

| Compact | Full |
|---------|------|
| `gt` | `greater_than` |
| `lt` | `less_than` |
| `gte` | `greater_than_or_equal` |
| `lte` | `less_than_or_equal` |
| `bt` | `between` |

### Condition Fields (Flattened S6)

| Compact | Full Path | Type |
|---------|-----------|------|
| `ts` | `time.start` | integer (HHMM) or string ("HH:MM") |
| `te` | `time.end` | integer (HHMM) or string ("HH:MM") |
| `sm` | `soc.min` | number (0-100) |
| `sx` | `soc.max` | number (0-100) |
| `gpo` | `grid_power.operator` | string |
| `gpv` | `grid_power.value` | number (kW) |
| `gpx` | `grid_power.value_max` | number (kW) |
