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

export interface BatteryDetailData {
  stackVoltage: number;
  stackCurrent: number;
  stackSoc: number;
  stackSoh: number;
  workingMode: BatteryWorkingMode;
  cellCount: number;
  cellVoltageMin: number;
  cellVoltageMax: number;
  cellVoltageDelta: number;
  cellVoltages: number[];
  ntcCount: number;
  cellTempMin: number;
  cellTempMax: number;
  cellTemps: number[];
  lastUpdate: Date;
}

// ─── Energy Simulation / Forecast Types ─────────────────────────

export type SimulationSource = 'forecast' | 'backfill' | 'satellite';

export interface SimulationDataPoint {
  time: Date;
  pvEstimated: number;
  pvForecast: number;
  loadForecast: number;
  factoryLoadCorrected: number;
  estimatedSurplus: number;
  weatherGti: number;
  weatherTemp: number;
  weatherCloudCover: number;
  weatherCode: number;
  weatherWindSpeed: number;
  source: SimulationSource;
}
