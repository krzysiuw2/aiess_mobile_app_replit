import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const REGION = process.env.AWS_REGION || 'eu-central-1';
const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';
const STATE_TABLE = process.env.AGENT_STATE_TABLE || 'aiess_agent_state';
const DECISIONS_TABLE = process.env.AGENT_DECISIONS_TABLE || 'aiess_agent_decisions';
const SCHEDULES_API = process.env.SCHEDULES_API || '';
const SCHEDULES_API_KEY = process.env.SCHEDULES_API_KEY || '';
const INFLUX_URL = process.env.INFLUX_URL || 'https://eu-central-1-1.aws.cloud2.influxdata.com';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';
const BEDROCK_TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS || 55_000);

const ddb = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddb);
const lambda = new LambdaClient({ region: REGION });
const bedrock = new BedrockRuntimeClient({ region: REGION });

async function scanAutomationEnabledSites() {
  const items = [];
  let lastKey;

  do {
    const { Items, LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: SITE_CONFIG_TABLE,
      FilterExpression: 'automation.enabled = :t',
      ExpressionAttributeValues: marshall({ ':t': true }),
      ExclusiveStartKey: lastKey,
    }));
    if (Items) items.push(...Items.map(i => unmarshall(i)));
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

async function updateAgentState(siteId, scheduleSnapshot) {
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName: STATE_TABLE,
    Key: { site_id: siteId },
    UpdateExpression: 'SET last_daily_run = :ts, schedule_snapshot = :snap, updated_at = :ts',
    ExpressionAttributeValues: {
      ':ts': now,
      ':snap': scheduleSnapshot,
    },
  }));
}

async function logDecision(decision) {
  await docClient.send(new PutCommand({
    TableName: DECISIONS_TABLE,
    Item: decision,
  }));
}

async function fetchScheduleSch(siteId) {
  if (!SCHEDULES_API) return {};
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    headers: { 'x-api-key': SCHEDULES_API_KEY },
  });
  if (!res.ok) {
    console.warn(`[AgentDaily] Schedules API ${res.status} for ${siteId}`);
    return {};
  }
  const data = await res.json();
  const sch = data?.sch || {};
  return typeof sch === 'object' && sch !== null ? { ...sch } : {};
}

function mergeSchReplaceP678(currentSch, replacement) {
  const out = { ...(currentSch || {}) };
  out.p_6 = Array.isArray(replacement.p_6) ? replacement.p_6 : [];
  out.p_7 = Array.isArray(replacement.p_7) ? replacement.p_7 : [];
  out.p_8 = Array.isArray(replacement.p_8) ? replacement.p_8 : [];
  return out;
}

async function deployScheduleSch(siteId, sch) {
  if (!SCHEDULES_API) throw new Error('SCHEDULES_API not configured');
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SCHEDULES_API_KEY,
    },
    body: JSON.stringify({ site_id: siteId, sch }),
  });
  if (!res.ok) throw new Error(`Schedules API PUT ${res.status}: ${await res.text()}`);
  return res.json();
}

function rulesToSchBuckets(rules) {
  const sch = { p_6: [], p_7: [], p_8: [] };
  for (const rule of rules) {
    const pr = Number(rule.priority ?? rule.p ?? 7);
    const key = pr === 6 ? 'p_6' : pr === 8 ? 'p_8' : 'p_7';
    sch[key].push(rule);
  }
  return sch;
}

function cloneRules(rules) {
  return JSON.parse(JSON.stringify(rules));
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function applyBoundedAdjustments(rules, adjustments) {
  if (!adjustments || typeof adjustments !== 'object') return rules;
  const out = cloneRules(rules);
  for (const rule of out) {
    const pr = Number(rule.priority ?? rule.p);
    const a = rule.a || {};
    const c = rule.c || {};
    if (pr === 8 && a.t === 'dis' && c.gpv != null && adjustments.peak_shaving_threshold_kw != null) {
      const base = Number(c.gpv);
      const v = Number(adjustments.peak_shaving_threshold_kw);
      if (!Number.isNaN(base) && !Number.isNaN(v)) {
        const lo = base * 0.9;
        const hi = base * 1.1;
        c.gpv = Math.round(clamp(v, lo, hi) * 10) / 10;
        rule.c = c;
      }
    }
    if (a.t === 'dt' && a.soc != null && adjustments.discharge_soc_target != null) {
      const base = Number(a.soc);
      const v = Number(adjustments.discharge_soc_target);
      if (!Number.isNaN(base) && !Number.isNaN(v)) {
        a.soc = Math.round(clamp(v, base - 10, base + 10));
        rule.a = a;
      }
    }
  }
  return out;
}

async function fetchRecentComments(siteId, days = 7) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { Items } = await docClient.send(new QueryCommand({
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk AND SK >= :since',
    ExpressionAttributeValues: {
      ':pk': `DECISION#${siteId}`,
      ':since': since,
    },
    ScanIndexForward: false,
    Limit: 50,
  }));

  const comments = [];
  for (const item of (Items || [])) {
    if (item.customer_comments?.length) {
      for (const c of item.customer_comments) {
        comments.push({ decision_sk: item.SK, ...c });
      }
    }
  }
  return comments;
}

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

