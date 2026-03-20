import { DynamoDBClient, ScanCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const ddb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddb);
const lambda = new LambdaClient({});
const bedrock = new BedrockRuntimeClient({ region: 'eu-central-1' });

const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';
const STATE_TABLE = process.env.AGENT_STATE_TABLE || 'aiess_agent_state';
const DECISIONS_TABLE = process.env.AGENT_DECISIONS_TABLE || 'aiess_agent_decisions';
const OPT_ENGINE_V2_FUNCTION = process.env.OPT_ENGINE_V2_FUNCTION || 'aiess-optimization-engine-v2';
const BEDROCK_MODEL_ID = 'eu.anthropic.claude-sonnet-4-6';
const MAX_LESSONS = 50;

// ─── DynamoDB Helpers ───────────────────────────────────────────

async function scanEnabledSites() {
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: SITE_CONFIG_TABLE,
      FilterExpression: 'automation.enabled = :t',
      ExpressionAttributeValues: marshall({ ':t': true }),
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []).map(unmarshall));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function getAgentState(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: STATE_TABLE,
    Key: marshall({ site_id: siteId }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function queryPastWeekDecisions(siteId) {
  const pk = `DECISION#${siteId}`;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { Items } = await docClient.send(new QueryCommand({
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk AND SK >= :since',
    ExpressionAttributeValues: { ':pk': pk, ':since': since },
    ScanIndexForward: false,
  }));
  return Items || [];
}

// ─── Performance Aggregation ────────────────────────────────────

function aggregateWeekPerformance(decisions) {
  const predicted = { arbitrage_pln: 0, peak_shaving_pln: 0, pv_savings_pln: 0, total_savings_pln: 0 };
  const actual = { arbitrage_pln: 0, peak_shaving_pln: 0, pv_savings_pln: 0, total_savings_pln: 0 };
  let withActual = 0;

  for (const d of decisions) {
    if (d.predicted_outcome) {
      predicted.arbitrage_pln += d.predicted_outcome.arbitrage_pln || 0;
      predicted.peak_shaving_pln += d.predicted_outcome.peak_shaving_pln || 0;
      predicted.pv_savings_pln += d.predicted_outcome.pv_savings_pln || 0;
      predicted.total_savings_pln += d.predicted_outcome.total_savings_pln || 0;
    }
    if (d.actual_outcome) {
      actual.arbitrage_pln += d.actual_outcome.arbitrage_pln || 0;
      actual.peak_shaving_pln += d.actual_outcome.peak_shaving_pln || 0;
      actual.pv_savings_pln += d.actual_outcome.pv_savings_pln || 0;
      actual.total_savings_pln += d.actual_outcome.total_savings_pln || 0;
      withActual++;
    }
  }

  const accuracy = predicted.total_savings_pln !== 0
    ? Math.round((actual.total_savings_pln / predicted.total_savings_pln) * 100)
    : null;

  return {
    decisions_count: decisions.length,
    decisions_with_actuals: withActual,
    predicted,
    actual,
    accuracy_pct: accuracy,
    lessons_from_week: decisions.filter(d => d.lesson_learned).map(d => d.lesson_learned),
    customer_feedback: decisions.flatMap(d => (d.customer_comments || []).map(c => c.text)),
  };
}

// ─── Optimization Engine Invocation ─────────────────────────────

async function invokeOptimizationEngine(siteId, siteConfig) {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: OPT_ENGINE_V2_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({ site_id: siteId, site_config: siteConfig, mode: 'weekly' }),
  }));
  const payload = JSON.parse(Buffer.from(res.Payload).toString());
  if (res.FunctionError) throw new Error(`OptEngine error: ${JSON.stringify(payload)}`);
  if (payload.statusCode != null && payload.statusCode !== 200) {
    throw new Error(`OptEngine error: ${JSON.stringify(payload.error || payload)}`);
  }
  return payload.body !== undefined ? payload.body : payload;
}

// ─── Bedrock LLM Call ───────────────────────────────────────────

function detectLanguage(siteConfig) {
  const lang = siteConfig.ai_profile?.preferred_language
    || siteConfig.general?.language
    || 'pl';
  return lang === 'pl' ? 'Polish' : 'English';
}

