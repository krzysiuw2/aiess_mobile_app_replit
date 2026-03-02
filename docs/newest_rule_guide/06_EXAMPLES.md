# 06 — Real-World Rule Examples

> Copy-paste-ready rule examples for every action type and common scenario.
> All examples use the v1.4.3 optimized format.

---

## Quick Reference

| # | Use Case | Action | Priority | Key Feature |
|---|----------|--------|----------|-------------|
| 1 | Peak shaving | `dis` | P8 | Grid condition + PID |
| 2 | Off-peak night charge | `ct` | P7 | Charge to target + maxg |
| 3 | Solar self-consumption | `ch` | P7 | SoC cap + grid < 0 |
| 4 | Grid connection limit | `sl` | P9 | Dual-mode site limit |
| 5 | Emergency low battery | `ch` | P5 | SoC condition baseline |
| 6 | Weekend standby | `sb` | P6 | Weekday filter |
| 7 | Seasonal schedule | `dis` | P6 | Validity period |
| 8 | Grid-following discharge | `dis` | P7 | PID + grid condition |
| 9 | Smart discharge to target | `dt` | P7 | `ming` prevents export |
| 10 | Smart charge to target | `ct` | P7 | `maxg` limits grid import |
| 11 | Immediate emergency charge | `ct` | P8 | No conditions |
| 12 | AI-generated optimization | `ch` | P7 | Source field `s: "ai"` |

---

## 1. Peak Shaving (P8)

Discharge during evening peak when grid import is high.

```json
{
  "id": "PEAK-SHAVING-EVENING",
  "a": { "t": "dis", "pw": 50, "pid": true },
  "c": { "ts": 1700, "te": 2100, "sm": 30, "gpo": "gt", "gpv": 30 },
  "d": "weekdays"
}
```

**Priority**: P8 | **Behavior**: Weekdays 17:00-21:00, when grid > 30 kW AND SoC > 30%. PID smoothly tracks grid power.

---

## 2. Off-Peak Night Charge (P7)

Charge to 80% overnight using cheap electricity.

```json
{
  "id": "NIGHT-CHARGE-80",
  "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
  "c": { "ts": 2300, "te": 600 },
  "d": "weekdays"
}
```

**Priority**: P7 | **Behavior**: Weekdays 23:00-06:00, charge to 80% SoC, max 25 kW, keep grid import <= 50 kW. Equal spread strategy (default).

---

## 3. Solar Self-Consumption (P7)

Absorb excess solar production, stop at 90% SoC.

```json
{
  "id": "SOLAR-CHARGE",
  "a": { "t": "ch", "pw": 30 },
  "c": { "ts": 900, "te": 1600, "sx": 90, "gpo": "lt", "gpv": 0 },
  "d": "weekdays"
}
```

**Priority**: P7 | **Behavior**: Weekdays 09:00-16:00, when grid < 0 kW (exporting) AND SoC < 90%. Charges at fixed 30 kW.

---

## 4. Grid Connection Limit (P9)

Enforce grid connection agreement limits.

```json
{
  "id": "SITE-LIMIT-MAIN",
  "a": { "t": "sl", "hth": 70, "lth": -40 },
  "c": {}
}
```

**Priority**: P9 | **Behavior**: Always active. Caps all rules to max 70 kW import / 40 kW export. Actively controls grid with PID when thresholds are violated.

---

## 5. Emergency Low Battery (P5)

Safety net — slowly charge when battery is critically low.

```json
{
  "id": "EMERGENCY-LOW-CHARGE",
  "a": { "t": "ch", "pw": 10 },
  "c": { "sm": 0, "sx": 10 }
}
```

**Priority**: P5 | **Behavior**: When SoC drops below 10%, charge at 10 kW. No time/day restrictions. Always available as a fallback.

---

## 6. Weekend Standby (P6)

Keep the battery idle on weekends.

```json
{
  "id": "WEEKEND-STANDBY",
  "a": { "t": "sb", "pw": 0 },
  "c": {},
  "d": "weekend"
}
```

**Priority**: P6 | **Behavior**: Saturdays and Sundays, no power flow.

---

## 7. Seasonal Winter Schedule (P6)

Discharge rule only active during winter months.

```json
{
  "id": "WINTER-PEAK-DISCHARGE",
  "a": { "t": "dis", "pw": 40, "pid": true },
  "c": { "ts": 1700, "te": 2100, "sm": 30, "gpo": "gt", "gpv": 15 },
  "d": "weekdays",
  "vf": 1730419200,
  "vu": 1740787199
}
```

**Priority**: P6 | **Behavior**: Weekdays 17:00-21:00, Nov 2024 – Feb 2025 only. Discharges when grid > 15 kW and SoC > 30%.

