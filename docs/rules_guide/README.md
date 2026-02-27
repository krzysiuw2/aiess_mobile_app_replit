# BESS Schedule Rules - Complete Guide

> Comprehensive reference for managing Battery Energy Storage System (BESS) schedule rules via AWS IoT Shadow.
> Designed as Cursor AI context for mobile app development.

**Schema Version**: v1.4.3 | **Last Updated**: February 2026

---

## How to Use This Guide

This folder is a self-contained documentation package. Copy it into your mobile app project's `docs/` folder so Cursor AI has full context on how BESS rules work.

**For Cursor AI**: Reference any file in this folder when implementing rule management features. The TypeScript types in `06_TYPESCRIPT_TYPES.md` are copy-paste ready, and `07_MOBILE_APP_PATTERNS.md` contains React Native-specific hook implementations.

---

## Quick Start

### 1. Set Up the API Client

```typescript
const API_ENDPOINT = 'https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default';
const API_KEY = '<your-api-key>';

async function getSchedules(siteId: string) {
  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    headers: { 'x-api-key': API_KEY },
  });
  return response.json();
}
```

### 2. Read Rules

```typescript
const data = await getSchedules('domagala_1');
// data.sch.p_7 = array of Priority 7 rules
// data.safety = { soc_min: 5, soc_max: 100 }
// data.mode = 'automatic'
```

### 3. Create a Rule (GET-before-POST)

```typescript
const current = await getSchedules('domagala_1');
const newRule = {
  id: 'EVENING-CHARGE',
  a: { t: 'ch', pw: 30 },
  c: { ts: 1800, te: 2200 },
  d: 'weekdays',
};
const merged = [...(current.sch.p_7 || []), newRule];

await fetch(`${API_ENDPOINT}/schedules/domagala_1`, {
  method: 'POST',
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ site_id: 'domagala_1', sch: { p_7: merged } }),
});
```

---

## Folder Contents

| File | Description |
|------|-------------|
| [01_SHADOW_SCHEMA.md](./01_SHADOW_SCHEMA.md) | AWS IoT Shadow structure, field mapping, 8KB limit |
| [02_ACTION_TYPES.md](./02_ACTION_TYPES.md) | All 6 action types with fields, defaults, examples |
| [03_CONDITIONS_AND_SCHEDULING.md](./03_CONDITIONS_AND_SCHEDULING.md) | Time, SoC, grid conditions, weekdays, validity |
| [04_SAFETY_LIMITS.md](./04_SAFETY_LIMITS.md) | Safety SoC limits (v1.4.3), overrides all rules |
| [05_API_REFERENCE.md](./05_API_REFERENCE.md) | GET/POST endpoints, CRUD patterns, cURL examples |
| [06_TYPESCRIPT_TYPES.md](./06_TYPESCRIPT_TYPES.md) | Copy-paste-ready type definitions |
| [07_MOBILE_APP_PATTERNS.md](./07_MOBILE_APP_PATTERNS.md) | React Native hooks, helpers, form conversion |
| [08_EXAMPLES.md](./08_EXAMPLES.md) | Real-world rule examples for every action type |
| [09_PRIORITY_SYSTEM.md](./09_PRIORITY_SYSTEM.md) | P1-P11 deep-dive, P9 dual-mode behavior |
| [scripts/manage-rules.ps1](./scripts/manage-rules.ps1) | PowerShell interactive CLI for rule management |
| [scripts/curl-examples.sh](./scripts/curl-examples.sh) | cURL examples for all API operations |

---

## Key Concepts at a Glance

### Rule Format (Optimized v1.4.2)

```json
{
  "id": "EVENING-CHARGE",
  "a": { "t": "ch", "pw": 30 },
  "c": { "ts": 1800, "te": 2200 },
  "d": "weekdays"
}
```

### Priority System (Cloud: P4-P9)

| Priority | Name | Use Case |
|----------|------|----------|
| **P9** | Site Limit | Grid connection caps (dual-mode) |
| **P8** | High | Urgent commands, peak shaving |
| **P7** | Normal | Standard daily schedules |
| **P6** | Low | Background optimization |
| **P5** | Baseline | Fallback rules |
| **P4** | Reserved | Future use |

### Action Types

| Code | Name | Key Fields |
|------|------|------------|
| `ch` | Charge | `pw` (power kW) |
| `dis` | Discharge | `pw` (power kW) |
| `sb` | Standby | `pw: 0` |
| `sl` | Site Limit | `hth`, `lth` (thresholds) |
| `ct` | Charge to Target | `soc`, `maxp`, `maxg`, `str` |
| `dt` | Discharge to Target | `soc`, `maxp`, `ming`, `str` |

### Critical Rules

1. **Always GET before POST** -- POST replaces all rules in a priority
2. **No `p` field in rules** -- priority is inferred from the `p_X` array key
3. **Omit default values** -- saves space in the 8KB shadow limit
4. **Use optimized format only** -- abbreviated keys (`sch`, `p_X`, `ch`, `ts`, etc.)

---

## Shadow Structure Overview

```json
{
  "state": {
    "desired": {
      "v": "1.2",
      "mode": "automatic",
      "safety": { "soc_min": 5, "soc_max": 100 },
      "sch": {
        "p_7": [{ "id": "RULE-1", "a": { "t": "ch", "pw": 30 }, "c": {} }],
        "p_9": [{ "id": "SITE-LIMIT", "a": { "t": "sl", "hth": 70, "lth": -40 }, "c": {} }]
      }
    }
  },
  "version": 4275,
  "timestamp": 1736368800
}
```
