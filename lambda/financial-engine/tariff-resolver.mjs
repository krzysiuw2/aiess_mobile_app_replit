/**
 * Distribution tariff resolver.
 *
 * Resolves the distribution network rate (PLN/kWh) for a given hour by:
 *   1. Fetching the tariff definition from DynamoDB (cached per invocation)
 *   2. Determining the day type (weekday / saturday / sunday+holiday)
 *   3. Matching the local hour against zone schedules
 *
 * Polish public holidays are resolved using a built-in calendar (fixed-date
 * holidays plus Easter-dependent movable holidays via the computus algorithm).
 */

import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const TARIFF_TABLE = process.env.TARIFF_TABLE || 'aiess_tariff_data';
const DEFAULT_TIMEZONE = 'Europe/Warsaw';

// ── Public API ───────────────────────────────────────────────────

/**
 * Resolve distribution rate for a given hour.
 *
 * @param {Date} hour             UTC hour to resolve
 * @param {string} operator       e.g. 'pge', 'energa'
 * @param {string} tariffGroup    e.g. 'C21', 'B23'
 * @param {object} tariffCache    per-invocation cache object (mutated)
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} dynamoClient
 * @param {string} [timezone]     IANA timezone (default: Europe/Warsaw)
 * @returns {Promise<number>}     rate in PLN/kWh
 */
export async function resolveDistributionRate(hour, operator, tariffGroup, tariffCache, dynamoClient, timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const year = hour.getFullYear();
  const cacheKey = `${operator}#${tariffGroup}#${year}`;

  if (!tariffCache[cacheKey]) {
    tariffCache[cacheKey] = await fetchTariffFromDynamo(operator, tariffGroup, year, dynamoClient);
  }

  const tariff = tariffCache[cacheKey];
  if (!tariff || !tariff.zones || tariff.zones.length === 0) return 0;

  const zone = findZoneForHour(hour, tariff.zones, tz);
  return zone?.rate_pln_kwh || 0;
}

// ── DynamoDB fetch ───────────────────────────────────────────────

async function fetchTariffFromDynamo(operator, tariffGroup, year, dynamoClient) {
  try {
    const { Item } = await dynamoClient.send(new GetItemCommand({
      TableName: TARIFF_TABLE,
      Key: {
        PK: { S: `TARIFF#${operator}#${tariffGroup}` },
        SK: { S: String(year) },
      },
    }));

    if (!Item) {
      console.warn(`[TariffResolver] No tariff found for ${operator}/${tariffGroup}/${year}`);
      return null;
    }

    return unmarshall(Item);
  } catch (err) {
    console.error(`[TariffResolver] DynamoDB fetch error for ${operator}/${tariffGroup}/${year}:`, err.message);
    return null;
  }
}

// ── Zone matching ────────────────────────────────────────────────

/**
 * Find which tariff zone applies to a given hour.
 *
 * @param {Date} hour
 * @param {Array<{ name: string, rate_pln_kwh: number, schedule: { weekday: string[], saturday: string[], sunday_holiday: string[] } }>} zones
 * @param {string} timezone
 * @returns {object|null}  matching zone or null
 */
function findZoneForHour(hour, zones, timezone) {
  const local = getLocalDateParts(hour, timezone);
  const dayType = classifyDayType(local);

  for (const zone of zones) {
    const schedule = zone.schedule;
    let ranges;

    if (dayType === 'sunday_holiday') {
      ranges = schedule.sunday_holiday || [];
    } else if (dayType === 'saturday') {
      ranges = schedule.saturday || [];
    } else {
      ranges = schedule.weekday || [];
    }

    if (hourMatchesRanges(local.hour, ranges)) {
      return zone;
    }
  }

  return zones[0] || null;
}

/**
 * Check if a local hour (0-23) falls within any of the given time ranges.
 * Ranges are strings like "06:00-22:00" or "22:00-06:00" (overnight).
 */
function hourMatchesRanges(localHour, ranges) {
  for (const range of ranges) {
    const match = range.match(/^(\d{2}):00-(\d{2}):00$/);
    if (!match) continue;

    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);

    if (start < end) {
      if (localHour >= start && localHour < end) return true;
    } else if (start > end) {
      if (localHour >= start || localHour < end) return true;
    } else if (start === 0 && end === 24 || start === end) {
      return true;
    }
  }
  return false;
}

// ── Day type classification ──────────────────────────────────────

function classifyDayType(local) {
  const dateKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;

  if (local.dayOfWeek === 0 || isPolishHoliday(local.year, local.month, local.day)) {
    return 'sunday_holiday';
  }
  if (local.dayOfWeek === 6) {
    return 'saturday';
  }
  return 'weekday';
}

// ── Local time helpers ───────────────────────────────────────────

function getLocalDateParts(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);

  if (!timezone) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
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

    return { year, month, day, hour, dayOfWeek };
  } catch {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
    };
  }
}

// ── Polish holidays ──────────────────────────────────────────────

const FIXED_HOLIDAYS = [
  [1, 1],   // New Year's Day
  [1, 6],   // Epiphany
  [5, 1],   // Labour Day
  [5, 3],   // Constitution Day
  [8, 15],  // Assumption of Mary
  [11, 1],  // All Saints' Day
  [11, 11], // Independence Day
  [12, 25], // Christmas Day
  [12, 26], // Second Day of Christmas
];

const easterCache = new Map();

/**
 * Determine if a given local date is a Polish public holiday.
 * Covers all 13 Polish public holidays: 9 fixed-date + 4 Easter-dependent.
 */
function isPolishHoliday(year, month, day) {
  for (const [hm, hd] of FIXED_HOLIDAYS) {
    if (month === hm && day === hd) return true;
  }

  const easter = getEasterDate(year);
  const easterMs = new Date(year, easter.month - 1, easter.day).getTime();
  const targetMs = new Date(year, month - 1, day).getTime();
  const diffDays = Math.round((targetMs - easterMs) / 86400000);

  // Easter Sunday (0), Easter Monday (+1), Whit Sunday / Pentecost (+49), Corpus Christi (+60)
  if (diffDays === 0 || diffDays === 1 || diffDays === 49 || diffDays === 60) {
    return true;
  }

  return false;
}

/**
 * Anonymous Gregorian computus algorithm for Easter Sunday.
 * Returns { month, day } in the given year.
 */
function getEasterDate(year) {
  if (easterCache.has(year)) return easterCache.get(year);

  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const result = { month, day };
  easterCache.set(year, result);
  return result;
}
