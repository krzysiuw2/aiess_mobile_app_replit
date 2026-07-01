# DDB Config-Plane Migration — App Deliverables & Test Plan

Status as of 2026-07-01. Backend context: the AIESS config plane moved from
AWS IoT Device Shadow to DynamoDB `aiess_device_config`; `domagala_1` is
DDB-authoritative behind the legacy-shape compat shim (see architecture repo:
`contracts/api-gateway-endpoints.md`).

## Phase 1 — regression against the compat shim (DONE, all pass)

- Harness: `scripts/ddb-regression.mjs` (Node, no deps; API key read from the
  `aiess-update-schedules` Lambda env via AWS CLI).
- Result: **all 9 checklist items pass with zero app changes** — see
  `scripts/ddb-regression-report.md`. AI-rule auto-expiry confirmed working
  on the DDB path (~5.5 min after `vu`). No backend bugs found.
- Re-run any time: `node scripts/ddb-regression.mjs [--site <id>] [--skip-expiry]`.
  The harness restores all state it touches (rules, safety, P9 site limit).

## Phase 2 — DDB-native per-section path (feature-flagged, OFF)

### What shipped in the app

| Piece | Where |
|---|---|
| Remote flag `use_ddb_config_plane` (default false) | Supabase table `app_feature_flags` (migration `supabase/migrations/20260701_create_app_feature_flags.sql`), `lib/feature-flags.ts`, `hooks/useFeatureFlag.ts` |
| Section types (`ConfigSectionEnvelope`, `SharedSchedulesPayload`, `SharedSiteLimitsPayload`, `SharedIdentityPayload`, `DeviceManifest`) | `types/index.ts` |
| Transport `callAwsConfigProxy` (posts `{path, method, body, headers}` to the `aws-config-proxy` edge function) | `lib/edge-proxy.ts` |
| `getManifest` / `getSection` / `putSection` (+ `ConfigConflictError` on 412, `ConfigValidationError` on 400) | `lib/aws-schedules.ts` |
| Flag-gated read model + fetch→modify→PUT `If-Match` mutations | `hooks/useSchedules.ts` |
| Read-only device panel (fw version, EMS vendor, mode, grid band) | `components/settings/DeviceConfigPanel.tsx`, mounted in Settings → System |
| SigV4 proxy (deliverable, **not deployed**) | `supabase/functions/aws-config-proxy/index.ts` |

### Safety invariants (enforced in code)

- The app writes only `p_4..p_9`. On the DDB path, `p_1..p_3` and
  `p_10..p_11` are carried through verbatim and deep-compared against the
  fetched copy before every PUT; a mismatch aborts the write.
- Every PUT sends `If-Match` with the etag from the immediately preceding
  GET. On 412 the app refetches, notifies the user
  ("Rules changed elsewhere — reloaded"), and re-applies the edit once.
- The flag resolver defaults to `false` on any error, so failure of the flag
  fetch always lands on the legacy `/schedules` path.

### Blocking prerequisite before enabling the flag

The config-plane `/devices/*` routes use **AWS_IAM (SigV4)** auth. The app
reaches them only through the new `aws-config-proxy` Supabase function, which
must first be deployed by ops:

1. Create an IAM principal limited to `execute-api:Invoke` on the
   `aiess-config-plane` API.
2. `supabase secrets set CONFIG_API_ENDPOINT=... CONFIG_AWS_ACCESS_KEY_ID=...
   CONFIG_AWS_SECRET_ACCESS_KEY=...`
3. `supabase functions deploy aws-config-proxy`
4. Only then: `update app_feature_flags set enabled = true where key = 'use_ddb_config_plane';`

Rollback = flip the flag back to `false` (no app-store release needed). A
backend rollback of a site to `shadow` is invisible to the app on either path.

## Phase 2 test plan (run before enabling the flag in production)

Flag OFF (regression — should behave byte-identically to today):

1. Schedule list loads; create/edit/move/delete/toggle a rule; safety SoC and
   P9 site limit edits — all via legacy `/schedules`.
2. Settings → System shows no "Device Info" panel.

Flag ON (against a dev/soak site, proxy deployed):

1. Schedule list renders identical content to the legacy GET for the same
   site (spot-compare rule cards + safety values).
2. Round-trip each action type (`ch`, `dis`, `ct`, threshold); refetch shows
   identical rules; delete works.
3. Priority move p5→p7 leaves no orphan.
4. Safety SoC edit preserves `import_kw_max`/`export_kw_max` in
   `shared.site_limits` (verify via `GET /devices/{id}/sections/shared.site_limits`).
5. Concurrency: edit the same site from a second client between GET and save;
   expect the "Rules changed elsewhere" notice and a successful retried write.
6. Attempted P3/P10 writes are blocked client-side (guard throws) and
   server-side (schema 400).
7. Device Info panel shows fw version / EMS vendor / mode / grid band.
8. Kill switch: set the flag to false; app returns to legacy path within
   ~1 min (query staleTime) or on app restart, without a release.