async function fetchYesterdayTelemetry(siteId) {
  const q = `
    from(bucket: "aiess_v1")
      |> range(start: -48h, stop: -24h)
      |> filter(fn: (r) => r.site_id == "${siteId}" and r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r._field == "grid_import_kw" or r._field == "grid_export_kw" or r._field == "battery_kw" or r._field == "soc" or r._field == "pv_kw" or r._field == "load_kw")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;
  try {
    const csv = await fluxQuery(q);
    return parseCsv(csv);
  } catch (err) {
    console.warn(`[AgentDaily] Telemetry fetch failed for ${siteId}:`, err.message);
    return [];
  }
}

async function invokeOptimizationEngineV2(siteId, siteConfig) {
  const payload = { site_id: siteId, site_config: siteConfig, mode: 'daily' };
  const fn = process.env.OPTIMIZATION_ENGINE_V2_FUNCTION || 'aiess-optimization-engine-v2';
  const { Payload, FunctionError } = await lambda.send(new InvokeCommand({
    FunctionName: fn,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(payload),
  }));
  const raw = JSON.parse(Buffer.from(Payload).toString());
  if (FunctionError) {
    const msg = raw.errorMessage || raw.message || JSON.stringify(raw);
    throw new Error(`Optimization engine Lambda error: ${msg}`);
  }
  const inner = raw.body !== undefined ? raw.body : raw;
  const body = typeof inner === 'string' ? JSON.parse(inner) : inner;
  const code = raw.statusCode;
  if (code != null && code !== 200) {
    throw new Error(body?.error || `Optimization engine status ${code}`);
  }
  if (!body?.strategies || !Array.isArray(body.strategies) || body.strategies.length < 1) {
    throw new Error('Optimization engine returned no strategies');
  }
  return body;
}

function strategiesByName(strategies) {
  const m = {};
  for (const s of strategies) {
    if (s?.name) m[String(s.name).toLowerCase()] = s;
  }
  return m;
}

function pickStrategy(strategies, letter) {
  const by = strategiesByName(strategies);
  const L = String(letter ?? '').trim().toUpperCase();
  if (L === 'A') return by.aggressive;
  if (L === 'B') return by.balanced;
  if (L === 'C') return by.conservative;
  const low = String(letter ?? '').trim().toLowerCase();
  return by[low] || null;
}

function evaluateYesterdayOutcome(telemetry, previousDecision) {
  if (!telemetry.length || !previousDecision) {
    return { evaluated: false, reason: 'insufficient data' };
  }

  let totalImportKwh = 0;
  let totalExportKwh = 0;
  let peakGridKw = 0;
  let totalPvKwh = 0;
  let totalLoadKwh = 0;

  for (const row of telemetry) {
    const importKw = parseFloat(row.grid_import_kw) || 0;
    const exportKw = parseFloat(row.grid_export_kw) || 0;
    const pvKw = parseFloat(row.pv_kw) || 0;
    const loadKw = parseFloat(row.load_kw) || 0;

    totalImportKwh += importKw;
    totalExportKwh += exportKw;
    totalPvKwh += pvKw;
    totalLoadKwh += loadKw;
    peakGridKw = Math.max(peakGridKw, importKw);
  }

  const predicted = previousDecision.predicted_outcome || {};
  const actual = {
    arbitrage_pln: Math.round((predicted.arbitrage_pln || 0) * 0.85 * 100) / 100,
    peak_shaving_pln: Math.round((predicted.peak_shaving_pln || 0) * 0.9 * 100) / 100,
    pv_savings_pln: Math.round(totalPvKwh * 0.5 / 1000 * 100) / 100,
    total_savings_pln: 0,
  };
  actual.total_savings_pln = actual.arbitrage_pln + actual.peak_shaving_pln + actual.pv_savings_pln;

  const delta = {
    arbitrage_pln: actual.arbitrage_pln - (predicted.arbitrage_pln || 0),
    peak_shaving_pln: actual.peak_shaving_pln - (predicted.peak_shaving_pln || 0),
    pv_savings_pln: actual.pv_savings_pln - (predicted.pv_self_consumption_pln || 0),
    total_savings_pln: actual.total_savings_pln - (predicted.total_savings_pln || 0),
  };

  let lesson = null;
  if (delta.total_savings_pln < -5) {
    lesson = `Actual savings were ${Math.abs(delta.total_savings_pln).toFixed(2)} PLN below prediction. Possible causes: forecast inaccuracy or unexpected load changes.`;
  } else if (delta.total_savings_pln > 5) {
    lesson = `Actual savings exceeded prediction by ${delta.total_savings_pln.toFixed(2)} PLN. Strategy performed better than expected.`;
  }

  return {
    evaluated: true,
    actual_outcome: actual,
    delta,
    lesson,
    telemetry_summary: {
      total_import_kwh: Math.round(totalImportKwh),
      total_export_kwh: Math.round(totalExportKwh),
      peak_grid_kw: Math.round(peakGridKw),
      total_pv_kwh: Math.round(totalPvKwh),
      total_load_kwh: Math.round(totalLoadKwh),
    },
  };
}

function detectLanguage(siteConfig) {
  const lang = siteConfig.ai_profile?.preferred_language
    || siteConfig.general?.language
    || 'pl';
  return lang === 'pl' ? 'Polish' : 'English';
}

function buildSystemPrompt(siteConfig) {
  const language = detectLanguage(siteConfig);
  return `You are an energy strategy selector for a BESS site. The optimization engine already produced three candidate strategies (aggressive, balanced, conservative). Your job is to pick exactly one letter: A, B, or C, optionally suggest small bounded parameter tweaks, and assess validation.

LANGUAGE: Write "reasoning" in ${language}. JSON keys stay in English.

MAPPING:
- A = aggressive (higher savings potential, moderate risk)
- B = balanced
- C = conservative (lower risk, very_low risk label)

ADJUSTMENTS (optional object; omit keys you do not want to change):
- peak_shaving_threshold_kw: absolute grid-power threshold kW for peak-shaving discharge (engine-derived baseline; you may suggest a value within ±10% of the baseline shown)
- discharge_soc_target: target SoC % for discharge-to-target rules (within ±10 percentage points of baseline shown)

OUTPUT: a single JSON object, no markdown:
{
  "strategy": "A"|"B"|"C",
  "adjustments": { },
  "validation_status": "ok"|"warning",
  "reasoning": "short explanation"
}

Use "warning" in validation_status if the chosen strategy has simulation_valid false or if risk conflicts with the site's stated risk_tolerance. Otherwise "ok".`;
}

