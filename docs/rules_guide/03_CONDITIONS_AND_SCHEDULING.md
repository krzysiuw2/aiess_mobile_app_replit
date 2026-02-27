# Conditions and Scheduling Reference

> How to control WHEN a rule activates: time windows, SoC thresholds, grid power triggers, weekdays, and validity periods.

---

## Overview

Conditions determine **when** a rule activates. They live inside the `c` (conditions) block. All conditions are optional and use AND logic -- **all** specified conditions must be true for the rule to activate.

```json
{
  "id": "EXAMPLE",
  "a": { "t": "ch", "pw": 30 },
  "c": {
    "ts": 800,      // Time start: 08:00
    "te": 1800,     // Time end: 18:00
    "sm": 20,       // Only if SoC > 20%
    "sx": 80        // Only if SoC < 80%
  },
  "d": "weekdays"   // Weekdays filter (at RULE level, not inside c)
}
```

**Rule-level fields** (NOT inside `c`):
- `d` -- weekday filter
- `vf`, `vu` -- validity period
- `act` -- active flag
- `s` -- source metadata

---

## Conditions Block (`c`)

### Fields

| Field | Key | Type | Description |
|-------|-----|------|-------------|
| Time Start | `ts` | integer | Start time in HHMM format |
| Time End | `te` | integer | End time in HHMM format |
| SoC Min | `sm` | number | Minimum battery SoC % (0-100) |
| SoC Max | `sx` | number | Maximum battery SoC % (0-100) |
| Grid Power Operator | `gpo` | string | Comparison operator |
| Grid Power Value | `gpv` | number | Threshold value in kW |
| Grid Power Max | `gpx` | number | Upper bound for `bt` (between) |

### Empty Conditions

```json
{ "c": {} }
```

Empty conditions `{}` means the rule is **always active** (or immediate mode for goal-based actions).

---

## Time Condition

### Format

Time uses **HHMM integer format**:

| Time | HHMM Integer | Notes |
|------|-------------|-------|
| 00:00 | `0` | Midnight |
| 06:00 | `600` | |
| 08:30 | `830` | |
| 14:00 | `1400` | |
| 18:00 | `1800` | |
| 23:59 | `2359` | |

### Basic Usage

```json
{
  "c": {
    "ts": 800,     // 08:00
    "te": 1800     // 18:00
  }
}
```

Rule is active from 08:00 to 18:00.

### Overnight Spanning

When `te < ts`, the time window wraps to the next day:

```json
{
  "c": {
    "ts": 2200,    // 22:00
    "te": 600      // 06:00 (next day)
  }
}
```

Rule is active from 22:00 to 06:00 next day.

### Time Conversion Helpers

```typescript
// HHMM integer → "HH:MM" string
function formatTime(hhmm: number): string {
  const hours = Math.floor(hhmm / 100);
  const minutes = hhmm % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// "HH:MM" string → HHMM integer
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 100 + minutes;
}
```

---

## SoC Condition

Activates rule when battery State of Charge is within range.

### Fields

| Field | Key | Range | Description |
|-------|-----|-------|-------------|
| SoC Min | `sm` | 0-100 | Rule active when SoC >= this value |
| SoC Max | `sx` | 0-100 | Rule active when SoC <= this value |

### Examples

```json
// Only discharge when battery is above 30%
{ "c": { "sm": 30, "sx": 100 } }

// Only charge when battery is below 80%
{ "c": { "sm": 0, "sx": 80 } }

// Active only between 40-60% SoC
{ "c": { "sm": 40, "sx": 60 } }
```

---

## Grid Power Condition

Activates rule based on grid power measurement. Positive = importing from grid, negative = exporting.

