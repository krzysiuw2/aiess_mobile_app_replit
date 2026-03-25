/**
 * Forecast Engine Lambda — Main Handler
 * 
 * Modes:
 *   forecast_48h  — 48-hour PV + load forecast (runs every 3h via EventBridge)
 *   forecast_7d   — 7-day PV + load forecast (runs daily via EventBridge)
 *   backfill      — Historical PV estimation + factory load reconstruction
 *   self_align             — Satellite fetch + PV reconstruction + calibration (daily at 09:00 UTC)
 *   calibration_backfill   — One-time historical backfill (pass start_date, end_date)
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
import { calculateSitePv, calculateSitePvFromSubhourly, getUniqueOrientations } from './pv-calculator.mjs';
import { writeSimulationData, readHistoricalBatteryPower, readHistoricalGridPower, readHistoricalSimulation } from './influxdb-writer.mjs';
import { buildLoadProfile, buildLoadProfileWithStdDev, buildTempCorrection, forecastLoad, computeScaleFactors } from './load-forecaster.mjs';
import { getHolidaysForRange, createClassifier } from './day-type-classifier.mjs';
import { loadEnergaFromS3, parseEnergaData } from './energa-parser.mjs';
import { runSatelliteFetch, runPvReconstruction, runCalibration, computeIntradayCorrection, runSelfAlignBackfill } from './calibration-engine.mjs';

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
        case 'self_align':
          result = await runSelfAlign(site);
          break;
        case 'calibration_backfill': {
          const startDate = event.start_date || '2025-01-01';
          const endDate = event.end_date || new Date().toISOString().slice(0, 10);
          result = await runSelfAlignBackfill(site, startDate, endDate);
          break;
        }
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

  const { hourly: weatherAllHourly, subhourly: weatherAllSubhourly } = await fetchWeatherForOrientations(location, orientationsAll, 'forecast', {
    forecastDays,
    apiKey: OPEN_METEO_API_KEY,
  });

  // Apply calibration correction from self-alignment pipeline
  const calibration = site.pv_calibration || {};
  const calFactor = (calibration.gti_correction ?? 1.0) * (calibration.pv_efficiency_correction ?? 1.0);
  if (calFactor !== 1.0) {
    console.log(`[ForecastEngine] Applying PV calibration factor ${calFactor.toFixed(4)} for ${site_id}`);
  }

  const hasSubhourly = weatherAllSubhourly.size > 0;
  const pvForecastTs = hasSubhourly
    ? calculateSitePvFromSubhourly(weatherAllSubhourly, arrays, 'all', null, calFactor)
    : calculateSitePv(weatherAllHourly, arrays, 'all', null, calFactor);

  let pvEstimatedTs = [];
  if (orientationsUnmonitored.length > 0) {
    pvEstimatedTs = hasSubhourly
      ? calculateSitePvFromSubhourly(weatherAllSubhourly, arrays, 'unmonitored_only', null, calFactor)
      : calculateSitePv(weatherAllHourly, arrays, 'unmonitored_only', null, calFactor);
  }

  if (hasSubhourly) {
    const totalSubhourlyPts = [...weatherAllSubhourly.values()].reduce((s, r) => s + r.length, 0);
    console.log(`[ForecastEngine] Using 15-min resolution for PV: ${totalSubhourlyPts} sub-hourly points`);
  }

  const weatherFirstKey = orientationsAll[0]?.key;
  const weatherRows = weatherFirstKey ? weatherAllHourly.get(weatherFirstKey) : [];

  let loadForecastTs = [];
  try {
    const { loadMap, tempMap } = await readHistoricalSimulation(site_id, 180);
    console.log(`[ForecastEngine] Load data for ${site_id}: ${loadMap.size} load points, ${tempMap.size} temp points`);
    if (loadMap.size > 168) {
      const countryCode = site.location?.country || '';
      const timezone = site.general?.timezone || '';

      const histStart = new Date(Date.now() - 180 * 86400000);
      const futureEnd = new Date(Date.now() + forecastDays * 86400000);
      const holidaySet = await getHolidaysForRange(countryCode, histStart, futureEnd);
      const classifyFn = createClassifier(holidaySet, timezone);

      const profile = buildLoadProfile(loadMap, classifyFn);
      const tempCoeffs = buildTempCorrection(loadMap, tempMap, profile, classifyFn);
      const scaleFactors = computeScaleFactors(loadMap, profile, classifyFn, 14);
      const futureWeather = (weatherRows || []).map(r => ({ time: r.time, temp: r.temp }));
      loadForecastTs = forecastLoad(profile, tempCoeffs, futureWeather, scaleFactors, classifyFn);

      const sfLog = [...scaleFactors.entries()].map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ');
      console.log(`[ForecastEngine] Load forecast: ${loadForecastTs.length} pts, peak: ${Math.max(...loadForecastTs.map(p => p.loadKw), 0).toFixed(1)} kW, holidays: ${holidaySet.size}, scale: {${sfLog}}`);

      // Intraday correction: compare recent actual PV vs forecast, adjust future hours
      try {
        const profileWithStdDev = buildLoadProfileWithStdDev(loadMap, classifyFn);
        const intradayResult = await computeIntradayCorrection(site_id, profileWithStdDev, classifyFn);
        if (intradayResult.applied) {
          const nowMs = Date.now();
          for (const pt of pvForecastTs) {
            if (new Date(pt.time).getTime() > nowMs) {
              pt.pvKw *= intradayResult.correction;
            }
          }
          for (const pt of pvEstimatedTs) {
            if (new Date(pt.time).getTime() > nowMs) {
              pt.pvKw *= intradayResult.correction;
            }
          }
          console.log(`[ForecastEngine] Intraday PV correction: ${intradayResult.correction.toFixed(3)} (from ${intradayResult.sampleCount} recent hours)`);
        }
      } catch (intradayErr) {
        console.warn(`[ForecastEngine] Intraday correction skipped: ${intradayErr.message}`);
      }
    } else {
      console.warn(`[ForecastEngine] Not enough load data for ${site_id}: ${loadMap.size} < 168 required`);
    }
  } catch (err) {
    console.warn(`[ForecastEngine] Load forecast unavailable for ${site_id}: ${err.message}`);
  }

  const pvForecastMap = new Map(pvForecastTs.map(p => [p.time, p.pvKw]));
  const pvEstimatedMap = new Map(pvEstimatedTs.map(p => [p.time, p.pvKw]));
  const loadForecastMap = new Map(loadForecastTs.map(p => [p.time, p.loadKw]));

  const points = (weatherRows || []).map(w => {
    const pvFc = pvForecastMap.get(w.time) || 0;
    const loadFc = loadForecastMap.get(w.time) || 0;
    return {
      time: w.time,
      pvEstimated: pvEstimatedMap.get(w.time) || 0,
      pvForecast: pvFc,
      loadForecast: loadFc,
      energyBalance: pvFc - loadFc,
      weatherGti: w.gti,
      weatherTemp: w.temp,
      weatherCloudCover: w.cloudCover,
      weatherCode: w.weatherCode,
      weatherWindSpeed: w.windSpeed,
    };
  });

  await writeSimulationData(site_id, 'forecast', points);

  const loadPeakKw = loadForecastTs.length > 0
    ? Math.max(...loadForecastTs.map(p => p.loadKw), 0)
    : 0;

  return {
    forecastDays,
    pointsWritten: points.length,
    pvPeakKw: Math.max(...pvForecastTs.map(p => p.pvKw), 0),
    loadPeakKw,
    loadForecastPoints: loadForecastTs.length,
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
      const { hourly: weather } = await fetchWeatherForOrientations(location, [orient], 'archive', {
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

  let gridPowerMap = new Map();
  if (!energaData) {
    try {
      gridPowerMap = await readHistoricalGridPower(site_id, startDate, endDate);
      console.log(`[Backfill] ${site_id}: Loaded ${gridPowerMap.size} grid telemetry points (no Energa data — using telemetry fallback)`);
    } catch (err) {
      console.warn(`[Backfill] No grid telemetry: ${err.message}`);
    }
  }

  const weatherFirstKey = orientations[0]?.key;
  const weatherRows = weatherFirstKey ? allWeatherRows.get(weatherFirstKey) : [];

  const points = [];
  let validationErrors = [];
  let telemetryLoadCount = 0;

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
    } else {
      const gridPower = gridPowerMap.get(w.time);
      if (gridPower != null) {
        factoryLoadCorrected = Math.max(0, gridPower + pvEst + batteryPower);
        telemetryLoadCount++;
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

  if (telemetryLoadCount > 0) {
    console.log(`[Backfill] ${site_id}: Computed ${telemetryLoadCount} factory_load_corrected from grid telemetry + archive PV estimate`);
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

async function runSelfAlign(site) {
  const { site_id } = site;
  console.log(`[SelfAlign] Starting self-alignment for ${site_id}`);

  let satellite = { skipped: true };
  let reconstruction = { pointsWritten: 0 };
  let calibration = { gti_correction: 1.0, pv_efficiency_correction: 1.0 };

  try {
    satellite = await runSatelliteFetch(site);
  } catch (err) {
    console.error(`[SelfAlign] Satellite fetch failed for ${site_id}: ${err.message}`);
    satellite = { error: err.message };
  }

  try {
    reconstruction = await runPvReconstruction(site);
  } catch (err) {
    console.error(`[SelfAlign] PV reconstruction failed for ${site_id}: ${err.message}`);
    reconstruction = { error: err.message };
  }

  try {
    calibration = await runCalibration(site);
  } catch (err) {
    console.error(`[SelfAlign] Calibration failed for ${site_id}: ${err.message}`);
    calibration = { error: err.message };
  }

  console.log(`[SelfAlign] Done for ${site_id}: satellite=${satellite.pointsWritten ?? 0} pts, reconstruction=${reconstruction.pointsWritten ?? 0} pts`);
  return { satellite, reconstruction, calibration };
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
