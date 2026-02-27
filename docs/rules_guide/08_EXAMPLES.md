# Real-World Rule Examples

> Complete rule examples for every action type and common use case.
> All examples use v1.4.2 optimized format (no `p` field in rules).

---

## Quick Reference

| # | Use Case | Action | Priority | Key Feature |
|---|----------|--------|----------|-------------|
| 1 | Peak shaving | `dis` | P8 | Grid condition + PID |
| 2 | Off-peak night charge | `ct` | P7 | Charge to target overnight |
| 3 | Solar self-consumption | `ch` | P7 | SoC-capped charging |
| 4 | Grid connection limit | `sl` | P9 | Dual-mode site limit |
| 5 | Emergency low battery | `ch` | P5 | SoC condition baseline |
| 6 | Weekend standby | `sb` | P6 | Weekday filter |
| 7 | Seasonal schedule | `dis` | P6 | Validity period |
| 8 | Grid-following discharge | `dis` | P7 | PID + grid condition |
| 9 | Smart discharge to target | `dt` | P7 | `ming` grid constraint |
| 10 | Smart charge to target | `ct` | P7 | `maxg` grid constraint |
| 11 | Immediate emergency charge | `ct` | P8 | No conditions |
| 12 | AI-generated optimization | `ch` | P7 | Source field |

---

## Example 1: Peak Shaving (P8)

Discharge during evening peak hours when grid import is high.

```json
{
  "id": "PEAK-SHAVING-EVENING",
  "a": { "t": "dis", "pw": 50, "pid": true },
  "c": {
    "ts": 1700,
    "te": 2100,
    "sm": 30,
    "gpo": "gt",
    "gpv": 30
  },
  "d": "weekdays"
}
```

**Priority**: P8 (high)
**Behavior**: Weekdays 5-9 PM, when grid > 30 kW and SoC > 30%, discharge at 50 kW with PID for smooth grid tracking.

---

## Example 2: Off-Peak Night Charge (P7)

Charge battery to 80% overnight using cheap off-peak electricity.

```json
{
  "id": "NIGHT-CHARGE-80",
  "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
  "c": { "ts": 2300, "te": 600 },
  "d": "weekdays"
}
```

**Priority**: P7 (normal)
**Behavior**: Weekdays 11 PM - 6 AM, charge to 80% SoC, max 25 kW power, max 50 kW grid import. Uses equal spread strategy (default).

---

## Example 3: Solar Self-Consumption (P7)

Charge from solar excess during daytime, stop at 90% SoC.

```json
{
  "id": "SOLAR-CHARGE",
  "a": { "t": "ch", "pw": 30 },
  "c": {
    "ts": 900,
    "te": 1600,
    "sx": 90,
    "gpo": "lt",
    "gpv": 0
  },
  "d": "weekdays"
}
```

**Priority**: P7 (normal)
**Behavior**: Weekdays 9 AM - 4 PM, when grid < 0 kW (exporting) and SoC < 90%, charge at 30 kW.

---

## Example 4: Grid Connection Limit (P9)

Enforce grid connection agreement limits.

```json
{
  "id": "SITE-LIMIT-MAIN",
  "a": { "t": "sl", "hth": 70, "lth": -40 },
  "c": {}
}
```

**Priority**: P9 (site limit)
**Behavior**: Always active. Caps all rules to max 70 kW import / 40 kW export. Actively controls grid when thresholds are violated (PID).

---

## Example 5: Emergency Low Battery (P5)

Baseline rule to slowly charge when battery is critically low.

```json
{
  "id": "EMERGENCY-LOW-CHARGE",
  "a": { "t": "ch", "pw": 10 },
  "c": { "sm": 0, "sx": 10 }
}
```

**Priority**: P5 (baseline)
**Behavior**: When SoC drops below 10%, charge at 10 kW. Always active (no time or day restrictions). Acts as a safety net.

---

## Example 6: Weekend Standby (P6)

Keep the system idle on weekends.

```json
{
  "id": "WEEKEND-STANDBY",
  "a": { "t": "sb", "pw": 0 },
  "c": {},
  "d": "weekend"
}
```

**Priority**: P6 (low)
**Behavior**: Saturdays and Sundays, no power flow.

---

## Example 7: Seasonal Schedule with Validity Period (P6)

Discharge rule only active during winter months.

```json
{
  "id": "WINTER-PEAK-DISCHARGE",
  "a": { "t": "dis", "pw": 40, "pid": true },
  "c": {
    "ts": 1700,
    "te": 2100,
    "sm": 30,
    "gpo": "gt",
    "gpv": 15
  },
  "d": "weekdays",
  "vf": 1730419200,
  "vu": 1740787199
}
```

**Priority**: P6 (low)
**Behavior**: Weekdays 5-9 PM during November 2024 - February 2025 only. Discharges when grid > 15 kW and SoC > 30%.

---

## Example 8: Grid-Following Discharge with PID (P7)

Track grid power and discharge proportionally.

```json
{
  "id": "GRID-FOLLOW-DISCHARGE",
  "a": { "t": "dis", "pw": 999, "pid": true },
  "c": {
    "ts": 1400,
    "te": 2200,
    "gpo": "gt",
    "gpv": 20
  },
  "d": "weekdays"
}
```