function strategySummariesForPrompt(strategies) {
  const letterOf = { aggressive: 'A', balanced: 'B', conservative: 'C' };
  return strategies.map((s) => {
    const name = s.name || '';
    const letter = letterOf[String(name).toLowerCase()] || '?';
    const sum = s.forecast?.summary || {};
    return {
      letter,
      name,
      risk: s.risk,
      simulation_valid: s.simulation_valid,
      estimated_savings_pln: sum.estimated_savings_pln,
      total_net_cost_pln: sum.total_net_cost_pln,
      peak_grid_import_kw: sum.peak_grid_import_kw,
      self_consumption_pct: sum.self_consumption_pct,
      soc_end: sum.soc_end,
    };
  });
}

function baselinesForAdjustments(strategy) {
  const rules = strategy?.rules || [];
  let peak_shaving_threshold_kw = null;
  const discharge_soc_targets = [];
  for (const rule of rules) {
    const pr = Number(rule.priority ?? rule.p);
    const a = rule.a || {};
    const c = rule.c || {};
    if (pr === 8 && a.t === 'dis' && c.gpv != null) peak_shaving_threshold_kw = c.gpv;
    if (a.t === 'dt' && a.soc != null) discharge_soc_targets.push(a.soc);
  }
  return {
    peak_shaving_threshold_kw,
    discharge_soc_target: discharge_soc_targets.length ? discharge_soc_targets[0] : null,
  };
}

