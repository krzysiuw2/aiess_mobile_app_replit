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