function buildWeeklyPrompt(siteConfig, weekPerf, forecast, currentLessons) {
  const profile = siteConfig.ai_profile || {};
  const description = siteConfig.general?.description || 'No site description available';
  const language = detectLanguage(siteConfig);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekLabel = weekStart.toISOString().slice(0, 10);

  const batteryKwh = siteConfig.battery?.capacity_kwh || 100;
  const pvPeak = siteConfig.pv_system?.total_peak_kw || 0;
  const backupReserve = profile.backup_reserve_percent ?? 0;

  return `You are an AI energy management agent for a BESS (Battery Energy Storage System) site in Poland.
You are performing a WEEKLY review and planning session.

LANGUAGE: Write ALL text (strategy, goals, guidance, lessons) in ${language}. Use Polish energy terminology:
- "autokonsumpcja" (not "self-consumption")
- "moc zamówiona" (contracted power / demand charge)
- "taryfa dystrybucyjna" (distribution tariff)
- "strefa szczytowa/pozaszczytowa/nocna" (peak/off-peak/night zone)
- "krzywa dzwonowa" (bell curve)
Technical identifiers stay in English.

## Site Description
${description}

## AI Profile
- Business type: ${profile.business_type || 'unknown'}
- Battery: ${batteryKwh} kWh
- PV installation: ${pvPeak} kW peak
- Shifts: ${profile.shift_count ?? 'unknown'}
- Operating hours: ${profile.operating_hours ? `${profile.operating_hours.start} – ${profile.operating_hours.end}` : 'unknown'}
- Operating days: ${profile.operating_days || 'unknown'}
- Weekend pattern: ${profile.weekend_pattern || 'unknown'}
- Optimization goals (priority order): ${(profile.goal_priority_order || profile.optimization_goals || []).join(', ') || 'none set'}
- Backup reserve: ${backupReserve > 0 ? backupReserve + '%' : 'not set (use judgment)'}
- Risk tolerance: ${profile.risk_tolerance || 'balanced'}
- Peak shaving confidence (peak_confidence): ${siteConfig.peak_confidence != null ? siteConfig.peak_confidence : '0.99 (engine default)'}
- Customer constraints: ${profile.constraints_text || 'none'}
- Seasonal notes: ${profile.seasonal_notes || 'none'}

## CRITICAL: EXPORT LIMIT & PV EXCESS ABSORPTION
${siteConfig.grid_connection?.export_limit_kw ? `Export limit: ${siteConfig.grid_connection.export_limit_kw} kW.` : 'The site likely has an export limit set at inverter level.'}
This is primarily a WEEKEND and HOLIDAY problem:
- On workdays: factory load absorbs most PV → surplus rarely hits the export limit
- On weekends/holidays: factory load ≈ 0 → full PV output (~${pvPeak} kW) hits the grid → inverters get curtailed = FREE ENERGY WASTED
Weekly strategy MUST include: "On weekends/holidays, charge battery from PV excess to 100% before export limit is reached."
- Battery charging absorbs the surplus, prevents curtailment, and captures free energy
- Inverter shutdown = absolute last resort, NOT normal operation
- Then discharge that stored energy on Monday/next workday during peak load

## CRITICAL: WEEKEND PV SURPLUS OPPORTUNITY
If the site has PV and does NOT operate on weekends, weekends are the BEST charging opportunity:
- Factory load drops to near-zero → virtually ALL PV output becomes surplus
- Example: ${pvPeak} kW PV with ~0 kW load = up to ${pvPeak} kW free charging for 6+ hours
- The battery should charge to 100% SoC from free PV on Saturday/Sunday
- Then discharge on Monday morning when the factory starts consuming again
- This is FREE energy — do NOT leave the battery idle on weekends when PV is available!
Weekend guidance must reflect this: "Charge from PV to 100%, prepare for Monday discharge."

## BATTERY HEALTH — STANDBY SoC
When no charging opportunity is expected for extended periods (e.g. consecutive cloudy days with no PV surplus, or sites without PV during holidays), do NOT discharge to the absolute minimum. Maintain a healthy standby SoC of 20-40% to prolong LFP battery life. But if PV charging is available (e.g. sunny weekend), charge fully — standby SoC is only for when NO charge source exists.

## Past Week Performance (7 days)
- Decisions executed: ${weekPerf.decisions_count}
- Decisions with measured actuals: ${weekPerf.decisions_with_actuals}
- Predicted total savings: ${weekPerf.predicted.total_savings_pln.toFixed(2)} PLN
  (arbitrage: ${weekPerf.predicted.arbitrage_pln.toFixed(2)}, peak shaving: ${weekPerf.predicted.peak_shaving_pln.toFixed(2)}, PV: ${weekPerf.predicted.pv_savings_pln.toFixed(2)})
- Actual total savings: ${weekPerf.actual.total_savings_pln.toFixed(2)} PLN
  (arbitrage: ${weekPerf.actual.arbitrage_pln.toFixed(2)}, peak shaving: ${weekPerf.actual.peak_shaving_pln.toFixed(2)}, PV: ${weekPerf.actual.pv_savings_pln.toFixed(2)})
- Prediction accuracy: ${weekPerf.accuracy_pct !== null ? weekPerf.accuracy_pct + '%' : 'N/A (no predictions)'}
- Lessons from daily agents: ${weekPerf.lessons_from_week.length > 0 ? weekPerf.lessons_from_week.join('; ') : 'none'}
- Customer feedback: ${weekPerf.customer_feedback.length > 0 ? weekPerf.customer_feedback.join('; ') : 'none'}

${forecast.strategies?.length ? `## Optimization engine (v2) — 3 strategy packages
The engine produced **three strategy packages**: **aggressive**, **balanced**, and **conservative**. Each package bundles rules with a simulated per-strategy **forecast** (hourly flow and summary). Use this for weekly context: which risk posture fits the site this week, and how PV / grid / SoC should trend — deployment chooses a package; do not treat the output as loose "hints" or isolated charge/discharge windows.

- Current SoC: ${forecast.current_soc != null ? `${forecast.current_soc}%` : 'unknown'}
- TGE prices (horizon): ${forecast.data_summary?.tge_price_range
    ? `min ${forecast.data_summary.tge_price_range.min}, max ${forecast.data_summary.tge_price_range.max}, avg ${forecast.data_summary.tge_price_range.avg} PLN/MWh`
    : forecast.data_summary?.price_range
      ? `min ${forecast.data_summary.price_range.min}, max ${forecast.data_summary.price_range.max}`
      : 'n/a'}
- PV / load (horizon): ${forecast.data_summary?.pv_total_kwh != null ? `${forecast.data_summary.pv_total_kwh} kWh PV, ${forecast.data_summary.load_total_kwh} kWh load` : 'n/a'}${forecast.data_summary?.surplus_total_kwh != null ? `, surplus ${forecast.data_summary.surplus_total_kwh} kWh` : ''}

**Per package:**
${forecast.strategies.map((s) => {
    const sum = s.forecast?.summary || {};
    return `- **${s.name}** (${s.risk || 'n/a'}): simulation_valid=${s.simulation_valid}; estimated_savings_pln≈${sum.estimated_savings_pln != null ? sum.estimated_savings_pln : 'n/a'}; SoC ${sum.soc_start ?? '?'}% → ${sum.soc_end ?? '?'}%; peak grid import ${sum.peak_grid_import_kw ?? '?'} kW; self-consumption ${sum.self_consumption_pct ?? '?'}%`;
  }).join('\n')}
${forecast.tradeoff_analysis ? `
**Trade-off analysis:** ${JSON.stringify(forecast.tradeoff_analysis)}` : ''}` : `## 7-Day Forecast Summary (from optimization engine)
- Charge windows found: ${forecast.charge_windows?.length || 0}
- Discharge windows found: ${forecast.discharge_windows?.length || 0}
- Peak shaving needed: ${forecast.peak_shaving_needed ? 'YES' : 'no'}
- Bell curve active: ${forecast.bell_curve_active ? 'YES' : 'no'}
- Projected weekly savings: arbitrage ${forecast.projected_savings?.arbitrage_pln?.toFixed(2) || '0.00'} PLN, peak shaving ${forecast.projected_savings?.peak_shaving_pln?.toFixed(2) || '0.00'} PLN, autokonsumpcja PV ${forecast.projected_savings?.pv_self_consumption_pln?.toFixed(2) || '0.00'} PLN
- Constraints applied: ${(forecast.constraints_applied || []).join(', ') || 'none'}`}
${forecast.load_pv_profile?.data_available ? `
## CRITICAL: Load vs PV Summary
- PV peak: ${forecast.load_pv_profile.pv_actual_peak_kw || pvPeak} kW
- Load peak: ${forecast.load_pv_profile.load_peak_kw} kW, avg: ${forecast.load_pv_profile.load_avg_kw} kW
- Surplus hours (PV > Load): ${forecast.load_pv_profile.surplus_hours_count}
${forecast.load_pv_profile.surplus_hours_count <= 3 ? '⚠️ VERY LIMITED PV surplus — factory consumes most PV output. Do NOT overestimate autokonsumpcja potential on workdays.' : ''}` : ''}
${forecast.tariff_zone_summary ? `
## Distribution Tariff Zones
${forecast.tariff_zone_summary.map(z => `- ${z.zone}: ${z.rate_pln_kwh} PLN/kWh (${z.hours})`).join('\n')}
Note: Factor into daily guidance. Cheaper zones favored for charging, but consider 10% RTE loss.` : ''}

## Current Lessons (accumulated knowledge)
${currentLessons.length > 0 ? currentLessons.map((l, i) => `${i + 1}. [${l.category || 'general'}] ${l.text}`).join('\n') : 'No lessons yet.'}

## Your Task
Produce a JSON object with EXACTLY these two keys:

1. "weekly_plan" — the plan for the upcoming week:
{
  "week": "${weekLabel}",
  "strategy": "<1-2 sentence high-level strategy>",
  "goals": ["<goal 1>", "<goal 2>", ...],
  "constraints_active": ["<constraint 1>", ...],
  "daily_guidance": {
    "mon": "<guidance for Monday>",
    "tue": "<guidance for Tuesday>",
    "wed": "<guidance for Wednesday>",
    "thu": "<guidance for Thursday>",
    "fri": "<guidance for Friday>",
    "sat": "<guidance for Saturday>",
    "sun": "<guidance for Sunday>"
  },
  "strategy_notes": "<any extra context for the daily/intraday agents>",
  "created_at": "<ISO timestamp>"
}

2. "new_lessons" — an array of 0-3 new lessons learned from this week's review:
[
  {
    "text": "<lesson>",
    "category": "forecast_accuracy" | "strategy" | "customer_preference" | "timing" | "constraint"
  }
]

Respond with ONLY the JSON object, no markdown fences, no extra text.`;
}