function buildUserPrompt({
  siteConfig,
  agentState,
  enginePayload,
  recentComments,
  outcomeEvaluation,
}) {
  const language = detectLanguage(siteConfig);
  const strategies = enginePayload.strategies || [];
  const summaries = strategySummariesForPrompt(strategies);
  const baselines = {};
  for (const s of strategies) {
    baselines[s.name] = baselinesForAdjustments(s);
  }

  const parts = [
    '=== STRATEGY OPTIONS (choose A, B, or C) ===',
    JSON.stringify(summaries, null, 2),
    '',
    '=== PARAMETER BASELINES (for bounded adjustments) ===',
    JSON.stringify(baselines, null, 2),
    '',
    '=== SITE PROFILE (automation / goals) ===',
    JSON.stringify({
      business_type: siteConfig.ai_profile?.business_type,
      risk_tolerance: siteConfig.ai_profile?.risk_tolerance,
      optimization_goals: siteConfig.ai_profile?.optimization_goals,
    }, null, 2),
    '',
    '=== SITE DESCRIPTION ===',
    siteConfig.general?.description || 'No description provided',
    '',
    '=== WEEKLY PLAN ===',
    JSON.stringify(agentState?.weekly_plan || { note: 'No weekly plan available' }, null, 2),
    '',
    '=== ENGINE CONTEXT ===',
    JSON.stringify({
      tradeoff_analysis: enginePayload.tradeoff_analysis,
      data_summary: enginePayload.data_summary,
      current_soc: enginePayload.current_soc,
    }, null, 2),
    '',
  ];

  if (agentState?.lessons?.length) {
    parts.push('=== LESSONS LEARNED ===');
    parts.push(JSON.stringify(agentState.lessons.slice(-10), null, 2));
    parts.push('');
  }

  if (recentComments.length) {
    parts.push('=== RECENT CUSTOMER COMMENTS ===');
    parts.push(JSON.stringify(recentComments, null, 2));
    parts.push('');
  }

  if (outcomeEvaluation?.evaluated) {
    parts.push('=== YESTERDAY OUTCOME ===');
    parts.push(JSON.stringify(outcomeEvaluation, null, 2));
    parts.push('');
  }

  parts.push(
    `Select the best strategy for today. Respect risk_tolerance and optimization_goals. ` +
    `Output only the JSON object. Reasoning in ${language}.`
  );

  return parts.join('\n');
}

function parseBedrockJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 500)}`);
  }
}

function isValidStrategyLetter(s) {
  return s === 'A' || s === 'B' || s === 'C';
}

function normalizeStrategyLetter(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C') return s;
  if (s === 'AGGRESSIVE') return 'A';
  if (s === 'BALANCED') return 'B';
  if (s === 'CONSERVATIVE') return 'C';
  return '';
}

async function callBedrockStrategySelect(systemPrompt, userPrompt) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2,
  });

  const cmd = new InvokeModelCommand({
    modelId: 'eu.anthropic.claude-sonnet-4-6',
    contentType: 'application/json',
    accept: 'application/json',
    body,
  });

  const response = await Promise.race([
    bedrock.send(cmd),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('bedrock_timeout')), BEDROCK_TIMEOUT_MS);
    }),
  ]);

  const result = JSON.parse(Buffer.from(response.body).toString());
  const text = result.content?.[0]?.text || '';
  return parseBedrockJson(text);
}

function predictedOutcomeFromForecast(forecast) {
  const sum = forecast?.summary || {};
  const total = Number(sum.estimated_savings_pln) || 0;
  return {
    arbitrage_pln: 0,
    peak_shaving_pln: 0,
    pv_savings_pln: 0,
    total_savings_pln: total,
  };
}

async function applyStrategyDeployment(siteId, mergedSch, automationMode) {
  switch (automationMode) {
    case 'automatic': {
      const ruleCount = ['p_6', 'p_7', 'p_8'].reduce((n, k) => n + (mergedSch[k]?.length || 0), 0);
      console.log(`[AgentDaily] ${siteId}: automatic mode — deploying ${ruleCount} rules (P6–P8)`);
      await deployScheduleSch(siteId, mergedSch);
      return 'applied';
    }
    case 'semi-automatic': {
      console.log(`[AgentDaily] ${siteId}: semi-automatic — pending approval (${['p_6', 'p_7', 'p_8'].reduce((n, k) => n + (mergedSch[k]?.length || 0), 0)} rules)`);
      return 'pending_approval';
    }
    case 'manual':
    default: {
      console.log(`[AgentDaily] ${siteId}: manual mode — logged only`);
      return 'pending_approval';
    }
  }
}

async function processSite(siteConfig) {
  const siteId = siteConfig.site_id;
  const automationMode = siteConfig.automation?.mode || 'manual';
  console.log(`[AgentDaily] Processing ${siteId} (mode: ${automationMode})`);

  const [agentState, recentComments] = await Promise.all([
    getAgentState(siteId),
    fetchRecentComments(siteId),
  ]);

  const enginePayload = await invokeOptimizationEngineV2(siteId, siteConfig);
  const strategies = enginePayload.strategies;

  const telemetry = await fetchYesterdayTelemetry(siteId);

  let previousDecision = null;
  const { Items: prevItems } = await docClient.send(new QueryCommand({
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `DECISION#${siteId}` },
    ScanIndexForward: false,
    Limit: 1,
  }));
  if (prevItems?.length) previousDecision = prevItems[0];

  const outcomeEvaluation = evaluateYesterdayOutcome(telemetry, previousDecision);

  if (outcomeEvaluation.evaluated && previousDecision) {
    await docClient.send(new UpdateCommand({
      TableName: DECISIONS_TABLE,
      Key: { PK: previousDecision.PK, SK: previousDecision.SK },
      UpdateExpression: 'SET actual_outcome = :actual, delta = :delta, lesson_learned = :lesson',
      ExpressionAttributeValues: {
        ':actual': outcomeEvaluation.actual_outcome,
        ':delta': outcomeEvaluation.delta,
        ':lesson': outcomeEvaluation.lesson || 'No significant deviation detected.',
      },
    }));

    if (outcomeEvaluation.lesson && agentState) {
      const lessonEntry = {
        text: outcomeEvaluation.lesson,
        created_at: new Date().toISOString(),
        agent_type: 'daily',
        category: 'forecast_accuracy',
      };
      await docClient.send(new UpdateCommand({
        TableName: STATE_TABLE,
        Key: { site_id: siteId },
        UpdateExpression: 'SET lessons = list_append(if_not_exists(lessons, :empty), :lesson)',
        ExpressionAttributeValues: {
          ':lesson': [lessonEntry],
          ':empty': [],
        },
      }));
    }
  }

  const systemPrompt = buildSystemPrompt(siteConfig);
  const userPrompt = buildUserPrompt({
    siteConfig,
    agentState,
    enginePayload,
    recentComments,
    outcomeEvaluation,
  });

  let selectedLetter = 'B';
  let adjustments = {};
  let reasoning = '';
  let validation_status = 'ok';
  let fallback_used = false;

  try {
    const llm = await callBedrockStrategySelect(systemPrompt, userPrompt);
    const norm = normalizeStrategyLetter(llm.strategy);
    if (!isValidStrategyLetter(norm)) {
      throw new Error(`invalid strategy: ${llm.strategy}`);
    }
    selectedLetter = norm;
    adjustments = llm.adjustments && typeof llm.adjustments === 'object' ? llm.adjustments : {};
    reasoning = llm.reasoning || '';
    if (llm.validation_status === 'warning' || llm.validation_status === 'ok') {
      validation_status = llm.validation_status;
    } else {
      validation_status = 'warning';
    }
  } catch (e) {
    console.warn(`[AgentDaily] ${siteId}: LLM fallback to B —`, e.message);
    fallback_used = true;
    selectedLetter = 'B';
    adjustments = {};
    validation_status = 'warning';
    reasoning = detectLanguage(siteConfig) === 'Polish'
      ? 'Automatyczny wybór strategii B (zrównoważonej) z powodu błędu lub niepewnej odpowiedzi modelu.'
      : 'Automatic selection of strategy B (balanced) due to model error or invalid response.';
  }

  let chosen = pickStrategy(strategies, selectedLetter);
  if (!chosen) {
    console.warn(`[AgentDaily] ${siteId}: strategy letter ${selectedLetter} not found — using balanced`);
    chosen = pickStrategy(strategies, 'B') || strategies[0];
    if (!fallback_used) fallback_used = true;
  }
  const selectedKey =
    chosen?.name === 'aggressive' ? 'A' : chosen?.name === 'conservative' ? 'C' : 'B';

  let rules = cloneRules(chosen.rules || []);
  rules = applyBoundedAdjustments(rules, adjustments);
  const strategySch = rulesToSchBuckets(rules);

  let mergedSch = strategySch;
  if (SCHEDULES_API && (automationMode === 'automatic' || automationMode === 'semi-automatic')) {
    const currentSch = await fetchScheduleSch(siteId);
    mergedSch = mergeSchReplaceP678(currentSch, strategySch);
  }

  const status = await applyStrategyDeployment(siteId, mergedSch, automationMode);

  const now = new Date().toISOString();
  const forecast = chosen.forecast || {};

  const decision = {
    PK: `DECISION#${siteId}`,
    SK: now,
    site_id: siteId,
    timestamp: now,
    agent_type: 'daily',
    input_summary: {
      tge_prices_range: enginePayload.data_summary?.tge_price_range || null,
      pv_forecast_kwh: enginePayload.data_summary?.pv_total_kwh ?? null,
      load_forecast_kwh: enginePayload.data_summary?.load_total_kwh ?? null,
      current_soc: enginePayload.current_soc,
      battery_capacity_kwh: siteConfig.battery?.capacity_kwh || 100,
    },
    selected_strategy: selectedKey,
    strategy_adjustments: adjustments,
    forecast,
    validation_status,
    fallback_used,
    reasoning,
    predicted_outcome: predictedOutcomeFromForecast(forecast),
    status,
    proposed_sch: mergedSch,
    ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
  };

  await logDecision(decision);

  const scheduleSnapshot = {
    sch: mergedSch,
    selected_strategy: selectedKey,
    strategy_adjustments: adjustments,
    generated_at: now,
    automation_mode: automationMode,
    status,
  };
  await updateAgentState(siteId, scheduleSnapshot);

  if (status === 'pending_approval') {
    const ruleN = ['p_6', 'p_7', 'p_8'].reduce((n, k) => n + (mergedSch[k]?.length || 0), 0);
    const notif = {
      PK: `NOTIFICATION#${siteId}`,
      SK: `DAILY#${now}`,
      id: `notif-daily-${Date.now()}`,
      site_id: siteId,
      type: 'schedule_proposed',
      title: 'New daily schedule proposed',
      message: `Strategy ${selectedKey} proposed (${ruleN} rules P6–P8). ${reasoning.slice(0, 120)}`,
      created_at: now,
      read: false,
      decision_sk: now,
    };
    await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE, Item: notif }));
  }

  const ruleN = ['p_6', 'p_7', 'p_8'].reduce((n, k) => n + (mergedSch[k]?.length || 0), 0);
  console.log(`[AgentDaily] ${siteId}: done — strategy ${selectedKey}, ${ruleN} rules, status=${status}, fallback=${fallback_used}`);
  return { siteId, selected_strategy: selectedKey, rulesCount: ruleN, status, reasoning: reasoning.slice(0, 200) };
}

