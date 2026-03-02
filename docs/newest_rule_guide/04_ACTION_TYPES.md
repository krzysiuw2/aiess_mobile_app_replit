# 04 — Action Types Reference

> All 6 action types, their parameters, behaviors, and when to use each one.
> Includes the critical distinction between conditions and action parameters.

---

## Action Type Summary

| Code | Name | Key Fields | Priority | Use Case |
|------|------|-----------|----------|----------|
| `ch` | Charge | `pw`, `pid?` | P5-P8 | Fixed-power charging |
| `dis` | Discharge | `pw`, `pid?` | P5-P8 | Fixed-power discharging |
| `sb` | Standby | `pw: 0` | P5-P7 | Hold battery idle |
| `sl` | Site Limit | `hth`, `lth` | **P9 only** | Grid connection limits |
| `ct` | Charge to Target | `soc`, `maxp?`, `maxg?`, `str?` | P5-P8 | Goal-based charging |
| `dt` | Discharge to Target | `soc`, `maxp?`, `ming?`, `str?` | P5-P8 | Goal-based discharging |

---

## 1. Charge (`ch`)

Fixed-power battery charging.

```json
{ "a": { "t": "ch", "pw": 30 } }
```

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | — | `"ch"` |
| Power | `pw` | number | Yes | — | Charge power in kW (>= 0). `999` = device max. |
| PID | `pid` | boolean | No | `false` | PID controller for grid-following. Omit if false. |

**Direct mode** (default): Sends exact power command. "Charge 30 kW" = exactly 30 kW.
**PID mode** (`pid: true`): Uses PID controller to track a grid setpoint. Only use with a grid power condition.

---

## 2. Discharge (`dis`)

Fixed-power battery discharging.

```json
{ "a": { "t": "dis", "pw": 50, "pid": true } }
```

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | — | `"dis"` |
| Power | `pw` | number | Yes | — | Discharge power in kW (>= 0). `999` = device max. |
| PID | `pid` | boolean | No | `false` | PID controller for grid-following. Omit if false. |

---

## 3. Standby (`sb`)

No power flow — hold the battery idle.

```json
{ "a": { "t": "sb", "pw": 0 } }
```

Always set `pw: 0`.

---

## 4. Site Limit (`sl`) — P9 Only

Grid connection power limits. **Exclusively for P9 rules.**

```json
{ "a": { "t": "sl", "hth": 70, "lth": -40 } }
```

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | — | `"sl"` |
| High Threshold | `hth` | number | Yes | — | Max import from grid (kW, positive) |
| Low Threshold | `lth` | number | Yes | — | Max export to grid (kW, negative) |

### Dual-Mode Behavior

**Mode 1 — Passive Capping:** When any P1-P8 rule is active, P9 caps its power to stay within thresholds.

```
P9 hth: 70 kW, P7 wants to charge 40 kW, grid currently at 50 kW
Without P9: grid = 50 + 40 = 90 kW (exceeds limit!)
With P9 cap: available = 70 - 50 = 20 kW → charge capped to 20 kW
```

**Mode 2 — Active PID:** When NO other rule is active AND grid exceeds thresholds, P9 generates its own commands.

```
P9 hth: 70 kW, no rule active, grid at 85 kW
P9 generates: DISCHARGE 15 kW (PID) → grid returns to 70 kW
```

---

## 5. Charge to Target (`ct`)

Goal-based charging — reach a target SoC by end of time window.

```json
{ "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50, "str": "eq" } }
```

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | — | `"ct"` |
| Target SoC | `soc` | number | Yes | — | Target % (0-100) |
| Max Power | `maxp` | number | No | 999 | Max charge power (kW) |
| Max Grid | `maxg` | number | No | 999999 | Max grid import (kW) — **action parameter, NOT a condition** |
| Strategy | `str` | string | No | `"eq"` | `"eq"` / `"agg"` / `"con"` |
| PID | `pid` | boolean | No | `false` | Omit if false |

**Strategies:**
- `eq` (Equal Spread): distribute power evenly over the time window
- `agg` (Aggressive): charge as fast as possible at the start
- `con` (Conservative): start slow, accelerate toward the end

**Immediate mode:** If no conditions are provided (`c` is `{}` or absent), charges at `maxp` immediately until `soc` is reached.

**`maxg` dynamically adjusts charge power:**
```
maxg: 30 kW, site load: 20 kW → available for charging = 30 - 20 = 10 kW
```

---

## 6. Discharge to Target (`dt`)

Goal-based discharging — reach a target SoC by end of time window.

```json
{ "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10, "str": "eq" } }
```

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | — | `"dt"` |
| Target SoC | `soc` | number | Yes | — | Target % (0-100) |
| Max Power | `maxp` | number | No | 999 | Max discharge power (kW) |
| Min Grid | `ming` | number | No | 0 | Min grid power to maintain (kW) — **action parameter** |
| Strategy | `str` | string | No | `"eq"` | `"eq"` / `"agg"` / `"con"` |
| PID | `pid` | boolean | No | `false` | Omit if false |

**`ming` prevents grid export:**
```
ming: 10 kW, grid currently at 15 kW → discharge limited to 15 - 10 = 5 kW
```

Without `ming`, the battery may discharge at full power and export to the grid.

---

## Conditions vs Action Parameters (CRITICAL)

This is the **most common source of bugs.** Two different mechanisms control grid power behavior:

### Grid CONDITION (`gpo`/`gpv` in `c`)

- Lives inside the **conditions block** `c`
- Controls **WHEN** to execute (binary: on/off)
- Use for **fixed power actions** (`ch`, `dis`, `sb`)

```json
{
  "a": { "t": "dis", "pw": 50 },
  "c": { "gpo": "gt", "gpv": 30 }
}
```
Rule activates only when grid > 30 kW. When active, discharges at fixed 50 kW.

### Grid ACTION PARAMETER (`maxg`/`ming` in `a`)

- Lives inside the **action block** `a`
- Controls **HOW** to execute (analog: dynamic adjustment)
- Use for **goal-based actions** (`ct`, `dt`)

```json
{
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
  "c": {}
}
```
Rule is always active. Dynamically adjusts discharge to keep grid >= 10 kW.

### Common Mistake

```json
// WRONG — using grid condition with discharge_to_target
{
  "a": { "t": "dt", "soc": 30, "maxp": 50 },
  "c": { "gpo": "gt", "gpv": 30 }
}
// Result: activates when grid > 30 kW, then discharges at FULL 50 kW → exports to grid!

// CORRECT — using action parameter
{
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
  "c": {}
}
// Result: always active, dynamically adjusts to keep grid >= 10 kW
```

### Quick Decision Table

| You want to... | Use | Location | Example |
|-----------------|-----|----------|---------|
| Execute ONLY when grid > X | Condition | `c` | `"c": { "gpo": "gt", "gpv": 30 }` |
| Keep grid >= X while discharging | Action param | `a` | `"a": { "t": "dt", "ming": 10 }` |
| Limit grid import to X while charging | Action param | `a` | `"a": { "t": "ct", "maxg": 30 }` |

---

## PID Mode Reference

| Rule Type | PID | When to Use |
|-----------|-----|-------------|
| Direct charge/discharge (`ch`/`dis`) | `false` (default) | Exact power command |
| Grid-following with `gpo` condition | `true` | Smooth grid tracking |
| Site limits (`sl` on P9) | N/A (internal PID) | Automatic |
| Goal-based (`ct`/`dt`) | `false` (default) | Power calculated by algorithm |

Only set `pid: true` on `ch`/`dis` rules that have a grid power condition and need smooth grid tracking.
