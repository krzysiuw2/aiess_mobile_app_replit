export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

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
}

export interface LiveData {
  gridPower: number;
  batteryPower: number;
  batterySoc: number;
  batteryStatus: 'Charging' | 'Discharging' | 'Standby';
  pvPower: number;
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
}

// ─── Schedule Rule Types (v1.4.3 optimized format) ──────────────

export type ActionType = 'ch' | 'dis' | 'sb' | 'sl' | 'ct' | 'dt';
export type GridOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'bt';
export type Strategy = 'eq' | 'agg' | 'con';
export type WeekdayShorthand = 'weekdays' | 'weekend' | 'everyday' | 'ed' | 'all' | string;
export type Priority = 4 | 5 | 6 | 7 | 8 | 9;
export type SystemMode = 'automatic' | 'semi-automatic' | 'manual';

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
}

export interface ScheduleRuleWithPriority extends OptimizedScheduleRule {
  priority: Priority;
}

export interface SchedulesResponse {
  site_id: string;
  v: string;
  mode?: SystemMode;
  safety?: {
    soc_min?: number;
    soc_max?: number;
  };
  sch: {
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
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
  shadow_version: number;
  updated_priorities: string[];
  total_rules: number;
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

  timeStart?: string;
  timeEnd?: string;
  socMin?: number;
  socMax?: number;
  gridPowerOperator?: GridOperator;
  gridPowerValue?: number;
  gridPowerValueMax?: number;

  weekdays?: number[];
  validFrom?: number;
  validUntil?: number;
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
