/**
 * Load Forecaster - Statistical load prediction with day-type awareness
 *
 * Builds hourly load profiles from historical data (PV-corrected factory load).
 * Uses day-type (workday/weekend/holiday) x local-hour medians with
 * temperature correction and per-type scale factors.
 *
 * Holiday profiles fall back to weekend when insufficient data is available.
 */

const MIN_BUCKET_SIZE = 48;

/**
 * Build a load profile from historical data.
 * Profile = median factory load for each (dayType, localHour) combination.
 *
 * @param {Map<string, number>} loadMap        ISO timestamp -> factory_load_corrected kW
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @returns {Map<string, number>}  Key "dayType_hour" (e.g. "workday_14") -> median load kW
 */
export function buildLoadProfile(loadMap, classifyFn) {
  const buckets = new Map();

  for (const [timeStr, load] of loadMap) {
    if (load <= 0) continue;
    const { dayType, localHour } = classifyFn(timeStr);
    const key = `${dayType}_${localHour}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(load);
  }

  const profile = new Map();
  for (const [key, values] of buckets) {
    profile.set(key, median(values));
  }

  // Fallback: holiday -> weekend if holiday data is sparse
  let holidayCount = 0;
  for (const [key] of profile) {
    if (key.startsWith('holiday_')) holidayCount++;
  }

  if (holidayCount < 12) {
    for (let h = 0; h < 24; h++) {
      const holidayKey = `holiday_${h}`;
      if (!profile.has(holidayKey) || buckets.get(holidayKey)?.length < 3) {
        const weekendVal = profile.get(`weekend_${h}`);
        if (weekendVal != null) {
          profile.set(holidayKey, weekendVal);
        }
      }
    }
  }

  return profile;
}

/**
 * Build a load profile that includes both median and standard deviation per bucket.
 * Used by the calibration engine to score PV reconstruction confidence.
 *
 * @param {Map<string, number>} loadMap  ISO timestamp -> factory_load_corrected kW
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @returns {Map<string, { median: number, stdDev: number, count: number }>}
 */
export function buildLoadProfileWithStdDev(loadMap, classifyFn) {
  const buckets = new Map();

  for (const [timeStr, load] of loadMap) {
    if (load <= 0) continue;
    const { dayType, localHour } = classifyFn(timeStr);
    const key = `${dayType}_${localHour}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(load);
  }

  const profile = new Map();
  for (const [key, values] of buckets) {
    profile.set(key, {
      median: median(values),
      stdDev: stdDev(values),
      count: values.length,
    });
  }

  let holidayCount = 0;
  for (const [key] of profile) {
    if (key.startsWith('holiday_')) holidayCount++;
  }

  if (holidayCount < 12) {
    for (let h = 0; h < 24; h++) {
      const holidayKey = `holiday_${h}`;
      if (!profile.has(holidayKey) || buckets.get(holidayKey)?.length < 3) {
        const weekendVal = profile.get(`weekend_${h}`);
        if (weekendVal != null) {
          profile.set(holidayKey, weekendVal);
        }
      }
    }
  }

  return profile;
}

/**
 * Compute temperature correction coefficients per day-type.
 * Simple linear regression: load_residual = a * temp + b
 *
 * @param {Map<string, number>} loadMap   Timestamp -> factory load kW
 * @param {Map<string, number>} tempMap   Timestamp -> temperature °C
 * @param {Map<string, number>} profile   Load profile from buildLoadProfile
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @returns {Map<string, { slope: number, intercept: number }>}  dayType -> coefficients
 */
export function buildTempCorrection(loadMap, tempMap, profile, classifyFn) {
  const byType = new Map();

  for (const [timeStr, load] of loadMap) {
    const temp = tempMap.get(timeStr);
    if (temp == null || load <= 0) continue;

    const { dayType, localHour } = classifyFn(timeStr);
    const key = `${dayType}_${localHour}`;
    const profileLoad = profile.get(key);
    if (profileLoad == null) continue;

    if (!byType.has(dayType)) byType.set(dayType, { xs: [], ys: [] });
    const b = byType.get(dayType);
    b.xs.push(temp);
    b.ys.push(load - profileLoad);
  }

  const result = new Map();
  const fallback = { slope: 0, intercept: 0 };

  for (const [dayType, data] of byType) {
    if (data.xs.length < MIN_BUCKET_SIZE) {
      result.set(dayType, fallback);
    } else {
      result.set(dayType, linearRegression(data.xs, data.ys));
    }
  }

  // Ensure all types have coefficients
  for (const dt of ['workday', 'weekend', 'holiday']) {
    if (!result.has(dt)) {
      result.set(dt, result.get('weekend') || fallback);
    }
  }

  return result;
}

/**
 * Generate a load forecast for a list of future timestamps.
 *
 * @param {Map<string, number>} profile                 Load profile (dayType_hour -> median kW)
 * @param {Map<string, { slope: number, intercept: number }>} tempCoeffsMap  Per-type temp coefficients
 * @param {{ time: string, temp: number }[]} futureWeather  Future timestamps with temp
 * @param {Map<string, number>} scaleFactors             Per-type scale factors
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @returns {{ time: string, loadKw: number }[]}
 */
export function forecastLoad(profile, tempCoeffsMap, futureWeather, scaleFactors, classifyFn) {
  const result = [];

  for (const { time, temp } of futureWeather) {
    const { dayType, localHour } = classifyFn(time);
    const key = `${dayType}_${localHour}`;
    const baseLoad = profile.get(key) || 0;

    const tempCoeffs = tempCoeffsMap.get(dayType) || { slope: 0, intercept: 0 };
    const tempCorrection = tempCoeffs.slope * temp + tempCoeffs.intercept;
    const sf = scaleFactors.get(dayType) ?? 1.0;
    const forecastKw = Math.max(0, (baseLoad + tempCorrection) * sf);

    result.push({ time, loadKw: Math.round(forecastKw * 100) / 100 });
  }

  return result;
}

/**
 * Compute per-day-type rolling scale factors from recent data.
 *
 * @param {Map<string, number>} loadMap   Recent actual load
 * @param {Map<string, number>} profile   Load profile
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @param {number} days                   How many recent days to use
 * @returns {Map<string, number>}  dayType -> scale factor (typically 0.5 - 2.0)
 */
export function computeScaleFactors(loadMap, profile, classifyFn, days = 14) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const byType = new Map();

  for (const [timeStr, load] of loadMap) {
    const d = new Date(timeStr);
    if (d < cutoff) continue;

    const { dayType, localHour } = classifyFn(timeStr);
    const key = `${dayType}_${localHour}`;
    const pLoad = profile.get(key);
    if (pLoad == null || pLoad <= 0) continue;

    if (!byType.has(dayType)) byType.set(dayType, { actual: 0, profile: 0, count: 0 });
    const b = byType.get(dayType);
    b.actual += load;
    b.profile += pLoad;
    b.count++;
  }

  const result = new Map();
  for (const [dayType, data] of byType) {
    if (data.count < 12 || data.profile === 0) {
      result.set(dayType, 1.0);
    } else {
      const factor = data.actual / data.profile;
      result.set(dayType, Math.max(0.5, Math.min(2.0, factor)));
    }
  }

  // Ensure all types have factors; holiday falls back to weekend
  for (const dt of ['workday', 'weekend', 'holiday']) {
    if (!result.has(dt)) {
      result.set(dt, result.get('weekend') ?? 1.0);
    }
  }

  return result;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
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
