# 01 — Quick Start: Schedule Rules for the Web Panel

> Everything you need to build a schedule rule editor in the web panel.
> Covers the API, data format, TypeScript types, CRUD operations, and
> UI patterns — all in one place, using the latest v1.4.3 optimized format.

---

## TL;DR

1. Rules live in an **AWS IoT Named Shadow** (`schedule`), accessed via a REST API
2. The wire format uses **abbreviated keys** to fit within the 8KB shadow limit
3. Rules are organized by **priority** (P4–P9), higher number = higher priority
4. There are **6 action types**: `ch`, `dis`, `sb`, `sl`, `ct`, `dt`
5. **POST replaces all rules** in a priority — always GET-before-POST

---

## API at a Glance

```
Base:  https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
Auth:  x-api-key header
```

| Method | Path | What It Does |
|--------|------|--------------|
| GET | `/schedules/{siteId}` | Read all rules, safety, mode |
| POST | `/schedules/{siteId}` | Write rules/safety/mode (merge by priority key) |

---

## Minimal Example: Create a Rule

```typescript
const API = 'https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default';
const KEY = 'your-api-key';

// 1. GET current rules
const res = await fetch(`${API}/schedules/domagala_1`, {
  headers: { 'x-api-key': KEY },
});
const current = await res.json();

// 2. Add new rule to P7 array
const p7 = [...(current.sch.p_7 || []), {
  id: 'night-charge',
  a: { t: 'ch', pw: 15 },
  c: { ts: 2200, te: 600 },
  d: [1, 2, 3, 4, 5],
}];

// 3. POST the full P7 array back
await fetch(`${API}/schedules/domagala_1`, {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ site_id: 'domagala_1', sch: { p_7: p7 } }),
});
```

---

## What the GET Response Looks Like

```json
{
  "site_id": "domagala_1",
  "v": "1.2",
  "mode": "automatic",
  "safety": { "soc_min": 10, "soc_max": 90 },
  "sch": {
    "p_5": [
      { "id": "emergency-low", "a": { "t": "ch", "pw": 10 }, "c": { "sm": 0, "sx": 10 } }
    ],
    "p_7": [
      {
        "id": "night-charge",
        "a": { "t": "ct", "soc": 80, "maxp": 25, "maxg": 50 },
        "c": { "ts": 2300, "te": 600 },
        "d": "weekdays"
      },
      {
        "id": "peak-discharge",
        "s": "ai",
        "a": { "t": "dt", "soc": 30, "maxp": 50, "ming": 10 },
        "c": { "ts": 1700, "te": 2100 },
        "d": "weekdays"
      }
    ],
    "p_9": [
      { "id": "site-limit", "a": { "t": "sl", "hth": 70, "lth": -40 }, "c": {} }
    ]
  },
  "metadata": { "total_rules": 4, "cloud_rules": 4, "local_rules": 0, "scada_safety_rules": 0 },
  "last_updated": null
}
```

---

## Rule Shape (v1.4.3)

```typescript
interface OptimizedScheduleRule {
  id: string;                       // Unique ID (1-63 chars)
  s?: 'ai' | 'man';                // Source: AI or manual (default: 'man', omit if manual)
  a: OptimizedAction;               // WHAT to do
  c?: OptimizedConditions;          // WHEN to do it ({} = always)
  act?: boolean;                    // Active flag (omit if true, include only when false)
  d?: string | number[];            // Day filter (omit = every day)
  vf?: number;                      // Valid from — Unix timestamp (omit if 0)
  vu?: number;                      // Valid until — Unix timestamp (omit if 0)
}
```

Priority is NOT stored in the rule. It comes from which `p_X` array the rule lives in.
