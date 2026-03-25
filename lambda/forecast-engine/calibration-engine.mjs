/**
 * Calibration Engine — Self-Aligning PV Forecast
 *
 * Three-layer self-calibration pipeline:
 *   Layer 1: Satellite radiation download (ground truth GTI)
 *   Layer 2: Confidence-weighted PV reconstruction from energy balance
 *   Layer 3: Rolling calibration coefficient computation
 *   Layer 3b: Near-term intraday correction
 *
 * Runs daily via the "self_align" mode in the forecast engine.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

import {
  fetchSatelliteForOrientations,
} from './open-meteo-client.mjs';
import { getUniqueOrientations } from './pv-calculator.mjs';
import {
  writeSatelliteData,
  writeReconstructedPvData,
  readSimulationField,
  readTelemetryFields,
  readHistoricalSimulation,
  readActualPvMeter,
} from './influxdb-writer.mjs';
import { buildLoadProfileWithStdDev } from './load-forecaster.mjs';
import { getHolidaysForRange, createClassifier } from './day-type-classifier.mjs';

const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || null;
const SITE_CONFIG_TABLE = process.env.SITE_CONFIG_TABLE || 'site_config';
const SATELLITE_LAG_DAYS = parseInt(process.env.SATELLITE_LAG_DAYS || '5', 10);

const ddb = new DynamoDBClient({});

// ---------------------------------------------------------------------------
// Layer 1: Satellite Radiation Download
// ---------------------------------------------------------------------------

/**
 * Fetch satellite-observed GTI for each orientation and write to InfluxDB.
 * Uses ERA5 reanalysis (satellite-assimilated) as ground truth.
 */
export async function runSatelliteFetch(site) {
  const { site_id, location, pv_system } = site;
  const arrays = pv_system?.arrays || [];
  if (!location?.latitude || !location?.longitude || arrays.length === 0) {
    return { date: null, pointsWritten: 0, skipped: true };
  }

  const targetDate = new Date(Date.now() - SATELLITE_LAG_DAYS * 86400000);
  const dateStr = targetDate.toISOString().slice(0, 10);

  const orientations = getUniqueOrientations(arrays, 'all');
  let totalPoints = 0;

  try {
    const satelliteMap = await fetchSatelliteForOrientations(
      location, orientations, dateStr, dateStr, OPEN_METEO_API_KEY,
    );

    for (const [key, rows] of satelliteMap) {
      if (rows.length > 0) {
        const daylightRows = rows.filter(r => r.satelliteGti > 0 || r.satelliteGhi > 0);
        await writeSatelliteData(site_id, rows);
        totalPoints += rows.length;
        console.log(`[Calibration] Satellite ${site_id}/${key}: ${rows.length} total, ${daylightRows.length} daylight`);
      }
    }
  } catch (err) {
    console.error(`[Calibration] Satellite fetch failed for ${site_id}: ${err.message}`);
    return { date: dateStr, pointsWritten: 0, error: err.message };
  }

  console.log(`[Calibration] Satellite fetch for ${site_id}: ${totalPoints} points for ${dateStr}`);
  return { date: dateStr, pointsWritten: totalPoints };
}

// ---------------------------------------------------------------------------
// Layer 2: Confidence-Weighted PV Reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstruct actual PV from energy balance for yesterday.
 * Confidence is scored by load predictability (std_dev relative to PV magnitude).
 * Works for any operating schedule — not hardcoded to weekends.
 */
