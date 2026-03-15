/**
 * Financial Engine Lambda — Main Handler
 *
 * Triggered by: EventBridge daily at 2:00 AM CET, or on-demand for recalculation
 *
 * Modes:
 *   daily       — Calculate yesterday's financial data
 *   recalculate — Recalculate from a given start date to end date
 *
 * Environment variables:
 *   SITE_CONFIG_TABLE   DynamoDB table name (default: site_config)
 *   FINANCIAL_TABLE     DynamoDB table for summaries (default: aiess_financial_summaries)
 *   TARIFF_TABLE        DynamoDB table for tariff data (default: aiess_tariff_data)
 *   INFLUX_URL          InfluxDB Cloud URL
 *   INFLUX_TOKEN        InfluxDB API token
 *   INFLUX_ORG          InfluxDB org (default: aiess)
 *   INFLUX_BUCKET       Target bucket (default: aiess_v1_1h)
 */

import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

import { resolvePriceForHour, resolveExportPrice, getSellerMargin } from './price-resolver.mjs';
import { resolveDistributionRate } from './tariff-resolver.mjs';
import { calculateHourlyFinancials, aggregateMonthly } from './financial-calculator.mjs';
import { writeHourlyToInflux, readHourlyTelemetry, createInfluxReader } from './influxdb-writer.mjs';
import { writeMonthlySummary, getCumulativeSavingsBefore } from './dynamodb-writer.mjs';

const ddb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddb);

const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';

export const handler = async (event) => {
  const mode = event.mode || 'daily';
  const targetSiteId = event.site_id || null;
  console.log(`[FinancialEngine] Mode: ${mode}, target site: ${targetSiteId || 'all'}`);

  const sites = targetSiteId
    ? [await getSiteConfig(targetSiteId)]
    : await getAllSiteConfigs();

  const results = [];

  for (const site of sites) {
    if (!site || !site.site_id) continue;

    const financial = site.financial;
    if (!financial) {
      console.warn(`[FinancialEngine] Skipping ${site.site_id}: no financial settings`);
      continue;
    }

    try {
      let result;
      switch (mode) {
        case 'daily':
          result = await runDaily(site);
          break;
        case 'recalculate':
          result = await runRecalculate(site, event);
          break;
        default:
          throw new Error(`Unknown mode: ${mode}`);
      }
      results.push({ site_id: site.site_id, status: 'ok', ...result });
    } catch (err) {
      console.error(`[FinancialEngine] Error for ${site.site_id}:`, err);
      results.push({ site_id: site.site_id, status: 'error', error: err.message });
    }
  }

  console.log(`[FinancialEngine] Done. Processed ${results.length} sites.`);
  return { mode, results };
};

// ── Mode handlers ────────────────────────────────────────────────

async function runDaily(site) {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  console.log(`[FinancialEngine] Daily calculation for ${site.site_id}: ${dateStr}`);
  return processDateRange(site, dateStr, dateStr);
}

async function runRecalculate(site, event) {
  const startDate = event.start_date;
  const endDate = event.end_date || new Date().toISOString().slice(0, 10);

  if (!startDate) {
    throw new Error('recalculate mode requires start_date in event');
  }

  console.log(`[FinancialEngine] Recalculation for ${site.site_id}: ${startDate} to ${endDate}`);
  return processDateRange(site, startDate, endDate);
}

// ── Core processing ──────────────────────────────────────────────

async function processDateRange(site, startDate, endDate) {
  const { site_id, financial: financialSettings } = site;
  const timezone = site.general?.timezone || 'Europe/Warsaw';
  const operator = financialSettings.distribution_operator;
  const tariffGroup = financialSettings.distribution_tariff_group;

  const telemetryMap = await readHourlyTelemetry(site_id, startDate, endDate);
  console.log(`[FinancialEngine] ${site_id}: Loaded ${telemetryMap.size} telemetry hours`);

  if (telemetryMap.size === 0) {
    console.warn(`[FinancialEngine] ${site_id}: No telemetry data for ${startDate} to ${endDate}`);
    return { hoursProcessed: 0, monthsWritten: 0 };
  }

  const influxReader = await createInfluxReader(startDate, endDate);
  const tariffCache = {};
  const sellerMargin = getSellerMargin(financialSettings);

  const hourlyResults = [];
  const hourlyPoints = [];

  const sortedHours = [...telemetryMap.keys()].sort();

  for (const hourKey of sortedHours) {
    const telemetry = telemetryMap.get(hourKey);
    const hour = new Date(hourKey);

    const [energyPrice, exportRate, distributionRate] = await Promise.all([
      resolvePriceForHour(hour, financialSettings, influxReader),
      resolveExportPrice(hour, financialSettings, influxReader),
      resolveDistributionRate(hour, operator, tariffGroup, tariffCache, ddb, timezone),
    ]);

    const result = calculateHourlyFinancials(telemetry, energyPrice, distributionRate, exportRate, sellerMargin);

    hourlyResults.push({ hourKey, ...result });
    hourlyPoints.push({ time: hourKey, ...result });
  }

  const WRITE_BATCH = 2000;
  for (let i = 0; i < hourlyPoints.length; i += WRITE_BATCH) {
    await writeHourlyToInflux(site_id, hourlyPoints.slice(i, i + WRITE_BATCH));
    if (i + WRITE_BATCH < hourlyPoints.length) await sleep(200);
  }

  console.log(`[FinancialEngine] ${site_id}: Wrote ${hourlyPoints.length} hourly points to InfluxDB`);

  const monthlyGroups = groupByMonth(hourlyResults);
  const sortedMonths = [...monthlyGroups.keys()].sort();
  let monthsWritten = 0;

  for (const period of sortedMonths) {
    const monthResults = monthlyGroups.get(period);

    const previousCumulative = await getCumulativeSavingsBefore(site_id, period, docClient);
    const summary = aggregateMonthly(site_id, period, monthResults, financialSettings, previousCumulative);

    await writeMonthlySummary(site_id, period, summary, docClient);
    monthsWritten++;
  }

  console.log(`[FinancialEngine] ${site_id}: Wrote ${monthsWritten} monthly summaries to DynamoDB`);

  return {
    hoursProcessed: hourlyPoints.length,
    monthsWritten,
    dateRange: { start: startDate, end: endDate },
  };
}

// ── DynamoDB helpers ─────────────────────────────────────────────

async function getSiteConfig(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: SITE_CONFIG_TABLE,
    Key: { site_id: { S: siteId } },
  }));
  return Item ? unmarshall(Item) : null;
}

async function getAllSiteConfigs() {
  const items = [];
  let lastKey;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: SITE_CONFIG_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    for (const item of (result.Items || [])) {
      items.push(unmarshall(item));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── Utility ──────────────────────────────────────────────────────

function groupByMonth(hourlyResults) {
  const groups = new Map();
  for (const result of hourlyResults) {
    const period = result.hourKey.slice(0, 7);
    if (!groups.has(period)) groups.set(period, []);
    groups.get(period).push(result);
  }
  return groups;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
