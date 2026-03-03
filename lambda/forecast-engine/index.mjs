/**
 * Forecast Engine Lambda — Main Handler
 * 
 * Modes:
 *   forecast_48h  — 48-hour PV + load forecast (runs every 3h via EventBridge)
 *   forecast_7d   — 7-day PV + load forecast (runs daily via EventBridge)
 *   backfill      — Historical PV estimation + factory load reconstruction
 * 
 * Environment variables:
 *   SITE_CONFIG_TABLE   DynamoDB table name (default: site_config)
 *   INFLUX_URL          InfluxDB Cloud URL
 *   INFLUX_TOKEN        InfluxDB API token
 *   INFLUX_ORG          InfluxDB org (default: aiess)
 *   INFLUX_BUCKET       Target bucket (default: aiess_v1_1h)
 *   OPEN_METEO_API_KEY  Optional commercial API key
 *   ENERGA_S3_BUCKET    S3 bucket for Energa CSV files (backfill only)
 */

import { DynamoDBClient, ScanCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

import { fetchWeatherForOrientations } from './open-meteo-client.mjs';
import { calculateSitePv, getUniqueOrientations } from './pv-calculator.mjs';
import { writeSimulationData, readHistoricalBatteryPower, readHistoricalSimulation } from './influxdb-writer.mjs';
import { buildLoadProfile, buildTempCorrection, forecastLoad, computeScaleFactor } from './load-forecaster.mjs';
import { loadEnergaFromS3, parseEnergaData } from './energa-parser.mjs';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});

const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';
const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || null;
const ENERGA_S3_BUCKET = process.env.ENERGA_S3_BUCKET || '';

export const handler = async (event) => {
  const mode = event.mode || 'forecast_48h';
  const targetSiteId = event.site_id || null;
  console.log(`[ForecastEngine] Mode: ${mode}, target site: ${targetSiteId || 'all'}`);

  const sites = targetSiteId
    ? [await getSiteConfig(targetSiteId)]
    : await getAllSiteConfigs();

  const results = [];

  for (const site of sites) {
    if (!site || !site.site_id) continue;
    const location = site.location;
    if (!location?.latitude || !location?.longitude) {
      console.warn(`[ForecastEngine] Skipping ${site.site_id}: no GPS coordinates`);
      continue;
    }

    const arrays = site.pv_system?.arrays || [];
    if (arrays.length === 0) {
      console.warn(`[ForecastEngine] Skipping ${site.site_id}: no PV arrays configured`);
      continue;
    }

    try {
      let result;
      switch (mode) {
        case 'forecast_48h':
          result = await runForecast(site, 3);
          break;
        case 'forecast_7d':
          result = await runForecast(site, 7);
          break;
        case 'backfill':
          result = await runBackfill(site, event);
          break;
        default:
          throw new Error(`Unknown mode: ${mode}`);
      }
      results.push({ site_id: site.site_id, status: 'ok', ...result });
    } catch (err) {
      console.error(`[ForecastEngine] Error for ${site.site_id}:`, err);
      results.push({ site_id: site.site_id, status: 'error', error: err.message });
    }
  }

  console.log(`[ForecastEngine] Done. Processed ${results.length} sites.`);
  return { mode, results };
};

async function runForecast(site, forecastDays) {
  const { site_id, location, pv_system, inverter } = site;
  const arrays = pv_system?.arrays || [];

  const orientationsAll = getUniqueOrientations(arrays, 'all');
  const orientationsUnmonitored = getUniqueOrientations(arrays, 'unmonitored_only');

  const weatherAll = await fetchWeatherForOrientations(location, orientationsAll, 'forecast', {
    forecastDays,
    apiKey: OPEN_METEO_API_KEY,
  });

  const pvForecastTs = calculateSitePv(weatherAll, arrays, 'all');

  let pvEstimatedTs = [];
  if (orientationsUnmonitored.length > 0) {
    pvEstimatedTs = calculateSitePv(weatherAll, arrays, 'unmonitored_only');
  }

  const weatherFirstKey = orientationsAll[0]?.key;
  const weatherRows = weatherFirstKey ? weatherAll.get(weatherFirstKey) : [];

  let loadForecastTs = [];
  try {
    const { loadMap, tempMap } = await readHistoricalSimulation(site_id, 90);
    console.log(`[ForecastEngine] Load data for ${site_id}: ${loadMap.size} load points, ${tempMap.size} temp points`);
    if (loadMap.size > 168) {
      const profile = buildLoadProfile(loadMap);
      const tempCoeffs = buildTempCorrection(loadMap, tempMap, profile);
      const scaleFactor = computeScaleFactor(loadMap, profile, 7);
      const futureWeather = (weatherRows || []).map(r => ({ time: r.time, temp: r.temp }));
      loadForecastTs = forecastLoad(profile, tempCoeffs, futureWeather, scaleFactor);
      console.log(`[ForecastEngine] Load forecast: ${loadForecastTs.length} points, peak: ${Math.max(...loadForecastTs.map(p => p.loadKw), 0).toFixed(1)} kW`);
    } else {
      console.warn(`[ForecastEngine] Not enough load data for ${site_id}: ${loadMap.size} < 168 required`);
    }
  } catch (err) {
    console.warn(`[ForecastEngine] Load forecast unavailable for ${site_id}: ${err.message}`);
  }

  const pvForecastMap = new Map(pvForecastTs.map(p => [p.time, p.pvKw]));
  const pvEstimatedMap = new Map(pvEstimatedTs.map(p => [p.time, p.pvKw]));
  const loadForecastMap = new Map(loadForecastTs.map(p => [p.time, p.loadKw]));

  const points = (weatherRows || []).map(w => ({
    time: w.time,
    pvEstimated: pvEstimatedMap.get(w.time) || 0,
    pvForecast: pvForecastMap.get(w.time) || 0,
    loadForecast: loadForecastMap.get(w.time) || 0,
    weatherGti: w.gti,
    weatherTemp: w.temp,
    weatherCloudCover: w.cloudCover,
    weatherCode: w.weatherCode,
    weatherWindSpeed: w.windSpeed,
  }));

  await writeSimulationData(site_id, 'forecast', points);

  return {
    forecastDays,
    pointsWritten: points.length,
    pvPeakKw: Math.max(...pvForecastTs.map(p => p.pvKw), 0),
  };
}

