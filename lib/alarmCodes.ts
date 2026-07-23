/**
 * Alarm / fault code → human-readable name.
 * Roche names from EMS1000 BMS discrete inputs (code = bit index + 1).
 * Wincle codes are raw non-zero fault-register values.
 * See aiess-architecture ADR 0011.
 */

import type { AlarmKind, Language } from '@/types';
import type { BessProducer } from '@/constants/bessProducers';

/** Roche discrete-input alarm names (code 1..57), English. */
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

/** Roche discrete-input alarm names (code 1..57), Polish. */
export const ROCHE_ALARM_NAMES_PL: Record<number, string> = {
  1: 'Awaria sprzętowa BMU',
  2: 'Awaria sprzętowa BCU',
  3: 'Awaria bezpiecznika',
  4: 'Zespawanie kontaktora',
  5: 'Awaria komunikacji BMU',
  6: 'Awaria komunikacji BAU',
  7: 'Awaria czujnika prądu',
  8: 'Awaria urządzenia monitorującego izolację',
  9: 'Nieprawidłowe rozłączenie odłącznika izolacji',
  10: 'Przepięcie napięcia całkowitego — poziom 1',
  11: 'Podnapięcie napięcia całkowitego — poziom 1',
  12: 'Przepięcie ogniwa — poziom 1',
  13: 'Podnapięcie ogniwa — poziom 1',
  14: 'Nadmierny prąd rozładowania — poziom 1',
  15: 'Nadmierny prąd ładowania — poziom 1',
  16: 'Zbyt wysoka temperatura rozładowania — poziom 1',
  17: 'Zbyt niska temperatura rozładowania — poziom 1',
  18: 'Zbyt wysoka temperatura ładowania — poziom 1',
  19: 'Zbyt niska temperatura ładowania — poziom 1',
  20: 'Niska rezystancja izolacji — poziom 1',
  21: 'Zbyt wysoka temperatura bieguna — poziom 1',
  22: 'Zbyt wysoka temperatura złącza PDU — poziom 1',
  23: 'Zbyt duża różnica napięć ogniw — poziom 1',
  24: 'Zbyt duża różnica temperatur ogniw — poziom 1',
  25: 'Niski poziom SOC — poziom 1',
  26: 'Przepięcie napięcia całkowitego — poziom 2',
  27: 'Podnapięcie napięcia całkowitego — poziom 2',
  28: 'Przepięcie ogniwa — poziom 2',
  29: 'Podnapięcie ogniwa — poziom 2',
  30: 'Nadmierny prąd rozładowania — poziom 2',
  31: 'Nadmierny prąd ładowania — poziom 2',
  32: 'Zbyt wysoka temperatura rozładowania — poziom 2',
  33: 'Zbyt niska temperatura rozładowania — poziom 2',
  34: 'Zbyt wysoka temperatura ładowania — poziom 2',
  35: 'Zbyt niska temperatura ładowania — poziom 2',
  36: 'Niska rezystancja izolacji — poziom 2',
  37: 'Zbyt wysoka temperatura bieguna — poziom 2',
  38: 'Zbyt wysoka temperatura złącza PDU — poziom 2',
  39: 'Zbyt duża różnica napięć ogniw — poziom 2',
  40: 'Zbyt duża różnica temperatur ogniw — poziom 2',
  41: 'Niski poziom SOC — poziom 2',
  42: 'Przepięcie napięcia całkowitego — poziom 3',
  43: 'Podnapięcie napięcia całkowitego — poziom 3',
  44: 'Przepięcie ogniwa — poziom 3',
  45: 'Podnapięcie ogniwa — poziom 3',
  46: 'Nadmierny prąd rozładowania — poziom 3',
  47: 'Nadmierny prąd ładowania — poziom 3',
  48: 'Zbyt wysoka temperatura rozładowania — poziom 3',
  49: 'Zbyt niska temperatura rozładowania — poziom 3',
  50: 'Zbyt wysoka temperatura ładowania — poziom 3',
  51: 'Zbyt niska temperatura ładowania — poziom 3',
  52: 'Niska rezystancja izolacji — poziom 3',
  53: 'Zbyt wysoka temperatura bieguna — poziom 3',
  54: 'Zbyt wysoka temperatura złącza PDU — poziom 3',
  55: 'Zbyt duża różnica napięć ogniw — poziom 3',
  56: 'Zbyt duża różnica temperatur ogniw — poziom 3',
  57: 'Niski poziom SOC — poziom 3',
};

export function getAlarmLabel(
  producer: BessProducer,
  code: number,
  kind: AlarmKind = 'alarm',
  language: Language = 'en',
): string {
  if (producer === 'roche' && kind === 'alarm') {
    const table = language === 'pl' ? ROCHE_ALARM_NAMES_PL : ROCHE_ALARM_NAMES;
    return table[code] ?? `Alarm #${code}`;
  }
  if (kind === 'fault') {
    return language === 'pl' ? `Błąd rejestru ${code}` : `Fault reg ${code}`;
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
