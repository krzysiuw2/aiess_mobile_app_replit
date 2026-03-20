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

const ddb = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddb);
const lambda = new LambdaClient({ region: REGION });
const bedrock = new BedrockRuntimeClient({ region: REGION });

// ─── DynamoDB Helpers ────────────────────────────────────────────

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

// ─── Schedules API ───────────────────────────────────────────────

async function fetchCurrentSchedules(siteId) {
  if (!SCHEDULES_API) return [];
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    headers: { 'x-api-key': SCHEDULES_API_KEY },
  });
  if (!res.ok) {
    console.warn(`[AgentDaily] Schedules API ${res.status} for ${siteId}`);
    return [];
  }
  const data = await res.json();

  // Flatten the { sch: { p_6: [...], p_7: [...], p_8: [...], p_9: [...] } } structure
  const rules = [];
  const sch = data?.sch || data;
  for (const [priorityKey, priorityRules] of Object.entries(sch)) {
    if (!Array.isArray(priorityRules)) continue;
    const pNum = parseInt(priorityKey.replace('p_', ''), 10);
    for (const rule of priorityRules) {
      rules.push({ ...rule, p: pNum || rule.p });
    }
  }
  return rules;
}

async function writeScheduleRules(siteId, rules) {
  if (!SCHEDULES_API) throw new Error('SCHEDULES_API not configured');
  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SCHEDULES_API_KEY,
    },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) throw new Error(`Schedules API PUT ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Recent Customer Comments ────────────────────────────────────

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

// ─── InfluxDB Telemetry ─────────────────────────────────────────

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

// ─── Optimization Engine ─────────────────────────────────────────

async function invokeOptimizationEngine(siteId, siteConfig) {
  const payload = { site_id: siteId, site_config: siteConfig, mode: 'daily' };
  const { Payload } = await lambda.send(new InvokeCommand({
    FunctionName: process.env.OPTIMIZATION_ENGINE_FUNCTION || 'aiess-optimization-engine',
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(payload),
  }));
  return JSON.parse(Buffer.from(Payload).toString());
}

// ─── Outcome Tracking ────────────────────────────────────────────

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

// ─── Bedrock LLM Call ────────────────────────────────────────────

function detectLanguage(siteConfig) {
  const lang = siteConfig.ai_profile?.preferred_language
    || siteConfig.general?.language
    || 'pl';
  return lang === 'pl' ? 'Polish' : 'English';
}

function buildSystemPrompt(siteConfig) {
  const language = detectLanguage(siteConfig);
  const backupReserve = siteConfig.ai_profile?.backup_reserve_percent ?? 0;
  const batteryKwh = siteConfig.battery?.capacity_kwh || 100;
  const maxCharge = siteConfig.power_limits?.max_charge_kw || 50;
  const maxDischarge = siteConfig.power_limits?.max_discharge_kw || 50;
  const pvPeak = siteConfig.pv_system?.total_peak_kw || 0;
  const gridCapacity = siteConfig.grid_connection?.capacity_kva;

  return `You are an AI energy management agent for a BESS (Battery Energy Storage System) site in Poland.

LANGUAGE: Write ALL reasoning and descriptions in ${language}. Use Polish energy terminology:
- "autokonsumpcja" (not "self-consumption")
- "moc zamówiona" (contracted power / demand charge)
- "taryfa dystrybucyjna" (distribution tariff)
- "strefa szczytowa/pozaszczytowa/nocna" (peak/off-peak/night zone)
- "krzywa bell" or "krzywa dzwonowa" (bell curve for export following PV)
Technical identifiers (rule IDs, JSON keys) stay in English.

HARDWARE:
- Battery: ${batteryKwh} kWh (${siteConfig.battery?.chemistry || 'LFP'})
- Max charge: ${maxCharge} kW, max discharge: ${maxDischarge} kW
- PV installation: ${pvPeak} kW peak
- Grid connection: ${gridCapacity ? gridCapacity + ' kVA' : 'unknown'}
- Export allowed: ${siteConfig.grid_connection?.export_allowed ?? true}
- Export follows sun (bell curve): ${siteConfig.grid_connection?.export_follows_sun || false}

CRITICAL — EXPORT LIMIT & PV EXCESS ABSORPTION (P8 priority):
${siteConfig.grid_connection?.export_limit_kw ? `Export limit: ${siteConfig.grid_connection.export_limit_kw} kW.` : 'Export limit: check site description or assume inverter-level curtailment exists.'}
This is mainly a WEEKEND and HOLIDAY problem. On workdays the factory load (40-70 kW) absorbs most PV, so surplus rarely exceeds the export limit. But on weekends/holidays when load is near zero, the FULL PV output (~${pvPeak} kW) hits the grid and triggers inverter curtailment = FREE ENERGY WASTED.
Create P8 charging rules for weekends/holidays during PV hours to absorb excess before the export limit is hit:
- When grid power is negative (exporting) and approaching the limit, battery should charge
- Example: export limit 50 kW → start charging when grid export exceeds ~35 kW (15 kW margin)
- Weekend with zero load: surplus ≈ full PV → charge at max rate up to ${maxCharge} kW → battery to 100%
- On workdays: only if load drops unusually low and surplus spikes (rare, but possible during breaks/holidays)
- This captures energy that inverter curtailment would throw away — battery charging is ALWAYS better than curtailment
- Inverter shutdown/curtailment = absolute LAST resort safety mechanism, NOT normal operation
- Active during PV production hours (roughly 08:00-16:00, peak 10:00-14:00)

CRITICAL — WEEKEND vs WEEKDAY PV SURPLUS:
If the site has PV and does NOT operate on weekends/holidays:
- WEEKDAYS: Factory load (typically 40-70 kW) consumes most PV → limited surplus, maybe only at peak sun (11-13)
- WEEKENDS: Factory load drops to near-zero → virtually ALL PV becomes surplus (up to ${pvPeak} kW for 6+ hours!)
- On weekends: charge the battery to 100% SoC from FREE PV energy. This is the best opportunity!
- On Friday evening: consider NOT discharging fully — preserve SoC for weekend PV charging cycle
- On Sunday/Monday: battery at 100% → discharge during Monday peak factory load to offset grid consumption
This weekday/weekend asymmetry is KEY to optimization. Always check what day of week the schedule is for.

BATTERY HEALTH — STANDBY SoC:
When no charging opportunity is expected for extended periods (consecutive cloudy days, sites without PV during holidays), maintain a healthy standby SoC of 20-40% to prolong LFP battery life. But if PV charging IS available (sunny day, especially weekends), charge fully — standby SoC only applies when NO charge source exists.
${backupReserve > 0 ? `Customer-configured backup reserve: ${backupReserve}% (never go below this)` : 'No backup reserve configured — use your judgment for safe minimums.'}

CRITICAL — LOAD vs PV ANALYSIS:
You will receive a "load_pv_profile" section from the optimization engine. Study it carefully:
- Compare avg_load_kw against PV output hour by hour
- PV surplus (net_surplus_kw > 0) means the battery CAN charge from PV
- PV deficit (net_surplus_kw < 0) means the factory consumes MORE than PV produces — no free energy to charge
- Do NOT assume PV surplus exists just because there is a PV installation — look at the actual numbers
- On WORKDAYS: surplus hours are typically limited to peak sun (11:00-13:00) and may be very small
- On WEEKENDS/HOLIDAYS: if factory is closed, surplus = nearly full PV output for many hours — CHARGE!

DISTRIBUTION TARIFF:
You will receive "tariff_zone_summary" showing distribution charge zones (B23, C22, etc.). Even when the energy price is flat, distribution tariff varies by time of day:
- Charging during cheaper distribution zones (off-peak/night) saves on distribution costs
- However, if the price difference is small relative to 10% round-trip efficiency loss, note this in reasoning
- Factor distribution tariff into charge/discharge timing decisions

RULE MANAGEMENT:
You will receive CURRENT schedule rules. For each, decide:
1. KEEP — rule is fine as-is
2. MODIFY — needs parameter adjustment
3. DELETE — no longer optimal (only AI-sourced rules)
4. ADD — new rule needed

Rules with source "ai" (s: "ai") = AI-created, freely modifiable/deletable.
Rules WITHOUT "ai" source = MANUAL customer rules — do NOT delete, only suggest changes in reasoning.

OUTPUT FORMAT (strict JSON):
{
  "rules_keep": ["<rule_id>", ...],
  "rules_modify": [{ "id": "<existing_id>", "priority": <6|7|8>, "action": { "type": "charge"|"discharge"|"idle"|"limit_export", "power_kw": <number>, "target_soc": <number, optional> }, "conditions": { "time_start": "HH:MM", "time_end": "HH:MM", "soc_min": <number, optional>, "soc_max": <number, optional> }, "days": ["mon",...] }],
  "rules_delete": ["<rule_id>", ...],
  "rules_add": [{ "id": "ai-daily-<suffix>", "priority": <6|7|8>, "action": {...}, "conditions": {...}, "days": [...] }],
  "reasoning": "<strategy explanation in ${language}>"
}

PRIORITY LEVELS:
- P6: Standard arbitrage / cost optimization
- P7: Peak shaving / moc zamówiona management
- P8: Autokonsumpcja PV / bell curve rules

Only P6-P8 are in scope. P9 (safety) is never altered.
Only output valid JSON. No markdown fences.`;
}

function buildUserPrompt({ siteConfig, agentState, optimResult, currentSchedules, recentComments, outcomeEvaluation }) {
  const language = detectLanguage(siteConfig);

  const formattedRules = (currentSchedules || []).map(r => ({
    id: r.id,
    source: r.s === 'ai' ? 'AI (previous run)' : 'MANUAL (customer)',
    priority: r.p,
    action: r.a,
    conditions: r.c,
    days: r.d,
    active: r.act !== false,
  }));

  const parts = [
    '=== SITE PROFILE ===',
    JSON.stringify(siteConfig.ai_profile || {}, null, 2),
    '',
    '=== SITE DESCRIPTION ===',
    siteConfig.general?.description || 'No description provided',
    '',
    '=== WEEKLY PLAN ===',
    JSON.stringify(agentState?.weekly_plan || { note: 'No weekly plan available' }, null, 2),
    '',
  ];

  // Highlight load vs PV profile separately for maximum LLM attention
  const lpProfile = optimResult?.load_pv_profile;
  if (lpProfile?.data_available) {
    parts.push('=== ⚡ CRITICAL: LOAD vs PV PROFILE (actual data) ===');
    parts.push(`PV peak installation: ${lpProfile.pv_peak_kw} kW`);
    parts.push(`PV actual peak (today/forecast): ${lpProfile.pv_actual_peak_kw} kW`);
    parts.push(`Load PEAK: ${lpProfile.load_peak_kw} kW`);
    parts.push(`Load AVERAGE: ${lpProfile.load_avg_kw} kW`);
    parts.push(`Hours with net PV surplus (>1 kW): ${lpProfile.surplus_hours_count}`);
    if (lpProfile.surplus_hours_count <= 3) {
      parts.push('⚠️ VERY LIMITED PV surplus — the factory consumes most/all PV. Do NOT plan large PV charging windows.');
    }
    parts.push('Hourly breakdown (kW):');
    for (const h of (lpProfile.hourly_profile || [])) {
      const tag = h.net_surplus_kw > 1 ? '☀️surplus' : h.net_surplus_kw < -10 ? '🏭deficit' : '~neutral';
      parts.push(`  ${String(h.hour).padStart(2, '0')}:00 → PV: ${h.avg_pv_kw}, Load: ${h.avg_load_kw}, Net: ${h.net_surplus_kw} (${tag})`);
    }
    parts.push('');
  } else {
    parts.push('=== LOAD vs PV ===');
    parts.push(`No forecast data available. PV peak: ${lpProfile?.pv_peak_kw || siteConfig.pv_system?.total_peak_kw || '?'} kW.`);
    parts.push(`Estimate load from site description. Typical small industrial: 40-70 kW.`);
    parts.push('');
  }

  // Highlight tariff zones
  const tariffSummary = optimResult?.tariff_zone_summary;
  if (tariffSummary && tariffSummary.length > 0) {
    parts.push('=== TARYFA DYSTRYBUCYJNA (distribution tariff zones) ===');
    for (const z of tariffSummary) {
      parts.push(`  ${z.zone}: ${z.rate_pln_kwh} PLN/kWh (${z.hours}, ${z.hour_count}h)`);
    }
    parts.push('Note: factor this into charge timing. Cheaper zones = better for charging. But consider 10% RTE loss.');
    parts.push('');
  }

  parts.push('=== OPTIMIZATION ENGINE OUTPUT ===');
  // Strip load_pv_profile and tariff_zone_summary from engine output to avoid duplication
  const strippedResult = { ...optimResult };
  delete strippedResult.load_pv_profile;
  delete strippedResult.tariff_zone_summary;
  parts.push(JSON.stringify(strippedResult, null, 2));
  parts.push('');

  parts.push('=== CURRENT SCHEDULE RULES (manage these) ===');
  parts.push(
    formattedRules.length > 0
      ? JSON.stringify(formattedRules, null, 2)
      : 'No existing rules. Create new ones from scratch.'
  );
  parts.push('');

  if (agentState?.lessons?.length) {
    const recent = agentState.lessons.slice(-10);
    parts.push('=== LESSONS LEARNED ===');
    parts.push(JSON.stringify(recent, null, 2));
    parts.push('');
  }

  if (recentComments.length) {
    parts.push('=== RECENT CUSTOMER COMMENTS ===');
    parts.push(JSON.stringify(recentComments, null, 2));
    parts.push('');
  }

  if (outcomeEvaluation?.evaluated) {
    parts.push('=== YESTERDAY OUTCOME EVALUATION ===');
    parts.push(JSON.stringify(outcomeEvaluation, null, 2));
    parts.push('');
  }

  parts.push(
    `Based on the above data, produce an optimized daily schedule by managing existing rules. ` +
    `For each existing rule, decide: KEEP, MODIFY, or DELETE. Add new rules only when needed. ` +
    `Do NOT delete manual (customer) rules — only AI rules. ` +
    `CRITICAL: Look at the load vs PV profile — if surplus hours are few, do not create large PV charging windows. ` +
    `Consider the standby SoC concept — don't discharge to minimum if no charging opportunity follows soon. ` +
    `Consider the weekly plan guidance, lessons from past decisions, and any customer feedback. ` +
    `Write the reasoning in ${language}. Output only the JSON object.`
  );

  return parts.join('\n');
}