export async function runPvReconstruction(site) {
  const { site_id, location } = site;
  const timezone = site.general?.timezone || 'UTC';
  const countryCode = location?.country || '';

  const targetDate = new Date(Date.now() - 86400000);
  const dateStr = targetDate.toISOString().slice(0, 10);

  const { loadMap } = await readHistoricalSimulation(site_id, 180);
  if (loadMap.size < 168) {
    console.warn(`[Calibration] Insufficient load data for ${site_id}: ${loadMap.size} points`);
    return { date: dateStr, pointsWritten: 0 };
  }

  const histStart = new Date(Date.now() - 180 * 86400000);
  const futureEnd = new Date(Date.now() + 86400000);
  const holidaySet = await getHolidaysForRange(countryCode, histStart, futureEnd);
  const classifyFn = createClassifier(holidaySet, timezone);

  const profileWithStdDev = buildLoadProfileWithStdDev(loadMap, classifyFn);

  const [telemetry, pvForecastMap] = await Promise.all([
    readTelemetryFields(site_id, dateStr, dateStr),
    readSimulationField(site_id, 'pv_estimated', 'forecast', 3),
  ]);

  const points = [];

  for (const [hourKey, { gridPower, pcsPower }] of telemetry) {
    if (hourKey.slice(0, 10) !== dateStr) continue;

    const { dayType, localHour } = classifyFn(hourKey);
    const profileData = profileWithStdDev.get(`${dayType}_${localHour}`);
    if (!profileData) continue;

    const expectedLoad = profileData.median;
    const loadStdDev = profileData.stdDev;
    const pvEstimate = pvForecastMap.get(hourKey) || 0;

    // Energy balance: PV = factory_load - grid_import - battery_charge
    const pvReconstructed = Math.max(0, expectedLoad - gridPower - pcsPower);

    const pvDenominator = Math.max(pvEstimate, pvReconstructed, 1);
    const confidence = 1 / (1 + loadStdDev / pvDenominator);

    if (pvEstimate > 0.1 || pvReconstructed > 0.5) {
      points.push({
        time: hourKey,
        pvReconstructed: Math.round(pvReconstructed * 100) / 100,
        pvConfidence: Math.round(confidence * 1000) / 1000,
      });
    }
  }

  if (points.length > 0) {
    await writeReconstructedPvData(site_id, points);
  }

  const avgConf = points.length > 0
    ? (points.reduce((s, p) => s + p.pvConfidence, 0) / points.length).toFixed(3)
    : 'n/a';
  console.log(`[Calibration] PV reconstruction for ${site_id}: ${points.length} pts, avg_confidence=${avgConf}`);
  return { date: dateStr, pointsWritten: points.length, avgConfidence: parseFloat(avgConf) || 0 };
}

// ---------------------------------------------------------------------------
// Layer 3: Rolling Calibration Coefficients
// ---------------------------------------------------------------------------

/**
 * Compute GTI and PV model correction factors from accumulated ground truth,
 * then write to DynamoDB site_config.pv_calibration.
 */
export async function runCalibration(site) {
  const { site_id } = site;

  const [satelliteGtiMap, forecastGtiMap, pvReconstructedMap, pvConfidenceMap, pvForecastMap] =
    await Promise.all([
      readSimulationField(site_id, 'satellite_gti', 'satellite', 30),
      readSimulationField(site_id, 'weather_gti', 'forecast', 30),
      readSimulationField(site_id, 'pv_reconstructed', 'reconstructed', 60),
      readSimulationField(site_id, 'pv_confidence', 'reconstructed', 60),
      readSimulationField(site_id, 'pv_estimated', 'forecast', 60),
    ]);

  const gtiResult = computeGtiCorrection(satelliteGtiMap, forecastGtiMap, 0.05);
  const pvResult = computePvCorrection(pvReconstructedMap, pvConfidenceMap, pvForecastMap, 0.03);

  const calibration = {
    gti_correction: round4(gtiResult.factor),
    pv_efficiency_correction: round4(pvResult.factor),
    last_calibrated: new Date().toISOString().slice(0, 10),
    gti_sample_count: gtiResult.sampleCount,
    pv_sample_count: pvResult.sampleCount,
    gti_confidence: round3(gtiResult.confidence),
    pv_confidence: round3(pvResult.confidence),
  };

  await writeCalibrationToConfig(site_id, calibration);

  console.log(
    `[Calibration] ${site_id}: GTI=${calibration.gti_correction} (n=${gtiResult.sampleCount}), ` +
    `PV=${calibration.pv_efficiency_correction} (n=${pvResult.sampleCount})`,
  );
  return calibration;
}

