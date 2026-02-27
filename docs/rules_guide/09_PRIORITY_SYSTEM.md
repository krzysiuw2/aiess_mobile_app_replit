# Priority System

> Complete reference for the P1-P11 priority hierarchy, cloud-updateable range, evaluation order, and P9 dual-mode behavior.

---

## Priority Levels (P1-P11)

Higher number = higher priority. P11 is the highest.

| Priority | Name | Access | Purpose |
|----------|------|--------|---------|
| **P11** | Safety | Device only | SoC limits, emergency stops |
| **P10** | SCADA | Device only | Grid operator commands (DNP3) |
| **P9** | Site Limit | **Cloud** | Grid connection limits (dual-mode) |
| **P8** | Cloud High | **Cloud** | Urgent commands, peak shaving |
| **P7** | Cloud Normal | **Cloud** | Standard daily schedules |
| **P6** | Cloud Low | **Cloud** | Background optimization |
| **P5** | Cloud Baseline | **Cloud** | Fallback rules |
| **P4** | Cloud Reserved | **Cloud** | Future use |
| **P3** | Local High | Device only | Local user overrides |
| **P2** | Local Normal | Device only | Local user schedules |
| **P1** | Local Default | Device only | Default standby fallback |

---

## Cloud-Updateable Range

Mobile and web apps can manage **P4-P9** via AWS IoT Shadow.

```
P11, P10      -> Device-only (safety, SCADA)
P9-P4         -> Cloud-updateable via API
P3, P2, P1    -> Device-only (local control)
```

The `sch` object in the shadow contains arrays `p_4` through `p_9`. Priorities P1-P3 and P10-P11 are managed locally on the device and are never visible in the cloud shadow.

---

## Priority Evaluation Order

When the device decides what to do, it evaluates rules top-down:

```
1. Safety SoC Limits (desired.safety)   -- ALWAYS enforced first
2. P11 Safety Rules                     -- Emergency stops, hard SoC limits
3. P10 SCADA                            -- Grid operator commands
4. P9 Site Limit                        -- Active if violated OR caps P1-P8
5. P8 Cloud High                        -- Check conditions, first match wins
6. P7 Cloud Normal                      -- Check conditions, first match wins
7. P6 Cloud Low                         -- Check conditions, first match wins
8. P5 Cloud Baseline                    -- Fallback cloud rules
9. P4 Cloud Reserved                    -- Future use
10. P3 Local High                       -- Local overrides
11. P2 Local Normal                     -- Local schedules
12. P1 Local Default                    -- Standby fallback (always present)
```

**First match wins**: Within each priority, the first rule whose conditions are met is executed. Rules are evaluated in array order.

---

## Priority Characteristics

### P11 - Safety (Device Only)

- Auto-generated from device configuration
- Cannot be modified by users or cloud
- Enforces hard SoC limits and emergency stops
- Overridden only by `desired.safety` SoC limits from cloud

### P10 - SCADA (Device Only)

- Grid operator commands via SCADA/DNP3 protocol
- **Bypasses P9** site limits (grid operator has authority)
- Temporary commands that expire when SCADA disconnects

### P9 - Site Limit (Cloud-Updateable)

