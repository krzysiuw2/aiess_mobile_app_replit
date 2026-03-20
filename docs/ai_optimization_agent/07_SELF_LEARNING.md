# Self-Learning and Feedback Mechanisms

The AI Optimization Agent implements a **Predict → Execute → Measure → Learn** loop. Outcome tracking, lesson management, customer feedback, and weekly performance review enable continuous improvement.

---

## 1. Predict → Execute → Measure → Learn Loop

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  PREDICT    │ ──► │  EXECUTE     │ ──► │  MEASURE    │ ──► │  LEARN      │
│  (LLM +     │     │  (Schedule   │     │  (Telemetry  │     │  (Lessons,  │
│   OptEngine)│     │   rules)     │     │   vs pred)  │     │   feedback) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                                    (next run)
```

---

## 2. Outcome Tracking Pipeline

### Daily Agent Flow

1. **Read yesterday's telemetry** (InfluxDB, `-48h` to `-24h`)
2. **Fetch previous decision** (last daily decision for the site)
3. **Compare**:
   - Actual: total import/export, peak grid, PV, load
   - Predicted: `predicted_outcome` from the decision
4. **Compute delta**: `actual - predicted` for arbitrage, peak shaving, PV savings
5. **Write**:
   - Update decision: `actual_outcome`, `delta`, `lesson_learned`
   - If `lesson` exists: append to `agent_state.lessons`

### Lesson Generation

- **Delta < -5 PLN**: "Actual savings were X PLN below prediction. Possible causes: forecast inaccuracy or unexpected load changes."
- **Delta > 5 PLN**: "Actual savings exceeded prediction by X PLN. Strategy performed better than expected."
- **Otherwise**: "No significant deviation detected."

---

## 3. Lesson Management

### Storage

- **Table**: `aiess_agent_state`
- **Attribute**: `lessons` (list of objects)
- **Max entries**: Rolling 50 (FIFO when appending)

### Lesson Structure

```ts
{
  text: string;
  created_at: string;
  agent_type: 'daily' | 'weekly' | 'intraday';
  category?: LessonCategory;
}
```

### Categories

| Category | Description |
|----------|-------------|
| `forecast_accuracy` | PV/load forecast vs. actual |
| `strategy` | Strategic choices (e.g. arbitrage vs. peak shaving) |
| `customer_preference` | Inferred from comments |
| `timing` | When to charge/discharge |
| `constraint` | Safety or grid limits |

### Usage

- **Daily agent**: Last 10 lessons in user prompt
- **Intraday agent**: Last 5 lessons (text only) in Bedrock prompt
- **Weekly agent**: Aggregated lessons for strategic review

---

## 4. Customer Feedback Loop

```
Customer comments on decision
         │
         ▼
Stored in aiess_agent_decisions (customer_comments)
         │
         ▼
Next daily/weekly agent run fetches "Recent Customer Comments"
         │
         ▼
Included in LLM user prompt
         │
         ▼
AI can propose ai_profile updates (e.g. risk_tolerance, goals)
         │
         ▼
Notification: profile_update_suggested (if proposed)
```

Comments are fetched for the last 7 days, up to 50 entries, and passed to the LLM as structured JSON.

---

## 5. Weekly Performance Review

### Aggregation (Weekly Agent)

- **Input**: Past 7 days of decisions with `actual_outcome`
- **Computed**:
  - Sum of predicted vs. actual savings
  - Forecast accuracy (PV, load) if available
  - Count of decisions, rollbacks
- **Output**: Strategic lessons, updated `performance_30d` (rolling window)

### Lesson Types from Weekly Review

- Accuracy patterns (e.g. "PV forecast consistently 15% high on cloudy days")
- Strategy adjustments (e.g. "Peak shaving more effective than arbitrage this week")
- Timing insights (e.g. "Morning discharge windows underperformed")

### Preservation

- **Weekly summaries**: Preserved indefinitely (or per retention policy)
- **Individual lessons**: FIFO eviction when exceeding 50 entries

---

## 6. In-App Notifications for Pattern Detection

Notification types that surface learning insights:

| Type | Trigger | Example |
|------|---------|---------|
| `schedule_proposed` | Daily agent, semi-automatic/manual | "New daily schedule proposed" |
| `profile_update_suggested` | AI proposes ai_profile change from feedback | "Consider adjusting risk tolerance" |
| `weekly_report` | Weekly agent | "Weekly performance summary" |
| `rollback_alert` | Intraday health rollback | "Safety rollback: SoC below minimum" |

Future pattern notifications (e.g. "Grid load decreased 20% — should we adjust?") would be generated when the agent detects significant changes and proposes actions.

---

## 7. Lesson Aging

| Item | Retention |
|------|-----------|
| **Individual lessons** | Rolling 50, FIFO |
| **Weekly summaries** | Preserved indefinitely |
| **Decision records** | TTL 90 days (daily), 30 days (intraday) |
| **Performance 30d** | Rolling 30-day window |

---

## 8. Data Flow Summary

| Source | Destination | Purpose |
|--------|-------------|---------|
| InfluxDB telemetry | Daily agent | Yesterday outcome evaluation |
| `aiess_agent_decisions` | Daily agent | Previous decision, comments |
| `aiess_agent_state.lessons` | Daily, intraday, weekly | LLM context |
| `aiess_agent_state.performance_30d` | Mobile app | PerformanceMetrics |
| Customer comments | Next agent run | Feedback in LLM prompt |
