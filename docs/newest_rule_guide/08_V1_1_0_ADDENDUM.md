# v1.1.0 Addendum — New Rule Vocabulary, Override, Telemetry Contract

App version 1.1.0 extends the rules system. This addendum documents what
changed on top of guides 01–07.

## 1. New action types

| Type | Name | Action fields | Layer |
|------|------|---------------|-------|
| `bx` | Block Export | `lim` (allowed export kW through the block, 0 = hard), `fm` (`firm`/`soft`) | Guardrails (p_9) |
| `bi` | Block Import | `lim` (allowed import kW through the block, 0 = hard), `fm` | Guardrails (p_9) |
| `sc` | Self-Consumption | `tg` (grid target kW, import-positive), `db` (dead band ±kW), `cmax`/`dmax` (charge/discharge caps kW; `dmax: 0` = absorb-only), `smn`/`smx` (SoC window) | User band |
| `hs` | Hold SoC | `sl_` (SoC low %), `sh_` (SoC high %, ≥ `sl_`, defaults to `sl_`), `hy` (hysteresis %, 0–50, default 1) | User band |

Guardrail types (`bx`, `bi`, and the existing `sl`) always execute in the
Guardrails layer — the app hides the priority picker for them and writes them
to the fixed band `p_9`.

## 2. Rule-level recurrence

- `rc`: `'once' | 'daily' | 'weekly' | 'monthly'` — recurrence tag.
  - `rc: 'once'` without an explicit `vu` gets `vu` stamped cloud-side from
    the rule's window (F16); an explicit `vu` is still respected. Once-rules
    are auto-expired after their window passes.
- `md`: `number[]` (1–31) — days of month, ANDed with weekday `d`.

## 3. Polarity matrix (editor enforcement)

The editor greys out latching operator choices (`lib/rule-polarity.ts`):

- `ch`/`ct`: `grid > X` blocked (latch); SoC-min-only gate blocked unless a
  stabilizing `grid < X` gate is present.
- `dis`/`dt`: `grid < X` blocked; SoC-max-only gate blocked unless a
  stabilizing `grid > X` gate is present.
- `sc`: all grid-power gates blocked (the tracking loop fights them; the
  Lambda rejects with 400).
- `hs`: grid gates allowed but warned (chatter) — prefer time windows.
- `between` + charge/discharge: allowed with a bang-bang warning.

Non-fatal `warnings[]` from `POST /schedules` are surfaced in a post-save
alert.

## 4. Operator override

`POST /override/{site_id}` via the `aws-proxy` edge function
(`lib/aws-override.ts`):

```json
{ "action": "ch|dis|sb|auto", "power_kw": 50, "ttl_sec": 3600, "source": "app", "reason": "..." }
```

- Single override slot; `ttl_sec` 1..86400; `action: "auto"` releases.
- The POST response (`override_id`, `issued_at`, request `ttl_sec`) drives the
  banner optimistically; telemetry self-corrects it (SCADA masking is only
  detectable from `operator_source`).
- UI gating only (ADR 0009): issue/release controls are shown to
  `device_users.role` `owner`/`admin`; everyone sees the banner. The Lambda
  checks the API key, not the user.

## 5. Decision-telemetry field contract (InfluxDB `energy_telemetry`)

The app selects these fields and degrades gracefully until the forwarder
Lambda ships them:

| Field | Type | Use |
|-------|------|-----|
| `control_source` | string (`plan`/`schedule`/`operator`/`fallback`) | override banner activation |
| `operator_source` | string (`app`/`scada`) | banner variant, SCADA masking |
| `override_id` | string | reconcile optimistic override |
| `plan_state` | string (`active`/`stale`/`expired`) | plan chip |
| `plan_id`, `plan_revision`, `plan_age_sec` | string/int | plan chip detail |
| `capped_by` | string | reserved |
| `pv_curtail_active` | bool/int | curtailment chip |
| `pv_curtail_export_kw_max` | float | curtailment chip limit |

## 6. Simple mode (behavior object)

The Schedule tab has a per-user local Simple/Pro toggle. Simple mode
reads/writes the whole `behavior` object via GET/PUT `/site-config/{site_id}`
(PUT deep-merges): `zero_export`, `peak_shave`, `offpeak_charge`,
`backup_reserve`, `pv_self_consumption`, `ai_optimization` (informational in
v1.1.0). The cloud materializer turns each setting into a `set_*` rule
asynchronously (replace-by-id). In Pro mode, `set_*` rules get a
"from Settings" badge; editing one warns that the next settings save
overwrites it.

## 7. Rule history

`GET /schedules/{site_id}/history?since&until&rule_id&limit` — read-only
audit trail, 90-day horizon, no restore. Events: `added` / `changed` (with
`changed_fields` + `previous`) / `expired` / `deleted`; attribution derives
from the `updated_by` prefix (app/API, Settings materializer, operator,
auto-expiry).
