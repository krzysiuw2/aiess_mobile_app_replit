/**
 * Shared display formatters.
 */

/**
 * Format a power value given in kW for display, scaling to MW for large sites.
 *
 *  |v| < 100     -> "24.2 kW"  (one decimal)
 *  100..999.99   -> "105 kW"   (no decimals; keeps SVG boxes narrow)
 *  |v| >= 1000   -> "1.05 MW"  (two decimals)
 */
export function formatPower(kw: number): string {
  const abs = Math.abs(kw);
  if (abs >= 1000) return `${(kw / 1000).toFixed(2)} MW`;
  if (abs >= 100) return `${Math.round(kw)} kW`;
  return `${kw.toFixed(1)} kW`;
}

/**
 * Same scaling but returns only the number, without the unit.
 * Useful where the unit is rendered separately.
 */
export function formatPowerValue(kw: number): { value: string; unit: 'kW' | 'MW' } {
  const abs = Math.abs(kw);
  if (abs >= 1000) return { value: (kw / 1000).toFixed(2), unit: 'MW' };
  if (abs >= 100) return { value: Math.round(kw).toString(), unit: 'kW' };
  return { value: kw.toFixed(1), unit: 'kW' };
}

/**
 * Format a millisecond duration compactly: "42m", "3h 15m", "2d 4h".
 * Used for alarm "active since" / episode duration displays.
 */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}
