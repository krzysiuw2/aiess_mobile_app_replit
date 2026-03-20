# Daily Planner Agent

The Daily Planner agent (`lambda/agent-daily/`) produces optimized daily battery schedules for automation-enabled BESS sites. It runs once per day after TGE prices are published, invokes the optimization engine for data-driven recommendations, and uses an LLM to synthesize human-readable schedule rules.

---

## 1. Trigger & Schedule

| Property | Value |
|----------|-------|
| **Trigger** | EventBridge cron rule |
| **Schedule** | `cron(0 10 * * ? *)` — 10:00 UTC daily |
| **Local time** | 11:00 CET (Central European Time) |
| **Rationale** | Runs after TGE (Towarowa Giełda Energii) day-ahead prices are published, enabling price-based arbitrage planning |

---

## 2. Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Scan automation-enabled sites (site_config.automation.enabled = true) │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. For each site:                                                        │
│    • Read site config, agent state, current schedules, recent comments   │
│    • Snapshot current schedule (for rollback)                             │
│    • Invoke optimization engine (Lambda)                                 │
│    • Fetch yesterday's telemetry (InfluxDB)                             │
│    • Evaluate yesterday's outcome vs. predicted                          │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Build LLM prompt (system + user)                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Call Bedrock InvokeModelCommand (Claude Sonnet 4)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Parse JSON response → schedule rules                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Apply rules per automation mode (automatic / semi-automatic / manual) │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Context Assembly

The agent gathers the following context for each site:

| Source | Table/API | Purpose |
|--------|-----------|---------|
| Site config | `site_config` | Battery, power limits, AI profile, grid connection |
| Agent state | `aiess_agent_state` | Weekly plan, lessons learned, schedule snapshot |
| Current schedules | Schedules API `GET /schedules/{siteId}` | Existing rules to consider |
| Recent comments | `aiess_agent_decisions` (Query) | Customer feedback from last 7 days |
| Yesterday telemetry | InfluxDB `aiess_v1` | Actual vs. predicted outcome |

---

## 4. Prompt Structure

### System Prompt

- **Role**: AI energy management agent for BESS
- **Task**: Produce optimized daily schedule as JSON rules
- **Constraints** (injected from site config):
  - Battery capacity (kWh)
  - Max charge / discharge (kW)
  - Backup reserve (%)
  - Risk tolerance
  - Business type
  - Export allowed (boolean)

### Output Format (strict JSON)

```json
{
  "rules": [
    {
      "id": "agent-daily-<unique-suffix>",
      "priority": 6,
      "action": {
        "type": "charge" | "discharge" | "idle" | "limit_export",
        "power_kw": <number>,
        "target_soc": <number, optional>
      },
      "conditions": {
        "time_start": "HH:MM",
        "time_end": "HH:MM",
        "soc_min": <number, optional>,
        "soc_max": <number, optional>,
        "price_above": <number, optional>,
        "price_below": <number, optional>
      },
      "days": ["mon","tue","wed","thu","fri","sat","sun"]
    }
  ],
  "reasoning": "Brief explanation of the strategy chosen and why."
}
```

### User Prompt Sections

1. **SITE PROFILE** — `ai_profile` from site config
2. **WEEKLY PLAN** — `weekly_plan` from agent state
3. **OPTIMIZATION ENGINE OUTPUT** — charge/discharge windows, projected savings, constraints
4. **CURRENT SCHEDULES** — existing rules
5. **LESSONS LEARNED** — last 10 lessons from agent state
6. **RECENT CUSTOMER COMMENTS** — feedback from decisions
7. **YESTERDAY OUTCOME EVALUATION** — actual vs. predicted, delta, lesson

---

## 5. Output: Schedule Rules

- **Priorities**: P6 (arbitrage), P7 (peak shaving), P8 (PV self-consumption)
- **Source tag**: All AI-generated rules are tagged with `s: 'ai'` for UI identification
- **Storage**: Written via Schedules API `PUT /schedules/{siteId}` with `{ rules }`

---

## 6. Automation Modes

| Mode | Behavior |
|------|----------|
| **automatic** | Write rules directly to Schedules API; status `applied` |
| **semi-automatic** | Store rules as `pending_approval`; create notification; do not write |
| **manual** | Log rules only; status `pending_approval`; create notification |

Notifications for `pending_approval` are stored in `aiess_agent_decisions` with `PK: NOTIFICATION#${siteId}`, `SK: DAILY#${timestamp}`.

---

## 7. Outcome Tracking (Yesterday)

1. **Fetch telemetry**: InfluxDB query for `-48h` to `-24h` (yesterday)
2. **Compare**: Actual import/export/peak vs. predicted outcome from last decision
3. **Compute delta**: `actual - predicted` for arbitrage, peak shaving, PV savings
4. **Write back**:
   - Update previous decision: `actual_outcome`, `delta`, `lesson_learned`
   - If lesson exists: append to `agent_state.lessons` with `category: forecast_accuracy`

---

## 8. Safety Validation

The optimization engine and agent enforce:

| Constraint | Implementation |
|------------|----------------|
| SoC limits | No rule may violate `soc_min` / `soc_max` from safety config |
| Power limits | Rules respect `max_charge_kw`, `max_discharge_kw` |
| Grid capacity | Import buffer 2–3% below `capacity_kva` |
| Export | Export buffer 1 kW when `export_allowed` is false |

These are encoded in the optimization engine's `validateConstraints()` and passed to the LLM as constraints in the system prompt.

---

## 9. IAM Permissions

| Resource | Actions |
|----------|---------|
| `site_config` | `dynamodb:GetItem`, `dynamodb:Scan` |
| `aiess_agent_state` | `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem` |
| `aiess_agent_decisions` | `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:PutItem`, `dynamodb:UpdateItem` |
| Optimization engine Lambda | `lambda:InvokeFunction` |
| Bedrock | `bedrock:InvokeModel` |

---

## 10. Environment Variables

| Variable | Description |
|----------|-------------|
| `SITE_CONFIG_TABLE` | DynamoDB table for site config (default: `site_config`) |
| `AGENT_STATE_TABLE` | DynamoDB table for agent state (default: `aiess_agent_state`) |
| `AGENT_DECISIONS_TABLE` | DynamoDB table for decisions (default: `aiess_agent_decisions`) |
| `SCHEDULES_API` | Base URL of Schedules API |
| `SCHEDULES_API_KEY` | API key for Schedules API |
| `INFLUX_URL` | InfluxDB Cloud URL |
| `INFLUX_TOKEN` | InfluxDB API token |
| `INFLUX_ORG` | InfluxDB organization (default: `aiess`) |
| `OPTIMIZATION_ENGINE_FUNCTION` | Lambda function name (default: `aiess-optimization-engine`) |

---

## 11. CloudFormation

- **Lambda**: `aiess-agent-daily`, Node.js 20.x, 512 MB, 300 s timeout
- **Reserved concurrency**: 3
- **EventBridge rule**: `aiess-agent-daily`, `cron(0 10 * * ? *)` with 1 retry

---

## 12. Manual Invocation

The handler can be invoked with `{ site_id: "..." }` to process a single site instead of all automation-enabled sites.
