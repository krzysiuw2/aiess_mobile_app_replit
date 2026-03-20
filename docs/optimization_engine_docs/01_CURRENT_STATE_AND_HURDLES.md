# Current State and Hurdles

> **Purpose**: Document what works, what doesn't, and the specific problems the v2.0 architecture solves.
> **Last Updated**: 2026-03-19

---

## 1. What Works Well Today

### Priority System (P9 + P11)

The 11-level priority system is sound at its core. P11 safety enforcement (SoC limits, grid meter offline detection) and P9 dual-mode site limits (passive capping + active PID control) work reliably. The production site runs `R1` at P9 with `hth: 70, lth: -40` and it correctly caps all lower-priority rules while actively controlling the grid when thresholds are violated.

### PID Controller

The PID controller smoothly ramps battery charge/discharge to reach setpoints without grid oscillation. The compensated grid calculation (`measured_grid + pcs_power`) prevents the PID from fighting its own battery feedback. The ramp limiter prevents sudden power changes that could trip the EMS.

### Goal-Based Actions (v1.4.0)

`charge_to_target` and `discharge_to_target` with strategies (`equal_spread`, `aggressive`, `conservative`) work well in production. The `calculate_dynamic_power()` function correctly adjusts power based on time remaining and energy delta. The production rules `WEEKLY-DIS-EV` (discharge to 40% SoC, Mon-Thu) and `RDC-2-ALLDAY` (discharge to 2% SoC, Friday) demonstrate this.

### Compact Format (Shadow V2, S2-S6)

The abbreviated format saves significant Shadow payload size:

| Optimization | Savings | Example |
|-------------|---------|---------|
| S1: Root keys | ~80 bytes fixed | `v`, `sch`, `p_X` |
| S2: Weekday shorthand | ~40 bytes/rule | `"wkd"`, `[1,2,3,4]` |
| S3: Field abbreviations | ~80 bytes/rule | `id`, `a`, `c`, `pw` |
| S4: Omit defaults | ~35 bytes/rule | Skip `act: true`, `pid: false` |
| S5: Compact time | ~6 bytes/rule | `1400` vs `"14:00"` |
| S6: Flattened conditions | ~10 bytes/rule | `ts`/`te`/`sm`/`sx`/`gpo`/`gpv` |

The edge device parser (`schedule_parser.c`) already supports both verbose and compact formats with full backward compatibility.

### Shadow Sync

The shadow sync process (`shadow_sync_main.c`) correctly merges cloud rules (P4-P9) with local rules (P1-P3), protects P10-P11 from cloud override, and triggers hot-reload via IPC. File-based inotify watch on `schedules.json` provides sub-second reload.

---

## 2. The Format Mismatch Problem

Three different systems produce or consume schedule rules, and they all use slightly different formats.

### AI Agent Output (from `04_DAILY_AGENT.md`)

```json
{
  "rules": [
    {
      "id": "agent-daily-arb-1",
      "priority": 6,
      "action": {
        "type": "charge",
        "power_kw": 50,
        "target_soc": 80
      },
      "conditions": {
        "time_start": "02:00",
        "time_end": "06:00",
        "soc_min": 20,
        "soc_max": 80,
        "price_above": 300,
        "price_below": 200
      },
      "days": ["mon", "tue", "wed", "thu", "fri"]
    }
  ],
  "reasoning": "..."
}
```

### Mobile App TypeScript (`OptimizedScheduleRule` from `05_SCHEDULE.md`)

```typescript
{
  id: "arb-c1",
  s: "ai",
  a: { t: "ch", pw: 50, pid: true },
  c: { ts: 200, te: 600, sm: 20, sx: 80 },
  d: "wkd",
  vu: 1742425200
}
```

### Edge Device Schema (`schedules.schema.json`)

```json
{
  "rule_id": "arb-c1",
  "priority": 6,
  "conditions": {
    "time": { "start": "02:00", "end": "06:00" },
    "soc": { "min": 20, "max": 80 }
  },
  "action": {
    "type": "charge",
    "power_kw": 50,
    "use_pid": true
  },
  "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri"]
}
```

### Production Runtime (`/var/lib/aiess/schedules.json`)

```json
{
  "id": "LAD-50",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "ts": 500, "te": 2100, "gpo": "lt", "gpv": 0 },
  "d": [1, 2, 3, 4, 5]
}
```

### Specific Mismatches

