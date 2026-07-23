import { CHART_COLORS } from '@/constants/chartColors';
import type { BatteryWorkingMode, CabinetDetail } from '@/types';

/** Cabinets with no row newer than this are treated as offline. */
export const CABINET_OFFLINE_MS = 5 * 60 * 1000;

/**
 * The device's `stack_id` field is 0-indexed (0, 1, 2, ...). Every place the
 * cabinet number is shown to a user should display it 1-indexed ("Cabinet 1",
 * not "Cabinet 0") — use this helper instead of the raw stackId so the
 * convention stays consistent everywhere.
 */
export function cabinetDisplayNumber(stackId: number): number {
  return stackId + 1;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: CHART_COLORS.success,
  warning: CHART_COLORS.warning,
  critical: CHART_COLORS.error,
};

export function getHealthColor(status: HealthStatus): string {
  return STATUS_COLORS[status];
}

export function getVoltageDeltaStatus(deltaMv: number): HealthStatus {
  if (deltaMv > 80) return 'critical';
  if (deltaMv > 30) return 'warning';
  return 'healthy';
}

export function getMinVoltageStatus(mv: number): HealthStatus {
  if (mv < 2800) return 'critical';
  if (mv < 3000) return 'warning';
  return 'healthy';
}

export function getMaxVoltageStatus(mv: number): HealthStatus {
  if (mv > 3750) return 'critical';
  if (mv > 3650) return 'warning';
  return 'healthy';
}

export function getCellVoltageStatus(mv: number): HealthStatus {
  if (mv < 2800 || mv > 3750) return 'critical';
  if (mv < 3000 || mv > 3650) return 'warning';
  return 'healthy';
}

export function getMinTempStatus(tempC: number): HealthStatus {
  if (tempC < 0) return 'critical';
  if (tempC < 10) return 'warning';
  return 'healthy';
}

export function getMaxTempStatus(tempC: number): HealthStatus {
  if (tempC > 55) return 'critical';
  if (tempC > 45) return 'warning';
  return 'healthy';
}

export function getCellTempStatus(tempC: number): HealthStatus {
  if (tempC < 0 || tempC > 55) return 'critical';
  if (tempC < 10 || tempC > 45) return 'warning';
  return 'healthy';
}

export function getSohStatus(soh: number): HealthStatus {
  if (soh < 80) return 'critical';
  if (soh < 90) return 'warning';
  return 'healthy';
}

export function parseCsvToNumbers(csv: string): number[] {
  if (!csv || csv.trim() === '') return [];
  return csv.split(',').map(v => {
    const n = parseFloat(v.trim());
    return isNaN(n) ? 0 : n;
  });
}

export function getOverallBatteryStatus(
  voltageDelta: number,
  minVoltage: number,
  maxVoltage: number,
  minTemp: number,
  maxTemp: number,
): HealthStatus {
  const statuses = [
    getVoltageDeltaStatus(voltageDelta),
    getMinVoltageStatus(minVoltage),
    getMaxVoltageStatus(maxVoltage),
    getMinTempStatus(minTemp),
    getMaxTempStatus(maxTemp),
  ];
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'healthy';
}

const WORKING_MODE_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Charge Disabled',
  2: 'Discharge Disabled',
  3: 'Standby',
  4: 'Stop',
  170: 'No Communication',
};

export function getWorkingModeLabel(mode: BatteryWorkingMode): string {
  return WORKING_MODE_LABELS[mode] ?? `Unknown (${mode})`;
}

export function getWorkingModeStatus(mode: BatteryWorkingMode): HealthStatus {
  if (mode === 0) return 'healthy';
  if (mode === 170) return 'critical';
  return 'warning';
}

const CHARGE_DISCHARGE_LABELS: Record<number, string> = {
  0: 'Standby',
  1: 'Charging',
  2: 'Discharging',
};

export function getChargeDischargeLabel(status: number): string {
  return CHARGE_DISCHARGE_LABELS[status] ?? `Status ${status}`;
}

/**
 * Aggregate online cabinets into a whole-site view.
 * Min of mins, max of maxes, mean SoC/SoH, summed current / power limits.
 * Cell arrays are empty (per-cabinet only).
 */
export function aggregateSite(cabinets: CabinetDetail[]): CabinetDetail | null {
  const online = cabinets.filter(c => c.online);
  const source = online.length > 0 ? online : cabinets;
  if (source.length === 0) return null;

  const mean = (vals: number[]) =>
    vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;

  const cellVoltageMin = Math.min(...source.map(c => c.cellVoltageMin));
  const cellVoltageMax = Math.max(...source.map(c => c.cellVoltageMax));
  const cellTempMin = Math.min(...source.map(c => c.cellTempMin));
  const cellTempMax = Math.max(...source.map(c => c.cellTempMax));

  const alarmCodeSet = new Set<number>();
  const faultCodeSet = new Set<number>();
  for (const c of source) {
    c.alarmCodes.forEach(code => alarmCodeSet.add(code));
    c.faultCodes.forEach(code => faultCodeSet.add(code));
  }

  const anyOnline = cabinets.some(c => c.online);
  const latest = Math.max(...cabinets.map(c => c.lastUpdate.getTime()));

  return {
    stackId: null,
    isAggregate: true,
    online: anyOnline,
    stackVoltage: mean(source.map(c => c.stackVoltage)),
    stackCurrent: source.reduce((s, c) => s + c.stackCurrent, 0),
    stackSoc: mean(source.map(c => c.stackSoc)),
    stackSoh: mean(source.map(c => c.stackSoh)),
    workingMode: source[0].workingMode,
    chargeDischargeStatus: source[0].chargeDischargeStatus,
    maxChargeKw: source.reduce((s, c) => s + c.maxChargeKw, 0),
    maxDischargeKw: source.reduce((s, c) => s + c.maxDischargeKw, 0),
    cellCount: source.reduce((s, c) => s + c.cellCount, 0),
    cellVoltageMin,
    cellVoltageMax,
    cellVoltageDelta: cellVoltageMax - cellVoltageMin,
    cellVoltages: [],
    ntcCount: source.reduce((s, c) => s + c.ntcCount, 0),
    cellTempMin,
    cellTempMax,
    cellTemps: [],
    alarmCount: alarmCodeSet.size,
    alarmCodes: Array.from(alarmCodeSet).sort((a, b) => a - b),
    faultCount: faultCodeSet.size,
    faultCodes: Array.from(faultCodeSet).sort((a, b) => a - b),
    lastUpdate: new Date(latest),
  };
}

export function isCabinetStale(lastUpdate: Date, nowMs: number = Date.now()): boolean {
  return nowMs - lastUpdate.getTime() > CABINET_OFFLINE_MS;
}
