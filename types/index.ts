import type { FinancialSettings } from './financial';
import type { SiteConfigAiProfile } from './ai-agent';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export type DeviceRole = 'owner' | 'admin' | 'viewer' | string;

export interface Device {
  id: string;
  device_id: string;
  name: string;
  status: 'active' | 'inactive' | 'maintenance' | 'offline';
  device_type: 'on_grid' | 'off_grid' | 'hybrid';
  location: string | null;
  battery_capacity_kwh: number | null;
  pcs_power_kw: number | null;
  pv_power_kw: number | null;
  /** Current user's role on this device (from device_users). UI gating only
   *  per ADR 0009 — the Lambda checks the API key, not the user. */
  role: DeviceRole | null;
}

// ─── Decision Telemetry (v1.1.0) ─────────────────────────────────
// Edge decision-telemetry fields (schedules-format contract). These land in
// InfluxDB `energy_telemetry` via the iot-to-telegraf-forwarder; treat all of
// them as optional — the ingest mapping is rolling out separately, so queries
// must tolerate their absence.

export type ControlSource = 'plan' | 'fallback' | 'operator' | 'safety';
export type OperatorSource = 'app' | 'scada';
export type PlanState = 'active' | 'stale' | 'expired';

export interface LiveData {
  gridPower: number;
  batteryPower: number;
  batterySoc: number;
  batteryStatus: 'Charging' | 'Discharging' | 'Standby';
  pvPower: number;
  pvEstimated: number;
  pvTotal: number;
  factoryLoad: number;
  lastUpdate: Date;
  activeRuleId?: string;
  activeRuleAction?: 'ch' | 'sb' | 'dis';
  activeRulePower?: number;
  gridPowerAvg1m?: number;
  gridPowerAvg5m?: number;
  pvPowerAvg1m?: number;
  pvPowerAvg5m?: number;
  factoryLoadAvg1m?: number;
  factoryLoadAvg5m?: number;
  // Decision telemetry (all optional — see ControlSource note above).
  controlSource?: ControlSource;
  operatorSource?: OperatorSource;
  overrideId?: string;
  planState?: PlanState;
  planId?: string;
  planRevision?: number;
  planAgeSec?: number;
  cappedBy?: string;
  pvCurtailActive?: boolean;
  pvCurtailExportKwMax?: number;
}

// ─── Schedule Rule Types (v1.4.3 optimized format) ──────────────

export type ActionType = 'ch' | 'dis' | 'sb' | 'sl' | 'ct' | 'dt' | 'bx' | 'bi' | 'sc' | 'hs';
export type GridOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'bt';
export type Strategy = 'eq' | 'agg' | 'con';
export type WeekdayShorthand = 'weekdays' | 'weekend' | 'everyday' | 'ed' | 'all' | string;
export type Priority = 4 | 5 | 6 | 7 | 8 | 9;
export type SystemMode = 'automatic' | 'semi-automatic' | 'manual';
/** Recurrence tag (Phase A). `once` without `vu` gets vu stamped by the cloud (F16). */
export type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly';
export type Firmness = 'firm' | 'soft';

/** Guardrail-typed actions always execute in the Guardrails layer regardless
 *  of the priority slot they are stored in (schedules-format contract). */
export const GUARDRAIL_ACTION_TYPES: ReadonlySet<ActionType> = new Set(['sl', 'bx', 'bi']);

export interface OptimizedAction {
  t: ActionType;
  pw?: number;
  pid?: boolean;
  hth?: number;
  lth?: number;
  soc?: number;
  maxp?: number;
  maxg?: number;
  ming?: number;
  str?: Strategy;
  /** bx/bi: allowed kW in the blocked direction (default 0 = hard block). */
  lim?: number;
  /** bx/bi: firm (default) or soft (clamp + warn when binding). */
  fm?: Firmness;
  /** sc: grid tracking target kW, import-positive (default 0). */
  tg?: number;
  /** sc: dead band kW — no correction inside ± band (default 1.0). */
  db?: number;
  /** sc: max charge kW cap (omitted = device max). */
  cmax?: number;
  /** sc: max discharge kW cap (0 = absorb-only). */
  dmax?: number;
  /** sc: stop discharging below this SoC. */
  smn?: number;
  /** sc: stop charging above this SoC. */
  smx?: number;
  /** hs: soc_low (required, 0-100). */
  sl_?: number;
  /** hs: soc_high (>= sl_, defaults to sl_). */
  sh_?: number;
  /** hs: hysteresis SoC (0-50, default 1). */
  hy?: number;
}