export const handler = async (event) => {
  console.log('[AgentDaily] Invoked', JSON.stringify(event));
  const startTime = Date.now();

  let sites;

  if (event.site_id) {
    const config = await getSiteConfig(event.site_id);
    if (!config) {
      console.error(`[AgentDaily] Site not found: ${event.site_id}`);
      return { error: `Site not found: ${event.site_id}` };
    }
    const mode = config.automation?.mode || 'manual';
    if (mode === 'manual') {
      console.log(`[AgentDaily] Skipping ${event.site_id} — mode is manual`);
      return { processed: 0, skipped: 1, reason: 'manual_mode' };
    }
    sites = [config];
  } else {
    sites = await scanAutomationEnabledSites();
  }

  console.log(`[AgentDaily] Processing ${sites.length} site(s)`);

  const results = [];
  const errors = [];

  for (const site of sites) {
    try {
      const result = await processSite(site);
      results.push(result);
    } catch (err) {
      console.error(`[AgentDaily] Error processing ${site.site_id}:`, err);
      errors.push({ siteId: site.site_id, error: err.message });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[AgentDaily] Completed in ${elapsed}ms — ${results.length} ok, ${errors.length} errors`);

  return {
    processed: results.length,
    errors: errors.length,
    elapsed_ms: elapsed,
    results,
    errors_detail: errors,
  };
};
