import { DynamoDBClient, ScanCommand, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const ddb = new DynamoDBClient({});
const lambda = new LambdaClient({});
const bedrock = new BedrockRuntimeClient({});

const INFLUX_URL = process.env.INFLUX_URL || '';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';
const SCHEDULES_API = process.env.SCHEDULES_API || '';
const SCHEDULES_API_KEY = process.env.SCHEDULES_API_KEY || '';

const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';
const STATE_TABLE = process.env.AGENT_STATE_TABLE || 'aiess_agent_state';
const DECISIONS_TABLE = process.env.AGENT_DECISIONS_TABLE || 'aiess_agent_decisions';
const OPT_FUNCTION = process.env.OPTIMIZATION_FUNCTION || 'aiess-optimization-engine';

const BEDROCK_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';
const TTL_30_DAYS = 30 * 24 * 60 * 60;

const PV_THRESHOLD = 0.20;
const LOAD_THRESHOLD = 0.15;
const SOC_DRIFT_PP = 10;
const MINOR_PV_THRESHOLD = 0.05;
const MINOR_LOAD_THRESHOLD = 0.05;
const MINOR_SOC_DRIFT_PP = 3;

// ─── InfluxDB Helpers ───────────────────────────────────────────

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

async function fetchRecentTelemetry(siteId) {
  const q = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r.site_id == "${siteId}" and r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r._field == "grid_power" or r._field == "soc" or r._field == "pv_power" or r._field == "factory_load")
      |> last()
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;
  try {
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      grid_power_kw: parseFloat(r.grid_power) || 0,
      soc: parseFloat(r.soc) || 0,
      pv_power_kw: parseFloat(r.pv_power) || 0,
      load_kw: parseFloat(r.factory_load) || 0,
      timestamp: r._time,
    };
  } catch (err) {
    console.warn(`[Intraday] Telemetry fetch failed for ${siteId}:`, err.message);
    return null;
  }
}

async function fetchCurrentForecast(siteId) {
  const q = `
    from(bucket: "aiess_v1")
      |> range(start: -1h, stop: 1h)
      |> filter(fn: (r) => r.site_id == "${siteId}" and r._measurement == "energy_forecast")
      |> filter(fn: (r) => r._field == "pv_forecast_kw" or r._field == "load_forecast_kw")
      |> last()
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;
  try {
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      pv_forecast_kw: parseFloat(r.pv_forecast_kw) || 0,
      load_forecast_kw: parseFloat(r.load_forecast_kw) || 0,
    };
  } catch {
    return null;
  }
}

// ─── DynamoDB Helpers ───────────────────────────────────────────

async function scanEnabledSites() {
  const items = [];
  let lastKey;

  do {
    const { Items, LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: SITE_CONFIG_TABLE,
      FilterExpression: 'automation.enabled = :t',
      ExpressionAttributeValues: marshall({ ':t': true }),
      ExclusiveStartKey: lastKey,
    }));
    if (Items) items.push(...Items.map(unmarshall));
    lastKey = LastEvaluatedKey;
  } while (lastKey);

  return items;
}

async function getSiteConfig(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: SITE_CONFIG_TABLE,
    Key: marshall({ site_id: siteId }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function getAgentState(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: STATE_TABLE,
    Key: marshall({ site_id: siteId }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function updateLastRun(siteId, now) {
  await ddb.send(new UpdateItemCommand({
    TableName: STATE_TABLE,
    Key: marshall({ site_id: siteId }),
    UpdateExpression: 'SET last_intraday_run = :ts, updated_at = :ts',
    ExpressionAttributeValues: marshall({ ':ts': now.toISOString() }),
  }));
}

async function logDecision(siteId, now, action, deviations, gate, health) {
  const sk = `INTRADAY#${now.toISOString()}`;
  const ttl = Math.floor(now.getTime() / 1000) + TTL_30_DAYS;

  const item = {
    PK: `DECISION#${siteId}`,
    SK: sk,
    site_id: siteId,
    timestamp: now.toISOString(),
    agent_type: 'intraday',
    input_summary: {
      current_soc: deviations?.soc?.actual_pct ?? null,
      pv_actual_kw: deviations?.pv?.actual_kw ?? null,
      pv_forecast_kw: deviations?.pv?.forecast_kw ?? null,
      load_actual_kw: deviations?.load?.actual_kw ?? null,
      load_forecast_kw: deviations?.load?.forecast_kw ?? null,
    },
    reasoning: gate?.reasoning || action,
    rules_created: gate?.rules_created || [],
    rules_modified: gate?.rules_modified || [],
    rules_deleted: [],
    predicted_outcome: {},
    status: action === 'health_rollback' ? 'rolled_back' : 'applied',
    gate_action: action,
    health_status: health?.status || 'unknown',
    health_issues: health?.issues || [],
    deviations: deviations ? {
      pv_deviation_pct: deviations.pv?.deviation_pct,
      load_deviation_pct: deviations.load?.deviation_pct,
      soc_drift_pp: deviations.soc?.drift_pp,
    } : null,
    bedrock_used: gate?.bedrock_used || false,
    ttl,
  };

  await ddb.send(new PutItemCommand({
    TableName: DECISIONS_TABLE,
    Item: marshall(item, { removeUndefinedValues: true }),
  }));
}