export interface OptimizedConditions {
  ts?: number;
  te?: number;
  sm?: number;
  sx?: number;
  gpo?: GridOperator;
  gpv?: number;
  gpx?: number;
}

/** No `p` field -- priority is inferred from parent p_X array */
export interface OptimizedScheduleRule {
  id: string;
  s?: 'ai' | 'man';
  a: OptimizedAction;
  c?: OptimizedConditions;
  act?: boolean;
  d?: WeekdayShorthand | number[];
  vf?: number;
  vu?: number;
  /** Days of month 1-31 (recurrence dimension, ANDed with `d`). */
  md?: number[];
  /** Recurrence tag; `once` without `vu` gets vu stamped cloud-side (F16). */
  rc?: Recurrence;
}

export interface ScheduleRuleWithPriority extends OptimizedScheduleRule {
  priority: Priority;
}

/** P1-P3 (edge-local) and P10-P11 (SCADA/safety) rules — display only,
 *  the server rejects writes to these bands. */
export interface ReadOnlyScheduleRule extends OptimizedScheduleRule {
  priority: number;
}

export interface SchedulesResponse {
  site_id: string;
  v: string;
  safety?: {
    soc_min?: number;
    soc_max?: number;
  };
  sch: {
    /** Local band (edge-only) — read-only in the app. */
    p_1?: OptimizedScheduleRule[];
    p_2?: OptimizedScheduleRule[];
    p_3?: OptimizedScheduleRule[];
    /** Cloud-writable band P4-P9. */
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
    /** SCADA/safety band — read-only everywhere. */
    p_10?: OptimizedScheduleRule[];
    p_11?: OptimizedScheduleRule[];
  };
  metadata: {
    total_rules: number;
    local_rules: number;
    cloud_rules: number;
    scada_safety_rules: number;
  };
  last_updated: number | null;
}

export interface SaveSchedulesResponse {
  message: string;
  site_id: string;
  /** Legacy wire field name. Since the DynamoDB config-plane migration this
   *  carries the DDB item version (small monotonic int), NOT an IoT shadow
   *  version. Kept for response-shape compatibility; do not use. */
  shadow_version: number;
  updated_priorities: string[];
  total_rules: number;
  /** Non-fatal validation warnings (e.g. polarity mismatches) — v1.1.0. */
  warnings?: string[];
}

export interface ScheduleRuleFormData {
  id: string;
  priority: Priority;
  actionType: ActionType;
  active: boolean;

  power?: number;
  usePid?: boolean;
  highThreshold?: number;
  lowThreshold?: number;
  targetSoc?: number;
  maxPower?: number;
  maxGridPower?: number;
  minGridPower?: number;
  strategy?: Strategy;

  // bx/bi (block export / block import)
  limitKw?: number;
  firmness?: Firmness;
  // sc (self-consumption)
  targetGridKw?: number;
  deadBandKw?: number;
  scMaxChargeKw?: number;
  scMaxDischargeKw?: number;
  scSocMin?: number;
  scSocMax?: number;
  // hs (hold SoC)
  holdSocLow?: number;
  holdSocHigh?: number;
  hysteresis?: number;

  timeStart?: string;
  timeEnd?: string;
  socMin?: number;
  socMax?: number;
  gridPowerOperator?: GridOperator;
  gridPowerValue?: number;
  gridPowerValueMax?: number;

  weekdays?: number[];
  monthDays?: number[];
  recurrence?: Recurrence;
  validFrom?: number;
  validUntil?: number;
}

// ─── Operator Override (v1.1.0) ─────────────────────────────────
// POST /override/{site_id} → aiess-set-operator-override Lambda →
// shared.operator_override in the DDB config plane → MQTT patch → edge.
// Single slot with TTL; precedence: Safety → SCADA → Guardrails →
// app override → Plan → Fallback.

export type OverrideAction = 'charge' | 'discharge' | 'standby' | 'auto';

export interface OverrideRequest {
  action: OverrideAction;
  /** Magnitude kW >= 0. Ignored for standby/auto. */
  power_kw?: number;
  /** Required for non-auto. Integer 1..86400 (24h hard cap). */
  ttl_sec?: number;
  source?: 'app';
  reason?: string;
}

