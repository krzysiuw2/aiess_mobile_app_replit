/**
 * Load Forecaster - Statistical load prediction
 * 
 * Builds hourly load profiles from historical data (PV-corrected factory load).
 * Uses day-of-week x hour-of-day medians with temperature correction.
 * No ML infrastructure required.
 */

/**
 * Build a load profile from historical data.
 * Profile = median factory load for each (dayOfWeek, hour) combination.
 *
 * @param {Map<string, number>} loadMap  ISO timestamp -> factory_load_corrected kW
 * @returns {Map<string, number>}  Key "dow_hour" (e.g. "1_14") -> median load kW
 */
export function buildLoadProfile(loadMap) {
  const buckets = new Map();

  for (const [timeStr, load] of loadMap) {
    if (load <= 0) continue;
    const d = new Date(timeStr);
    const dow = d.getUTCDay();
    const hour = d.getUTCHours();
    const key = `${dow}_${hour}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(load);
  }

  const profile = new Map();
  for (const [key, values] of buckets) {
    profile.set(key, median(values));
  }

  return profile;
}

/**
 * Compute temperature correction coefficients.
 * Simple linear regression: load_residual = a * temp + b
 *
 * @param {Map<string, number>} loadMap  Timestamp -> factory load kW
 * @param {Map<string, number>} tempMap  Timestamp -> temperature °C
 * @param {Map<string, number>} profile  Load profile from buildLoadProfile
 * @returns {{ slope: number, intercept: number }}
 */
export function buildTempCorrection(loadMap, tempMap, profile) {
  const xs = [];
  const ys = [];

  for (const [timeStr, load] of loadMap) {
    const temp = tempMap.get(timeStr);
    if (temp == null || load <= 0) continue;

    const d = new Date(timeStr);
    const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
    const profileLoad = profile.get(key);
    if (profileLoad == null) continue;

    xs.push(temp);
    ys.push(load - profileLoad);
  }

  if (xs.length < 48) {
    return { slope: 0, intercept: 0 };
  }

  return linearRegression(xs, ys);
}

/**
 * Generate a load forecast for a list of future timestamps.
 *
 * @param {Map<string, number>} profile      Load profile (dow_hour -> median kW)
 * @param {{ slope: number, intercept: number }} tempCoeffs  Temperature correction
 * @param {{ time: string, temp: number }[]} futureWeather  Future timestamps with temp
 * @param {number} scaleFactor  Recent scaling factor (ratio of recent actual vs profile)
 * @returns {{ time: string, loadKw: number }[]}
 */
export function forecastLoad(profile, tempCoeffs, futureWeather, scaleFactor = 1.0) {
  const result = [];

  for (const { time, temp } of futureWeather) {
    const d = new Date(time);
    const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
    const baseLoad = profile.get(key) || 0;

    const tempCorrection = tempCoeffs.slope * temp + tempCoeffs.intercept;
    const forecastKw = Math.max(0, (baseLoad + tempCorrection) * scaleFactor);

    result.push({ time, loadKw: Math.round(forecastKw * 100) / 100 });
  }

  return result;
}

/**
 * Compute a rolling scale factor by comparing recent actual load to profile.
 * Uses the last N days of data.
 *
 * @param {Map<string, number>} loadMap   Recent actual load
 * @param {Map<string, number>} profile   Load profile
 * @param {number} days                   How many recent days to use
 * @returns {number}  Scale factor (typically 0.8 - 1.2)
 */
export function computeScaleFactor(loadMap, profile, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  let sumActual = 0;
  let sumProfile = 0;
  let count = 0;

  for (const [timeStr, load] of loadMap) {
    const d = new Date(timeStr);
    if (d < cutoff) continue;
    const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
    const pLoad = profile.get(key);
    if (pLoad == null || pLoad <= 0) continue;

    sumActual += load;
    sumProfile += pLoad;
    count++;
  }

  if (count < 24 || sumProfile === 0) return 1.0;
  const factor = sumActual / sumProfile;
  return Math.max(0.5, Math.min(2.0, factor));
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function linearRegression(xs, ys) {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}
