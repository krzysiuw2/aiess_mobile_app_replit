/**
 * InfluxDB Writer & Reader for financial data
 *
 * Writes financial_metrics measurement to InfluxDB using line protocol.
 * Reads energy telemetry and TGE price data for financial calculations.
 */

const INFLUX_URL = process.env.INFLUX_URL || '';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'aiess_v1_1h';

const MEASUREMENT = 'financial_metrics';

/**
 * Write an array of hourly financial data points to InfluxDB.
 *
 * @param {string} siteId
 * @param {{ time: string, energy_cost_pln?: number, distribution_cost_pln?: number,
 *           seller_margin_cost_pln?: number, export_revenue_pln?: number,
 *           pv_self_consumed_kwh?: number, pv_self_consumed_value_pln?: number,
 *           battery_charge_cost_pln?: number, battery_discharge_value_pln?: number,
 *           battery_arbitrage_pln?: number, total_rate_pln_kwh?: number,
 *           grid_import_kwh?: number, grid_export_kwh?: number,
 *           battery_charge_kwh?: number, battery_discharge_kwh?: number,
 *           pv_production_kwh?: number }[]} points
 * @returns {Promise<void>}
 */
export async function writeHourlyToInflux(siteId, points) {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    throw new Error('InfluxDB configuration missing (INFLUX_URL / INFLUX_TOKEN)');
  }
  if (points.length === 0) return;

  const BATCH_SIZE = 5000;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const lines = batch.map(p => formatLineProtocol(siteId, p)).filter(Boolean).join('\n');
    if (lines) await postToInflux(lines);
  }
}

function formatLineProtocol(siteId, point) {
  const tags = `site_id=${escapeTag(siteId)}`;
  const fields = [];

  if (point.energy_cost_pln != null)             fields.push(`energy_cost_pln=${round4(point.energy_cost_pln)}`);
  if (point.distribution_cost_pln != null)       fields.push(`distribution_cost_pln=${round4(point.distribution_cost_pln)}`);
  if (point.seller_margin_cost_pln != null)      fields.push(`seller_margin_cost_pln=${round4(point.seller_margin_cost_pln)}`);
  if (point.export_revenue_pln != null)          fields.push(`export_revenue_pln=${round4(point.export_revenue_pln)}`);
  if (point.pv_self_consumed_kwh != null)        fields.push(`pv_self_consumed_kwh=${round4(point.pv_self_consumed_kwh)}`);
  if (point.pv_self_consumed_value_pln != null)  fields.push(`pv_self_consumed_value_pln=${round4(point.pv_self_consumed_value_pln)}`);
  if (point.battery_charge_cost_pln != null)     fields.push(`battery_charge_cost_pln=${round4(point.battery_charge_cost_pln)}`);
  if (point.battery_discharge_value_pln != null) fields.push(`battery_discharge_value_pln=${round4(point.battery_discharge_value_pln)}`);
  if (point.battery_arbitrage_pln != null)       fields.push(`battery_arbitrage_pln=${round4(point.battery_arbitrage_pln)}`);
  if (point.total_rate_pln_kwh != null)          fields.push(`total_rate_pln_kwh=${round4(point.total_rate_pln_kwh)}`);
  if (point.grid_import_kwh != null)             fields.push(`grid_import_kwh=${round4(point.grid_import_kwh)}`);
  if (point.grid_export_kwh != null)             fields.push(`grid_export_kwh=${round4(point.grid_export_kwh)}`);
  if (point.battery_charge_kwh != null)          fields.push(`battery_charge_kwh=${round4(point.battery_charge_kwh)}`);
  if (point.battery_discharge_kwh != null)       fields.push(`battery_discharge_kwh=${round4(point.battery_discharge_kwh)}`);
  if (point.pv_production_kwh != null)           fields.push(`pv_production_kwh=${round4(point.pv_production_kwh)}`);

  if (fields.length === 0) return '';

  const tsNano = toNanoTimestamp(point.time);
  return `${MEASUREMENT},${tags} ${fields.join(',')} ${tsNano}`;
}

// ── Readers ──────────────────────────────────────────────────────

/**
 * Read hourly energy telemetry for a date range.
 * Returns a Map of ISO hour key -> { gridPower, batteryPower, pvPower }.
 *
 * @param {string} siteId
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<Map<string, { gridPower: number, batteryPower: number, pvPower: number }>>}
 */
export async function readHourlyTelemetry(siteId, startDate, endDate) {
  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "grid_power_mean" or r._field == "pcs_power_mean" or r._field == "total_pv_power_mean")
      |> yield(name: "telemetry")
  `;

  const csv = await fluxQuery(query);
  return parseTelemetryCsv(csv);
}

/**
 * Read TGE RDN hourly prices for a date range.
 * Returns a Map of ISO hour key -> price in PLN/MWh.
 *
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<Map<string, number>>}
 */
export async function readTgePrices(startDate, endDate) {
  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "tge_rdn")
      |> filter(fn: (r) => r._field == "price_pln_mwh")
      |> yield(name: "tge")
  `;

  const csv = await fluxQuery(query);
  return parseSingleValueCsv(csv);
}

/**
 * Create an InfluxReader object for use by price-resolver.
 * Pre-fetches TGE prices for the entire date range.
 *
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<{ getTgePrice: (hour: Date) => number|null }>}
 */
export async function createInfluxReader(startDate, endDate) {
  let tgePriceMap = null;

  return {
    async getTgePrice(hour) {
      if (!tgePriceMap) {
        tgePriceMap = await readTgePrices(startDate, endDate);
      }
      const hourKey = hour.toISOString().slice(0, 13) + ':00:00.000Z';
      return tgePriceMap.get(hourKey) ?? null;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────

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

function parseTelemetryCsv(csv) {
  const result = new Map();
  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return result;

  let headers = null;
  for (const line of lines) {
    const cols = line.split(',');
    if (!headers) { headers = cols; continue; }
    if (cols.length < headers.length) continue;

    const timeIdx = headers.indexOf('_time');
    const valueIdx = headers.indexOf('_value');
    const fieldIdx = headers.indexOf('_field');

    const time = cols[timeIdx]?.trim();
    const value = parseFloat(cols[valueIdx]?.trim());
    const field = cols[fieldIdx]?.trim();
    if (!time || isNaN(value)) continue;

    const hourKey = new Date(time).toISOString().slice(0, 13) + ':00:00.000Z';
    if (!result.has(hourKey)) {
      result.set(hourKey, { gridPower: 0, batteryPower: 0, pvPower: 0 });
    }
    const entry = result.get(hourKey);
    if (field === 'grid_power_mean') entry.gridPower = value;
    else if (field === 'pcs_power_mean') entry.batteryPower = value;
    else if (field === 'total_pv_power_mean') entry.pvPower = value;
  }
  return result;
}

function parseSingleValueCsv(csv) {
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
