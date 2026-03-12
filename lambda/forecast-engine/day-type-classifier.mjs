/**
 * Day-type classifier for load forecasting.
 *
 * Classifies timestamps as 'workday', 'weekend', or 'holiday'
 * using timezone-aware local time and country-specific holiday calendars.
 *
 * Supported countries: PL (Poland) via poland-public-holidays.
 * Falls back to weekend-only classification for unsupported countries.
 */

let plHolidaysModule = null;

async function getPlHolidays() {
  if (!plHolidaysModule) {
    try {
      plHolidaysModule = await import('poland-public-holidays');
    } catch {
      console.warn('[DayType] poland-public-holidays not available, PL holidays disabled');
      plHolidaysModule = { getHolidaysInYear: () => [] };
    }
  }
  return plHolidaysModule;
}

/**
 * Get a Set of "YYYY-MM-DD" strings for all holidays in the given range.
 *
 * @param {string} countryCode  ISO 3166-1 alpha-2 (e.g. "PL")
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Set<string>>}
 */
export async function getHolidaysForRange(countryCode, startDate, endDate) {
  const holidays = new Set();
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (countryCode === 'PL') {
    const mod = await getPlHolidays();
    const getHolidays = mod.getHolidaysInYear || mod.default?.getHolidaysInYear;
    if (!getHolidays) return holidays;

    for (let year = startYear; year <= endYear; year++) {
      try {
        const yearHolidays = getHolidays(year);
        for (const h of yearHolidays) {
          const d = h.date instanceof Date ? h.date : new Date(h.date);
          const key = d.toISOString().slice(0, 10);
          holidays.add(key);
        }
      } catch (err) {
        console.warn(`[DayType] Failed to get PL holidays for ${year}: ${err.message}`);
      }
    }
  }

  return holidays;
}

/**
 * Get the local date components for a UTC timestamp in a given timezone.
 *
 * @param {Date|string} date
 * @param {string} timezone  IANA timezone (e.g. "Europe/Warsaw")
 * @returns {{ year: number, month: number, day: number, hour: number, dayOfWeek: number, dateKey: string }}
 */
export function getLocalDateParts(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);

  if (!timezone) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
      dateKey: d.toISOString().slice(0, 10),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      weekday: 'short',
    }).formatToParts(d);

    const get = (type) => parts.find(p => p.type === type)?.value || '';
    const year = parseInt(get('year'));
    const month = parseInt(get('month'));
    const day = parseInt(get('day'));
    let hour = parseInt(get('hour'));
    if (hour === 24) hour = 0;
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = wdMap[get('weekday')] ?? d.getUTCDay();
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return { year, month, day, hour, dayOfWeek, dateKey };
  } catch {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
      dateKey: d.toISOString().slice(0, 10),
    };
  }
}

/**
 * Classify a timestamp into a day-type.
 *
 * @param {Date|string} date
 * @param {Set<string>} holidaySet  Set of "YYYY-MM-DD" holiday date strings
 * @param {string} timezone         IANA timezone
 * @returns {'workday' | 'weekend' | 'holiday'}
 */
export function classifyDayType(date, holidaySet, timezone) {
  const local = getLocalDateParts(date, timezone);

  if (holidaySet.has(local.dateKey) && local.dayOfWeek !== 0 && local.dayOfWeek !== 6) {
    return 'holiday';
  }

  if (local.dayOfWeek === 0 || local.dayOfWeek === 6) {
    return 'weekend';
  }

  return 'workday';
}

/**
 * Create a classifier function bound to a specific holiday set and timezone.
 * Returns (dateStr) => { dayType, localHour } for efficient use in loops.
 *
 * @param {Set<string>} holidaySet
 * @param {string} timezone
 * @returns {(dateStr: string) => { dayType: string, localHour: number }}
 */
export function createClassifier(holidaySet, timezone) {
  return (dateStr) => {
    const local = getLocalDateParts(dateStr, timezone);
    let dayType;
    if (holidaySet.has(local.dateKey) && local.dayOfWeek !== 0 && local.dayOfWeek !== 6) {
      dayType = 'holiday';
    } else if (local.dayOfWeek === 0 || local.dayOfWeek === 6) {
      dayType = 'weekend';
    } else {
      dayType = 'workday';
    }
    return { dayType, localHour: local.hour };
  };
}