async function runBackfill(site, event) {
  const { site_id, location, pv_system } = site;
  const arrays = pv_system?.arrays || [];
  const startDate = event.start_date || '2025-01-01';
  const endDate = event.end_date || new Date().toISOString().slice(0, 10);

  const orientations = getUniqueOrientations(arrays, 'unmonitored_only');
  if (orientations.length === 0) {
    return { message: 'No unmonitored arrays to backfill' };
  }

  console.log(`[Backfill] ${site_id}: Fetching archive weather ${startDate} to ${endDate}`);

  const maxDaysPerChunk = 90;
  let allWeatherRows = new Map();

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const orient of orientations) {
    const allRows = [];
    let chunkStart = new Date(start);
    while (chunkStart < end) {
      const chunkEnd = new Date(Math.min(chunkStart.getTime() + maxDaysPerChunk * 86400000, end.getTime()));
      const chunkStartStr = chunkStart.toISOString().slice(0, 10);
      const chunkEndStr = chunkEnd.toISOString().slice(0, 10);

      console.log(`[Backfill] Fetching ${orient.key} chunk: ${chunkStartStr} - ${chunkEndStr}`);
      const weather = await fetchWeatherForOrientations(location, [orient], 'archive', {
        startDate: chunkStartStr,
        endDate: chunkEndStr,
        apiKey: OPEN_METEO_API_KEY,
      });
      const rows = weather.get(orient.key) || [];
      allRows.push(...rows);

      chunkStart = new Date(chunkEnd.getTime() + 86400000);
      await sleep(500);
    }
    allWeatherRows.set(orient.key, allRows);
  }

  const pvEstimatedTs = calculateSitePv(allWeatherRows, arrays, 'unmonitored_only');
  const pvMap = new Map(pvEstimatedTs.map(p => [p.time, p.pvKw]));

  let energaData = null;
  if (event.energa_data) {
    try {
      if (event.energa_csv_content) {
        energaData = parseEnergaData(
          event.energa_csv_content.consumption,
          event.energa_csv_content.production
        );
      } else if (ENERGA_S3_BUCKET && event.energa_data.consumption_key) {
        energaData = await loadEnergaFromS3(
          s3,
          ENERGA_S3_BUCKET,
          event.energa_data.consumption_key,
          event.energa_data.production_key
        );
      }
    } catch (err) {
      console.warn(`[Backfill] Could not load Energa data: ${err.message}`);
    }
  }

  const energaMap = new Map();
  if (energaData) {
    for (const row of energaData) {
      energaMap.set(row.time, row);
    }
  }

  let batteryPowerMap = new Map();
  try {
    batteryPowerMap = await readHistoricalBatteryPower(site_id, startDate, endDate);
  } catch (err) {
    console.warn(`[Backfill] No battery history: ${err.message}`);
  }

  const weatherFirstKey = orientations[0]?.key;
  const weatherRows = weatherFirstKey ? allWeatherRows.get(weatherFirstKey) : [];

  const points = [];
  let validationErrors = [];

  for (const w of (weatherRows || [])) {
    const pvEst = pvMap.get(w.time) || 0;

    let factoryLoadCorrected = null;

    const energaRow = energaMap.get(w.time);
    const batteryPower = batteryPowerMap.get(w.time) ?? 0;

    if (energaRow) {
      factoryLoadCorrected = Math.max(0, energaRow.gridPower + pvEst + batteryPower);

      if (energaRow.production > 0 && pvEst > 0) {
        const impliedPvMin = energaRow.production;
        const error = pvEst - impliedPvMin;
        if (Math.abs(error) > pvEst * 0.5) {
          validationErrors.push({ time: w.time, pvEst, exportKw: energaRow.production, error });
        }
      }
    }

    points.push({
      time: w.time,
      pvEstimated: pvEst,
      factoryLoadCorrected,
      weatherGti: w.gti,
      weatherTemp: w.temp,
      weatherCloudCover: w.cloudCover,
      weatherCode: w.weatherCode,
      weatherWindSpeed: w.windSpeed,
    });
  }

  const WRITE_BATCH = 2000;
  for (let i = 0; i < points.length; i += WRITE_BATCH) {
    await writeSimulationData(site_id, 'backfill', points.slice(i, i + WRITE_BATCH));
    await sleep(200);
  }

  const pvTotal = pvEstimatedTs.reduce((sum, p) => sum + p.pvKw, 0);
  const pvPeak = Math.max(...pvEstimatedTs.map(p => p.pvKw), 0);

  console.log(`[Backfill] ${site_id}: ${points.length} points written, PV peak=${pvPeak.toFixed(1)}kW, validation errors=${validationErrors.length}`);

  return {
    pointsWritten: points.length,
    pvPeakKw: pvPeak,
    pvTotalKwh: Math.round(pvTotal),
    validationErrors: validationErrors.slice(0, 10),
  };
}

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
