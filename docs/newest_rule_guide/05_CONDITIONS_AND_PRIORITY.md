# 05 — Conditions, Scheduling & Priority System

> How to control WHEN a rule activates: time windows, SoC thresholds,
> grid power triggers, day filters, validity periods, and how the
> priority system determines which rule wins.

---

## Conditions Block (`c`)

All conditions are optional and use **AND logic** — every specified condition must be true for the rule to activate.

```json
{
  "c": {
    "ts": 1700,    // AND time >= 17:00
    "te": 2100,    // AND time <= 21:00
    "sm": 30,      // AND SoC >= 30%
    "sx": 90,      // AND SoC <= 90%
    "gpo": "gt",   // AND grid power > 20 kW
    "gpv": 20
  }
}
```

Empty conditions `{}` = rule is **always active**.

---

## Time Condition (`ts` / `te`)

HHMM integer format:

| Time | HHMM | Notes |
|------|------|-------|
| 00:00 | `0` | Midnight |
| 06:30 | `630` | |
| 14:00 | `1400` | |
| 22:00 | `2200` | |
| 23:59 | `2359` | |

**Overnight spanning:** When `te < ts`, the window wraps to the next day:
```json
{ "c": { "ts": 2200, "te": 600 } }   // 22:00 → 06:00 next day
```

**Conversion helpers:**
```typescript
function formatTime(hhmm: number): string {
  return `${Math.floor(hhmm / 100).toString().padStart(2, '0')}:${(hhmm % 100).toString().padStart(2, '0')}`;
}

function parseTime(str: string): number {
  const [h, m] = str.split(':').map(Number);
  return h * 100 + m;
}
```

---

## SoC Condition (`sm` / `sx`)

| Field | Key | Range | Meaning |
|-------|-----|-------|---------|
| SoC Min | `sm` | 0-100 | Rule active when SoC >= this value |
| SoC Max | `sx` | 0-100 | Rule active when SoC <= this value |

```json
{ "c": { "sm": 30, "sx": 80 } }   // active when 30% <= SoC <= 80%
```

---

## Grid Power Condition (`gpo` / `gpv` / `gpx`)

Binary on/off trigger based on grid power. Positive = importing, negative = exporting.

| Operator | Code | Example | Meaning |
|----------|------|---------|---------|
| Greater than | `gt` | `"gpo": "gt", "gpv": 20` | Grid > 20 kW |
| Less than | `lt` | `"gpo": "lt", "gpv": 0` | Grid < 0 kW (exporting) |
| Greater or equal | `gte` | `"gpo": "gte", "gpv": 10` | Grid >= 10 kW |
| Less or equal | `lte` | `"gpo": "lte", "gpv": -5` | Grid <= -5 kW |
| Equal | `eq` | `"gpo": "eq", "gpv": 0` | Grid == 0 kW |
| Between | `bt` | `"gpo": "bt", "gpv": 10, "gpx": 50` | 10 <= Grid <= 50 kW |

---

## Day Filter (`d`) — Rule Level

**Not inside `c`** — this field is at the rule level.

| Format | Days | Example |
|--------|------|---------|
| `"weekdays"` or `"wd"` | Mon-Fri | `"d": "weekdays"` |
| `"weekend"` or `"we"` | Sat-Sun | `"d": "weekend"` |
| `"everyday"` / `"ed"` / `"all"` | All | `"d": "everyday"` |
| `[0,1,2,3,4,5,6]` | Custom | `"d": [1, 3, 5]` = Mon, Wed, Fri |

Day index: 0=Sunday, 1=Monday, ..., 6=Saturday.

If `d` is omitted, the rule is active **every day**.

---

## Validity Period (`vf` / `vu`) — Rule Level

| Field | Key | Default | Description |
|-------|-----|---------|-------------|
| Valid From | `vf` | 0 (immediate) | Rule ignored before this Unix timestamp |
| Valid Until | `vu` | 0 (forever) | Rule ignored after this Unix timestamp |

Omit when using defaults to save shadow space.

```json
{
  "vf": 1735689600,   // Jan 1, 2025 00:00 UTC
  "vu": 1738367999    // Jan 31, 2025 23:59 UTC
}
```

