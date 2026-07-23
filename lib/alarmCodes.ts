/**
 * Alarm / fault code → human-readable name.
 * Roche names from EMS1000 BMS discrete inputs (code = bit index + 1).
 * Wincle codes are raw non-zero fault-register values.
 * See aiess-architecture ADR 0011.
 */

import type { AlarmKind } from '@/types';
import type { BessProducer } from '@/constants/bessProducers';

/** Roche discrete-input alarm names (code 1..57). */
export const ROCHE_ALARM_NAMES: Record<number, string> = {
  1: 'BMU Hardware Fault',
  2: 'BCU Hardware Fault',
  3: 'Fuse Fault',
  4: 'Contactor Adhesion Fault',
  5: 'BMU Communication Fault',
  6: 'BAU Communication Fault',
  7: 'Current Sensor Fault',
  8: 'Insulation Monitoring Device Fault',
  9: 'Isolation Switch Abnormal Disconnect',
  10: 'Total Voltage Overvoltage Level 1 Alarm',
  11: 'Total Voltage Undervoltage Level 1 Alarm',
  12: 'Cell Overvoltage Level 1 Alarm',
  13: 'Cell Undervoltage Level 1 Alarm',
  14: 'Discharge Overcurrent Level 1 Alarm',
  15: 'Charge Overcurrent Level 1 Alarm',
  16: 'Discharge Battery Over-TEMP Level 1 Alarm',
  17: 'Discharge Battery Under-TEMP Level 1 Alarm',
  18: 'Charge Battery Over-TEMP Level 1 Alarm',
  19: 'Charge Battery Under-TEMP Level 1 Alarm',
  20: 'Insulation Resistance Low Level 1 Alarm',
  21: 'Pole TEMP High Level 1 Alarm',
  22: 'PDU Connector TEMP High Level 1 Alarm',
  23: 'Cell Voltage Difference High Level 1 Alarm',
  24: 'Cell TEMP Difference High Level 1 Alarm',
  25: 'SOC Low Level 1 Alarm',
  26: 'Total Voltage Overvoltage Level 2 Alarm',
  27: 'Total Voltage Undervoltage Level 2 Alarm',
  28: 'Cell Overvoltage Level 2 Alarm',
  29: 'Cell Undervoltage Level 2 Alarm',
  30: 'Discharge Overcurrent Level 2 Alarm',
  31: 'Charge Overcurrent Level 2 Alarm',
  32: 'Discharge Battery Over-TEMP Level 2 Alarm',
  33: 'Discharge Battery Under-TEMP Level 2 Alarm',
  34: 'Charge Battery Over-TEMP Level 2 Alarm',
  35: 'Charge Battery Under-TEMP Level 2 Alarm',
  36: 'Insulation Resistance Low Level 2 Alarm',
  37: 'Pole TEMP High Level 2 Alarm',
  38: 'PDU Connector TEMP High Level 2 Alarm',
  39: 'Cell Voltage Difference High Level 2 Alarm',
  40: 'Cell TEMP Difference High Level 2 Alarm',
  41: 'SOC Low Level 2 Alarm',
  42: 'Total Voltage Overvoltage Level 3 Alarm',
  43: 'Total Voltage Undervoltage Level 3 Alarm',
  44: 'Cell Overvoltage Level 3 Alarm',
  45: 'Cell Undervoltage Level 3 Alarm',
  46: 'Discharge Overcurrent Level 3 Alarm',
  47: 'Charge Overcurrent Level 3 Alarm',
  48: 'Discharge Battery Over-TEMP Level 3 Alarm',
  49: 'Discharge Battery Under-TEMP Level 3 Alarm',
  50: 'Charge Battery Over-TEMP Level 3 Alarm',
  51: 'Charge Battery Under-TEMP Level 3 Alarm',
  52: 'Insulation Resistance Low Level 3 Alarm',
  53: 'Pole TEMP High Level 3 Alarm',
  54: 'PDU Connector Temperature High Level 3 Alarm',
  55: 'Cell Voltage Difference High Level 3 Alarm',
  56: 'Cell TEMP Difference High Level 3 Alarm',
  57: 'SOC Low Level 3 Alarm',
};

export function getAlarmLabel(
  producer: BessProducer,
  code: number,
  kind: AlarmKind = 'alarm',
): string {
  if (producer === 'roche' && kind === 'alarm') {
    return ROCHE_ALARM_NAMES[code] ?? `Alarm #${code}`;
  }
  if (kind === 'fault') {
    return `Fault reg ${code}`;
  }
  // Wincle alarms / unknown: show as register value
  return `REG ${code}`;
}

export function parseAlarmCodesCsv(csv: string | undefined | null): number[] {
  if (!csv || csv.trim() === '') return [];
  return csv
    .split(',')
    .map(v => parseInt(v.trim(), 10))
    .filter(n => !isNaN(n) && n !== 0);
}
