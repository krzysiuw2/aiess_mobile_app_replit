/**
 * Open-Meteo API Client
 * 
 * Fetches weather forecast and historical archive data.
 * Supports per-array GTI requests with custom tilt/azimuth.
 */

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

const requestTimestamps = [];
const MAX_REQUESTS_PER_MINUTE = 50;
const responseCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const HOURLY_VARS = [
  'global_tilted_irradiance',
  'diffuse_radiation',
  'direct_radiation',
  'temperature_2m',
  'cloud_cover',
  'weather_code',
  'wind_speed_10m',
  'is_day',
].join(',');

const DAILY_VARS = 'sunrise,sunset';

/**
 * Convert compass azimuth (0=N, 90=E, 180=S, 270=W) to
 * Open-Meteo convention (0=S, -90=E, 90=W, ±180=N).
 */
function toOpenMeteoAzimuth(compassDeg) {
  let a = (compassDeg ?? 180) - 180;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/**
 * Fetch weather forecast for a single orientation.
 *
 * @param {number} lat      Latitude
 * @param {number} lon      Longitude
 * @param {number} tilt     Panel tilt in degrees
 * @param {number} azimuth  Panel azimuth in Open-Meteo degrees (0=S, -90=E, 90=W)
 * @param {number} forecastDays  Number of forecast days (2-16)
 * @param {string|null} apiKey   Optional commercial API key
 * @returns {object} Parsed JSON response
 */
export async function fetchForecast(lat, lon, tilt, azimuth, forecastDays = 3, apiKey = null) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    tilt: String(tilt),
    azimuth: String(azimuth),
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    forecast_days: String(forecastDays),
    timezone: 'auto',
    timeformat: 'unixtime',
  });

  if (apiKey) params.set('apikey', apiKey);

  const url = `${FORECAST_BASE}?${params}`;
  const cacheKey = `forecast_${url}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[OpenMeteo] Cache hit for forecast:', cacheKey.slice(0, 60));
    return cached.data;
  }

  await rateLimit();
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Open-Meteo forecast error ${res.status}: ${text}`);
  }
  const data = await res.json();
  responseCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

/**
 * Fetch historical weather archive for a single orientation.
 *
 * @param {number} lat         Latitude
 * @param {number} lon         Longitude
 * @param {number} tilt        Panel tilt
 * @param {number} azimuth     Panel azimuth
 * @param {string} startDate   ISO date string YYYY-MM-DD
 * @param {string} endDate     ISO date string YYYY-MM-DD
 * @param {string|null} apiKey Optional API key
 * @returns {object} Parsed JSON response
 */
export async function fetchArchive(lat, lon, tilt, azimuth, startDate, endDate, apiKey = null) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    tilt: String(tilt),
    azimuth: String(azimuth),
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    start_date: startDate,
    end_date: endDate,
    timezone: 'auto',
    timeformat: 'unixtime',
  });

  if (apiKey) params.set('apikey', apiKey);

  const url = `${ARCHIVE_BASE}?${params}`;
  const cacheKey = `archive_${url}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[OpenMeteo] Cache hit for archive:', cacheKey.slice(0, 60));
    return cached.data;
  }

  await rateLimit();
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Open-Meteo archive error ${res.status}: ${text}`);
  }
  const data = await res.json();
  responseCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

async function rateLimit() {
  const now = Date.now();
  const windowStart = now - 60000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const waitMs = requestTimestamps[0] - windowStart + 100;
    console.log(`[OpenMeteo] Rate limit: waiting ${waitMs}ms`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  requestTimestamps.push(Date.now());
}

/**
 * Parse Open-Meteo response into a flat array of hourly weather rows.
 *
 * @param {object} data  Raw Open-Meteo JSON response
 * @returns {{ time: string, gti: number, diffuse: number, direct: number,
 *             temp: number, cloudCover: number, weatherCode: number,
 *             windSpeed: number, isDay: number }[]}
 */
export function parseHourlyWeather(data) {
  const h = data.hourly;
  if (!h || !h.time) return [];

  const utcOffsetSec = data.utc_offset_seconds || 0;
  const rows = [];

  for (let i = 0; i < h.time.length; i++) {
    const ts = h.time[i];
    const isoTime = new Date((ts + utcOffsetSec) * 1000).toISOString();

    rows.push({
      time: isoTime,
      timestamp: ts,
      gti: h.global_tilted_irradiance?.[i] ?? 0,
      diffuse: h.diffuse_radiation?.[i] ?? 0,
      direct: h.direct_radiation?.[i] ?? 0,
      temp: h.temperature_2m?.[i] ?? 15,
      cloudCover: h.cloud_cover?.[i] ?? 0,
      weatherCode: h.weather_code?.[i] ?? 0,
      windSpeed: h.wind_speed_10m?.[i] ?? 0,
      isDay: h.is_day?.[i] ?? 0,
    });
  }

  return rows;
}

/**
 * Fetch weather data for all unique orientations of a site.
 *
 * @param {object} location       { latitude, longitude }
 * @param {{ tilt: number, azimuth: number, key: string }[]} orientations
 * @param {'forecast'|'archive'} mode
 * @param {object} opts           { forecastDays, startDate, endDate, apiKey }
 * @returns {Map<string, object[]>} Map of orientationKey -> weather rows
 */
export async function fetchWeatherForOrientations(location, orientations, mode, opts = {}) {
  const { forecastDays = 3, startDate, endDate, apiKey = null } = opts;
  const weatherMap = new Map();

  for (const { tilt, azimuth, key } of orientations) {
    const omAzimuth = toOpenMeteoAzimuth(azimuth);
    let data;
    if (mode === 'forecast') {
      data = await fetchForecast(location.latitude, location.longitude, tilt, omAzimuth, forecastDays, apiKey);
    } else {
      data = await fetchArchive(location.latitude, location.longitude, tilt, omAzimuth, startDate, endDate, apiKey);
    }
    const rows = parseHourlyWeather(data);
    weatherMap.set(key, rows);
  }

  return weatherMap;
}
