/**
 * PV Calculator - Physics-based solar power estimation
 * 
 * Ported from open-meteo-solar-forecast Python library (MIT License).
 * Uses Global Tilted Irradiance (GTI) from Open-Meteo + cell temperature
 * derating via the Ross model to compute DC power output per array.
 */

const G_STC = 1000;           // Irradiance at Standard Test Conditions (W/m²)
const TEMP_STC_CELL = 25;     // Cell temperature at STC (°C)
const ALPHA_TEMP = -0.004;    // Silicon temperature coefficient (1/°C)
const FAIMAN_U0 = 25.0;       // Faiman constant heat loss coefficient W/(m²·K)
const FAIMAN_U1 = 6.84;       // Faiman wind heat loss coefficient W/(m²·K·(m/s))

/**
 * Calculate cell temperature using the Faiman model.
 * Wind-dependent: higher wind → cooler panels → better efficiency.
 *
 * At wind=0 m/s: K_eff=0.040 (hotter than old Ross 0.034)
 * At wind=2 m/s: K_eff=0.026 (cooler)
 * At wind=5 m/s: K_eff=0.017 (much cooler)
 */
function cellTemperature(gtiWm2, tempAmbientC, windSpeedMs) {
  const ws = Math.max(0, windSpeedMs || 0);
  return tempAmbientC + gtiWm2 / (FAIMAN_U0 + FAIMAN_U1 * ws);
}

/**
 * Calculate instantaneous power output for a single PV array.
 *
 * @param {number} gtiWm2       Global Tilted Irradiance on the array plane (W/m²)
 * @param {number} tempAmbientC Ambient temperature (°C)
 * @param {object} array        PV array config from site_config.pv_system.arrays[]
 * @param {number} [windSpeedMs] Wind speed in m/s (used for cell cooling)
 * @returns {number}            Power output in kW (>= 0)
 */
export function calculateArrayPower(gtiWm2, tempAmbientC, array, windSpeedMs) {
  if (!gtiWm2 || gtiWm2 <= 0) return 0;

  const dcWp = (array.peak_kw || 0) * 1000;
  if (dcWp <= 0) return 0;

  const tempCell = cellTemperature(gtiWm2, tempAmbientC, windSpeedMs);
  const efficiency = array.efficiency_factor ?? 1.0;
  const shadingMultiplier = array.shading_factor ?? 1.0;

  const powerW = dcWp
    * (gtiWm2 / G_STC)
    * (1 + ALPHA_TEMP * (tempCell - TEMP_STC_CELL))
    * efficiency
    * shadingMultiplier;

  return Math.max(0, powerW / 1000);
}

/**
 * Calculate power with diffuse-only fallback for shaded conditions.
 * When direct radiation is blocked (e.g. by horizon or nearby objects),
 * only diffuse irradiance contributes.
 *
 * @param {number} gtiWm2         Full GTI (W/m²)
 * @param {number} diffuseWm2     Diffuse horizontal irradiance (W/m²)
 * @param {number} directWm2      Direct horizontal irradiance (W/m²)
 * @param {number} tempAmbientC   Ambient temperature (°C)
 * @param {object} array          PV array config
 * @param {boolean} isShaded      Whether the array is temporarily shaded from direct sun
 * @returns {number}              Power output in kW
 */
export function calculateArrayPowerWithShading(gtiWm2, diffuseWm2, directWm2, tempAmbientC, array, isShaded, windSpeedMs) {
  if (!isShaded) {
    return calculateArrayPower(gtiWm2, tempAmbientC, array, windSpeedMs);
  }
  const totalHoriz = (diffuseWm2 || 0) + (directWm2 || 0);
  const diffuseFraction = totalHoriz > 0 ? Math.max(0, (diffuseWm2 || 0) / totalHoriz) : 1.0;
  const effectiveGti = (gtiWm2 || 0) * diffuseFraction;
  return calculateArrayPower(effectiveGti, tempAmbientC, array, windSpeedMs);
}

/**
 * Compute hourly PV timeseries for a whole site.
 *
 * @param {Map<string,object[]>} weatherByOrientation
 *   Key = "tilt_azimuth" (e.g. "30_180"), value = array of hourly weather rows
 *   Each row: { time, gti, diffuse, direct, temp }
 * @param {object[]} arrays        All PV arrays from site_config.pv_system.arrays
 * @param {'all'|'unmonitored_only'} mode
 *   'all' = forecast for all arrays, 'unmonitored_only' = only arrays where monitored !== true
 * @param {number|null} acCapacityKw  Optional inverter AC capacity clamp
 * @returns {{ time: string, pvKw: number }[]}
 */
