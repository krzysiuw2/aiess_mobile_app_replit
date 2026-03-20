# AI Optimization Agent — Weekly Strategist

The Weekly Strategist is the top tier of the cascading AI agent. It runs every Sunday at 09:00 UTC, reviews the past week’s performance, and produces a strategic plan for the upcoming week.

---

## 1. Trigger

| Property | Value |
|----------|-------|
| **Schedule** | `cron(0 9 ? * SUN *)` |
| **Time** | Sunday 09:00 UTC |
| **Invoker** | AWS EventBridge |

---

## 2. Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Scan/Get site_config (automation.enabled = true)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. For each site:                                                        │
│    - Query past 7 days of decisions (aiess_agent_decisions)              │
│    - Get agent state (aiess_agent_state)                                  │
│    - Invoke optimization engine (mode: weekly, 168h)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Aggregate week performance (predicted vs actual, lessons, feedback)    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Build Bedrock prompt (site profile + week review + forecast + lessons) │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Call Bedrock (Claude Sonnet 4)                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Parse response: weekly_plan + new_lessons                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. Save weekly plan + lessons to aiess_agent_state                       │
│    Log decision to aiess_agent_decisions                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bedrock Prompt Structure

The prompt includes:

### 3.1 Site Description

- `general.description` — narrative site description

### 3.2 AI Profile

- `business_type`, `shift_count`, `operating_hours`, `operating_days`, `weekend_pattern`
- `optimization_goals` / `goal_priority_order`
- `backup_reserve_percent`, `risk_tolerance`, `constraints_text`, `seasonal_notes`

### 3.3 Past Week Performance

- `decisions_count`, `decisions_with_actuals`
- Predicted vs actual savings (arbitrage, peak shaving, PV)
- Prediction accuracy (%)
- Lessons from daily agents
- Customer feedback

### 3.4 7-Day Forecast Summary (from optimization engine)

- Charge/discharge windows count
- Peak shaving needed: yes/no
- Bell curve active: yes/no
- Projected weekly savings
- Constraints applied

### 3.5 Current Lessons

- Up to 50 accumulated lessons (recent ones shown)

### 3.6 Output Format

The model must return a JSON object with EXACTLY two keys:

1. **`weekly_plan`** — JSON object with:
   - `week` — ISO date string (e.g. `2025-03-16`)
   - `strategy` — 1–2 sentence high-level strategy
   - `goals` — array of goal strings
   - `constraints_active` — array of active constraints
   - `daily_guidance` — `{ mon, tue, wed, thu, fri, sat, sun }` with guidance strings
   - `strategy_notes` — extra context for daily/intraday agents
   - `created_at` — ISO timestamp

2. **`new_lessons`** — array of 0–3 new lessons:
   - `text` — lesson text
   - `category` — `forecast_accuracy` | `strategy` | `customer_preference` | `timing` | `constraint`

---

## 4. Lesson Management

### 4.1 Rolling Buffer

- Lessons are stored in `aiess_agent_state.lessons`.
- **Maximum:** 50 entries.
- **Eviction:** FIFO — oldest lessons removed when new ones are added.

### 4.2 Lesson Categories

| Category | Description |
|----------|-------------|
| `forecast_accuracy` | PV/load forecast accuracy issues |
| `strategy` | Strategy effectiveness or adjustments |
| `customer_preference` | Customer preferences or constraints |
| `timing` | Timing-related issues |
| `constraint` | Constraint or safety-related learnings |

### 4.3 New Lessons from Weekly

```javascript
const lessons = [
  ...existingLessons,
  ...newLessons.map(l => ({
    text: l.text,
    category: l.category,
    agent_type: 'weekly',
    created_at: now,
  })),
].slice(-MAX_LESSONS);  // MAX_LESSONS = 50
```

---

## 5. Self-Learning

### 5.1 Predicted vs Actual

- Weekly agent aggregates `predicted_outcome` and `actual_outcome` from daily decisions.
- Accuracy: `actual.total_savings_pln / predicted.total_savings_pln * 100` (when predictions exist).
- Lessons from daily agents (`lesson_learned`) and customer feedback are passed to the prompt.

### 5.2 Lesson Generation

- The LLM produces 0–3 new lessons based on the week review.
- Lessons are stored with `agent_type: 'weekly'` and `category`.

---

## 6. State Persistence

### 6.1 Update `aiess_agent_state`

```javascript
UpdateExpression: 'SET weekly_plan = :wp, lessons = :ls, last_weekly_run = :ts, updated_at = :ts'
```

### 6.2 Log Decision

```javascript
{
  PK: `DECISION#${siteId}`,
  SK: `WEEKLY#${now}`,
  site_id,
  timestamp,
  agent_type: 'weekly',
  input_summary: { tge_prices_range, current_soc, ... },
  reasoning: weeklyPlan.strategy,
  rules_created: [],
  rules_modified: [],
  rules_deleted: [],
  predicted_outcome: { arbitrage_pln, peak_shaving_pln, pv_savings_pln, total_savings_pln },
  actual_outcome: null,
  delta: null,
  lesson_learned: null,
  status: 'applied',
}
```

No TTL on weekly decisions.

---

## 7. CloudFormation Template Overview

The template is in `lambda/agent-weekly/cloudformation.yaml`.

### 7.1 Resources

| Resource | Type | Description |
|----------|------|--------------|
| `WeeklyAgentRole` | IAM Role | Assume role for Lambda |
| `WeeklyAgentFunction` | Lambda | Node.js 20.x, 256 MB, 300 s timeout |
| `WeeklyScheduleRule` | EventBridge Rule | `cron(0 9 ? * SUN *)` |
| `WeeklySchedulePermission` | Lambda Permission | Allow EventBridge to invoke |

### 7.2 Permissions

- **DynamoDB:** GetItem, Query, Scan, UpdateItem, PutItem on `site_config`, `aiess_agent_state`, `aiess_agent_decisions`
- **Lambda:** Invoke `aiess-optimization-engine`
- **Bedrock:** Invoke `eu.anthropic.claude-sonnet-4-6`
- **CloudWatch Logs:** CreateLogGroup, CreateLogStream, PutLogEvents

### 7.3 Parameters

| Parameter | Default |
|-----------|---------|
| `FunctionName` | `aiess-agent-weekly` |
| `SiteConfigTable` | `site_config` |
| `AgentStateTable` | `aiess_agent_state` |
| `AgentDecisionsTable` | `aiess_agent_decisions` |
| `OptEngineFunction` | `aiess-optimization-engine` |

### 7.4 Environment Variables

- `SITE_CONFIG_TABLE`
- `AGENT_STATE_TABLE`
- `AGENT_DECISIONS_TABLE`
- `OPT_ENGINE_FUNCTION`

---

## 8. Manual Trigger

The agent can be triggered manually via the Agent API:

```http
POST /agent/trigger/{site_id}
Content-Type: application/json

{ "agent_type": "weekly" }
```

This invokes the Lambda with `{ site_id, manual_trigger: true }`.

---

## 9. Error Handling

- If a site fails, the error is logged and the loop continues for other sites.
- Invalid LLM response (missing `week` or `strategy`) throws an error.
- Response includes `processed` count and `results` array with `status: 'ok'` or `status: 'error'` per site.