| Field | AI Agent | Mobile App | Edge Schema | Production |
|-------|----------|------------|-------------|------------|
| Rule ID key | `id` | `id` | `rule_id` | `id` |
| Time format | `time_start`/`time_end` (flat strings) | `ts`/`te` (HHMM int) | `time.start`/`.end` (nested strings) | `ts`/`te` (HHMM int) |
| SoC format | `soc_min`/`soc_max` (flat) | `sm`/`sx` | `soc.min`/`.max` (nested) | `sm`/`sx` |
| Grid power | Not supported | `gpo`/`gpv` | `grid_power.operator`/`.value` (nested) | `gpo`/`gpv` |
| Weekdays | `days: ["mon",...]` (lowercase) | `d: "wkd"` or `d: [1,2,3]` | `weekdays: ["Mon",...]` (capitalized) | `d: [1,2,3,4,5]` |
| Action `idle` | Supported | Not used | Not in schema (`standby` instead) | Not used |
| Action `limit_export` | Supported | Not used | Not in schema (`site_limit` instead) | Not used |
| Price conditions | `price_above`, `price_below` | Not used | **Not supported on edge** | Not used |
| `use_pid` | Not specified | `pid` | `use_pid` | `pid` |
| Source tag | Not specified | `s: "ai"` | Not in schema | Not used |
| Validity | Not specified | `vf`/`vu` | `valid_from`/`valid_until` | Not used (0 = no expiry) |

### Root Cause

There is no single canonical format definition. Each system was developed independently:

- The edge device schema (`schedules.schema.json`) uses verbose nested format
- The Shadow V2 optimizations (S2-S6) created a compact format for wire efficiency
- The mobile app adopted the compact format
- The AI agent docs defined yet another format with flat conditions and different naming
- The edge parser supports BOTH formats but the AI agent outputs NEITHER correctly

---

## 3. Why AI-Generated Rules Are Messy

The current AI optimization agent (documented in `code_reference/ai_optimization_agent/`) uses Claude Sonnet 4 to generate rule JSON. This fails for several reasons:

### Too Many Degrees of Freedom

The LLM receives optimization "hints" (charge/discharge windows, PV surplus, peak shaving data) and must construct arbitrary JSON. It can create any number of rules, at any priority, with any combination of conditions. There are no guardrails on the output structure.

### No Schema Validation Before Deployment

