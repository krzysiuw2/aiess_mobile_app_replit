# AI Optimization Agent — Data Model

This document describes the DynamoDB schemas and TypeScript interfaces used by the AI Optimization Agent.

---

## 1. DynamoDB Tables

### 1.1 `aiess_agent_state`

Per-site persistent state for the agent. One item per site.

| Attribute | Type | Description |
|-----------|------|--------------|
| **site_id** | String (PK) | Site identifier; no partition key |
| **weekly_plan** | Map | Current `WeeklyPlan` object |
| **lessons** | List | Array of lesson objects (max 50, FIFO) |
| **performance_30d** | Map | Rolling 30-day performance metrics |
| **schedule_snapshot** | Map | Last known good schedule for rollback |
| **last_weekly_run** | String | ISO timestamp of last weekly run |
| **last_daily_run** | String | ISO timestamp of last daily run |
| **last_intraday_run** | String | ISO timestamp of last intraday run |
| **updated_at** | String | ISO timestamp of last update |

**Access pattern:** `GetItem` by `site_id`.

---

### 1.2 `aiess_agent_decisions`

Decision log for all agent types. Also used for notifications (different PK prefix).

| Attribute | Type | Description |
|-----------|------|--------------|
| **PK** | String | `DECISION#{site_id}` for decisions |
| **SK** | String | Sort key; format varies by agent type |
| **site_id** | String | Site identifier |
| **timestamp** | String | ISO timestamp |
| **agent_type** | String | `weekly` \| `daily` \| `intraday` |
| **input_summary** | Map | Summary of inputs (prices, forecasts, SoC, etc.) |
| **reasoning** | String | Agent reasoning or strategy notes |
| **rules_created** | List | List of rule objects created |
| **rules_modified** | List | List of rule modifications |
| **rules_deleted** | List | Array of deleted rule IDs |
| **predicted_outcome** | Map | Predicted savings (arbitrage, peak shaving, PV) |
| **actual_outcome** | Map | Actual outcome (filled in later) |
| **delta** | Map | Difference between predicted and actual |
| **lesson_learned** | String | Lesson extracted from this decision |
| **customer_comments** | List | User comments on this decision |
| **status** | String | `applied` \| `pending_approval` \| `approved` \| `rejected` \| `rolled_back` |
| **ttl** | Number | Unix timestamp for expiry (optional) |

**SK formats:**

| Agent type | SK format | Example |
|------------|-----------|---------|
| `weekly` | `WEEKLY#{ISO_timestamp}` | `WEEKLY#2025-03-16T09:00:00.000Z` |
| `daily` | ISO timestamp | `2025-03-16T10:00:00.000Z` |
| `intraday` | `INTRADAY#{ISO_timestamp}` | `INTRADAY#2025-03-16T10:15:00.000Z` |

**TTL policy:**

| Agent type | TTL |
|------------|-----|
| `intraday` | 30 days |
| `daily` | 90 days |
| `weekly` | None (no TTL) |

**Access pattern:** `Query` by `PK = DECISION#{site_id}` with optional `SK >= :since` for time range.

---

### 1.3 Notification Records (Same Table)

Notifications use the same `aiess_agent_decisions` table with a different PK:

| Attribute | Type | Description |
|-----------|------|--------------|
| **PK** | String | `NOTIFICATION#{site_id}` |
| **SK** | String | `DAILY#{timestamp}` or similar |
| **id** | String | Notification ID |
| **site_id** | String | Site identifier |
| **type** | String | `schedule_proposed` \| `profile_update_suggested` \| `weekly_report` \| `rollback_alert` |
| **title** | String | Notification title |
| **message** | String | Notification body |
| **created_at** | String | ISO timestamp |
| **read** | Boolean | Whether user has read it |
| **decision_sk** | String | SK of related decision |

**Access pattern:** `Query` by `PK = NOTIFICATION#{site_id}`.

---

## 2. SiteConfigAiProfile Interface

Stored in `site_config.ai_profile`. Defines the agent’s business context and optimization preferences.

```typescript
interface SiteConfigAiProfile {
  business_type?: 'industrial' | 'commercial' | 'office' | 'residential' | 'agricultural';
  shift_count?: 1 | 2 | 3 | 0;
  operating_hours?: { start: string; end: string };
  operating_days?: 'mon_fri' | 'mon_sat' | 'everyday';
  weekend_pattern?: 'much_less' | 'slightly_less' | 'same' | 'more';
  optimization_goals?: OptimizationGoal[];
  goal_priority_order?: OptimizationGoal[];
  backup_reserve_percent?: number;
  risk_tolerance?: 'conservative' | 'balanced' | 'aggressive';
  constraints_text?: string;
  seasonal_notes?: string;
  shift_pattern_detail?: string;
  wizard_completed?: boolean;
  wizard_completed_at?: string;
}

type OptimizationGoal =
  | 'maximize_arbitrage'
  | 'peak_shaving'
  | 'pv_self_consumption'
  | 'reduce_bill';
```