See [P9 Deep Dive](#p9-site-limit-deep-dive) below.

### P8 - Cloud High

- Urgent cloud commands
- Peak shaving rules
- Use for time-critical operations that must override normal schedules

### P7 - Cloud Normal

- **Most commonly used priority**
- Standard daily charge/discharge schedules
- Goal-based rules (charge to target, discharge to target)

### P6 - Cloud Low

- Background optimization
- Low-priority rules that yield to any P7+ rule
- Seasonal or long-term schedules

### P5 - Cloud Baseline

- Fallback cloud rules
- Emergency low-battery charging
- Rules that should always be available but rarely activate

### P4 - Cloud Reserved

- Reserved for future use
- Avoid using in production

### P1-P3 - Local (Device Only)

- P3: Local high-priority user overrides
- P2: Local normal schedules
- P1: Default standby (always present on device, never visible in cloud)

---

## P9 Site Limit Deep Dive

P9 is unique because it operates in **two modes simultaneously**:

### Mode 1: Passive Capping

When any P1-P8 rule is executing, P9 **constrains its power** to stay within thresholds.

```
Scenario:
  P9: hth=70 kW, lth=-40 kW
  P7: Charge at 40 kW
  Current grid: 50 kW (importing)

  Without P9: Grid = 50 + 40 = 90 kW (exceeds agreement!)
  With P9 capping: Available = 70 - 50 = 20 kW
  Result: P7 charge capped to 20 kW, grid = 70 kW
```

Capping works for both charging (high threshold) and discharging (low threshold):

```
Scenario (export):
  P9: lth=-40 kW
  P7: Discharge at 60 kW
  Current grid: 10 kW (importing)

  Without P9: Grid = 10 - 60 = -50 kW (exceeds export limit!)
  With P9 capping: Available = 10 - (-40) = 50 kW
  Result: P7 discharge capped to 50 kW, grid = -40 kW
```

### Mode 2: Active PID Controller

When **no other rule is active** AND grid thresholds are violated, P9 generates its own commands.

| Grid Condition | P9 Action | PID |
|----------------|-----------|-----|
| Grid > `hth` (importing too much) | Discharge to reduce import | Yes |
| Grid < `lth` (exporting too much) | Charge to reduce export | Yes |
| Within thresholds | No action | -- |

```
Scenario (active control):
  P9: hth=70 kW
  No P1-P8 rule active
  Current grid: 85 kW (over threshold!)

  P9 generates: DISCHARGE 15 kW (PID-controlled)
  Result: Grid smoothly returns to 70 kW
```

### P9 Execution Order

```
1. P11 Safety         -> Always enforced
2. P10 SCADA          -> BYPASSES P9 (grid operator authority)
3. P8-P4 Cloud Rules  -> Checked with P9 capping applied
4. P9 ACTIVE          -> If thresholds violated & no P8-P4 matched
5. P3-P1 Local Rules  -> Checked with P9 capping applied
6. P1 Standby         -> Default (if P9 within limits)
```

### P9 Rule Example

```json
{
  "id": "SITE-LIMIT-FARM",
  "a": { "t": "sl", "hth": 70, "lth": -40 },
  "c": {}
}
```

Place this rule in the `p_9` array. This single rule:
1. **Caps** all P1-P8 rules to stay within +70/-40 kW
2. **Actively controls** grid when thresholds are violated (PID)

### Disabling Active Control

If you only want capping without active PID control, set very wide thresholds:

```json
{
  "id": "SITE-LIMIT-PASSIVE",
  "a": { "t": "sl", "hth": 9999, "lth": -9999 },
  "c": {}
}
```

This effectively makes P9 a passive limiter only (thresholds will never be violated by ambient grid power).

---

## Priority Conflicts

### Same Priority, Overlapping Time

When two rules in the same priority have overlapping time windows:
- **First match wins**: Rules are evaluated in array order
- The device executes the first rule whose conditions are met and skips the rest

### Cross-Priority Conflicts

Higher priority always wins:
- P8 rule overrides P7 rule (even if P7 conditions are met first)
- P9 site limit constrains all lower-priority rules

### Recommended Organization

| Priority | Use For | Example Rules |
|----------|---------|---------------|
| **P9** | Site limits only | 1 site limit rule |
| **P8** | Urgent / peak shaving | 1-3 critical rules |
| **P7** | Daily schedules | 3-10 normal rules |
| **P6** | Background / seasonal | 1-5 optimization rules |
| **P5** | Fallbacks | 1-2 emergency rules |

---

## Common Patterns

### Layer 1: Safety Foundation

```
P9: Site limit (always active, caps everything)
P5: Emergency low battery charge (SoC < 10%)
```

### Layer 2: Daily Operations

```
P7: Night charge to target (23:00-06:00, weekdays)
P7: Peak discharge to target (17:00-21:00, weekdays)
P7: Solar absorption (09:00-16:00, grid < 0)
```

### Layer 3: High-Priority Overrides

```
P8: Peak shaving (17:00-21:00, grid > 30 kW, PID)
```

### Layer 4: Background Optimization

```
P6: Weekend standby
P6: Seasonal winter discharge (validity period)
```