**Priority**: P7 (normal)
**Behavior**: Weekdays 2-10 PM, when grid > 20 kW. Uses PID to smoothly reduce grid import. `pw: 999` means "use maximum device power" (PID will modulate actual output).

---

## Example 9: Smart Discharge to Target with `ming` (P7)

Discharge to target SoC while preventing grid export.

```json
{
  "id": "SMART-PEAK-DISCHARGE",
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10, "str": "eq" },
  "c": { "ts": 1700, "te": 2100 },
  "d": "weekdays"
}
```

**Priority**: P7 (normal)
**Behavior**: Weekdays 5-9 PM, discharge to 30% SoC. Dynamically adjusts power to keep grid >= 10 kW (never exports). Uses equal spread strategy over the 4-hour window.

**Why `ming` in `a` and not `gpo` in `c`**: The `ming` action parameter provides **dynamic adjustment** (analog control), while a grid condition would only provide on/off triggering. See [02_ACTION_TYPES.md](./02_ACTION_TYPES.md#conditions-vs-action-parameters).

---

## Example 10: Smart Charge to Target with `maxg` (P7)

Charge to target SoC while limiting grid import.

```json
{
  "id": "SMART-NIGHT-CHARGE",
  "a": { "t": "ct", "soc": 80, "maxp": 60, "maxg": 30, "str": "eq" },
  "c": { "ts": 2300, "te": 600 },
  "d": "weekdays"
}
```

**Priority**: P7 (normal)
**Behavior**: Weekdays 11 PM - 6 AM, charge to 80% SoC. Battery dynamically adjusts charging power to keep grid import <= 30 kW. If site uses 20 kW, battery charges at max 10 kW.

---

## Example 11: Immediate Emergency Charge (P8)

Charge to 90% SoC as fast as possible, no time window.

```json
{
  "id": "EMERGENCY-CHARGE-NOW",
  "a": { "t": "ct", "soc": 90, "maxp": 100 }
}
```

**Priority**: P8 (high)
**Behavior**: Immediate mode (no conditions). Charges at max 100 kW until 90% SoC is reached. No time, day, or grid restrictions.

Note: No `c` field at all = immediate mode for goal-based rules.

---

## Example 12: AI-Generated Optimization Rule (P7)

Rule created by AI optimizer with source metadata.

```json
{
  "id": "AI-OPT-2026-02-27",
  "s": "ai",
  "a": { "t": "ch", "pw": 25, "pid": true },
  "c": {
    "ts": 1000,
    "te": 1500,
    "gpo": "lt",
    "gpv": -5
  }
}
```

**Priority**: P7 (normal)
**Behavior**: 10 AM - 3 PM, when grid < -5 kW (exporting surplus solar). AI-generated rule (`s: "ai"`) to absorb solar surplus. Device ignores the `s` field; it's metadata for the mobile app UI.

---

## Complete Shadow Document Example

A full shadow with multiple rules across priorities:

```json
{
  "state": {
    "desired": {
      "v": "1.2",
      "mode": "semi-automatic",
      "safety": {
        "soc_min": 10,
        "soc_max": 90
      },
      "sch": {
        "p_5": [
          {
            "id": "EMERGENCY-LOW-CHARGE",
            "a": { "t": "ch", "pw": 10 },
            "c": { "sm": 0, "sx": 10 }
          }
        ],
        "p_7": [
          {
            "id": "NIGHT-CHARGE-80",
            "s": "man",
            "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
            "c": { "ts": 2300, "te": 600 },
            "d": "weekdays"
          },
          {
            "id": "SMART-PEAK-DISCHARGE",
            "s": "man",
            "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
            "c": { "ts": 1700, "te": 2100 },
            "d": "weekdays"
          },
          {
            "id": "AI-SOLAR-ABSORB",
            "s": "ai",
            "a": { "t": "ch", "pw": 25, "pid": true },
            "c": { "ts": 1000, "te": 1500, "gpo": "lt", "gpv": -5 }
          }
        ],
        "p_8": [
          {
            "id": "PEAK-SHAVING-EVENING",
            "a": { "t": "dis", "pw": 50, "pid": true },
            "c": { "ts": 1700, "te": 2100, "sm": 30, "gpo": "gt", "gpv": 30 },
            "d": "weekdays"
          }
        ],
        "p_9": [
          {
            "id": "SITE-LIMIT-MAIN",
            "a": { "t": "sl", "hth": 70, "lth": -40 },
            "c": {}
          }
        ]
      }
    },
    "reported": {
      "v": "1.2",
      "last_sync": 1740652800,
      "rule_count": 6,
      "version": "1.4.3",
      "current_soc": 65,
      "safety_status": "ok"
    }
  },
  "version": 4285,
  "timestamp": 1740652800
}
```

This shadow contains:
- **Safety limits**: 10-90% SoC range
- **Mode**: Semi-automatic
- **P5**: Emergency low battery fallback (1 rule)
- **P7**: Night charging, peak discharging, AI solar absorption (3 rules)
- **P8**: Peak shaving (1 rule)
- **P9**: Grid connection limit (1 rule)
- **Total**: 6 rules, well within the 8KB limit
