import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
const SCHEDULES_API = process.env.SCHEDULES_API || '';
const SCHEDULES_API_KEY = process.env.SCHEDULES_API_KEY || '';
const INFLUX_URL = process.env.INFLUX_URL || '';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || '';

async function fluxQuery(query) {
  const res = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: 'POST',
    headers: { Authorization: `Token ${INFLUX_TOKEN}`, 'Content-Type': 'application/vnd.flux', Accept: 'application/csv' },
    body: query,
  });
  if (!res.ok) throw new Error(`InfluxDB ${res.status}: ${await res.text()}`);
  return res.text();
}

function parseCsv(csv) {
  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = vals[i]?.trim(); });
    return obj;
  });
}

const handlers = {
  async get_site_config({ site_id }) {
    const { Item } = await ddb.send(new GetItemCommand({ TableName: SITE_CONFIG_TABLE, Key: marshall({ site_id }) }));
    return Item ? unmarshall(Item) : { site_id, _empty: true };
  },

  async get_current_schedules({ site_id }) {
    const res = await fetch(`${SCHEDULES_API}/schedules/${site_id}`, { headers: { 'x-api-key': SCHEDULES_API_KEY } });
    return res.json();
  },

  async send_schedule_rule({ site_id, priority, rule, rule_json }) {
    if (!rule && rule_json) rule = typeof rule_json === 'string' ? JSON.parse(rule_json) : rule_json;
    const key = `p_${priority}`;
    const current = await handlers.get_current_schedules({ site_id });
    const existing = current.sch?.[key] || [];
    const filtered = existing.filter(r => r.id !== rule.id);
    rule.s = 'ai';
    filtered.push(rule);
    const res = await fetch(`${SCHEDULES_API}/schedules/${site_id}`, {
      method: 'POST',
      headers: { 'x-api-key': SCHEDULES_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id, sch: { [key]: filtered } }),
    });
    return res.json();
  },

  async delete_schedule_rule({ site_id, priority, rule_id }) {
    const key = `p_${priority}`;
    const current = await handlers.get_current_schedules({ site_id });
    const existing = current.sch?.[key] || [];
    const filtered = existing.filter(r => r.id !== rule_id);
    const res = await fetch(`${SCHEDULES_API}/schedules/${site_id}`, {
      method: 'POST',
      headers: { 'x-api-key': SCHEDULES_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id, sch: { [key]: filtered } }),
    });
    return res.json();
  },

  async set_system_mode({ site_id, mode }) {
    const res = await fetch(`${SCHEDULES_API}/schedules/${site_id}`, {
      method: 'POST',
      headers: { 'x-api-key': SCHEDULES_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id, sch: {}, mode }),
    });
    return res.json();
  },

  async set_safety_limits({ site_id, soc_min, soc_max }) {
    const res = await fetch(`${SCHEDULES_API}/schedules/${site_id}`, {
      method: 'POST',
      headers: { 'x-api-key': SCHEDULES_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id, sch: {}, safety: { soc_min, soc_max } }),
    });
    return res.json();
  },

  async update_site_config({ site_id, config_json }) {
    const config = typeof config_json === 'string' ? JSON.parse(config_json) : config_json;
    const existing = await handlers.get_site_config({ site_id });
    const merged = deepMerge(existing._empty ? {} : existing, config);
    merged.site_id = site_id;
    const now = new Date().toISOString();
    merged.updated_at = now;
    if (!merged.created_at) merged.created_at = now;

    const names = {};
    const values = {};
    const parts = [];
    for (const [key, val] of Object.entries(merged)) {
      if (key === 'site_id') continue;
      names[`#${key}`] = key;
      values[`:${key}`] = val;
      parts.push(`#${key} = :${key}`);
    }
    await ddb.send(new UpdateItemCommand({
      TableName: SITE_CONFIG_TABLE,
      Key: marshall({ site_id }),
      UpdateExpression: `SET ${parts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
    }));
    return { success: true, site_id };
  },

  async get_battery_status({ site_id }) {
    const q = `from(bucket: "aiess_v1") |> range(start: -2m) |> filter(fn: (r) => r.site_id == "${site_id}" and r._measurement == "energy_telemetry") |> last() |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    if (rows.length === 0) return { error: 'No recent data' };
    const r = rows[rows.length - 1];
    return {
      soc: parseFloat(r.soc) || 0,
      battery_power_kw: parseFloat(r.pcs_power) || 0,
      grid_power_kw: parseFloat(r.grid_power) || 0,
      pv_power_kw: parseFloat(r.total_pv_power) || 0,
      load_kw: parseFloat(r.compensated_power) || 0,
      active_rule_id: r.active_rule_id || null,
      active_rule_action: r.active_rule_action || null,
      timestamp: r._time,
    };
  },

  async get_energy_summary({ site_id, hours = 24 }) {
    const bucket = hours <= 1 ? 'aiess_v1' : hours <= 24 ? 'aiess_v1_1m' : hours <= 168 ? 'aiess_v1_15m' : 'aiess_v1_1h';
    const q = `from(bucket: "${bucket}") |> range(start: -${hours}h) |> filter(fn: (r) => r.site_id == "${site_id}" and r._measurement == "energy_telemetry") |> filter(fn: (r) => r._field == "grid_power_mean" or r._field == "pcs_power_mean" or r._field == "soc_mean" or r._field == "total_pv_power_mean" or r._field == "compensated_power_mean") |> mean() |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") |> limit(n: 1)`;
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    return { period_hours: hours, data: rows };
  },

  async get_tge_price({ site_id }) {
    const q = `from(bucket: "tge_energy_prices") |> range(start: -2h) |> filter(fn: (r) => r._measurement == "energy_prices") |> last() |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    if (rows.length === 0) return { error: 'No TGE price data' };
    const r = rows[rows.length - 1];
    const pln_mwh = parseFloat(r.price_pln_mwh || r.fixing_i_price) || 0;
    return { price_pln_mwh: pln_mwh, price_pln_kwh: pln_mwh / 1000, timestamp: r._time };
  },

  async get_tge_price_history({ hours = 24 }) {
    const q = `from(bucket: "tge_energy_prices") |> range(start: -${hours}h) |> filter(fn: (r) => r._measurement == "energy_prices") |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") |> sort(columns: ["_time"])`;
    const csv = await fluxQuery(q);
    return { period_hours: hours, data: parseCsv(csv) };
  },

  async get_tge_prices({ site_id, hours }) {
    if (!hours || hours === 0) {
      return handlers.get_tge_price({ site_id });
    }
    const current = await handlers.get_tge_price({ site_id });
    const history = await handlers.get_tge_price_history({ hours });
    return { current_price: current, history: history.data, period_hours: hours };
  },

  async get_chart_data({ site_id, fields, hours = 24, chart_type = 'line', title }) {
    const fieldList = typeof fields === 'string' ? fields.split(',').map(f => f.trim()) : fields;
    const bucket = hours <= 1 ? 'aiess_v1' : hours <= 24 ? 'aiess_v1_1m' : hours <= 168 ? 'aiess_v1_15m' : 'aiess_v1_1h';
    const fieldFilter = fieldList.map(f => `r._field == "${f}_mean" or r._field == "${f}"`).join(' or ');
    const q = `from(bucket: "${bucket}") |> range(start: -${hours}h) |> filter(fn: (r) => r.site_id == "${site_id}" and r._measurement == "energy_telemetry") |> filter(fn: (r) => ${fieldFilter}) |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") |> sort(columns: ["_time"]) |> limit(n: 500)`;
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    const labels = rows.map(r => r._time);
    const colorMap = { grid_power: '#ef4444', pcs_power: '#3b82f6', soc: '#22c55e', total_pv_power: '#f59e0b', compensated_power: '#8b5cf6' };
    const datasets = fieldList.map(f => ({
      label: f.replace(/_/g, ' '),
      data: rows.map(r => parseFloat(r[`${f}_mean`] || r[f]) || 0),
      color: colorMap[f] || '#6b7280',
    }));
    return { _chart: true, chart_type, title: title || `${fieldList.join(', ')} (${hours}h)`, labels, datasets, point_count: rows.length, hours };
  },

  async get_rule_config_history({ site_id, hours = 24 }) {
    const q = `from(bucket: "aiess_v1_1m") |> range(start: -${hours}h) |> filter(fn: (r) => r.site_id == "${site_id}" and r._measurement == "rule_config") |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") |> sort(columns: ["_time"]) |> limit(n: 200)`;
    const csv = await fluxQuery(q);
    return { period_hours: hours, data: parseCsv(csv) };
  },

  async get_active_rule_history({ site_id, hours = 24 }) {
    const q = `from(bucket: "aiess_v1_1m") |> range(start: -${hours}h) |> filter(fn: (r) => r.site_id == "${site_id}" and r._measurement == "energy_telemetry") |> filter(fn: (r) => r._field == "active_rule_id" or r._field == "active_rule_action" or r._field == "active_rule_power") |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") |> sort(columns: ["_time"]) |> limit(n: 200)`;
    const csv = await fluxQuery(q);
    return { period_hours: hours, data: parseCsv(csv) };
  },

  async get_rule_history({ site_id, hours = 24, type = 'both' }) {
    const result = {};
    if (type === 'config' || type === 'both') {
      result.config_history = (await handlers.get_rule_config_history({ site_id, hours })).data;
    }
    if (type === 'active' || type === 'both') {
      result.active_history = (await handlers.get_active_rule_history({ site_id, hours })).data;
    }
    result.period_hours = hours;
    return result;
  },
};

const CONFIRMABLE = new Set(['send_schedule_rule', 'delete_schedule_rule', 'set_system_mode', 'set_safety_limits', 'update_site_config']);

export const handler = async (event) => {
  const agentAction = event.actionGroup;
  const apiPath = event.apiPath;
  const params = {};
  for (const p of (event.parameters || [])) { params[p.name] = p.value; }
  if (event.requestBody?.content?.['application/json']?.properties) {
    for (const p of event.requestBody.content['application/json'].properties) {
      try { params[p.name] = JSON.parse(p.value); } catch { params[p.name] = p.value; }
    }
  }

  const toolName = apiPath?.replace(/^\//, '').replace(/\//g, '_') || event.function || 'unknown';
  console.log(`[Agent Action] ${toolName}`, JSON.stringify(params));

  try {
    const fn = handlers[toolName];
    if (!fn) {
      return formatResponse(event, { error: `Unknown tool: ${toolName}` });
    }
    const result = await fn(params);
    return formatResponse(event, result);
  } catch (err) {
    console.error(`[Agent Action] Error in ${toolName}:`, err);
    return formatResponse(event, { error: err.message });
  }
};

function formatResponse(event, body) {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: 200,
      responseBody: {
        'application/json': {
          body: JSON.stringify(body),
        },
      },
    },
  };
}