The Schedules API does not validate rules against `schedules.schema.json` before writing to IoT Shadow. If the LLM generates `"type": "idle"` (which the edge doesn't support), the rule gets deployed and silently ignored.

### Unsupported Features in LLM Output

The AI agent prompt includes `price_above` and `price_below` conditions, but the edge device has no concept of energy prices. The edge only supports time, SoC, and grid power conditions. Price-based logic must be pre-computed into fixed time windows by the optimization engine.

### Inconsistent Naming

The AI agent prompt uses `idle` where the edge expects `standby`, `limit_export` where the edge expects `site_limit`, `time_start` where the edge expects `ts` or `time.start`. Each LLM call may produce subtly different formatting.

### No Feedback on Failures

When a rule is malformed and the edge parser rejects it, there is no feedback mechanism to the AI agent. The agent believes its rules were applied, but the edge device is running different rules (or none).

---

## 4. Real-World Production Rules Analysis

The actual `/var/lib/aiess/schedules.json` running in production demonstrates what a well-designed rule set looks like. These rules were **manually crafted** (not AI-generated) and implement a sophisticated weekly pattern:

### P9: Site Limits (Always-On)

```json
{ "id": "R1", "a": { "t": "sl", "hth": 70, "lth": -40 }, "c": {} }
```

**What it does**: Grid import never exceeds 70 kW, grid export never exceeds 40 kW. This protects the grid connection agreement. It's always active (no conditions) and applies to all days.

**Set by**: User/installer via mobile app.

### P7: Weekday Operational Rules

**Rule: `LAD-50` — PV Surplus Capture (Mon-Fri)**

```json
{
  "id": "LAD-50",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "ts": 500, "te": 2100, "gpo": "lt", "gpv": 0 },
  "d": [1, 2, 3, 4, 5]
}
```

Charge at up to 50 kW when grid goes below 0 (PV surplus), 05:00-21:00, weekdays. The PID controller ramps charge power to keep grid near 0 kW. Combined with P9 `lth: -40`, the system allows up to 40 kW export while charging with the excess.

**Rule: `WEEKLY-DIS` — Morning Discharge (Mon-Fri)**

```json
{
  "id": "WEEKLY-DIS",
  "a": { "t": "dt", "soc": 40, "str": "eq", "maxp": 50, "ming": 20 },
  "c": { "ts": 600, "te": 1100 },
  "d": [1, 2, 3, 4, 5]
}
```

Discharge-to-target 40% SoC, equal spread, 06:00-11:00, weekdays. The `ming: 20` constraint ensures grid import stays above 20 kW during discharge (prevents export from discharge). This is the morning arbitrage window — discharge stored energy during higher-price morning hours.

**Rule: `WEEKLY-DIS-EV` — Evening Discharge (Mon-Thu)**

```json
{
  "id": "WEEKLY-DIS-EV",
  "a": { "t": "dt", "soc": 40, "str": "eq", "maxp": 50, "ming": 10 },
  "c": { "ts": 1400, "te": 2100 },
  "d": [1, 2, 3, 4]
}
```

Same as morning but for afternoon/evening (14:00-21:00), Mon-Thu only. Lower `ming: 10` because evening load is typically higher so less risk of export.

**Rule: `RDC-2-ALLDAY` — Friday Full Discharge**

```json
{
  "id": "RDC-2-ALLDAY",
  "a": { "t": "dt", "soc": 2, "str": "eq", "maxp": 50, "ming": 10 },
  "c": { "ts": 1400, "te": 2100 },
  "d": [5]
}
```

Discharge to 2% SoC on Friday afternoon. This empties the battery for maximum weekend PV surplus absorption. The optimization engine should automate this pattern: detect that weekends have high PV surplus and pre-empty the battery on Friday.

**Rule: `LAD-50-WKND` — Weekend PV Surplus Capture**

```json
{
  "id": "LAD-50-WKND",
  "a": { "t": "ch", "pw": 50, "pid": true },
  "c": { "gpo": "lt", "gpv": -5 },
  "d": [0, 6]
}
```

Charge when grid < -5 kW on weekends (Sat/Sun). More conservative threshold than weekdays (`-5` vs `0`) because weekend load is near-zero and we want to export some surplus to the grid before charging.

**Rule: `WEEKND-DIS` — Weekend Discharge (currently inactive)**

```json
{
  "id": "WEEKND-DIS",
  "a": { "t": "dis", "pw": 20, "pid": true },
  "c": { "gpo": "gt", "gpv": 2 },
  "act": false
}
```

Discharge when grid > 2 kW on weekends. Currently disabled (`act: false`). This would discharge to reduce any grid import during weekends, but it's turned off — likely because the site owner prefers to keep battery full for Monday morning discharge.

### The Weekly Pattern

This rule set implements a smart weekly cycle:

```
Mon-Thu:  Charge from PV surplus → Discharge morning + evening to SoC 40%
Friday:   Charge from PV surplus → Full discharge to SoC 2% (empty for weekend)
Sat-Sun:  Charge from PV surplus (conservative threshold) → Keep stored
Monday:   Start week with battery full from weekend PV
```

**This pattern was designed by a human who understands the site.** The optimization engine should be able to derive this pattern automatically from:

- Weekly PV forecast (high surplus on weekends with zero load)
- Weekly load forecast (factory runs Mon-Fri)
- TGE price patterns (higher weekday prices for discharge)
- Battery capacity and grid limits

---

## 5. Priority System Gaps

### Unused Priorities

| Priority | Intended Use | Actual Use |
|----------|-------------|------------|
| P1 | Default standby | Never populated in production |
| P2 | Local simple rules | Never used |
| P3 | Local time-of-day | Never used |
| P4 | Cloud reserved | Never used |
| P5 | Cloud baseline | Never used |
| P6 | Cloud low priority | Never used |
| P7 | Cloud normal | **ALL operational rules live here** |
| P8 | Cloud high priority | Never used |
| P9 | Site limits | Active (`R1`) |
| P10 | SCADA | Not yet implemented |
| P11 | Safety | Active (auto-generated) |

All six operational rules are crammed into P7. There's no semantic distinction between PV surplus capture, arbitrage discharge, and weekend management — they're all P7.

### No Intent Mapping

The priority number doesn't communicate the rule's purpose. `LAD-50` (PV surplus capture) and `WEEKLY-DIS` (arbitrage discharge) are at the same priority even though they serve different optimization goals. If the AI agent creates rules, it has no guidance on which priority to assign to which intent.

### P5 Unused but Ideal for Fallback

P5 ("Cloud Baseline") was designed as the lowest cloud priority but is never used. It's the natural home for defensive fallback rules that activate when higher-priority cloud schedules expire.

---

## 6. Missing Translation Layer

There is no `normalizeRule()` function that converts between formats. The current flow:

```
AI Agent → (raw LLM JSON) → Schedules API → (pass-through) → IoT Shadow → Edge Device
```

Should be:

```
AI Agent → Schedules API → normalizeRule() → schema validation → IoT Shadow → Edge Device
```

The `normalizeRule()` function would handle:

- `id` → already correct (edge parser accepts both `id` and `rule_id`)
- `time_start`/`time_end` → `ts`/`te` (HHMM integer)
- `soc_min`/`soc_max` → `sm`/`sx`
- `idle` → `sb` (standby)
- `limit_export` → `sl` (site_limit), requires `hth`/`lth`
- `days: ["mon",...]` → `d: [1,2,3,4,5]` (number array)
- Auto-inject `pid: true` for all PID-controlled rules
- Reject `price_above`/`price_below` (not supported on edge)
- Validate against `schedules.schema.json` and reject malformed rules

With the v2.0 optimization engine generating rules in canonical compact format, this translation layer becomes much simpler — it only needs to handle edge cases from manual rule creation in the mobile app, not AI-generated variability.
