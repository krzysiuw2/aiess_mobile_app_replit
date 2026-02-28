# 03 — Action Groups & Tool Reference

The agent has **11 APIs** split across two action groups. Both groups invoke the same Lambda (`aiess-bedrock-action`). The split exists because Bedrock imposes a limit of 11 APIs per agent (quota increase to 20 pending).

## Group 1: `aiess-management` (6 APIs)

Schedule management, system configuration, and site config reads.

### `get_site_config` — GET

Retrieves the full site configuration from DynamoDB.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |

**Returns:** Complete site config object (battery specs, PV arrays, grid limits, power limits, tariff, load profile, location, description).

---

### `get_current_schedules` — GET

Retrieves all current schedule rules from the IoT Named Shadow.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |

**Returns:** `{ sch: { p_4: [...], p_5: [...], ... p_9: [...] }, mode, safety }`.

---

### `send_schedule_rule` — POST (confirmable)

Creates or updates a schedule rule. Auto-tags `s: "ai"`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `priority` | integer | yes | Priority 4–9 |
| `rule_json` | string | yes | JSON string of the optimized rule object |

**Rule JSON format:** `{ id, a: { t, pw, pid, soc, maxp, maxg, ming, str, hth, lth }, c: { ts, te, sm, sx, gpo, gpv, gpx }, d, vf, vu }`

---

### `delete_schedule_rule` — POST (confirmable)

Deletes a rule by ID and priority.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `priority` | integer | yes | Priority 4–9 |
| `rule_id` | string | yes | Unique rule identifier |

---

### `set_system_mode` — POST (confirmable)

Sets the system operating mode.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `mode` | string | yes | `automatic`, `semi-automatic`, or `manual` |

---

### `set_safety_limits` — POST (confirmable)

Sets hardware-level battery SoC safety limits.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `soc_min` | number | yes | Min SoC 1–50% |
| `soc_max` | number | yes | Max SoC 50–100% |

---

## Group 2: `aiess-analytics` (5 APIs)

Energy monitoring, pricing, charting, and rule history.

### `get_battery_status` — GET

Real-time battery status from the last 2 minutes of telemetry.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |

**Returns:** `{ soc, battery_power_kw, grid_power_kw, pv_power_kw, load_kw, active_rule_id, active_rule_action, timestamp }`.

---

### `get_energy_summary` — GET

Aggregated energy statistics over a time period. Auto-selects the optimal InfluxDB bucket.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `hours` | integer | no | Lookback window (default: 24) |

**Bucket selection:** <=1h → `aiess_v1`, <=24h → `aiess_v1_1m`, <=168h → `aiess_v1_15m`, >168h → `aiess_v1_1h`.

---

### `get_tge_prices` — GET

TGE (Polish energy exchange) electricity prices. Merges current + history.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `hours` | integer | no | 0 or omit = latest only; >0 = current + history |

**Returns (latest only):** `{ price_pln_mwh, price_pln_kwh, timestamp }`.
**Returns (with history):** `{ current_price: {...}, history: [...], period_hours }`.

---

### `get_rule_history` — GET

Shadow config snapshots + active rule execution history. Merges two underlying queries.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `hours` | integer | no | Lookback window (default: 24) |
| `type` | string | no | `config`, `active`, or `both` (default: `both`) |

---

### `get_chart_data` — GET

Generates labeled time-series datasets for chart visualization.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site_id` | string | yes | Device / site identifier |
| `fields` | string | yes | Comma-separated: `grid_power`, `pcs_power`, `soc`, `total_pv_power`, `compensated_power` |
| `hours` | integer | no | Lookback window (default: 24) |
| `chart_type` | string | no | `line` or `bar` (default: `line`) |
| `title` | string | no | Chart title |

**Returns:** `{ _chart: true, chart_type, title, labels: [...timestamps], datasets: [{ label, data, color }], point_count, hours }`.

Field color map: grid_power = red, pcs_power = blue, soc = green, total_pv_power = amber, compensated_power = purple.

---

## Confirmable Operations

Tools marked with `x-requireConfirmation: ENABLED` in the OpenAPI schema trigger Bedrock's `returnControl` mechanism. When the agent decides to call one of these tools, it pauses execution and returns a confirmation request to the user instead of executing immediately.

**Confirmable tools:** `send_schedule_rule`, `delete_schedule_rule`, `set_system_mode`, `set_safety_limits`.

## Temporarily Dropped

`update_site_config` was removed from the action groups to stay within the 11-API quota. It remains implemented in the Lambda handler and will be re-added once the quota increase (11 → 20) is approved. Users can still update site config via the Settings UI in the mobile app.