async function callBedrock(systemPrompt, userPrompt) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.3,
  });

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: 'eu.anthropic.claude-sonnet-4-6',
    contentType: 'application/json',
    accept: 'application/json',
    body,
  }));

  const result = JSON.parse(Buffer.from(response.body).toString());
  const text = result.content?.[0]?.text || '';

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 500)}`);
  }
}

// ─── Apply Rules Based on Automation Mode ────────────────────────

async function applyRules(siteId, rules, automationMode) {
  switch (automationMode) {
    case 'automatic': {
      console.log(`[AgentDaily] ${siteId}: automatic mode — writing ${rules.length} rules`);
      await writeScheduleRules(siteId, rules);
      return 'applied';
    }
    case 'semi-automatic': {
      console.log(`[AgentDaily] ${siteId}: semi-automatic mode — storing ${rules.length} rules as pending`);
      return 'pending_approval';
    }
    case 'manual':
    default: {
      console.log(`[AgentDaily] ${siteId}: manual mode — logged ${rules.length} rules only`);
      return 'pending_approval';
    }
  }
}

// ─── Process Single Site ─────────────────────────────────────────

async function processSite(siteConfig) {
  const siteId = siteConfig.site_id;
  const automationMode = siteConfig.automation?.mode || 'manual';
  console.log(`[AgentDaily] Processing ${siteId} (mode: ${automationMode})`);

  const [agentState, currentSchedules, recentComments] = await Promise.all([
    getAgentState(siteId),
    fetchCurrentSchedules(siteId),
    fetchRecentComments(siteId),
  ]);

  const optimResult = await invokeOptimizationEngine(siteId, siteConfig);

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
    optimResult,
    currentSchedules,
    recentComments,
    outcomeEvaluation,
  });

  const llmResponse = await callBedrock(systemPrompt, userPrompt);
  const reasoning = llmResponse.reasoning || '';

  const rulesKeep = llmResponse.rules_keep || [];
  const rulesModify = llmResponse.rules_modify || [];
  const rulesDelete = llmResponse.rules_delete || [];
  const rulesAdd = llmResponse.rules_add || [];

  // Backward compat: if old-format "rules" array is returned, treat as all-new
  if (llmResponse.rules && !llmResponse.rules_add) {
    rulesAdd.push(...llmResponse.rules);
  }

  // Build the final rule set: kept originals + modified + new
  const keptOriginals = currentSchedules.filter(r => rulesKeep.includes(r.id));
  const finalRules = [...keptOriginals, ...rulesModify, ...rulesAdd];

  const status = await applyRules(siteId, finalRules, automationMode);

  const now = new Date().toISOString();

  const formatRule = (r) => ({
    id: r.id,
    priority: r.priority || r.p,
    action: r.action
      ? `${r.action.type} ${r.action.power_kw || ''}kW`.trim()
      : r.a ? `${r.a.t} ${r.a.pw || ''}kW`.trim() : '',
    time_window: r.conditions
      ? `${r.conditions.time_start}-${r.conditions.time_end}`
      : r.c ? `${r.c.ts || ''}-${r.c.te || ''}` : undefined,
  });

  const decision = {
    PK: `DECISION#${siteId}`,
    SK: now,
    site_id: siteId,
    timestamp: now,
    agent_type: 'daily',
    input_summary: {
      tge_prices_range: optimResult.data_summary?.price_range || null,
      pv_forecast_kwh: optimResult.data_summary?.forecast_points || 0,
      load_forecast_kwh: optimResult.data_summary?.forecast_points || 0,
      current_soc: optimResult.current_soc,
      battery_capacity_kwh: siteConfig.battery?.capacity_kwh || 100,
    },
    reasoning,
    rules_created: rulesAdd.map(formatRule),
    rules_modified: rulesModify.map(formatRule),
    rules_deleted: rulesDelete,
    rules_kept: rulesKeep,
    predicted_outcome: {
      arbitrage_pln: optimResult.projected_savings?.arbitrage_pln || 0,
      peak_shaving_pln: optimResult.projected_savings?.peak_shaving_pln || 0,
      pv_savings_pln: optimResult.projected_savings?.pv_self_consumption_pln || 0,
      total_savings_pln:
        (optimResult.projected_savings?.arbitrage_pln || 0) +
        (optimResult.projected_savings?.peak_shaving_pln || 0) +
        (optimResult.projected_savings?.pv_self_consumption_pln || 0),
    },
    status,
    ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
  };

  await logDecision(decision);

  const scheduleSnapshot = {
    rules: finalRules,
    generated_at: now,
    automation_mode: automationMode,
    status,
  };
  await updateAgentState(siteId, scheduleSnapshot);

  if (status === 'pending_approval') {
    const notif = {
      PK: `NOTIFICATION#${siteId}`,
      SK: `DAILY#${now}`,
      id: `notif-daily-${Date.now()}`,
      site_id: siteId,
      type: 'schedule_proposed',
      title: 'New daily schedule proposed',
      message: `AI agent proposed ${finalRules.length} schedule rules (${rulesAdd.length} new, ${rulesModify.length} modified, ${rulesDelete.length} deleted). ${reasoning.slice(0, 120)}`,
      created_at: now,
      read: false,
      decision_sk: now,
    };
    await docClient.send(new PutCommand({ TableName: DECISIONS_TABLE, Item: notif }));
  }

  console.log(`[AgentDaily] ${siteId}: done — ${finalRules.length} rules (${rulesAdd.length} new, ${rulesModify.length} modified, ${rulesDelete.length} deleted), status=${status}`);
  return { siteId, rulesCount: finalRules.length, status, reasoning: reasoning.slice(0, 200) };
}

// ─── Main Handler ────────────────────────────────────────────────

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
