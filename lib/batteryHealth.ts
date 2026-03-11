import Colors from '@/constants/colors';
import { CHART_COLORS } from '@/constants/chartColors';
import type { BatteryWorkingMode } from '@/types';

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