function computeGtiCorrection(satelliteMap, forecastMap, alpha) {
  const now = Date.now();
  let weightedSum = 0;
  let weightSum = 0;
  let count = 0;

  for (const [hourKey, satelliteGti] of satelliteMap) {
    const forecastGti = forecastMap.get(hourKey);
    if (!forecastGti || forecastGti < 10 || satelliteGti < 10) continue;

    const ratio = satelliteGti / forecastGti;
    if (ratio < 0.3 || ratio > 3.0) continue;

    const daysAgo = (now - new Date(hourKey).getTime()) / 86400000;
    const weight = Math.exp(-alpha * daysAgo);

    weightedSum += ratio * weight;
    weightSum += weight;
    count++;
  }

  if (count < 10) {
    return { factor: 1.0, sampleCount: count, confidence: 0 };
  }

  return {
    factor: clamp(weightedSum / weightSum, 0.5, 1.5),
    sampleCount: count,
    confidence: Math.min(1, count / 100),
  };
}

function computePvCorrection(pvReconstructedMap, pvConfidenceMap, pvForecastMap, alpha) {
  const now = Date.now();
  let weightedSum = 0;
  let weightSum = 0;
  let count = 0;

  for (const [hourKey, pvReconstructed] of pvReconstructedMap) {
    const pvForecast = pvForecastMap.get(hourKey);
    const pvConfidence = pvConfidenceMap.get(hourKey) || 0;

    if (!pvForecast || pvForecast < 1 || pvReconstructed < 1) continue;
    if (pvConfidence < 0.3) continue;

    const ratio = pvReconstructed / pvForecast;
    if (ratio < 0.1 || ratio > 5.0) continue;

    const daysAgo = (now - new Date(hourKey).getTime()) / 86400000;
    const weight = pvConfidence * Math.exp(-alpha * daysAgo);

    weightedSum += ratio * weight;
    weightSum += weight;
    count++;
  }

  if (count < 10) {
    return { factor: 1.0, sampleCount: count, confidence: 0 };
  }

  return {
    factor: clamp(weightedSum / weightSum, 0.3, 2.0),
    sampleCount: count,
    confidence: Math.min(1, count / 200),
  };
}

// ---------------------------------------------------------------------------
// Backfill: Historical Calibration Data Population
// ---------------------------------------------------------------------------

/**
 * Backfill satellite radiation for a date range (ERA5 archive available from 1940).
 * Chunks the range into 90-day requests to respect API limits.
 * Idempotent — re-running overwrites the same timestamps.
 */
export async function runSatelliteBackfill(site, startDate, endDate) {
  const { site_id, location, pv_system } = site;
  const arrays = pv_system?.arrays || [];
  if (!location?.latitude || !location?.longitude || arrays.length === 0) {
    return { pointsWritten: 0, skipped: true };
  }

  const orientations = getUniqueOrientations(arrays, 'all');
  const start = new Date(startDate);
  const end = new Date(endDate);
  const MAX_CHUNK_DAYS = 90;
  let totalPoints = 0;

  for (const orientation of orientations) {
    let chunkStart = new Date(start);
    while (chunkStart < end) {
      const chunkEnd = new Date(Math.min(
        chunkStart.getTime() + MAX_CHUNK_DAYS * 86400000,
        end.getTime(),
      ));
      const startStr = chunkStart.toISOString().slice(0, 10);
      const endStr = chunkEnd.toISOString().slice(0, 10);

      console.log(`[CalibrationBackfill] Satellite ${site_id}/${orientation.key}: ${startStr} → ${endStr}`);
      try {
        const satelliteMap = await fetchSatelliteForOrientations(
          location, [orientation], startStr, endStr, OPEN_METEO_API_KEY,
        );
        for (const [, rows] of satelliteMap) {
          if (rows.length > 0) {
            await writeSatelliteData(site_id, rows);
            totalPoints += rows.length;
          }
        }
      } catch (err) {
        console.error(`[CalibrationBackfill] Satellite chunk failed ${startStr}→${endStr}: ${err.message}`);
      }

      chunkStart = new Date(chunkEnd.getTime() + 86400000);
      await sleep(300);
    }
  }

  console.log(`[CalibrationBackfill] Satellite backfill for ${site_id}: ${totalPoints} total points`);
  return { pointsWritten: totalPoints };
}