---

## Active Flag (`act`) — Rule Level

| Value | Meaning | JSON |
|-------|---------|------|
| `true` (default) | Rule is enabled | **Omit the field** (saves space) |
| `false` | Rule is disabled | `"act": false` |

To toggle: set `act: false` to disable, or remove the `act` key to re-enable.

---

## Source Field (`s`) — Rule Level

Metadata only — the device ignores this field.

| Value | Meaning |
|-------|---------|
| `"man"` | Manual / user-created (default — omit to save space) |
| `"ai"` | Created by the AI agent |

---

## Priority System (P1–P11)

Higher number = higher priority. Higher priority always wins.

| Priority | Name | Access | Purpose |
|----------|------|--------|---------|
| **P11** | Safety | Device only | Emergency stops, hard SoC limits |
| **P10** | SCADA | Device only | Grid operator commands (bypasses P9) |
| **P9** | Site Limit | **Cloud** | Grid connection limits (dual-mode) |
| **P8** | Cloud High | **Cloud** | Urgent commands, peak shaving |
| **P7** | Cloud Normal | **Cloud** | Standard daily schedules (most used) |
| **P6** | Cloud Low | **Cloud** | Background optimization, seasonal |
| **P5** | Cloud Baseline | **Cloud** | Fallback / emergency rules |
| **P4** | Cloud Reserved | **Cloud** | Future use |
| **P3** | Local High | Device only | Local overrides |
| **P2** | Local Normal | Device only | Local schedules |
| **P1** | Local Default | Device only | Standby fallback |

**Cloud-updateable range: P4–P9** (via the Schedules API).

### Evaluation Order

```
1. Safety SoC Limits (desired.safety)     ← ALWAYS enforced first
2. P11 Safety Rules
3. P10 SCADA
4. P9 Site Limit (capping + active PID)
5. P8 Cloud High                          ← First match in array wins
6. P7 Cloud Normal
7. P6 Cloud Low
8. P5 Cloud Baseline
9. P4 Cloud Reserved
10. P3-P1 Local
```

Within each priority, rules are evaluated in **array order** — first match wins.

### Recommended Organization

| Priority | Use For | How Many |
|----------|---------|----------|
| **P9** | Site limit only | 1 rule |
| **P8** | Urgent / peak shaving | 1-3 rules |
| **P7** | Daily schedules | 3-10 rules |
| **P6** | Background / seasonal | 1-5 rules |
| **P5** | Fallbacks / emergency | 1-2 rules |

---

## Safety SoC Limits

Stored alongside schedules in the shadow (NOT inside `sch`):

```json
{
  "safety": { "soc_min": 10, "soc_max": 90 },
  "sch": { ... }
}
```

- `soc_min`: Never discharge below this % (range: 0-100, default: 5)
- `soc_max`: Never charge above this % (range: 0-100, default: 100)
- These override **everything**, including P11 safety rules
- Updated via POST with `safety` field and `sch: {}` (empty)

---

## System Mode

Stored alongside schedules in the shadow:

| Mode | Meaning |
|------|---------|
| `automatic` | Full autonomous operation (default) |
| `semi-automatic` | Assisted operation |
| `manual` | Manual control only |

Updated via POST with `mode` field and `sch: {}` (empty).

The mode field is for **cloud-side UI control only** — edge devices may ignore it.

---

## Shadow Size Limit

AWS IoT Shadow has a hard **8KB (8192 bytes)** limit.

| Format | Average Rule Size | Approximate Capacity |
|--------|-------------------|---------------------|
| Optimized (v1.4.3) | ~120 bytes | ~66 rules |

### Space-Saving Checklist

- Omit `act` when `true` (default)
- Omit `vf` and `vu` when `0` (default)
- Omit `pid` when `false` (default)
- Omit `s` when `"man"` (default)
- Omit `d` when rule is for every day
- Use abbreviated keys everywhere
- Use weekday shorthands (`"weekdays"` not `[1,2,3,4,5]`)
- Use HHMM integers (`1800` not `"18:00"`)
- Validate before save: `JSON.stringify(sch).length <= 7680`