**Important**: This is a binary on/off trigger. For dynamic power adjustment in goal-based rules, use action parameters (`maxg`/`ming`) instead. See [02_ACTION_TYPES.md](./02_ACTION_TYPES.md#conditions-vs-action-parameters).

### Operators

| Code | Verbose | Description |
|------|---------|-------------|
| `gt` | `greater_than` | Grid > `gpv` |
| `lt` | `less_than` | Grid < `gpv` |
| `gte` | `greater_than_or_equal` | Grid >= `gpv` |
| `lte` | `less_than_or_equal` | Grid <= `gpv` |
| `eq` | `equal` | Grid == `gpv` |
| `bt` | `between` | `gpv` <= Grid <= `gpx` |

### Examples

```json
// Discharge when importing > 20 kW from grid
{ "c": { "gpo": "gt", "gpv": 20 } }

// Charge when exporting (grid < 0 kW)
{ "c": { "gpo": "lt", "gpv": 0 } }

// Active when grid between 10-50 kW
{ "c": { "gpo": "bt", "gpv": 10, "gpx": 50 } }
```

### Combining with Time

```json
// Discharge during peak hours ONLY when grid > 30 kW
{
  "c": {
    "ts": 1700,
    "te": 2100,
    "gpo": "gt",
    "gpv": 30
  }
}
```

---

## Weekdays Filter (`d`)

Restricts rule to specific days of the week. This field is at **rule level**, NOT inside conditions.

### Supported Formats

| Format | Days | Description |
|--------|------|-------------|
| `"weekdays"` or `"wd"` | Mon-Fri | Weekdays |
| `"weekend"` or `"we"` | Sat-Sun | Weekend |
| `"everyday"` or `"ed"` or `"all"` | All | Every day |
| `"mon-fri"` | Mon-Fri | Day range |
| `"mon-wed"` | Mon-Wed | Day range |
| `"thu-sat"` | Thu-Sat | Day range |
| `"fri-sun"` | Fri-Sun | Wrapping range |
| `"12345"` | Mon-Fri | Digit string (1=Mon ... 7=Sun) |
| `"5"` | Fri | Single day |
| `[0,1,2,3,4,5,6]` | All | Bitmask array (0=Sun, 6=Sat) |

### Bitmask Array Reference

| Day | Index |
|-----|-------|
| Sunday | 0 |
| Monday | 1 |
| Tuesday | 2 |
| Wednesday | 3 |
| Thursday | 4 |
| Friday | 5 |
| Saturday | 6 |

### Default

If `d` is omitted, the rule is active **every day**.

### Case Sensitivity

All string formats are **case-insensitive**: `"Mon"`, `"mon"`, `"MON"` all work.

### Examples

```json
// Weekdays only
{ "d": "weekdays" }

// Weekend only
{ "d": "weekend" }

// Monday, Wednesday, Friday (bitmask array)
{ "d": [1, 3, 5] }

// Monday through Wednesday (range)
{ "d": "mon-wed" }
```

---

## Validity Period (`vf`, `vu`)

Rules can have start/end dates using Unix timestamps. These are at **rule level**, NOT inside conditions.

### Fields

| Field | Key | Type | Default | Description |
|-------|-----|------|---------|-------------|
| Valid From | `vf` | integer | 0 (immediate) | Rule ignored before this timestamp |
| Valid Until | `vu` | integer | 0 (forever) | Rule ignored after this timestamp |

### Default Behavior

- `vf: 0` or omitted = immediately valid
- `vu: 0` or omitted = valid forever

**Omit these fields when using defaults** to save shadow space.

### Example

```json
{
  "id": "WINTER-SCHEDULE",
  "a": { "t": "ch", "pw": 30 },
  "c": { "ts": 2200, "te": 600 },
  "d": "weekdays",
  "vf": 1730419200,
  "vu": 1733011199
}
```

This rule is only active during November 2025.

### Generating Timestamps

```typescript
const startDate = new Date('2026-01-01T00:00:00Z');
const vf = Math.floor(startDate.getTime() / 1000);

const endDate = new Date('2026-03-31T23:59:59Z');
const vu = Math.floor(endDate.getTime() / 1000);
```

### Expiration Behavior

- **Device**: Skips expired rules during evaluation (does NOT delete them)
- **Cloud**: Lambda cleanup job should periodically remove expired rules from shadow to free space

---

## Active Flag (`act`)

Controls whether a rule is enabled or disabled.

| Field | Key | Type | Default | Description |
|-------|-----|------|---------|-------------|
| Active | `act` | boolean | `true` | **Omit if true** (only include when `false`) |

### Usage

```json
// Active rule (default, field omitted)
{ "id": "RULE-1", "a": { "t": "ch", "pw": 30 }, "c": {} }

// Inactive rule (explicitly set to false)
{ "id": "RULE-2", "a": { "t": "ch", "pw": 30 }, "c": {}, "act": false }
```

Toggling a rule active/inactive:
1. GET current schedules
2. Find the rule, set `act: false` (or remove `act` to re-enable)
3. POST the updated priority array

---

## Source Field (`s`)

Metadata field indicating who created the rule. **Device ignores this field.**

| Value | Description |
|-------|-------------|
| `"man"` | Manual / user-created (default) |
| `"ai"` | AI-generated rule |

### Usage

```json
// AI-generated rule
{ "id": "AI-OPTIMIZE-1", "s": "ai", "a": { "t": "ch", "pw": 30 }, "c": {} }

// Manual rule (default, can omit 's')
{ "id": "USER-RULE-1", "a": { "t": "dis", "pw": 50 }, "c": {} }
```

Omit `s` when `"man"` (default) to save space.

---

## Complete Condition Combinations

### Time + SoC + Grid

```json
{
  "c": {
    "ts": 1700,     // 5:00 PM
    "te": 2100,     // 9:00 PM
    "sm": 30,       // SoC >= 30%
    "sx": 100,      // SoC <= 100%
    "gpo": "gt",    // Grid > 20 kW
    "gpv": 20
  }
}
```

ALL conditions must be true: time is 5-9 PM **AND** SoC is 30-100% **AND** grid > 20 kW.

### Time + Weekdays + Validity

```json
{
  "c": { "ts": 800, "te": 1600 },
  "d": "weekdays",
  "vf": 1704067200,
  "vu": 1711929599
}
```

Active 8 AM - 4 PM, Mon-Fri, only during Jan-Mar 2024.

### No Conditions (Always Active)

```json
{ "c": {} }
```

Rule is always active. Used for site limits and immediate goal-based rules.
