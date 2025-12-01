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
}

export type ActionType = 'ch' | 'dis' | 'sb' | 'ct' | 'dt' | 'sl';
export type Strategy = 'eq' | 'agg' | 'con';
export type GridPowerOperator = 'gt' | 'lt' | 'bt';

export interface RuleAction {
  t: ActionType;
  pw?: number;
  pid?: boolean;
  soc?: number;
  maxp?: number;
  maxg?: number;
  ming?: number;
  str?: Strategy;
  hth?: number;
  lth?: number;
}

export interface RuleConditions {
  ts?: number;
  te?: number;
  d?: string;
  sm?: number;
  sx?: number;
  gpo?: GridPowerOperator;
  gpv?: number;
  gpx?: number;
  vf?: number;
  vu?: number;
}

export interface Rule {
  id: string;
  p: number;
  a: RuleAction;
  c?: RuleConditions;
  act?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export type Language = 'en' | 'pl';

export interface AppSettings {
  language: Language;
  highThreshold: number | null;
  lowThreshold: number | null;
}