export interface OverrideResponse {
  message: string;
  site_id: string;
  override_id: string;
  /** Unix seconds. */
  issued_at: number;
  version: number;
  etag: string;
}

// ─── Schedule History (v1.1.0) ──────────────────────────────────
// GET /schedules/{site_id}/history — read-only audit trail, 90-day horizon.

export type ScheduleHistoryEventType = 'added' | 'changed' | 'expired' | 'deleted';

export interface ScheduleHistoryEvent {
  /** Unix seconds. */
  t: number;
  /** ISO timestamp. */
  at: string;
  version: number;
  /** Writer attribution, e.g. "compat:aiess-update-schedules:...", "behavior-materializer:...". */
  updated_by: string;
  event: ScheduleHistoryEventType;
  rule_id: string;
  band: string;
  rule?: OptimizedScheduleRule;
  changed_fields?: string[];
  previous?: OptimizedScheduleRule;
}

export interface ScheduleHistoryResponse {
  site_id?: string;
  events: ScheduleHistoryEvent[];
  returned?: number;
  horizon_days?: number;
}

export interface ScheduleHistoryQuery {
  /** Unix seconds. */
  since?: number;
  /** Unix seconds. */
  until?: number;
  rule_id?: string;
  limit?: number;
}

// ─── DDB Config Plane (per-section) Types ───────────────────────
// See contract: config-plane API (`GET/PUT /devices/{id}/sections/{section_id}`).
// Used only behind the `use_ddb_config_plane` feature flag.

export type ConfigSectionId = 'shared.schedules' | 'shared.site_limits' | 'shared.identity';

/** All p_1..p_11 buckets. The app only ever writes p_4..p_9. */
export type SchedulePriorityKey =
  | 'p_1' | 'p_2' | 'p_3' | 'p_4' | 'p_5' | 'p_6'
  | 'p_7' | 'p_8' | 'p_9' | 'p_10' | 'p_11';

export interface SharedSchedulesPayload {
  v: string;
  sch: Partial<Record<SchedulePriorityKey, OptimizedScheduleRule[]>>;
}

export interface SharedSiteLimitsPayload {
  soc_min_percent: number;
  soc_max_percent: number;
  import_kw_max?: number;
  export_kw_max?: number;
}

/** Note: `system_mode` uses underscores, unlike the legacy API's hyphenated mode. */
export type ConfigSystemMode = 'automatic' | 'semi_automatic' | 'manual';

export interface SharedIdentityPayload {
  thing_name?: string;
  serial_id?: string;
  hw_revision?: string;
  ems_vendor?: string;
  fw_version?: string;
  system_mode?: ConfigSystemMode;
}

export interface ConfigSectionEnvelope<T = unknown> {
  payload: T;
  version: number;
  etag: string;
  updated_by?: string;
  updated_at?: string | number;
}

export interface DeviceManifestSection {
  version: number;
  etag: string;
}

/** Shape verified live: `GET /devices/{id}/manifest` (schema `manifest.v1`). */
export interface DeviceManifest {
  schema: string;
  manifest_etag: string;
  sections: Record<string, DeviceManifestSection>;
}

export interface PutSectionResponse {
  version: number;
  etag: string;
}

// ─── App-level Types ────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export type Language = 'en' | 'pl';

export interface AppSettings {
  language: Language;
}

// ─── Site Config (DynamoDB) ─────────────────────────────────────

export interface SiteConfigGeneral {
  name?: string;
  status?: 'active' | 'inactive' | 'commissioning';
  system_type?: 'hybrid' | 'on_grid' | 'off_grid';
  description?: string;
  commissioned_at?: string;
  timezone?: string;
}

export interface SiteConfigLocation {
  address?: string;
  latitude?: number;
  longitude?: number;
  elevation_m?: number;
  climate_zone?: string;
  country?: string;
}

export interface SiteConfigBattery {
  manufacturer?: string;
  model?: string;
  chemistry?: string;
  capacity_kwh?: number;
  nominal_voltage_v?: number;
  modules_count?: number;
  racks_count?: number;
  c_rate_charge?: number;
  c_rate_discharge?: number;
  cycle_warranty?: number;
  temp_min_c?: number;
  temp_max_c?: number;
}