/**
 * Backfill PV reconstruction for a date range.
 *
 * Two modes depending on what data is available:
 *   1. Real PV meter (total_pv_power_mean in telemetry) — confidence=1.0, used directly
 *   2. Energy balance reconstruction — confidence scored by load_std_dev as normal
 *
 * Processes day-by-day to avoid huge InfluxDB range queries.
 */
export async function runPvReconstructionBackfill(site, startDate, endDate) {
  const { site_id, location } = site;
  const timezone = site.general?.timezone || 'UTC';
  const countryCode = location?.country || '';

  const { loadMap } = await readHistoricalSimulation(site_id, 365);
  if (loadMap.size < 168) {
    console.warn(`[CalibrationBackfill] Insufficient load data for ${site_id}`);
    return { pointsWritten: 0 };
  }

  const histStart = new Date(Date.now() - 365 * 86400000);
  const futureEnd = new Date();
  const holidaySet = await getHolidaysForRange(countryCode, histStart, futureEnd);
  const classifyFn = createClassifier(holidaySet, timezone);
  const profileWithStdDev = buildLoadProfileWithStdDev(loadMap, classifyFn);

  // Check if site has real PV meter readings available
  const pvMeterMap = await readActualPvMeter(site_id, startDate, endDate);
  const hasPvMeter = pvMeterMap.size > 0;

  if (hasPvMeter) {
    console.log(`[CalibrationBackfill] ${site_id}: PV meter data available (${pvMeterMap.size} points) — using direct readings`);
  } else {
    console.log(`[CalibrationBackfill] ${site_id}: No PV meter — using energy balance reconstruction`);
  }

  const [telemetry, pvForecastMap] = await Promise.all([
    readTelemetryFields(site_id, startDate, endDate),
    readSimulationField(site_id, 'pv_estimated', 'forecast', 365),
  ]);

  const points = [];

  for (const [hourKey, { gridPower, pcsPower }] of telemetry) {
    if (hourKey < startDate || hourKey > endDate + 'T23:59:59Z') continue;

    // Mode 1: Direct PV meter reading — highest possible confidence
    const pvMeterReading = pvMeterMap.get(hourKey);
    if (hasPvMeter && pvMeterReading != null) {
      if (pvMeterReading > 0.1) {
        points.push({
          time: hourKey,
          pvReconstructed: Math.round(pvMeterReading * 100) / 100,
          pvConfidence: 1.0,
        });
      }
      continue;
    }

    // Mode 2: Energy balance reconstruction
    const { dayType, localHour } = classifyFn(hourKey);
    const profileData = profileWithStdDev.get(`${dayType}_${localHour}`);
    if (!profileData) continue;

    const pvEstimate = pvForecastMap.get(hourKey) || 0;
    const pvReconstructed = Math.max(0, profileData.median - gridPower - pcsPower);
    const pvDenominator = Math.max(pvEstimate, pvReconstructed, 1);
    const confidence = 1 / (1 + profileData.stdDev / pvDenominator);

    if (pvEstimate > 0.1 || pvReconstructed > 0.5) {
      points.push({
        time: hourKey,
        pvReconstructed: Math.round(pvReconstructed * 100) / 100,
        pvConfidence: Math.round(confidence * 1000) / 1000,
      });
    }
  }

  // Write in batches of 2000
  const BATCH = 2000;
  for (let i = 0; i < points.length; i += BATCH) {
    await writeReconstructedPvData(site_id, points.slice(i, i + BATCH));
    await sleep(200);
  }

  const avgConf = points.length > 0
    ? (points.reduce((s, p) => s + p.pvConfidence, 0) / points.length).toFixed(3)
    : 'n/a';
  console.log(`[CalibrationBackfill] PV reconstruction for ${site_id}: ${points.length} pts, avg_confidence=${avgConf}, pvMeter=${hasPvMeter}`);
  return { pointsWritten: points.length, avgConfidence: parseFloat(avgConf) || 0, usedPvMeter: hasPvMeter };
}

