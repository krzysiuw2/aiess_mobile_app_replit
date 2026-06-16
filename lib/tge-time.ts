/**
 * TGE timestamp helpers.
 *
 * The TGE day-ahead price feed stores timestamps using the "Warsaw-as-Z"
 * convention (see aiess-architecture contracts/tge-prices.md): the Warsaw
 * wall-clock digits are written with a `Z` suffix as if they were UTC. So a
 * point for the Warsaw delivery hour 14:00 is stored at `...T14:00:00Z`.
 *
 * Consequence: a `Date` parsed from that string has UTC fields equal to the
 * Warsaw wall clock. We therefore label / group prices using the UTC fields
 * (getUTCHours, timeZone:'UTC' formatting) and keep all day-window math in this
 * same "Warsaw-as-Z" space so everything stays self-consistent. Only when we
 * need the real instant (e.g. matching the price for the current moment) do we
 * convert with reinterpretWarsawZAsUtc().
 */

interface WarsawParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function warsawParts(instant: Date): WarsawParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: p.hour === '24' ? 0 : +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}

/** Offset (ms) such that warsawWallClock = trueUtc + offset, at a given instant. */
function warsawOffsetMs(instant: Date): number {
  const p = warsawParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a stored Warsaw-as-Z Date to the real UTC instant (DST-aware).
 * Two-pass to settle the offset correctly around DST transitions.
 */
export function reinterpretWarsawZAsUtc(stored: Date): Date {
  const wallMs = stored.getTime(); // wall-clock digits interpreted as if UTC
  let offset = warsawOffsetMs(new Date(wallMs));
  let utcMs = wallMs - offset;
  offset = warsawOffsetMs(new Date(utcMs));
  utcMs = wallMs - offset;
  return new Date(utcMs);
}

/** "Now" expressed in Warsaw-as-Z space (UTC fields = current Warsaw wall clock). */
export function warsawNowAsZ(): Date {
  const p = warsawParts(new Date());
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** Start of a Warsaw delivery day (today + dayOffset) in Warsaw-as-Z space. */
export function warsawDayStartAsZ(dayOffset: number): Date {
  const p = warsawParts(new Date());
  return new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset, 0, 0, 0));
}

/** 'HH:MM' Warsaw wall-clock label for a stored point. */
export function warsawTimeLabel(stored: Date): string {
  const hh = String(stored.getUTCHours()).padStart(2, '0');
  const mm = String(stored.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 'HH:MM-HH:MM' label for a price slot. TGE stores the interval START, so the
 * end is start + stepMin. The final slot of the day is shown as '24:00'.
 */
export function warsawIntervalLabel(stored: Date, stepMin: number): string {
  const start = warsawTimeLabel(stored);
  let end = warsawTimeLabel(new Date(stored.getTime() + stepMin * 60_000));
  if (end === '00:00') end = '24:00';
  return `${start}–${end}`;
}

/** Warsaw wall-clock hour (0-23) for a stored point. */
export function warsawHour(stored: Date): number {
  return stored.getUTCHours();
}

/** 'YYYY-MM-DD' Warsaw delivery-day key for a stored point or day-start. */
export function warsawDateKey(stored: Date): string {
  return stored.toISOString().slice(0, 10);
}

/** Short locale day label, e.g. 'Mon 15', for a stored point. */
export function warsawDayLabel(stored: Date, locale: string): string {
  return stored.toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  });
}

/** Full locale date, e.g. '15 June 2026 · Monday'. */
export function warsawFullDate(stored: Date, locale: string): string {
  return stored.toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