---

## 8. Grid-Following Discharge with PID (P7)

Track grid power and discharge proportionally.

```json
{
  "id": "GRID-FOLLOW-DISCHARGE",
  "a": { "t": "dis", "pw": 999, "pid": true },
  "c": { "ts": 1400, "te": 2200, "gpo": "gt", "gpv": 20 },
  "d": "weekdays"
}
```

**Priority**: P7 | **Behavior**: Weekdays 14:00-22:00, when grid > 20 kW. `pw: 999` = device max power. PID modulates actual output to smoothly reduce grid import.

---

## 9. Smart Discharge to Target with `ming` (P7)

Discharge to target SoC while preventing grid export.

```json
{
  "id": "SMART-PEAK-DISCHARGE",
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10, "str": "eq" },
  "c": { "ts": 1700, "te": 2100 },
  "d": "weekdays"
}
```

**Priority**: P7 | **Behavior**: Weekdays 17:00-21:00, discharge to 30% SoC. Dynamically adjusts power to keep grid >= 10 kW (never exports). Equal spread over the 4-hour window.

---

## 10. Smart Charge to Target with `maxg` (P7)

Charge to target SoC while limiting grid import.

```json
{
  "id": "SMART-NIGHT-CHARGE",
  "a": { "t": "ct", "soc": 80, "maxp": 60, "maxg": 30, "str": "eq" },
  "c": { "ts": 2300, "te": 600 },
  "d": "weekdays"
}
```

**Priority**: P7 | **Behavior**: Weekdays 23:00-06:00, charge to 80%. Dynamically adjusts charge power to keep grid import <= 30 kW. If site uses 20 kW, battery charges at max 10 kW.

---

## 11. Immediate Emergency Charge (P8)

Charge to 90% as fast as possible, no time window.

```json
{
  "id": "EMERGENCY-CHARGE-NOW",
  "a": { "t": "ct", "soc": 90, "maxp": 100 }
}
```

**Priority**: P8 | **Behavior**: No conditions (no `c` field) = immediate mode. Charges at max 100 kW until 90% SoC. No time, day, or grid restrictions.

---

## 12. AI-Generated Optimization (P7)

Rule created by the AI agent with source metadata.

```json
{
  "id": "AI-OPT-2026-02-27",
  "s": "ai",
  "a": { "t": "ch", "pw": 25, "pid": true },
  "c": { "ts": 1000, "te": 1500, "gpo": "lt", "gpv": -5 }
}
```

**Priority**: P7 | **Behavior**: 10:00-15:00, when grid < -5 kW (exporting surplus solar). The `s: "ai"` flag marks it as AI-generated (metadata only — device ignores it).

---

## Complete Shadow Example

A realistic shadow with layered rules:

```json
{
  "state": {
    "desired": {
      "v": "1.2",
      "mode": "automatic",
      "safety": { "soc_min": 10, "soc_max": 90 },
      "sch": {
        "p_5": [
          { "id": "EMERGENCY-LOW", "a": { "t": "ch", "pw": 10 }, "c": { "sm": 0, "sx": 10 } }
        ],
        "p_7": [
          {
            "id": "NIGHT-CHARGE-80",
            "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
            "c": { "ts": 2300, "te": 600 },
            "d": "weekdays"
          },
          {
            "id": "SMART-PEAK-DISCHARGE",
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
            "id": "PEAK-SHAVING",
            "a": { "t": "dis", "pw": 50, "pid": true },
            "c": { "ts": 1700, "te": 2100, "sm": 30, "gpo": "gt", "gpv": 30 },
            "d": "weekdays"
          }
        ],
        "p_9": [
          { "id": "SITE-LIMIT", "a": { "t": "sl", "hth": 70, "lth": -40 }, "c": {} }
        ]
      }
    }
  }
}
```

### What this shadow does

| Layer | Rules | Behavior |
|-------|-------|----------|
| **P9** Safety | Site limit | Max 70 kW import, 40 kW export — always on |
| **P8** Urgent | Peak shaving | Weekday evenings, PID discharge when grid > 30 kW |
| **P7** Normal | Night charge | Weekday nights, charge to 80% with grid limit |
| **P7** Normal | Peak discharge | Weekday evenings, discharge to 30% without exporting |
| **P7** Normal | Solar absorb | AI rule, daytime solar surplus capture |
| **P5** Fallback | Emergency low | Charge at 10 kW when SoC < 10% |

Priority evaluation: P9 caps everything → P8 peak shaving wins in the evening → P7 night charge wins overnight → P7 solar absorb wins during day → P5 catches critically low battery.