/**
 * Full calibration backfill: satellite + reconstruction + recalibrate.
 * Invoke manually or as a one-time job after deploying to an existing site.
 */
export async function runSelfAlignBackfill(site, startDate, endDate) {
  const { site_id } = site;
  console.log(`[CalibrationBackfill] Starting full backfill for ${site_id}: ${startDate} → ${endDate}`);

  const satellite = await runSatelliteBackfill(site, startDate, endDate);
  const reconstruction = await runPvReconstructionBackfill(site, startDate, endDate);
  const calibration = await runCalibration(site);

  console.log(`[CalibrationBackfill] Done for ${site_id}: satellite=${satellite.pointsWritten} pts, reconstruction=${reconstruction.pointsWritten} pts`);
  return { satellite, reconstruction, calibration };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Layer 3b: Intraday Forecast Correction
// ---------------------------------------------------------------------------

/**
 * Compare recent actual PV (from energy balance) against forecast.
 * Returns a correction multiplier for remaining afternoon hours.
 *
 * @param {string} siteId
 * @param {Map<string, { median: number, stdDev: number }>} loadProfileWithStdDev
 * @param {(dateStr: string) => { dayType: string, localHour: number }} classifyFn
 * @returns {{ correction: number, sampleCount: number, applied: boolean }}
 */
export async function computeIntradayCorrection(siteId, loadProfileWithStdDev, classifyFn) {
  const today = new Date().toISOString().slice(0, 10);

  const [telemetry, pvForecastMap] = await Promise.all([
    readTelemetryFields(siteId, today, today),
    readSimulationField(siteId, 'pv_estimated', 'forecast', 1),
  ]);

  const now = Date.now();
  const threeHoursAgo = now - 3 * 3600000;

  let ratioSum = 0;
  let ratioCount = 0;

  for (const [hourKey, { gridPower, pcsPower }] of telemetry) {
    const hourTime = new Date(hourKey).getTime();
    if (hourTime < threeHoursAgo || hourTime > now) continue;

    const { dayType, localHour } = classifyFn(hourKey);
    const profileData = loadProfileWithStdDev.get(`${dayType}_${localHour}`);
    if (!profileData) continue;

    const pvActual = Math.max(0, profileData.median - gridPower - pcsPower);
    const pvForecast = pvForecastMap.get(hourKey) || 0;

    if (pvForecast > 1 && pvActual > 0.5) {
      ratioSum += pvActual / pvForecast;
      ratioCount++;
    }
  }

  if (ratioCount < 2) {
    return { correction: 1.0, sampleCount: 0, applied: false };
  }

  const recentRatio = ratioSum / ratioCount;
  // Blend toward 1.0 to avoid over-correcting on sparse data
  const correction = 0.6 * recentRatio + 0.4;

  return {
    correction: clamp(Math.round(correction * 1000) / 1000, 0.3, 2.0),
    sampleCount: ratioCount,
    applied: true,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB helpers
// ---------------------------------------------------------------------------

async function writeCalibrationToConfig(siteId, calibration) {
  const calMap = {};
  for (const [key, value] of Object.entries(calibration)) {
    if (typeof value === 'number') {
      calMap[key] = { N: String(value) };
    } else if (typeof value === 'string') {
      calMap[key] = { S: value };
    }
  }

  await ddb.send(new UpdateItemCommand({
    TableName: SITE_CONFIG_TABLE,
    Key: { site_id: { S: siteId } },
    UpdateExpression: 'SET pv_calibration = :cal',
    ExpressionAttributeValues: {
      ':cal': { M: calMap },
    },
  }));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function round4(v) { return Math.round(v * 10000) / 10000; }
function round3(v) { return Math.round(v * 1000) / 1000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
