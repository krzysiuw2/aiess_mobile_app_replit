# Intraday Adjuster Agent

The Intraday Adjuster agent (`lambda/agent-intraday/`) performs short-interval checks to detect forecast deviations and adjust schedules. It uses a **gated LLM architecture**: ~95% of runs use pure math adjustments; only ~5% invoke Bedrock when deviations are major.

---

## 1. Trigger & Schedule

| Property | Value |
|----------|-------|
| **Trigger** | EventBridge rate rule |
| **Schedule** | `rate(15 minutes)` |
| **Reserved concurrency** | 1 (single instance at a time) |

---

## 2. Gated LLM Architecture

```
                    ┌─────────────────────────────────────┐
                    │  Fetch telemetry + forecast + state │
                    └─────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────┐
                    │  Compute deviations (PV, load, SoC)  │
                    └─────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────┐
                    │  Health check (rollback triggers)    │
                    └─────────────────────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │ CRITICAL?                     │
                        │ (grid overload, SoC < min,    │
                        │  illegal export)              │
                        └───────────────┬───────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │ YES                │                   │ NO
                    ▼                   │                   ▼
        ┌───────────────────┐           │       ┌───────────────────────┐
        │ ROLLBACK schedule │           │       │ needs_llm?            │
        │ from snapshot     │           │       │ (PV >20%, load >15%,   │
        └───────────────────┘           │       │  SoC drift >10pp)      │
                                        │       └───────────┬───────────┘
                                        │                   │
                                        │       ┌───────────┴───────────┐
                                        │       │ YES        │ NO        │
                                        │       ▼            ▼           │
                                        │   ┌────────┐  ┌────────────┐  │
                                        │   │ Bedrock│  │ needs_adj?  │  │
                                        │   │ replan │  │ (5–20%)     │  │
                                        │   └────────┘  └─────┬──────┘  │
                                        │                     │         │
                                        │           ┌─────────┴─────────┐│
                                        │           │ YES    │ NO       ││
                                        │           ▼        ▼          ││
                                        │     ┌──────────┐ ┌────────┐  ││
                                        │     │ Math     │ │ No      │  ││
                                        │     │ adjust   │ │ action  │  ││
                                        │     └──────────┘ └────────┘  ││
                                        └──────────────────────────────┘
```

---

## 3. Run Interval (Per-Site)

| Site type | Default interval | Configurable |
|-----------|------------------|--------------|
| **RDN** (TGE RDN price model) | 15 minutes | `automation.intraday_interval_min` |
| **Other** | 60 minutes | `automation.intraday_interval_min` |

The agent skips a site if `last_intraday_run` is within the configured interval. Manual trigger (`event.manual_trigger`) bypasses the interval check.

---

## 4. Deviation Detection

### Thresholds

| Metric | Major (→ LLM) | Minor (→ math) | None |
|--------|---------------|----------------|------|
| **PV** | >20% | 5–20% | <5% |
| **Load** | >15% | 5–15% | <5% |
| **SoC drift** | >10 pp | 3–10 pp | <3 pp |

- **Major**: Triggers Bedrock replanning
- **Minor**: Math-only power adjustment to existing AI rules
- **None**: No action

### Deviation Computation

- **PV / Load**: `|actual - forecast| / forecast` (when forecast > 1 kW)
- **SoC drift**: `|actual_soc - expected_soc|` (expected from `soc_trajectory` in agent state)

---

## 5. Health Checks (Rollback Triggers)

| Check | Condition | Action |
|-------|-----------|--------|
| **GRID_OVERLOAD** | `grid_import_kw > capacity_kva` | Rollback |
| **SOC_BELOW_MIN** | `soc < soc_min` (default 5%) | Rollback |
| **UNAUTHORIZED_EXPORT** | `grid_power < -1 kW` when `export_allowed = false` | Rollback |

On any critical issue, the agent restores `schedule_snapshot` from `aiess_agent_state` via Schedules API. If no snapshot exists, it clears all AI rules at P6.

---

## 6. Math-Only Adjustment

When `needs_adjustment` is true but `needs_llm` is false:

1. Fetch current schedule (P6 rules)
2. Filter to active AI rules (`s === 'ai'`, `act !== false`)
3. For **charge** rules: adjust power based on PV surplus vs. forecast
4. For **discharge** rules: adjust power based on load increase vs. forecast
5. Clamp to `max_charge_kw` / `max_discharge_kw`
6. Write updated P6 rules via Schedules API

---

## 7. Bedrock Replanning

When `needs_llm` is true:

- **Model**: `anthropic.claude-3-haiku-20240307-v1:0` (lightweight, fast)
- **Prompt**: Site config, current deviations, weekly strategy, recent lessons, optimization engine output
- **Output**: JSON with `reasoning` and `rules` (compact format: `id`, `s`, `act`, `a`, `c`)
- **Merge**: Append new rules to existing P6, remove previous `intraday_adj_*` rules

---

## 8. Lightweight Logging

- Each run logs a decision to `aiess_agent_decisions` with:
  - `agent_type: 'intraday'`
  - `gate_action`: `no_action`, `math_adjusted`, `llm_replanned`, `health_rollback`, etc.
  - `deviations`, `health_status`, `bedrock_used`
- **TTL**: 30 days (`ttl = now + 30 * 86400`)

---

## 9. CloudFormation

- **Lambda**: `aiess-agent-intraday`, Node.js 20.x, 256 MB, 120 s timeout
- **Reserved concurrency**: 1
- **EventBridge rule**: `aiess-agent-intraday-15m`, `rate(15 minutes)`, 0 retries

---

## 10. Environment Variables

| Variable | Description |
|----------|-------------|
| `INFLUX_URL` | InfluxDB Cloud URL |
| `INFLUX_TOKEN` | InfluxDB API token |
| `INFLUX_ORG` | InfluxDB organization (default: `aiess`) |
| `SCHEDULES_API` | Schedules API base URL |
| `SCHEDULES_API_KEY` | Schedules API key |
| `SITE_CONFIG_TABLE` | Site config DynamoDB table |
| `AGENT_STATE_TABLE` | Agent state DynamoDB table |
| `AGENT_DECISIONS_TABLE` | Agent decisions DynamoDB table |
| `OPTIMIZATION_FUNCTION` | Optimization engine Lambda (default: `aiess-optimization-engine`) |

---

## 11. Manual Invocation

```json
{
  "site_id": "site-123",
  "manual_trigger": true
}
```

Forces a run for the given site, ignoring the interval check.