export function calculateSitePv(weatherByOrientation, arrays, mode = 'all', acCapacityKw = null, calibrationFactor = 1.0) {
  const filteredArrays = mode === 'unmonitored_only'
    ? arrays.filter(a => !a.monitored)
    : arrays;

  if (filteredArrays.length === 0) return [];

  const orientationKey = (arr) => `${arr.tilt_deg ?? 0}_${arr.azimuth_deg ?? 0}`;

  const timeMap = new Map();

  for (const array of filteredArrays) {
    const key = orientationKey(array);
    const weatherRows = weatherByOrientation.get(key);
    if (!weatherRows) continue;

    for (const row of weatherRows) {
      const power = calculateArrayPower(row.gti, row.temp, array, row.windSpeed);
      const existing = timeMap.get(row.time) || 0;
      timeMap.set(row.time, existing + power);
    }
  }

  const acClampW = acCapacityKw ? acCapacityKw * 1000 : Infinity;
  const result = [];
  for (const [time, totalKw] of timeMap) {
    result.push({
      time,
      pvKw: Math.min(totalKw * calibrationFactor, acClampW / 1000),
    });
  }

  result.sort((a, b) => new Date(a.time) - new Date(b.time));
  return result;
}

/**
 * Compute hourly PV from sub-hourly (15-min) weather data.
 *
 * Uses 15-min granularity for PV calculation (better cloud-transition
 * accuracy), then aggregates to hourly averages for output.
 *
 * @param {Map<string,object[]>} subhourlyByOrientation
 *   Key = "tilt_azimuth", value = array of 15-min weather rows
 * @param {object[]} arrays       PV arrays from site_config
 * @param {'all'|'unmonitored_only'} mode
 * @param {number|null} acCapacityKw
 * @returns {{ time: string, pvKw: number }[]}  Hourly aggregated output
 */
export function calculateSitePvFromSubhourly(subhourlyByOrientation, arrays, mode = 'all', acCapacityKw = null, calibrationFactor = 1.0) {
  const filteredArrays = mode === 'unmonitored_only'
    ? arrays.filter(a => !a.monitored)
    : arrays;

  if (filteredArrays.length === 0) return [];

  const orientationKey = (arr) => `${arr.tilt_deg ?? 0}_${arr.azimuth_deg ?? 0}`;
  const acClampKw = acCapacityKw || Infinity;

  const subhourlyMap = new Map();

  for (const array of filteredArrays) {
    const key = orientationKey(array);
    const rows = subhourlyByOrientation.get(key);
    if (!rows) continue;

    for (const row of rows) {
      const power = calculateArrayPower(row.gti, row.temp, array, row.windSpeed);
      const existing = subhourlyMap.get(row.time) || 0;
      subhourlyMap.set(row.time, Math.min(existing + power, acClampKw));
    }
  }

  const hourlyBuckets = new Map();
  for (const [isoTime, pvKw] of subhourlyMap) {
    const dt = new Date(isoTime);
    const hourKey = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours()).toISOString();
    const bucket = hourlyBuckets.get(hourKey) || { sum: 0, count: 0 };
    bucket.sum += pvKw;
    bucket.count += 1;
    hourlyBuckets.set(hourKey, bucket);
  }

  const result = [];
  for (const [time, { sum, count }] of hourlyBuckets) {
    result.push({ time, pvKw: (sum / count) * calibrationFactor });
  }

  result.sort((a, b) => new Date(a.time) - new Date(b.time));
  return result;
}

/**
 * Get unique orientation keys from an array list.
 * Used to deduplicate Open-Meteo API calls.
 */
export function getUniqueOrientations(arrays, mode = 'all') {
  const filtered = mode === 'unmonitored_only'
    ? arrays.filter(a => !a.monitored)
    : arrays;

  const seen = new Set();
  const orientations = [];
  for (const arr of filtered) {
    const tilt = arr.tilt_deg ?? 0;
    const azimuth = arr.azimuth_deg ?? 0;
    const key = `${tilt}_${azimuth}`;
    if (!seen.has(key)) {
      seen.add(key);
      orientations.push({ tilt, azimuth, key });
    }
  }
  return orientations;
}