async function callBedrock(prompt) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const res = await bedrock.send(new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  }));

  const parsed = JSON.parse(Buffer.from(res.body).toString());
  const text = parsed.content?.[0]?.text || '';

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 500)}`);
  }
}

// ─── State Persistence ──────────────────────────────────────────

async function saveWeeklyPlan(siteId, weeklyPlan, newLessons, existingLessons) {
  const now = new Date().toISOString();

  const lessons = [
    ...existingLessons,
    ...newLessons.map(l => ({
      text: l.text,
      category: l.category,
      agent_type: 'weekly',
      created_at: now,
    })),
  ].slice(-MAX_LESSONS);

  await docClient.send(new UpdateCommand({
    TableName: STATE_TABLE,
    Key: { site_id: siteId },
    UpdateExpression: 'SET weekly_plan = :wp, lessons = :ls, last_weekly_run = :ts, updated_at = :ts',
    ExpressionAttributeValues: {
      ':wp': weeklyPlan,
      ':ls': lessons,
      ':ts': now,
    },
  }));
}

async function logWeeklyDecision(siteId, weeklyPlan, weekPerf, forecast) {
  const now = new Date().toISOString();
  const sk = `WEEKLY#${now}`;

  await docClient.send(new PutCommand({
    TableName: DECISIONS_TABLE,
    Item: {
      PK: `DECISION#${siteId}`,
      SK: sk,
      site_id: siteId,
      timestamp: now,
      agent_type: 'weekly',
      input_summary: {
        tge_prices_range: forecast.data_summary?.tge_price_range
          || forecast.data_summary?.price_range
          || null,
        pv_forecast_kwh: forecast.data_summary?.pv_total_kwh ?? null,
        load_forecast_kwh: forecast.data_summary?.load_total_kwh ?? null,
        current_soc: forecast.current_soc ?? null,
        battery_capacity_kwh: null,
      },
      reasoning: weeklyPlan.strategy,
      rules_created: [],
      rules_modified: [],
      rules_deleted: [],
      predicted_outcome: (() => {
        const ps = forecast.projected_savings;
        if (ps) {
          return {
            arbitrage_pln: ps.arbitrage_pln || 0,
            peak_shaving_pln: ps.peak_shaving_pln || 0,
            pv_savings_pln: ps.pv_self_consumption_pln || 0,
            total_savings_pln: (ps.arbitrage_pln || 0)
              + (ps.peak_shaving_pln || 0)
              + (ps.pv_self_consumption_pln || 0),
          };
        }
        const bal = (forecast.strategies || []).find(s => s.name === 'balanced');
        const est = bal?.forecast?.summary?.estimated_savings_pln;
        const t = typeof est === 'number' ? est : 0;
        return {
          arbitrage_pln: 0,
          peak_shaving_pln: 0,
          pv_savings_pln: 0,
          total_savings_pln: t,
        };
      })(),
      actual_outcome: null,
      delta: null,
      lesson_learned: null,
      status: 'applied',
    },
  }));
}

