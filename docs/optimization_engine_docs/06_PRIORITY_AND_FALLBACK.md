# Priority and Fallback — Schedule Engine Design

**Status:** Design specification  
**Last Updated:** 2026-03-19

This document describes priority semantics, intent mapping, the P5 fallback tier, and offline robustness for an energy storage system with an **11-level priority schedule engine**.

---

## 1. Current Priority Usage Analysis

| Priority | Current usage |
|----------|----------------|
| **P1–P4** | Never used in production. Intended for local rules, but no one creates them. |
| **P5** | Never used. Was “Cloud Baseline” but has no rules. |
| **P6–P8** | Working range. **Currently all rules are in P7** — no differentiation between tiers. |
| **P9** | Active. Site limits (e.g. `hth: 70`, `lth: -40`). Set by the user via the mobile app. |
| **P10** | Reserved for SCADA / grid operator. Not yet implemented. |
| **P11** | Active. Auto-generated safety rules. |

---

## 2. Redefined Priority Semantics (Backward Compatible)

The **same engine** is retained; only **meanings** are clarified and extended. Existing numeric priorities remain valid.

| Priority | New role | Status |
|----------|----------|--------|
| **P11** | **SAFETY** — SoC limits, grid meter offline, cell protection | Unchanged |
| **P10** | **OPERATOR** — SCADA / TSO / future capacity market signals | Unchanged; door open |
| **P9** | **THRESHOLD** — Site limits (import/export protection). Set by user via mobile app, **not** by the optimization engine | Unchanged |
| **P8** | **SCHEDULE-HIGH** — Highest operational priority. Default: peak shaving | Active |
| **P7** | **SCHEDULE-MID** — Middle operational priority. Default: arbitrage | Active |
| **P6** | **SCHEDULE-LOW** — Lower operational priority. Default: PV optimization | Active |
| **P5** | **FALLBACK** — Defensive rules that activate when P6–P8 expire | New purpose |
| **P1–P4** | **DEPRECATED** — Reserved, not used | Deprecated |

---

## 3. Intent-to-Priority Mapping

Mapping is **configurable per site** via `site_config.schedule_intent_map`:

```json
{
  "schedule_intent_map": {
    "peak_shaving": 8,
    "arbitrage": 7,
    "pv_optimization": 6,
    "custom": 6
  }
}
```

**Benefits:**

- The AI agent looks up the intent map and knows exactly which priority to use.
- Different sites can reorder (e.g. profit-focused sites put arbitrage at P8).
- The mobile app shows human-readable intent labels instead of “Priority 7”.
- **No engine code changes** are required — configuration only.

---

## 4. P5 Fallback Tier (Detailed)

### Purpose

Defensive rules that activate when **cloud schedules (P6–P8) expire** and **no new rules** arrive from the cloud.

- Pre-configured **per site**.
- Editable via mobile app **“Fallback Settings”** tab.

### Default P5 rules

```json
{
  "p_5": [
    {
      "id": "fb-zero-export",
      "a": { "t": "ch", "pw": 50, "pid": true },
      "c": { "gpo": "lt", "gpv": -5, "sm": 5, "sx": 90 }
    },
    {
      "id": "fb-peak-shave",
      "a": { "t": "dis", "pw": 50, "pid": true },
      "c": { "gpo": "gt", "gpv": 70, "sm": 10, "sx": 95 }
    },
    {
      "id": "fb-standby",
      "a": { "t": "sb", "pw": 0 },
      "c": {}
    }
  ]
}
```

| Rule | Behavior |
|------|----------|
| **fb-zero-export** | Charge when grid < −5 kW (PV surplus capture). Generally always useful. |
| **fb-peak-shave** | Discharge when grid > 70 kW (near `moc_zamowiona`). Protective. |
| **fb-standby** | Default when nothing else matches. |

**P5 rules do not use `valid_until`** — they never expire. They are **local fallback** rules only.

---

## 5. Three-Level Offline Robustness

### Level 1: Normal

- P6–P8 active from the optimization engine.
- P9 from the mobile app.
- P11 auto-generated.

This is the **normal operating state**.

### Level 2: Stale (cloud schedules expired)

- All P6–P8 rules have passed their `valid_until`.
- No new rules from the cloud within a **configurable window** (default **4 hours**).
- **P5 fallback rules activate automatically** (they have no expiry).
- System logs a warning: **“Cloud schedules stale, using P5 fallback”**.
- Behavior remains **safe and useful**: PV surplus capture, peak shaving, and standby.

### Level 3: Shadow disconnected

- **Same runtime behavior as Level 2.**
- Shadow sync reconnects automatically when connectivity returns.
- P5 fallback may continue indefinitely while disconnected.
- When connectivity returns, **new cloud rules override P5** through normal priority evaluation.

---

## 6. Mandatory `valid_until` for Cloud Rules

- All rules in **P5–P8** produced by the **optimization engine** **MUST** set `valid_until` (e.g. `vu` field).
- The daily planner sets `vu` to **end of the current day** (23:59 local time) or the **next planning cycle**, so stale rules are dropped and P5 fallback can engage when appropriate.

**Manual rules** (user via mobile app) may optionally set `valid_until = 0` (never expires) for permanent rules. The app should **warn** users about indefinite lifetime.

---

## 7. Capacity Market (P10) — Door Open

P10 is reserved for **grid operator / TSO** commands. For **capacity market** (e.g. Rynek Mocy):

- TSO sends a signal via **SCADA** or **cloud API**.
- A **P10** rule is created with the required power output.
- **P10 overrides P1–P9** (including P9 site limits).
- **P10 is bypassed only by P11** safety.

Implementation details are **TBD** in a future update.

---

*End of document.*