---

## 3. AgentState Interface

```typescript
interface AgentState {
  site_id: string;
  weekly_plan?: WeeklyPlan;
  lessons: AgentLesson[];
  performance_30d: AgentPerformance30d;
  last_weekly_run?: string;
  last_daily_run?: string;
  last_intraday_run?: string;
  schedule_snapshot?: Record<string, unknown>;
  updated_at?: string;
}

interface AgentPerformance30d {
  total_savings_pln: number;
  avg_daily_savings_pln: number;
  forecast_accuracy_pv: number;
  forecast_accuracy_load: number;
  decisions_count: number;
  rollbacks_count: number;
}
```

---

## 4. AgentDecision Interface

```typescript
interface AgentDecision {
  PK: string;
  SK: string;
  site_id: string;
  timestamp: string;
  agent_type: 'weekly' | 'daily' | 'intraday';
  input_summary: AgentDecisionInputSummary;
  reasoning: string;
  rules_created: AgentDecisionRuleCreated[];
  rules_modified: AgentDecisionRuleModified[];
  rules_deleted: string[];
  predicted_outcome: AgentDecisionOutcome;
  actual_outcome?: AgentDecisionOutcome;
  delta?: AgentDecisionOutcome;
  lesson_learned?: string;
  customer_comments?: AgentDecisionComment[];
  status: DecisionStatus;
  ttl?: number;
}

interface AgentDecisionInputSummary {
  tge_prices_range?: { min: number; max: number; avg: number };
  pv_forecast_kwh?: number;
  load_forecast_kwh?: number;
  current_soc?: number;
  battery_capacity_kwh?: number;
}

interface AgentDecisionOutcome {
  arbitrage_pln?: number;
  peak_shaving_pln?: number;
  pv_savings_pln?: number;
  total_savings_pln?: number;
}
```

---

## 5. WeeklyPlan Interface

```typescript
interface WeeklyPlan {
  week: string;
  strategy: string;
  goals: string[];
  constraints_active: string[];
  daily_guidance: Record<string, string>;  // mon, tue, wed, thu, fri, sat, sun
  strategy_notes: string;
  created_at: string;
}
```

---

## 6. OptimizationResult Interface

```typescript
interface OptimizationResult {
  charge_windows: ChargeWindow[];
  discharge_windows: DischargeWindow[];
  pv_surplus_windows: PvSurplusWindow[];
  peak_shaving_needed: boolean;
  peak_shaving_windows?: PeakShavingWindow[];
  bell_curve_active: boolean;
  bell_curve_limits?: BellCurveLimit[];
  projected_savings: {
    arbitrage_pln: number;
    peak_shaving_pln: number;
    pv_self_consumption_pln: number;
  };
  constraints_applied: string[];
}

interface ChargeWindow {
  start: string;
  end: string;
  avg_price_pln_mwh: number;
  recommended_power_kw: number;
}

interface DischargeWindow {
  start: string;
  end: string;
  avg_price_pln_mwh: number;
  recommended_power_kw: number;
}
```

---

## 7. AgentLesson Interface

```typescript
interface AgentLesson {
  text: string;
  created_at: string;
  agent_type: 'weekly' | 'daily' | 'intraday';
  category?: LessonCategory;
}

type LessonCategory =
  | 'forecast_accuracy'
  | 'strategy'
  | 'customer_preference'
  | 'timing'
  | 'constraint';
```

---

## 8. AgentNotification Interface

```typescript
interface AgentNotification {
  id: string;
  site_id: string;
  type: AgentNotificationType;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  action_url?: string;
  decision_sk?: string;
}

type AgentNotificationType =
  | 'schedule_proposed'
  | 'profile_update_suggested'
  | 'weekly_report'
  | 'rollback_alert';
```

---

## 9. Related Tables

| Table | Purpose |
|-------|---------|
| `site_config` | Site configuration, `ai_profile`, `automation`, `power_limits`, etc. |
| `aiess_tariff_data` | Distribution tariff definitions; PK `TARIFF#{operator}#{tariff_group}`, SK `{year}` |
