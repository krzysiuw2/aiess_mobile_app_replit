# Action Types Reference

> All 6 action types supported by the BESS schedule rule system.
> Each action is specified in the `a` (action) block of a rule.

---

## Action Type Summary

| Code | Name | Key Fields | Typical Priority |
|------|------|------------|------------------|
| `ch` | Charge | `pw` | P5-P8 |
| `dis` | Discharge | `pw` | P5-P8 |
| `sb` | Standby | `pw: 0` | P5-P7 |
| `sl` | Site Limit | `hth`, `lth` | **P9 only** |
| `ct` | Charge to Target | `soc`, `maxp`, `maxg`, `str` | P5-P8 |
| `dt` | Discharge to Target | `soc`, `maxp`, `ming`, `str` | P5-P8 |

---

## 1. Charge (`ch`)

Fixed power battery charging.

### Schema

```json
{ "a": { "t": "ch", "pw": 30 } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"ch"` |
| Power | `pw` | number | Yes | -- | Charge power in kW (>= 0) |
| PID | `pid` | boolean | No | `false` | PID control for grid-following. **Omit if false.** |

### Behavior

- **Direct mode** (default, `pid` omitted): Sends exact power command to the EMS. "Charge 30 kW" means exactly 30 kW.
- **PID mode** (`pid: true`): Uses PID controller to track a grid setpoint. Use this only for grid-following behavior with a grid power condition.
- **Power 999**: Special marker meaning "use device maximum power".

### Examples

```json
// Simple charge at 30 kW
{ "a": { "t": "ch", "pw": 30 } }

// Grid-following charge with PID (use with grid power condition)
{ "a": { "t": "ch", "pw": 50, "pid": true } }

// Charge at max device power
{ "a": { "t": "ch", "pw": 999 } }
```

---

## 2. Discharge (`dis`)

Fixed power battery discharging.

### Schema

```json
{ "a": { "t": "dis", "pw": 50 } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"dis"` |
| Power | `pw` | number | Yes | -- | Discharge power in kW (>= 0) |
| PID | `pid` | boolean | No | `false` | PID control for grid-following. **Omit if false.** |

### Behavior

Same as Charge but in reverse. Direct mode by default, PID mode for grid-following.

### Examples

```json
// Simple discharge at 50 kW
{ "a": { "t": "dis", "pw": 50 } }

// Grid-following discharge with PID
{ "a": { "t": "dis", "pw": 50, "pid": true } }
```

---

## 3. Standby (`sb`)

No power flow (idle state).

### Schema

```json
{ "a": { "t": "sb", "pw": 0 } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"sb"` |
| Power | `pw` | number | Yes | -- | Always `0` |

### Example

```json
{
  "id": "WEEKEND-STANDBY",
  "a": { "t": "sb", "pw": 0 },
  "c": {},
  "d": "weekend"
}
```

---

## 4. Site Limit (`sl`) -- P9 Only

Grid connection power limits. Constrains all power flow to stay within grid connection agreement.

**This action type is exclusively for P9 rules.**

### Schema

```json
{ "a": { "t": "sl", "hth": 70, "lth": -40 } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"sl"` |
| High Threshold | `hth` | number | Yes | -- | Max import from grid (kW, positive) |
| Low Threshold | `lth` | number | Yes | -- | Max export to grid (kW, negative) |

### Dual-Mode Behavior

P9 site limits operate in **two modes simultaneously**:

#### Mode 1: Passive Capping

When any P1-P8 rule is executing, P9 **caps its power** to stay within thresholds.

```
Example:
  P9 hth: 70 kW
  Current grid: 50 kW
  P7 wants to charge: 40 kW
  Expected: 50 + 40 = 90 kW (exceeds P9!)

  P9 caps charge: 70 - 50 = 20 kW available
  Result: Battery charges at 20 kW, grid = 70 kW
```

#### Mode 2: Active PID Controller

When **no other rule is active** AND grid thresholds are violated, P9 **generates PID-controlled commands**.