// ─── Lambda Invoke ──────────────────────────────────────────────

async function invokeOptimizationEngine(siteId, siteConfig) {
  const payload = { site_id: siteId, site_config: siteConfig, mode: 'intraday' };

  const { Payload } = await lambda.send(new InvokeCommand({
    FunctionName: OPT_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  }));

  const result = JSON.parse(new TextDecoder().decode(Payload));
  if (result.errorMessage) throw new Error(`OptEngine error: ${result.errorMessage}`);
  return result;
}

// ─── Schedules API ──────────────────────────────────────────────

async function fetchSchedule(siteId) {
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    headers: { 'x-api-key': SCHEDULES_API_KEY },
  });
  if (!res.ok) throw new Error(`Schedules API GET ${res.status}`);
  return res.json();
}

async function saveScheduleP6(siteId, rules) {
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    method: 'POST',
    headers: { 'x-api-key': SCHEDULES_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ priorities: { p_6: rules } }),
  });
  if (!res.ok) throw new Error(`Schedules API POST ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Deviation Analysis ────────────────────────────────────────

function estimateExpectedSoc(state, siteConfig) {
  const trajectory = state?.soc_trajectory;
  if (!trajectory) return null;

  const currentHour = new Date().getHours();
  return trajectory[currentHour] ?? trajectory[String(currentHour)] ?? null;
}

function computeDeviations(telemetry, forecast, state, siteConfig) {
  if (!telemetry || !forecast) {
    return { pv: {}, load: {}, soc: {}, needs_llm: false, needs_adjustment: false, data_available: false };
  }

  const pvForecast = forecast.pv_forecast_kw;
  const loadForecast = forecast.load_forecast_kw;
  const pvActual = telemetry.pv_power_kw;
  const loadActual = telemetry.load_kw;
  const socActual = telemetry.soc;

  const pvDeviation = pvForecast > 1 ? Math.abs(pvActual - pvForecast) / pvForecast : 0;
  const loadDeviation = loadForecast > 1 ? Math.abs(loadActual - loadForecast) / loadForecast : 0;

  const expectedSoc = estimateExpectedSoc(state, siteConfig);
  const socDriftPp = expectedSoc !== null ? Math.abs(socActual - expectedSoc) : 0;

  return {
    pv: { actual_kw: round2(pvActual), forecast_kw: round2(pvForecast), deviation_pct: round2(pvDeviation) },
    load: { actual_kw: round2(loadActual), forecast_kw: round2(loadForecast), deviation_pct: round2(loadDeviation) },
    soc: { actual_pct: round1(socActual), expected_pct: expectedSoc, drift_pp: round1(socDriftPp) },
    needs_llm: pvDeviation > PV_THRESHOLD || loadDeviation > LOAD_THRESHOLD || socDriftPp > SOC_DRIFT_PP,
    needs_adjustment: pvDeviation > MINOR_PV_THRESHOLD || loadDeviation > MINOR_LOAD_THRESHOLD || socDriftPp > MINOR_SOC_DRIFT_PP,
    data_available: true,
  };
}

// ─── GATE Logic ─────────────────────────────────────────────────

async function evaluateGate(siteId, siteConfig, state, deviations, optimResult) {
  if (!deviations.data_available) {
    return { action: 'no_data', reasoning: 'Telemetry or forecast data unavailable' };
  }

  if (deviations.needs_llm) {
    console.log(`[Intraday] ${siteId}: Major deviation — PV ${fmtPct(deviations.pv.deviation_pct)}, Load ${fmtPct(deviations.load.deviation_pct)}, SoC drift ${deviations.soc.drift_pp}pp — invoking Bedrock`);
    return await replanWithBedrock(siteId, siteConfig, state, deviations, optimResult);
  }

  if (deviations.needs_adjustment) {
    console.log(`[Intraday] ${siteId}: Minor deviation — applying math adjustment`);
    return await adjustMathematically(siteId, siteConfig, deviations);
  }

  return { action: 'no_action', reasoning: 'All parameters within acceptable range' };
}

async function adjustMathematically(siteId, siteConfig, deviations) {
  try {
    const schedule = await fetchSchedule(siteId);
    const p6Rules = schedule.sch?.p_6 || [];
    const aiRules = p6Rules.filter(r => r.s === 'ai' && r.act !== false);

    if (aiRules.length === 0) {
      return { action: 'math_no_rules', reasoning: 'No active AI rules at P6 to adjust' };
    }

    const modified = [];
    const updatedRules = p6Rules.map(rule => {
      if (rule.s !== 'ai' || rule.act === false) return rule;

      const maxCharge = siteConfig.power_limits?.max_charge_kw || 50;
      const maxDischarge = siteConfig.power_limits?.max_discharge_kw || 50;
      let newPower = rule.a.pw || 0;

      if (rule.a.t === 'ch') {
        const pvSurplus = (deviations.pv.actual_kw || 0) - (deviations.pv.forecast_kw || 0);
        if (pvSurplus > 5) {
          newPower = Math.min(newPower + Math.round(pvSurplus * 0.5), maxCharge);
        } else if (pvSurplus < -5) {
          newPower = Math.max(newPower + Math.round(pvSurplus * 0.3), 0);
        }
      } else if (rule.a.t === 'dis') {
        const loadIncrease = (deviations.load.actual_kw || 0) - (deviations.load.forecast_kw || 0);
        if (loadIncrease > 5) {
          newPower = Math.min(newPower + Math.round(loadIncrease * 0.5), maxDischarge);
        } else if (loadIncrease < -5) {
          newPower = Math.max(newPower + Math.round(loadIncrease * 0.3), 0);
        }
      }

      if (newPower !== (rule.a.pw || 0)) {
        modified.push({ id: rule.id, change: `power ${rule.a.pw || 0} → ${newPower} kW` });
        return { ...rule, a: { ...rule.a, pw: newPower } };
      }
      return rule;
    });

    if (modified.length > 0) {
      await saveScheduleP6(siteId, updatedRules);
    }

    return {
      action: modified.length > 0 ? 'math_adjusted' : 'math_no_change',
      reasoning: modified.length > 0
        ? `Adjusted ${modified.length} rule(s): ${modified.map(m => m.change).join('; ')}`
        : 'Deviations present but no power changes warranted',
      rules_modified: modified,
    };
  } catch (err) {
    console.error(`[Intraday] Math adjustment error for ${siteId}:`, err);
    return { action: 'math_error', reasoning: `Adjustment failed: ${err.message}` };
  }
}

async function replanWithBedrock(siteId, siteConfig, state, deviations, optimResult) {
  const lessons = (state?.lessons || []).slice(-5).map(l => l.text).join('\n');
  const weeklyStrategy = state?.weekly_plan?.strategy || 'none';

  const lang = siteConfig.ai_profile?.preferred_language || siteConfig.general?.language || 'pl';
  const language = lang === 'pl' ? 'Polish' : 'English';
  const backupReserve = siteConfig.ai_profile?.backup_reserve_percent ?? 0;

  const lpProfile = optimResult?.load_pv_profile;
  let loadPvContext = '';
  if (lpProfile?.data_available) {
    loadPvContext = `
LOAD vs PV (current data):
- PV actual peak: ${lpProfile.pv_actual_peak_kw} kW, Load peak: ${lpProfile.load_peak_kw} kW, Load avg: ${lpProfile.load_avg_kw} kW
- Net surplus hours: ${lpProfile.surplus_hours_count}
${lpProfile.surplus_hours_count <= 3 ? '⚠️ Very limited PV surplus — factory consumes most PV.' : ''}`;
  }

  const prompt = `You are an intraday energy storage optimization agent for site ${siteId} in Poland.

LANGUAGE: Write reasoning in ${language}. Use "autokonsumpcja", "moc zamówiona", "taryfa dystrybucyjna" terminology.

SITE CONFIG:
- Battery: ${siteConfig.battery?.capacity_kwh || '?'} kWh, charge max ${siteConfig.power_limits?.max_charge_kw || '?'} kW, discharge max ${siteConfig.power_limits?.max_discharge_kw || '?'} kW
- Grid capacity: ${siteConfig.grid_connection?.capacity_kva || '?'} kVA, export allowed: ${siteConfig.grid_connection?.export_allowed ?? true}
- PV peak: ${siteConfig.pv_system?.total_peak_kw || 0} kW
- Price model: ${siteConfig.financial?.energy_price_model || 'unknown'}
${backupReserve > 0 ? `- Backup reserve: ${backupReserve}% (never discharge below)` : ''}
${loadPvContext}

BATTERY HEALTH: If no charging opportunity is expected (cloudy, no PV), maintain standby SoC 20-40%. But if it's a weekend/holiday with PV and low load, charge to 100% — that's free energy.
WEEKEND LOGIC: If factory is closed, nearly all PV is surplus. Charge aggressively from PV to 100% SoC.

CURRENT DEVIATIONS:
- PV: actual ${deviations.pv.actual_kw} kW vs forecast ${deviations.pv.forecast_kw} kW (${fmtPct(deviations.pv.deviation_pct)} off)
- Load: actual ${deviations.load.actual_kw} kW vs forecast ${deviations.load.forecast_kw} kW (${fmtPct(deviations.load.deviation_pct)} off)
- SoC: actual ${deviations.soc.actual_pct}% vs expected ${deviations.soc.expected_pct ?? '?'}% (drift ${deviations.soc.drift_pp}pp)

WEEKLY STRATEGY: ${weeklyStrategy}
RECENT LESSONS: ${lessons || 'none'}

OPTIMIZATION ENGINE (12h lookahead) suggests:
- Charge windows: ${JSON.stringify(optimResult?.charge_windows || [])}
- Discharge windows: ${JSON.stringify(optimResult?.discharge_windows || [])}
- Peak shaving needed: ${optimResult?.peak_shaving_needed || false}

Respond ONLY with a JSON object:
{
  "reasoning": "1-2 sentence explanation in ${language}",
  "rules": [
    {
      "id": "intraday_adj_<n>",
      "s": "ai",
      "act": true,
      "a": { "t": "ch|dis|sb", "pw": <number_kw> },
      "c": { "ts": <start_seconds_since_midnight>, "te": <end_seconds_since_midnight>, "sm": <soc_min>, "sx": <soc_max> }
    }
  ]
}
Rules are applied at P6 priority. Keep it minimal — only the adjustments needed for the next few hours.`;

  try {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      body: new TextEncoder().encode(body),
      contentType: 'application/json',
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    const text = result.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: 'llm_parse_fail', reasoning: text.substring(0, 300), bedrock_used: true };
    }

    const plan = JSON.parse(jsonMatch[0]);

    if (plan.rules?.length > 0) {
      const schedule = await fetchSchedule(siteId);
      const existingP6 = (schedule.sch?.p_6 || []).filter(r => !r.id?.startsWith('intraday_adj_'));
      const merged = [...existingP6, ...plan.rules];
      await saveScheduleP6(siteId, merged);
    }

    return {
      action: 'llm_replanned',
      reasoning: plan.reasoning || 'Bedrock re-planning applied',
      rules_created: plan.rules || [],
      rules_modified: [],
      bedrock_used: true,
    };
  } catch (err) {
    console.error(`[Intraday] Bedrock error for ${siteId}:`, err);
    return { action: 'llm_error', reasoning: `Bedrock invocation failed: ${err.message}`, bedrock_used: true };
  }
}

// ─── Health Check ───────────────────────────────────────────────

function assessHealth(telemetry, siteConfig) {
  if (!telemetry) return { status: 'no_telemetry', critical: false, issues: [] };

  const issues = [];
  const gridCapacity = siteConfig.grid_connection?.capacity_kva;
  const socMin = siteConfig.safety?.soc_min ?? 5;
  const exportAllowed = siteConfig.grid_connection?.export_allowed ?? true;

  if (gridCapacity && telemetry.grid_power_kw > gridCapacity) {
    issues.push({
      type: 'CRITICAL',
      code: 'GRID_OVERLOAD',
      message: `Grid import ${telemetry.grid_power_kw.toFixed(1)} kW exceeds capacity ${gridCapacity} kVA`,
    });
  }

  if (telemetry.soc < socMin) {
    issues.push({
      type: 'CRITICAL',
      code: 'SOC_BELOW_MIN',
      message: `SoC ${telemetry.soc.toFixed(1)}% below safety minimum ${socMin}%`,
    });
  }

  if (!exportAllowed && telemetry.grid_power_kw < -1) {
    issues.push({
      type: 'CRITICAL',
      code: 'UNAUTHORIZED_EXPORT',
      message: `Grid export ${Math.abs(telemetry.grid_power_kw).toFixed(1)} kW detected but export_allowed=false`,
    });
  }

  const critical = issues.some(i => i.type === 'CRITICAL');
  return { status: critical ? 'critical' : 'healthy', critical, issues };
}

async function rollbackSchedule(siteId, state) {
  const snapshot = state?.schedule_snapshot;
  if (!snapshot?.sch?.p_6) {
    console.warn(`[Intraday] ${siteId}: No schedule snapshot for rollback — clearing AI rules at P6`);
    try {
      const current = await fetchSchedule(siteId);
      const manualOnly = (current.sch?.p_6 || []).filter(r => r.s !== 'ai');
      await saveScheduleP6(siteId, manualOnly);
    } catch (err) {
      console.error(`[Intraday] ${siteId}: Failed to clear AI rules:`, err);
    }
    return;
  }

  try {
    await saveScheduleP6(siteId, snapshot.sch.p_6);
    console.log(`[Intraday] ${siteId}: Rolled back to schedule snapshot`);
  } catch (err) {
    console.error(`[Intraday] ${siteId}: Rollback failed:`, err);
  }
}

// ─── Utility ────────────────────────────────────────────────────

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function fmtPct(dec) { return `${Math.round(dec * 100)}%`; }

// ─── Main Handler ───────────────────────────────────────────────

async function processSite(siteConfig, now, manualTrigger) {
  const siteId = siteConfig.site_id;

  const state = await getAgentState(siteId);

  if (!manualTrigger) {
    const isRdn = siteConfig.financial?.energy_price_model === 'tge_rdn';
    const intervalMin = siteConfig.automation?.intraday_interval_min || (isRdn ? 15 : 60);
    const lastRun = state?.last_intraday_run;
    if (lastRun) {
      const elapsedMs = now.getTime() - new Date(lastRun).getTime();
      if (elapsedMs < intervalMin * 60_000) {
        return { site_id: siteId, skipped: true, reason: 'interval_not_elapsed' };
      }
    }
  }

  const [telemetry, forecast] = await Promise.all([
    fetchRecentTelemetry(siteId),
    fetchCurrentForecast(siteId),
  ]);

  const optimResult = await invokeOptimizationEngine(siteId, siteConfig);

  const deviations = computeDeviations(telemetry, forecast, state, siteConfig);

  const gate = await evaluateGate(siteId, siteConfig, state, deviations, optimResult);

  const health = assessHealth(telemetry, siteConfig);
  if (health.critical) {
    console.warn(`[Intraday] ${siteId}: CRITICAL health — ${health.issues.map(i => i.code).join(', ')} — rolling back`);
    await rollbackSchedule(siteId, state);
    await logDecision(siteId, now, 'health_rollback', deviations, { action: 'health_rollback', reasoning: health.issues.map(i => i.message).join('; ') }, health);
    await updateLastRun(siteId, now);
    return { site_id: siteId, action: 'health_rollback', health };
  }

  await logDecision(siteId, now, gate.action, deviations, gate, health);
  await updateLastRun(siteId, now);

  return {
    site_id: siteId,
    action: gate.action,
    deviations: deviations.data_available ? {
      pv_pct: deviations.pv.deviation_pct,
      load_pct: deviations.load.deviation_pct,
      soc_drift_pp: deviations.soc.drift_pp,
    } : null,
    health: health.status,
    bedrock_used: gate.bedrock_used || false,
  };
}

export const handler = async (event) => {
  const now = new Date();
  console.log(`[Intraday] Run at ${now.toISOString()}`);

  if (event.site_id) {
    const siteConfig = await getSiteConfig(event.site_id);
    if (!siteConfig) return { error: `Site ${event.site_id} not found` };

    const mode = siteConfig.automation?.mode || 'manual';
    if (mode === 'manual') {
      console.log(`[Intraday] Skipping ${event.site_id} — mode is manual`);
      return { timestamp: now.toISOString(), processed: 0, skipped: 1, reason: 'manual_mode' };
    }

    const result = await processSite(siteConfig, now, !!event.manual_trigger);
    return { timestamp: now.toISOString(), processed: result.skipped ? 0 : 1, results: [result] };
  }

  const sites = await scanEnabledSites();
  console.log(`[Intraday] Found ${sites.length} enabled sites`);

  const results = [];
  for (const site of sites) {
    try {
      results.push(await processSite(site, now, false));
    } catch (err) {
      console.error(`[Intraday] Error processing ${site.site_id}:`, err);
      results.push({ site_id: site.site_id, error: err.message });
    }
  }

  const processed = results.filter(r => !r.skipped && !r.error).length;
  const skipped = results.filter(r => r.skipped).length;
  const errors = results.filter(r => r.error).length;
  const bedrockCalls = results.filter(r => r.bedrock_used).length;

  console.log(`[Intraday] Done: ${processed} processed, ${skipped} skipped, ${errors} errors, ${bedrockCalls} Bedrock calls`);

  return { timestamp: now.toISOString(), processed, skipped, errors, bedrock_calls: bedrockCalls, results };
};
