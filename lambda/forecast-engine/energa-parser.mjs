/**
 * Energa CSV Parser
 * 
 * Parses historical grid data from Energa smart meter exports.
 * Two CSVs per site:
 *   - consumption_data.csv: Grid import (kWh per hour, only when importing)
 *   - solar_surplus_data.csv: Grid export (kWh per hour, only when exporting)
 * 
 * These are mutually exclusive — at any given hour, only one has a non-zero value.
 * Reconstructed grid_power = consumption - production (+import, -export).
 */

import { readFileSync } from 'fs';

/**
 * Parse a single Energa CSV file into a Map of ISO timestamp -> kWh value.
 *
 * @param {string} csvContent  Raw CSV text
 * @returns {Map<string, number>}  Timestamp -> value in kWh
 */
function parseCsv(csvContent) {
  const map = new Map();
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return map;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;

    const dateStr = line.slice(0, commaIdx).trim();
    const valueStr = line.slice(commaIdx + 1).trim();
    const value = parseFloat(valueStr);

    if (isNaN(value)) continue;

    const isoTime = normalizeTimestamp(dateStr);
    if (isoTime) map.set(isoTime, value);
  }

  return map;
}

/**
 * Normalize Energa date format "2025-01-01 00:00:00" to ISO.
 */
function normalizeTimestamp(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Parse Energa consumption and production CSVs and merge into grid power.
 *
 * @param {string} consumptionCsv  Raw CSV content of consumption_data.csv
 * @param {string} productionCsv   Raw CSV content of solar_surplus_data.csv
 * @returns {{ time: string, gridPower: number, consumption: number, production: number }[]}
 *   gridPower: kW average (positive = import, negative = export)
 *   For hourly data, kWh values equal kW averages.
 */
export function parseEnergaData(consumptionCsv, productionCsv) {
  const consumption = parseCsv(consumptionCsv);
  const production = parseCsv(productionCsv);

  const allTimes = new Set([...consumption.keys(), ...production.keys()]);
  const result = [];

  for (const time of allTimes) {
    const cons = consumption.get(time) || 0;
    const prod = production.get(time) || 0;
    result.push({
      time,
      gridPower: cons - prod,
      consumption: cons,
      production: prod,
    });
  }

  result.sort((a, b) => new Date(a.time) - new Date(b.time));
  return result;
}

/**
 * Load Energa CSVs from the local filesystem (for Lambda bundled files).
 */
export function loadEnergaFromFiles(consumptionPath, productionPath) {
  const consumptionCsv = readFileSync(consumptionPath, 'utf-8');
  const productionCsv = readFileSync(productionPath, 'utf-8');
  return parseEnergaData(consumptionCsv, productionCsv);
}

/**
 * Load Energa CSVs from S3.
 */
export async function loadEnergaFromS3(s3Client, bucket, consumptionKey, productionKey) {
  const [consRes, prodRes] = await Promise.all([
    s3Client.send(new (await import('@aws-sdk/client-s3')).GetObjectCommand({
      Bucket: bucket,
      Key: consumptionKey,
    })),
    s3Client.send(new (await import('@aws-sdk/client-s3')).GetObjectCommand({
      Bucket: bucket,
      Key: productionKey,
    })),
  ]);

  const consumptionCsv = await consRes.Body.transformToString();
  const productionCsv = await prodRes.Body.transformToString();

  return parseEnergaData(consumptionCsv, productionCsv);
}