// ─── Main Handler ───────────────────────────────────────────────

export const handler = async (event) => {
  console.log('[WeeklyAgent] Starting weekly run', JSON.stringify(event));

  let sites;
  if (event.site_id) {
    const { Item } = await ddb.send(new GetItemCommand({
      TableName: SITE_CONFIG_TABLE,
      Key: marshall({ site_id: event.site_id }),
    }));
    if (!Item) {
      return { processed: 0, results: [{ site_id: event.site_id, status: 'error', error: 'Site not found' }] };
    }
    const config = unmarshall(Item);
    const mode = config.automation?.mode || 'manual';
    if (mode === 'manual') {
      console.log(`[WeeklyAgent] Skipping ${event.site_id} — mode is manual`);
      return { processed: 0, skipped: 1, reason: 'manual_mode' };
    }
    sites = [config];
  } else {
    sites = await scanEnabledSites();
  }

  console.log(`[WeeklyAgent] Processing ${sites.length} site(s)`);
  const results = [];

  for (const siteConfig of sites) {
    const siteId = siteConfig.site_id;
    try {
      console.log(`[WeeklyAgent] ── Site ${siteId} ──`);

      const [decisions, agentState, forecast] = await Promise.all([
        queryPastWeekDecisions(siteId),
        getAgentState(siteId),
        invokeOptimizationEngine(siteId, siteConfig),
      ]);

      const weekPerf = aggregateWeekPerformance(decisions);
      const currentLessons = agentState?.lessons || [];

      console.log(`[WeeklyAgent] ${siteId}: ${weekPerf.decisions_count} decisions, ${currentLessons.length} lessons, forecast ready`);

      const prompt = buildWeeklyPrompt(siteConfig, weekPerf, forecast, currentLessons);
      const llmResponse = await callBedrock(prompt);

      const weeklyPlan = llmResponse.weekly_plan;
      const newLessons = llmResponse.new_lessons || [];

      if (!weeklyPlan?.week || !weeklyPlan?.strategy) {
        throw new Error(`Invalid LLM response: missing week or strategy`);
      }

      weeklyPlan.created_at = new Date().toISOString();

      await saveWeeklyPlan(siteId, weeklyPlan, newLessons, currentLessons);
      await logWeeklyDecision(siteId, weeklyPlan, weekPerf, forecast);

      console.log(`[WeeklyAgent] ${siteId}: plan saved – "${weeklyPlan.strategy}"`);
      results.push({ site_id: siteId, status: 'ok', strategy: weeklyPlan.strategy });
    } catch (err) {
      console.error(`[WeeklyAgent] ${siteId}: FAILED`, err);
      results.push({ site_id: siteId, status: 'error', error: err.message });
    }
  }

  console.log(`[WeeklyAgent] Done. ${results.filter(r => r.status === 'ok').length}/${results.length} succeeded`);
  return { processed: results.length, results };
};
