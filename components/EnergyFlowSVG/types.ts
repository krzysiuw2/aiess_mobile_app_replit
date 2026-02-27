import type { LiveData } from '@/types';

export type FlowState = 'forward' | 'reverse' | 'standby';
export type BattStatus = 'charging' | 'discharging' | 'standby';

export interface DerivedState {
  batteryPower: number;
  batterySoc: number;
  gridPower: number;
  pvPower: number;
  loadPower: number;

  battFlowState: FlowState;
  gridFlowState: FlowState;
  loadFlowState: FlowState;
  pvFlowState: FlowState;

  battColor: string;
  battStatus: BattStatus;
  statusColor: string;
  statusText: string;

  socValue: string;
  battPowerValue: string;
  gridValue: string;
  loadValue: string;
  pvValue: string;

  gridArrowPath: string;
  gridArrowColor: string;

  gridAvg1m: string | null;
  gridAvg5m: string | null;
  loadAvg1m: string | null;
  loadAvg5m: string | null;
  pvAvg1m: string | null;
  pvAvg5m: string | null;

  sunActive: boolean;
  smokeActive: boolean;
  waveActive: boolean;
  waveDir: 1 | -1;

  aiRuleId: string;
  aiAction: string;
  aiPower: string;
  aiColor: string;
  aiPowerColor: string;
}

export interface MonitorTranslations {
  soc: string;
  status: string;
  power: string;
  grid: string;
  load: string;
  pv: string;
  aiLogic: string;
  ruleId: string;
  action: string;
  targetPower: string;
  charging: string;
  discharging: string;
  standby: string;
  charge: string;
  discharge: string;
}

export interface EnergyFlowProps {
  liveData: LiveData | null | undefined;
  t: {
    monitor: MonitorTranslations;
  };
}