```
Example:
  P9 hth: 70 kW
  Current grid: 80 kW (exceeded!)
  No P1-P8 rule active

  P9 generates: DISCHARGE 10 kW (PID-controlled)
  Result: Grid returns to 70 kW
```

#### Behavior Matrix

| Scenario | P9 Mode | Action |
|----------|---------|--------|
| P7 charging, grid at threshold | Capping | Caps P7 charge power |
| No rule active, grid > hth | Active | PID discharge |
| No rule active, grid < lth | Active | PID charge |
| P10 SCADA active | Bypassed | SCADA overrides P9 |
| Grid within thresholds, no rule | Inactive | Falls through to P1 standby |

### Example

```json
{
  "id": "SITE-LIMIT-FARM",
  "a": { "t": "sl", "hth": 70, "lth": -40 },
  "c": {}
}
```

This single rule placed in `p_9`:
1. **Caps** all P1-P8 rules to stay within +70/-40 kW
2. **Actively controls** grid when thresholds are violated (PID)

See [09_PRIORITY_SYSTEM.md](./09_PRIORITY_SYSTEM.md) for full P9 deep-dive.

---

## 5. Charge to Target (`ct`)

Goal-based charging to reach a target SoC by end of time window.

### Schema

```json
{ "a": { "t": "ct", "soc": 80, "maxp": 50, "maxg": 30, "str": "eq" } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"ct"` |
| Target SoC | `soc` | number | Yes | -- | Target battery % (0-100) |
| Max Power | `maxp` | number | No | 999 | Max charge power in kW |
| Max Grid | `maxg` | number | No | 999999 | Max grid import in kW (action parameter) |
| Strategy | `str` | string | No | `"eq"` | Charging strategy |
| PID | `pid` | boolean | No | `false` | PID control. **Omit if false.** |

### Strategies

| Code | Name | Behavior |
|------|------|----------|
| `eq` | Equal Spread | Spreads power evenly over the time window |
| `agg` | Aggressive | Charges as fast as possible at the start |
| `con` | Conservative | Charges slowly, accelerates toward the end |

### Immediate Mode

If **no conditions** are provided (no `c` block or `c: {}`), the rule operates in **immediate max power mode**:
- Charges at `maxp` immediately
- Ignores time constraints
- Continues until `soc` is reached

### Grid Constraint: `maxg` (Action Parameter)

`maxg` is an **action parameter** (inside `a`), NOT a condition. It dynamically adjusts charge power to keep grid import below this value.

```
Example:
  maxg: 30 kW
  Current site load: 20 kW
  Available for charging: 30 - 20 = 10 kW
  Battery charges at 10 kW (not maxp!)
```

