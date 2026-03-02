/**
 * InfluxDB Writer & Reader for simulation data
 * 
 * Writes energy_simulation measurement to InfluxDB using line protocol.
 * Also provides read helpers for historical telemetry needed by backfill.
 */

const INFLUX_URL = process.env.INFLUX_URL || '';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'aiess_v1_1h';

const MEASUREMENT = 'energy_simulation';

/**
 * Write an array of simulation data points to InfluxDB.
 *
 * @param {string} siteId
 * @param {string} source   'forecast' | 'backfill' | 'satellite'
 * @param {{ time: string, pvEstimated?: number, pvForecast?: number,
 *           loadForecast?: number, factoryLoadCorrected?: number,
 *           weatherGti?: number, weatherTemp?: number,
 *           weatherCloudCover?: number, weatherCode?: number,
 *           weatherWindSpeed?: number }[]} points
 * @returns {Promise<void>}
 */
export async function writeSimulationData(siteId, source, points) {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    throw new Error('InfluxDB configuration missing (INFLUX_URL / INFLUX_TOKEN)');
  }
  if (points.length === 0) return;

  const BATCH_SIZE = 5000;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const lines = batch.map(p => formatLineProtocol(siteId, source, p)).join('\n');
    await postToInflux(lines);
  }
}

function formatLineProtocol(siteId, source, point) {
  const tags = `site_id=${escapeTag(siteId)},source=${escapeTag(source)}`;
  const fields = [];

  if (point.pvEstimated != null)          fields.push(`pv_estimated=${round4(point.pvEstimated)}`);
  if (point.pvForecast != null)           fields.push(`pv_forecast=${round4(point.pvForecast)}`);
  if (point.loadForecast != null)         fields.push(`load_forecast=${round4(point.loadForecast)}`);
  if (point.factoryLoadCorrected != null) fields.push(`factory_load_corrected=${round4(point.factoryLoadCorrected)}`);
  if (point.weatherGti != null)           fields.push(`weather_gti=${round4(point.weatherGti)}`);
  if (point.weatherTemp != null)          fields.push(`weather_temp=${round4(point.weatherTemp)}`);
  if (point.weatherCloudCover != null)    fields.push(`weather_cloud_cover=${round4(point.weatherCloudCover)}`);
  if (point.weatherCode != null)          fields.push(`weather_code=${Math.round(point.weatherCode)}i`);
  if (point.weatherWindSpeed != null)     fields.push(`weather_wind_speed=${round4(point.weatherWindSpeed)}`);

  if (fields.length === 0) return '';

  const tsNano = toNanoTimestamp(point.time);
  return `${MEASUREMENT},${tags} ${fields.join(',')} ${tsNano}`;
}

function round4(v) { return Math.round(v * 10000) / 10000; }

function escapeTag(s) { return String(s).replace(/[ ,=]/g, '\\$&'); }

function toNanoTimestamp(timeStr) {
  const ms = new Date(timeStr).getTime();
  return `${ms}000000`;
}

async function postToInflux(lineProtocol) {
  const url = `${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=ns`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: lineProtocol,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`InfluxDB write error ${res.status}: ${text}`);
  }
}

/**
 * Read historical battery power (pcs_power) from InfluxDB for backfill.
 * Returns hourly-averaged pcs_power for the given date range.
 *
 * @param {string} siteId
 * @param {string} startDate  ISO date YYYY-MM-DD
 * @param {string} endDate    ISO date YYYY-MM-DD
 * @returns {Map<string, number>}  ISO timestamp -> pcs_power_mean kW
 */
export async function readHistoricalBatteryPower(siteId, startDate, endDate) {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "pcs_power_mean")
      |> yield(name: "result")
  `;

  const csv = await fluxQuery(query);
  return parseBatteryPowerCsv(csv);
}

/**
 * Read historical grid power from InfluxDB for factory load correction.
 */
export async function readHistoricalGridPower(siteId, startDate, endDate) {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "grid_power_mean")
      |> yield(name: "result")
  `;

  const csv = await fluxQuery(query);
  return parseBatteryPowerCsv(csv);
}

async function fluxQuery(query) {
  const url = `${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      Accept: 'application/csv',
    },
    body: query,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`InfluxDB query error ${res.status}: ${text}`);
  }
  return res.text();
}

function parseBatteryPowerCsv(csv) {
  const map = new Map();
  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return map;

  const headers = lines[0].split(',');
  const timeIdx = headers.indexOf('_time');
  const valueIdx = headers.indexOf('_value');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const time = cols[timeIdx]?.trim();
    const value = parseFloat(cols[valueIdx]?.trim());
    if (time && !isNaN(value)) {
      const hourKey = new Date(time).toISOString().slice(0, 13) + ':00:00.000Z';
      map.set(hourKey, value);
    }
  }
  return map;
}

/**
 * Read historical load data for building statistical profiles.
 * Returns hourly factory_load_corrected from energy_simulation (backfill data).
 */
export async function readHistoricalSimulation(siteId, rangeDays = 90) {
  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -${rangeDays}d)
      |> filter(fn: (r) => r._measurement == "energy_simulation")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "factory_load_corrected" or r._field == "weather_temp")
      |> yield(name: "result")
  `;

  const csv = await fluxQuery(query);
  return parseSimulationCsv(csv);
}

function parseSimulationCsv(csv) {
  const loadMap = new Map();
  const tempMap = new Map();

  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return { loadMap, tempMap };

  const headers = lines[0].split(',');
  const timeIdx = headers.indexOf('_time');
  const valueIdx = headers.indexOf('_value');
  const fieldIdx = headers.indexOf('_field');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const time = cols[timeIdx]?.trim();
    const value = parseFloat(cols[valueIdx]?.trim());
    const field = cols[fieldIdx]?.trim();
    if (!time || isNaN(value)) continue;

    const hourKey = new Date(time).toISOString().slice(0, 13) + ':00:00.000Z';
    if (field === 'factory_load_corrected') {
      loadMap.set(hourKey, value);
    } else if (field === 'weather_temp') {
      tempMap.set(hourKey, value);
    }
  }

  return { loadMap, tempMap };
}
