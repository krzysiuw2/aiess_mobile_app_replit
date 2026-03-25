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
  peak_confidence?: number;
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

export interface ForecastHourly {
  hour: number;
  soc_pct: number;
  battery_kw: number;
  grid_kw: number;
  pv_kw: number;
  load_kw: number;
  pv_self_consumed_kw: number;
  pv_to_battery_kw: number;
  pv_exported_kw: number;
  grid_import_kw: number;
  grid_export_kw: number;
  batt_to_load_kw: number;
  batt_to_grid_kw: number;
  active_rule?: string;
  price_pln_mwh: number;
  net_cost_pln: number;
}

export interface ForecastSummary {
  total_grid_import_kwh: number;
  total_grid_export_kwh: number;
  total_pv_self_consumed_kwh: number;
  total_pv_to_battery_kwh: number;
  self_consumption_pct: number;
  soc_start: number;
  soc_end: number;
  soc_min: number;
  soc_max: number;
  peak_grid_import_kw: number;
  peak_grid_export_kw: number;
  total_net_cost_pln: number;
  estimated_savings_pln: number;
}

export interface StrategyForecast {
  strategy: string;
  horizon_hours: number;
  hourly: ForecastHourly[];
  summary: ForecastSummary;
}

export interface StrategyPackage {
  name: string;
  rules: Record<string, unknown>[];
  forecast: StrategyForecast;
  simulation_valid: boolean;
  risk: string;
}

export interface StrategySummary {
  letter: StrategyChoice;
  name: string;
  risk: string;
  simulation_valid: boolean;
  rule_count: number;
  estimated_savings_pln: number | null;
  total_net_cost_pln: number | null;
  peak_grid_import_kw: number | null;
  self_consumption_pct: number | null;
  soc_end: number | null;
}

export type StrategyChoice = 'A' | 'B' | 'C';
export type ValidationStatus = 'ok' | 'warning' | 'error';

export interface ScheduleRule {
  id?: string;
  p?: number;
  priority?: number;
  a?: { t?: string; p?: number; soc?: number; s?: string };
  c?: {
    ts?: string;
    te?: string;
    d?: number[];
    smin?: number;
    smax?: number;
    gop?: string;
    gpv?: number;
    gpv2?: number;
  };
  vu?: string;
  e?: boolean;
}

export interface ProposedSch {
  p_5?: ScheduleRule[];
  p_6?: ScheduleRule[];
  p_7?: ScheduleRule[];
  p_8?: ScheduleRule[];
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
  selected_strategy?: StrategyChoice;
  all_strategy_summaries?: StrategySummary[];
  strategy_adjustments?: Record<string, number>;
  forecast?: StrategyForecast;
  validation_status?: ValidationStatus;
  fallback_used?: boolean;
  proposed_sch?: ProposedSch;
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
  site_id: string;
  timestamp: string;
  mode: string;
  current_soc: number;
  strategies: StrategyPackage[];
  tradeoff_analysis: {
    winner: string;
    arbitrage_value_per_kwh: number;
    pv_value_per_kwh: number;
    night_charge_kwh: number;
    room_for_pv_kwh: number;
  };
  data_summary: {
    tge_price_range: { min: number; max: number; avg: number };
    pv_total_kwh: number;
    load_total_kwh: number;
    surplus_total_kwh: number;
  };
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
