import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

const INFLUX_URL  = process.env.INFLUX_URL  || 'https://eu-central-1-1.aws.cloud2.influxdata.com';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG  = process.env.INFLUX_ORG  || 'aiess';
const GUARD_TABLE = process.env.GUARD_TABLE  || 'export_guard_state';
const SUPLA_BASE  = process.env.SUPLA_BASE_URL || '';
const SITE_ID     = process.env.SITE_ID      || 'domagala_1';

const COOLDOWN_MS       = parseInt(process.env.COOLDOWN_MINUTES || '30', 10) * 60_000;
const CHECK_INTERVAL_MS = 15_000;
const CHECKS_PER_INVOKE = 4;

const CONFIG_KEY = `${SITE_ID}_config`;

async function getConfig() {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: GUARD_TABLE,
    Key: marshall({ guard_id: CONFIG_KEY }),
  }));
  const c = Item ? unmarshall(Item) : null;
  return {
    export_threshold: c?.export_threshold != null ? parseFloat(c.export_threshold) : parseFloat(process.env.EXPORT_THRESHOLD || '-40'),
    restart_threshold: c?.restart_threshold != null ? parseFloat(c.restart_threshold) : parseFloat(process.env.RESTART_THRESHOLD || '-20'),
    daylight_start: c?.daylight_start != null ? parseInt(c.daylight_start, 10) : parseInt(process.env.DAYLIGHT_START || '7', 10),
    daylight_end: c?.daylight_end != null ? parseInt(c.daylight_end, 10) : parseInt(process.env.DAYLIGHT_END || '19', 10),
  };
}

// ── InfluxDB helpers (same pattern as bedrock-agent-action) ─────────

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

async function getGridPower() {
  const q = `from(bucket: "aiess_v1") |> range(start: -2m) |> filter(fn: (r) => r.site_id == "${SITE_ID}" and r._measurement == "energy_telemetry") |> filter(fn: (r) => r._field == "grid_power") |> last()`;
  const csv = await fluxQuery(q);
  const rows = parseCsv(csv);
  if (rows.length === 0) return null;
  return parseFloat(rows[rows.length - 1]._value);
}

// ── Supla helpers ───────────────────────────────────────────────────

async function suplaRead() {
  const res = await fetch(`${SUPLA_BASE}/read`);
  return res.json();
}

async function suplaTurnOn() {
  const res = await fetch(`${SUPLA_BASE}/turn-on`);
  return res.json();
}

async function suplaTurnOff() {
  const res = await fetch(`${SUPLA_BASE}/turn-off`);
  return res.json();
}

// ── DynamoDB state ──────────────────────────────────────────────────

async function getState() {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: GUARD_TABLE,
    Key: marshall({ guard_id: SITE_ID }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function putState(state) {
  await ddb.send(new PutItemCommand({
    TableName: GUARD_TABLE,
    Item: marshall({
      guard_id: SITE_ID,
      ...state,
      updated_at: new Date().toISOString(),
    }, { removeUndefinedValues: true }),
  }));
}

async function clearState() {
  await putState({ inverter_off: false });
}

// ── Daylight check ──────────────────────────────────────────────────

function isDaylight(conf) {
  const warsawHour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Warsaw' }).format(new Date()),
    10,
  );
  return warsawHour >= conf.daylight_start && warsawHour < conf.daylight_end;
}

// ── Core guard logic (single iteration) ─────────────────────────────

async function tick(iterNum, conf) {
  const now = new Date();
  const tag = `[ExportGuard][${iterNum}]`;

  if (!isDaylight(conf)) {
    const state = await getState();
    if (state?.inverter_off) {
      console.log(`${tag} Outside daylight – restoring inverter`);
      await suplaTurnOn();
      await clearState();
    } else {
      console.log(`${tag} Outside daylight – nothing to do`);
    }
    return 'night';
  }

  const state = await getState();

  if (state?.inverter_off) {
    const nextCheck = new Date(state.next_check_at);
    if (now < nextCheck) {
      const secsLeft = Math.round((nextCheck - now) / 1000);
      console.log(`${tag} Cooldown active – ${secsLeft}s remaining`);
      return 'cooldown';
    }

    const power = await getGridPower();
    if (power === null) {
      console.log(`${tag} No InfluxDB data – skipping`);
      return 'no-data';
    }
    console.log(`${tag} Cooldown expired – grid_power=${power} kW (restart threshold: ${conf.restart_threshold})`);

    if (power >= conf.restart_threshold) {
      console.log(`${tag} RESTART inverter`);
      await suplaTurnOn();
      await clearState();
      return 'restarted';
    }

    const newNext = new Date(now.getTime() + COOLDOWN_MS).toISOString();
    console.log(`${tag} Still heavy export – extending cooldown until ${newNext}`);
    await putState({
      inverter_off: true,
      shutdown_at: state.shutdown_at,
      next_check_at: newNext,
      last_grid_power: power,
    });
    return 'extended';
  }

  // Inverter is ON – monitor for excessive export
  const power = await getGridPower();
  if (power === null) {
    console.log(`${tag} No InfluxDB data – skipping`);
    return 'no-data';
  }
  console.log(`${tag} grid_power=${power} kW (shutdown threshold: ${conf.export_threshold})`);

  if (power < conf.export_threshold) {
    console.log(`${tag} SHUTDOWN inverter`);
    await suplaTurnOff();
    await putState({
      inverter_off: true,
      shutdown_at: now.toISOString(),
      next_check_at: new Date(now.getTime() + COOLDOWN_MS).toISOString(),
      last_grid_power: power,
    });
    return 'shutdown';
  }

  return 'ok';
}

// ── Lambda handler ──────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async () => {
  console.log('[ExportGuard] Invocation start');
  const conf = await getConfig();

  for (let i = 0; i < CHECKS_PER_INVOKE; i++) {
    try {
      const result = await tick(i + 1, conf);

      if (result === 'night') {
        console.log('[ExportGuard] Night mode – ending invocation early');
        return { status: 'night' };
      }
    } catch (err) {
      console.error(`[ExportGuard][${i + 1}] Error:`, err);
    }

    if (i < CHECKS_PER_INVOKE - 1) {
      await sleep(CHECK_INTERVAL_MS);
    }
  }

  console.log('[ExportGuard] Invocation complete');
  return { status: 'done' };
};
