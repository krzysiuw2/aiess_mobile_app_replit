import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const GUARD_TABLE = process.env.GUARD_TABLE || 'export_guard_state';
const SUPLA_BASE = process.env.SUPLA_BASE_URL || '';
const SITE_ID = process.env.SITE_ID || 'domagala_1';
const INFLUX_URL = process.env.INFLUX_URL || 'https://eu-central-1-1.aws.cloud2.influxdata.com';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';

const CONFIG_KEY = `${SITE_ID}_config`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

async function getState() {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: GUARD_TABLE,
    Key: marshall({ guard_id: SITE_ID }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function getConfig() {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: GUARD_TABLE,
    Key: marshall({ guard_id: CONFIG_KEY }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function putConfig(updates) {
  const existing = await getConfig() || {};
  const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
  await ddb.send(new PutItemCommand({
    TableName: GUARD_TABLE,
    Item: marshall({ guard_id: CONFIG_KEY, ...merged }, { removeUndefinedValues: true }),
  }));
}

function parseInfluxCsv(csv) {
  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim(); });
    return obj;
  });
}

async function getGridPower() {
  if (!INFLUX_TOKEN) return null;
  try {
    const q = `from(bucket: "aiess_v1") |> range(start: -2m) |> filter(fn: (r) => r.site_id == "${SITE_ID}" and r._measurement == "energy_telemetry") |> filter(fn: (r) => r._field == "grid_power") |> last()`;
    const res = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
      method: 'POST',
      headers: { Authorization: `Token ${INFLUX_TOKEN}`, 'Content-Type': 'application/vnd.flux', Accept: 'application/csv' },
      body: q,
    });
    if (!res.ok) return null;
    const csv = await res.text();
    const rows = parseInfluxCsv(csv);
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i]._value != null ? parseFloat(rows[i]._value) : NaN;
      if (Number.isFinite(v)) return v;
    }
    return null;
  } catch {
    return null;
  }
}

async function getSuplaState() {
  if (!SUPLA_BASE) return null;
  try {
    const res = await fetch(`${SUPLA_BASE}/read`);
    return await res.json();
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (method === 'PATCH') {
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }
    const export_threshold = body.export_threshold != null ? parseFloat(body.export_threshold) : undefined;
    const restart_threshold = body.restart_threshold != null ? parseFloat(body.restart_threshold) : undefined;
    if (export_threshold != null && (isNaN(export_threshold) || export_threshold > 0)) {
      return json(400, { error: 'export_threshold must be negative (e.g. -40)' });
    }
    if (restart_threshold != null && (isNaN(restart_threshold) || restart_threshold > 0)) {
      return json(400, { error: 'restart_threshold must be negative (e.g. -20)' });
    }
    const updates = {};
    if (export_threshold != null) updates.export_threshold = export_threshold;
    if (restart_threshold != null) updates.restart_threshold = restart_threshold;
    if (Object.keys(updates).length === 0) {
      return json(400, { error: 'Provide export_threshold and/or restart_threshold' });
    }
    await putConfig(updates);
    const config = await getConfig();
    return json(200, { ok: true, config: { export_threshold: config?.export_threshold, restart_threshold: config?.restart_threshold } });
  }

  // GET
  const [state, config, gridPower, supla] = await Promise.all([getState(), getConfig(), getGridPower(), getSuplaState()]);

  const payload = {
    grid_power_kw: gridPower,
    inverter_on: supla?.on ?? (state?.inverter_off === true ? false : null),
    guard: state?.inverter_off
      ? { status: 'cooldown', shutdown_at: state.shutdown_at, next_check_at: state.next_check_at, last_grid_power: state.last_grid_power }
      : { status: 'monitoring' },
    config: {
      export_threshold: config?.export_threshold != null ? parseFloat(config.export_threshold) : -40,
      restart_threshold: config?.restart_threshold != null ? parseFloat(config.restart_threshold) : -20,
    },
    updated_at: state?.updated_at || config?.updated_at,
  };

  return json(200, payload);
};
