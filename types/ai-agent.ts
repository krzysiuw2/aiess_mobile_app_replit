// ─── AI Profile (stored in site_config.ai_profile) ──────────────
// The narrative site description lives in the EXISTING general.description field.
// The wizard updates general.description (shared with the site settings screen).
// ai_profile stores only the STRUCTURED data from the wizard.

export interface SiteConfigAiProfile {
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

export type OptimizationGoal =
  | 'maximize_arbitrage'
  | 'peak_shaving'
  | 'pv_self_consumption'
  | 'reduce_bill';

// ─── Weekly Plan (stored in aiess_agent_state) ──────────────────

export interface WeeklyPlan {
  week: string;
  strategy: string;
  goals: string[];
  constraints_active: string[];
  daily_guidance: Record<string, string>;
  strategy_notes: string;
  created_at: string;
}

// ─── Agent Decision Log (stored in aiess_agent_decisions) ───────

export type AgentType = 'weekly' | 'daily' | 'intraday';

export type DecisionStatus =
  | 'applied'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'rolled_back';

export interface AgentDecisionInputSummary {
  tge_prices_range?: { min: number; max: number; avg: number };
  pv_forecast_kwh?: number;
  load_forecast_kwh?: number;
  current_soc?: number;
  battery_capacity_kwh?: number;
}

export interface AgentDecisionOutcome {
  arbitrage_pln?: number;
  peak_shaving_pln?: number;
  pv_savings_pln?: number;
  total_savings_pln?: number;
}

export interface AgentDecisionRuleCreated {
  id: string;
  priority: number;
  action: string;
  time_window?: string;
}

export interface AgentDecisionRuleModified {
  id: string;
  change: string;
}

export interface AgentDecisionComment {
  text: string;
  created_at: string;
}

export interface AgentDecision {
  PK: string;
  SK: string;
  site_id: string;
  timestamp: string;
  agent_type: AgentType;
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

// ─── Lesson ─────────────────────────────────────────────────────

export type LessonCategory =
  | 'forecast_accuracy'
  | 'strategy'
  | 'customer_preference'
  | 'timing'
  | 'constraint';

export interface AgentLesson {
  text: string;
  created_at: string;
  agent_type: AgentType;
  category?: LessonCategory;
}

// ─── Agent State (per-site memory in aiess_agent_state) ─────────

export interface AgentPerformance30d {
  total_savings_pln: number;
  avg_daily_savings_pln: number;
  forecast_accuracy_pv: number;
  forecast_accuracy_load: number;
  decisions_count: number;
  rollbacks_count: number;
}

export interface AgentState {
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

// ─── Optimization Engine Result ─────────────────────────────────

export interface ChargeWindow {
  start: string;
  end: string;
  avg_price_pln_mwh: number;
  recommended_power_kw: number;
}

export interface DischargeWindow {
  start: string;
  end: string;
  avg_price_pln_mwh: number;
  recommended_power_kw: number;
}

export interface PvSurplusWindow {
  start: string;
  end: string;
  surplus_kw: number;
}

export interface PeakShavingWindow {
  start: string;
  end: string;
  target_grid_kw: number;
}

export interface BellCurveLimit {
  hour: number;
  max_export_kw: number;
}

export interface OptimizationResult {
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

// ─── API Query Params ───────────────────────────────────────────

export interface AgentDecisionQuery {
  agent_type?: AgentType;
  days?: number;
  limit?: number;
}

// ─── Notification Types ─────────────────────────────────────────

export type AgentNotificationType =
  | 'schedule_proposed'
  | 'profile_update_suggested'
  | 'weekly_report'
  | 'rollback_alert';

export interface AgentNotification {
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