export interface SiteConfigInverter {
  manufacturer?: string;
  model?: string;
  power_kw?: number;
  count?: number;
  type?: 'hybrid' | 'string' | 'central';
}

export interface SiteConfigPvArray {
  name?: string;
  peak_kw?: number;
  panel_count?: number;
  panel_watt?: number;
  tilt_deg?: number;
  azimuth_deg?: number;
  tracker?: 'fixed' | 'single_axis' | 'dual_axis';
  shading_factor?: number;
  monitored?: boolean;
  efficiency_factor?: number;
}

export interface SiteConfigPvSystem {
  total_peak_kw?: number;
  arrays?: SiteConfigPvArray[];
}

export interface SiteConfigGridConnection {
  capacity_kva?: number;
  voltage_level?: string;
  operator?: string;
  contract_type?: string;
  export_allowed?: boolean;
  export_follows_sun?: boolean;
  export_limit_kw?: number;
  import_limit_kw?: number;
  metering_point_id?: string;
}

export interface SiteConfigTariffPeriod {
  name: string;
  start: string;
  end: string;
  days: number[];
  import_rate?: number;
  export_rate?: number;
}

export interface SiteConfigTariff {
  type?: 'flat' | 'time_of_use' | 'dynamic';
  currency?: string;
  periods?: SiteConfigTariffPeriod[];
  demand_charge_per_kw?: number;
  fixed_monthly?: number;
}

export interface SiteConfigLoadProfile {
  type?: 'industrial' | 'commercial' | 'residential';
  typical_peak_kw?: number;
  typical_base_kw?: number;
  operating_hours?: { start: string; end: string };
  shift_pattern?: string;
  seasonal_notes?: string;
}

export interface SiteConfigPowerLimits {
  max_charge_kw?: number;
  max_discharge_kw?: number;
}

export interface SiteConfigInfluxDb {
  bucket?: string;
  measurement?: string;
}

export interface SiteConfigAutomation {
  mode?: SystemMode;
  enabled?: boolean;
  intraday_interval_min?: number;
  daily_time?: string;
  weekly_day?: number;
  weekly_time?: string;
  use_custom_fallback_rules?: boolean;
}

// ─── Behavior Settings (Simple mode) ─────────────────────────────
// Stored in the `behavior` sub-object of site-config; the cloud materializer
// turns each setting into a `set_*` rule asynchronously (replace-by-id).
// The app reads/writes the WHOLE object via GET/PUT /site-config/{site_id}
// (PUT deep-merges) — zero mapping logic client-side.

export interface BehaviorZeroExport {
  enabled: boolean;
  /** Allowed export kW (0 = hard zero-export). Materializes as set_zero_export (bx). */
  limit_kw?: number;
}

export interface BehaviorPeakShave {
  enabled: boolean;
  /** Grid import ceiling kW (> 0). Materializes as set_peak_shave (sl). */
  threshold_kw?: number;
}

export interface BehaviorOffpeakCharge {
  enabled: boolean;
  /** HH:MM local. */
  start?: string;
  /** HH:MM local. */
  end?: string;
  /** 0-100. Materializes as set_offpeak_charge (ct). */
  target_soc?: number;
}

export interface BehaviorBackupReserve {
  enabled: boolean;
  /** SoC floor 0-100. Materializes as set_backup_reserve (hs). */
  soc?: number;
}

export interface BehaviorPvSelfConsumption {
  enabled: boolean;
  /** When true, dmax: 0 — battery only absorbs surplus, never discharges. */
  absorb_only?: boolean;
}

export interface BehaviorAiOptimization {
  /** Informational in v1.1.0 — does not yet gate plan writes cloud-side. */
  enabled: boolean;
}

export interface SiteBehavior {
  zero_export?: BehaviorZeroExport;
  peak_shave?: BehaviorPeakShave;
  offpeak_charge?: BehaviorOffpeakCharge;
  backup_reserve?: BehaviorBackupReserve;
  pv_self_consumption?: BehaviorPvSelfConsumption;
  ai_optimization?: BehaviorAiOptimization;
}

