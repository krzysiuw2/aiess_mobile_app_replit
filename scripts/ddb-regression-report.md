# DDB regression report — domagala_1

Run: 2026-07-01T20:42:33.440Z  |  Backend: compat shim target `ddb`  |  Base: https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default

| Test | Result |
|---|---|
| 1. Golden GET: shape, metadata, safety, mode | PASS |
| 2. Round-trip per action type (ch, dis, ct, threshold) | PASS |
| 3. Priority move p_5 -> p_7, no orphan | PASS |
| 4. Safety SoC write: integers echo, shape unchanged | PASS |
| 5. P9 site limit sl rule round-trip | PASS |
| 7. TZ stability: 3 edit cycles, vf/vu must not drift | PASS |
| 8. Error parity: P3/P10 writes, missing id, ai without vu -> 400 | PASS |
| 9. site-config untouched (GET sanity) | PASS |
| 6. AI rule auto-expiry (s:"ai" + vu = now+5min) | PASS |

## Details

### 1. Golden GET: shape, metadata, safety, mode

- PASS — HTTP 200 — status 200
- PASS — site_id echoes
- PASS — has v (format string) — v=1.2
- PASS — has mode — mode=semi-automatic
- PASS — safety present — {"soc_min":1,"soc_max":100}
- PASS — sch is object
- PASS — metadata counts present — {"last_sync":"2026-07-01T20:36:26Z","rule_count":5,"version":26,"total_rules":5,"local_rules":0,"cloud_rules":5,"scada_safety_rules":0}
- PASS — safety SoC serialized as integers (raw text)
- PASS — metadata.cloud_rules + scada matches visible rules or documented split — visible p4-9=5, metadata={"last_sync":"2026-07-01T20:36:26Z","rule_count":5,"version":26,"total_rules":5,"local_rules":0,"cloud_rules":5,"scada_safety_rules":0}
- PASS — all rules parse for the editor

### 2. Round-trip per action type (ch, dis, ct, threshold)

- PASS — save accepted — status 200: {"message": "Updated: schedules", "site_id": "domagala_1", "shadow_version": 27, "updated_priorities": [5], "total_rules": 4}
- PASS — ZZTEST-CH survives identically
- PASS — ZZTEST-DIS survives identically
- PASS — ZZTEST-CT survives identically
- PASS — ZZTEST-THR survives identically
- PASS — test rules deleted

### 3. Priority move p_5 -> p_7, no orphan

- PASS — create in p_5 — status 200
- PASS — move POST accepted — status 200
- PASS — present in p_7
- PASS — no orphan in p_5
- PASS — cleanup

### 4. Safety SoC write: integers echo, shape unchanged

- PASS — POST accepted — status 200: {"message": "Updated: safety", "site_id": "domagala_1", "shadow_version": 0, "updated_priorities": [], "total_rules": 0}
- PASS — soc_min == 1 — {"soc_min":1,"soc_max":100}
- PASS — soc_max == 100
- PASS — integers in raw JSON
- PASS — safety restored — {"soc_min":1,"soc_max":100}

### 5. P9 site limit sl rule round-trip

- PASS — sl write accepted — status 200: {"message": "Updated: schedules", "site_id": "domagala_1", "shadow_version": 32, "updated_priorities": [9], "total_rules": 1}
- PASS — sl round-trips — {"t":"sl","hth":71,"lth":-47}
- PASS — single sl rule in p_9
- PASS — original p_9 restored — now: {"lth":-48,"t":"sl","hth":70}, want: {"lth":-48,"t":"sl","hth":70}

### 7. TZ stability: 3 edit cycles, vf/vu must not drift

- PASS — vf/vu stable across 3 edits
- PASS — cleanup

### 8. Error parity: P3/P10 writes, missing id, ai without vu -> 400

- PASS — P3 write rejected (400) — status 400: {"error": "Invalid schedules: Cannot modify read-only priority: P3"}
- PASS — P10 write rejected (400) — status 400: {"error": "Invalid schedules: Cannot modify read-only priority: P10"}
- PASS — missing id rejected (400) — status 400: {"error": "Invalid schedules: p_5[0] missing required field: id"}
- PASS — ai without vu rejected (400) — status 400: {"error": "Invalid schedules: p_5[0] AI-generated rules (s:\"ai\") must have vu (valid_until)"}
- PASS — no rejected rules persisted

### 9. site-config untouched (GET sanity)

- PASS — GET /site-config 200 — status 200
- PASS — site_id echoes
- PASS — has expected top-level sections — ai_profile,automation,battery,created_at,financial,general,grid_connection,influxdb,inverter,load_profile,location,power_limits,pv_system,site_id,tariff,updated_at

### 6. AI rule auto-expiry (s:"ai" + vu = now+5min)

- PASS — ai rule accepted — status 200: {"message": "Updated: schedules", "site_id": "domagala_1", "shadow_version": 38, "updated_priorities": [4], "total_rules": 1}
- PASS — ai rule visible before expiry
- PASS — ai rule auto-deleted after vu

All checks passed: the app requires **zero changes** for the DDB-backed legacy API.