See [Conditions vs Action Parameters](#conditions-vs-action-parameters) below.

### Examples

```json
// Charge to 80% overnight, spread evenly
{
  "id": "NIGHT-CHARGE",
  "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
  "c": { "ts": 2300, "te": 600 },
  "d": "weekdays"
}

// Immediate charge to 90% at max power
{
  "id": "EMERGENCY-CHARGE",
  "a": { "t": "ct", "soc": 90, "maxp": 100 }
}
```

---

## 6. Discharge to Target (`dt`)

Goal-based discharging to reach a target SoC by end of time window.

### Schema

```json
{ "a": { "t": "dt", "soc": 20, "maxp": 50, "ming": 10, "str": "eq" } }
```

### Fields

| Field | Key | Type | Required | Default | Description |
|-------|-----|------|----------|---------|-------------|
| Type | `t` | string | Yes | -- | `"dt"` |
| Target SoC | `soc` | number | Yes | -- | Target battery % (0-100) |
| Max Power | `maxp` | number | No | 999 | Max discharge power in kW |
| Min Grid | `ming` | number | No | 0 | Min grid power to maintain (action parameter) |
| Strategy | `str` | string | No | `"eq"` | Discharge strategy |
| PID | `pid` | boolean | No | `false` | PID control. **Omit if false.** |

### Grid Constraint: `ming` (Action Parameter)

`ming` is an **action parameter** (inside `a`), NOT a condition. It dynamically adjusts discharge power to keep grid power above this value, preventing export to grid.

```
Example:
  ming: 10 kW
  Current grid: 15 kW
  Available for discharge: 15 - 10 = 5 kW
  Battery discharges at 5 kW (not maxp!)
  Grid stays at 10 kW (no export)
```

**This is critical for discharge_to_target** -- without `ming`, the battery may discharge at full power and export to the grid.

### Examples

```json
// Discharge to 30% during peak, keep grid >= 10 kW
{
  "id": "PEAK-DISCHARGE",
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
  "c": { "ts": 1700, "te": 2100 },
  "d": "weekdays"
}

// Aggressive discharge to 20% (no grid constraint)
{
  "id": "FAST-DISCHARGE",
  "a": { "t": "dt", "soc": 20, "maxp": 100, "str": "agg" },
  "c": { "ts": 1800, "te": 2000 }
}
```

---

## Conditions vs Action Parameters

This is the **most common source of bugs**. There are two different ways to work with grid power:

### Grid Power CONDITION (`gpo`/`gpv` in `c`)

- **Location**: Inside conditions block `c`
- **Controls**: **WHEN** to execute (binary: on/off)
- **Use for**: Fixed power actions (`ch`, `dis`, `sb`)

```json
{
  "a": { "t": "dis", "pw": 50 },
  "c": { "gpo": "gt", "gpv": 30 }
}
```
Rule activates only when grid > 30 kW. When active, discharges at fixed 50 kW.

### Grid CONSTRAINT Parameter (`maxg`/`ming` in `a`)

- **Location**: Inside action block `a`
- **Controls**: **HOW** to execute (analog: dynamic adjustment)
- **Use for**: Goal-based actions (`ct`, `dt`)

```json
{
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
  "c": {}
}
```
Rule is always active. Dynamically adjusts discharge to keep grid >= 10 kW.

### Comparison

| Aspect | Condition (`gpo`/`gpv`) | Action Param (`ming`/`maxg`) |
|--------|------------------------|------------------------------|
| Location | `"c": {...}` | `"a": {...}` |
| Controls | WHEN to execute | HOW to execute |
| Effect | Binary (on/off) | Dynamic adjustment |
| For fixed actions | Yes (`ch`, `dis`, `sb`) | Not applicable |
| For goal-based | Not recommended | Yes (`ct`, `dt`) |

### Common Mistake

```json
// WRONG: Using grid CONDITION with discharge_to_target
{
  "a": { "t": "dt", "soc": 30, "maxp": 50 },
  "c": { "gpo": "gt", "gpv": 30 }
}
// Result: Activates when grid > 30 kW, then discharges at FULL 50 kW
// Grid drops to near zero, exports to grid!

// CORRECT: Using grid ACTION PARAMETER
{
  "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
  "c": {}
}
// Result: Always active, dynamically adjusts to keep grid >= 10 kW
```

### Quick Reference

| Want to... | Use | Location | Example |
|------------|-----|----------|---------|
| Execute ONLY when grid > X | Condition | `"c"` | `"c": {"gpo": "gt", "gpv": 30}` |
| Keep grid >= X while discharging | Action param | `"a"` | `"a": {"t": "dt", "ming": 10}` |
| Limit grid import to X while charging | Action param | `"a"` | `"a": {"t": "ct", "maxg": 30}` |

---

## PID Mode Reference

| Rule Type | PID | Reason |
|-----------|-----|--------|
| Direct charge/discharge | `false` (default) | Exact power command |
| Grid-following (with `gpo` condition) | `true` | Smooth grid tracking |
| Site limits (P9) | N/A (internal PID) | Automatic |
| Goal-based (`ct`, `dt`) | `false` (default) | Power calculated by algorithm |

Only set `pid: true` on `ch`/`dis` rules that have a grid power condition and need smooth grid tracking.