export interface SiteConfig {
  site_id: string;
  general?: SiteConfigGeneral;
  location?: SiteConfigLocation;
  battery?: SiteConfigBattery;
  inverter?: SiteConfigInverter;
  pv_system?: SiteConfigPvSystem;
  grid_connection?: SiteConfigGridConnection;
  tariff?: SiteConfigTariff;
  load_profile?: SiteConfigLoadProfile;
  power_limits?: SiteConfigPowerLimits;
  influxdb?: SiteConfigInfluxDb;
  automation?: SiteConfigAutomation;
  behavior?: SiteBehavior;
  financial?: FinancialSettings;
  ai_profile?: SiteConfigAiProfile;
  updated_at?: string;
  updated_by?: string;
  created_at?: string;
}

// ─── Battery Telemetry Types ────────────────────────────────────

export interface BatteryLiveData {
  minCellVoltage: number;
  maxCellVoltage: number;
  voltageDelta: number;
  minCellTemp: number;
  maxCellTemp: number;
  activeFaults: string;
  activeFaultCount: number;
  lastUpdate: Date;
}

export type BatteryWorkingMode = 0 | 1 | 2 | 3 | 4 | 170;

/** Per-cabinet (or site-aggregate) battery detail from battery_detail bucket. */
export interface CabinetDetail {
  /** Cabinet index; null when this is a whole-site aggregate. */
  stackId: number | null;
  isAggregate: boolean;
  online: boolean;
  stackVoltage: number;
  stackCurrent: number;
  stackSoc: number;
  stackSoh: number;
  workingMode: BatteryWorkingMode;
  chargeDischargeStatus: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  cellCount: number;
  cellVoltageMin: number;
  cellVoltageMax: number;
  cellVoltageDelta: number;
  cellVoltages: number[];
  ntcCount: number;
  cellTempMin: number;
  cellTempMax: number;
  cellTemps: number[];
  alarmCount: number;
  alarmCodes: number[];
  faultCount: number;
  faultCodes: number[];
  lastUpdate: Date;
}

/** @deprecated Prefer CabinetDetail — kept as alias for gradual migration. */
export type BatteryDetailData = CabinetDetail;

export type AlarmKind = 'alarm' | 'fault';

export interface AlarmEpisode {
  stackId: number;
  code: number;
  kind: AlarmKind;
  start: Date;
  /** null = still ongoing (last sample within ~3 min of now). */
  end: Date | null;
  durationMs: number;
}

export interface LiveAlarmItem {
  stackId: number;
  code: number;
  kind: AlarmKind;
  /** When this alarm/fault episode started (from battery_alarms history), if known. */
  since?: Date;
}

// ─── Financial Types (re-export) ─────────────────────────────────

export type {
  EnergyPriceModel,
  ExportPriceModel,
  DistributionOperator,
  TariffGroup,
  FinancialSettings,
  TariffZoneSchedule,
  TariffZone,
  DistributionTariffEntry,
  HourlyFinancialData,
  MonthlyFinancialSummary,
  FinancialSubTab,
  FinancialPeriod,
} from './financial';

export {
  DISTRIBUTION_OPERATORS,
  TARIFF_GROUPS,
  DEFAULT_FINANCIAL_SETTINGS,
} from './financial';

// ─── AI Agent Types (re-export) ──────────────────────────────────

export type {
  SiteConfigAiProfile,
  OptimizationGoal,
  WeeklyPlan,
  AgentType,
  DecisionStatus,
  AgentDecision,
  AgentDecisionComment,
  AgentDecisionInputSummary,
  AgentDecisionOutcome,
  AgentDecisionRuleCreated,
  AgentDecisionRuleModified,
  ForecastHourly,
  ForecastSummary,
  StrategyForecast,
  StrategyPackage,
  StrategySummary,
  StrategyChoice,
  ValidationStatus,
  ScheduleRule,
  ProposedSch,
  AgentLesson,
  LessonCategory,
  AgentState,
  AgentPerformance30d,
  OptimizationResult,
  AgentDecisionQuery,
  AgentNotificationType,
  AgentNotification,
} from './ai-agent';

// ─── Energy Simulation / Forecast Types ─────────────────────────

export type SimulationSource = 'forecast' | 'backfill' | 'satellite';

export interface SimulationDataPoint {
  time: Date;
  pvEstimated: number;
  pvForecast: number;
  loadForecast: number;
  factoryLoadCorrected: number;
  energyBalance: number;
  weatherGti: number;
  weatherTemp: number;
  weatherCloudCover: number;
  weatherCode: number;
  weatherWindSpeed: number;
  source: SimulationSource;
}
