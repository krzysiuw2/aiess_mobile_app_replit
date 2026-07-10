/**
 * InfluxDB Client
 * 
 * Handles communication with InfluxDB Cloud for live energy data.
 * Uses HTTP API with Flux queries.
 */

import { LiveData, SimulationDataPoint, BatteryLiveData, BatteryDetailData } from '@/types';
import { parseCsvToNumbers } from '@/lib/batteryHealth';
import { callInfluxProxy } from '@/lib/edge-proxy';

// Analytics Types
export interface ChartDataPoint {
  time: Date;
  gridPower: number;
  batteryPower: number;
  pvPower: number;
  soc: number;
  factoryLoad: number;
  compensatedPower: number;
  socMin?: number;
  socMax?: number;
}

export interface EnergyStats {
  gridImport: number;    // kWh imported from grid
  gridExport: number;    // kWh exported to grid
  charged: number;       // kWh charged into battery
  discharged: number;    // kWh discharged from battery
  avgSoc: number;        // Average SoC %
  pvProduction: number;  // kWh PV production
}

export type TimeRange = 'hour' | 'day' | 'week' | 'month' | '24h' | '7d' | '30d' | '365d';

// Bucket configuration for analytics
const ANALYTICS_CONFIG: Record<string, {
  bucket: string;
  aggregation: string | null;
  fieldSuffix: string;
  rangeStart: string;
  window: string;
  hours: number;
}> = {
  // Legacy format (hour/day/week/month)
  hour: {
    bucket: 'aiess_v1_1m',
    aggregation: '1m',
    fieldSuffix: '_mean',
    rangeStart: '-1h',
    window: '1m',
    hours: 1,
  },
  day: {
    bucket: 'aiess_v1_1m',
    aggregation: '1m',
    fieldSuffix: '_mean',
    rangeStart: '-24h',
    window: '5m',
    hours: 24,
  },
  week: {
    bucket: 'aiess_v1_15m',
    aggregation: '15m',
    fieldSuffix: '_mean',
    rangeStart: '-7d',
    window: '1h',
    hours: 168,
  },
  month: {
    bucket: 'aiess_v1_1h',
    aggregation: '1h',
    fieldSuffix: '_mean',
    rangeStart: '-30d',
    window: '6h',
    hours: 720,
  },
  // New format (24h/7d/30d/365d)
  '24h': {
    bucket: 'aiess_v1_1m',
    aggregation: '1m',
    fieldSuffix: '_mean',
    rangeStart: '-24h',
    window: '5m',
    hours: 24,
  },
  '7d': {
    bucket: 'aiess_v1_15m',
    aggregation: '15m',
    fieldSuffix: '_mean',
    rangeStart: '-7d',
    window: '1h',
    hours: 168,
  },
  '30d': {
    bucket: 'aiess_v1_1h',
    aggregation: '1h',
    fieldSuffix: '_mean',
    rangeStart: '-30d',
    window: '6h',
    hours: 720,
  },
  '365d': {
    bucket: 'aiess_v1_1h',
    aggregation: '1h',
    fieldSuffix: '_mean',
    rangeStart: '-365d',
    window: '1d',
    hours: 8760,
  },
};


/**
 * Split a CSV line respecting quoted fields (handles embedded commas/newlines).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse InfluxDB CSV response into key-value pairs
 */
function parseInfluxCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: Record<string, string>[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const values = splitCsvLine(line);

    if (headers.length === 0) {
      headers = values;
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    results.push(row);
  }

  return results;
}

/**
 * Calculate factory load from power values
 * Formula: max(0, grid_power + pv_power + battery_power)
 */
export function calculateFactoryLoad(gridPower: number, pvPower: number, batteryPower: number): number {
  // Energy balance: Grid + PV = Factory + Battery(charging)
  // When battery charges (negative), it's a load like factory
  // When battery discharges (positive), it's a source like PV
  return Math.max(0, gridPower + pvPower + batteryPower);
}

/**
 * Determine battery status from power value
 * pcs_power: - = charging (power going into battery), + = discharging (power coming out)
 */
export function getBatteryStatus(batteryPower: number): 'Charging' | 'Discharging' | 'Standby' {
  if (batteryPower < -0.5) return 'Charging';
  if (batteryPower > 0.5) return 'Discharging';
  return 'Standby';
}

async function runFluxQuery(query: string): Promise<Record<string, string>[]> {
  const csv = await callInfluxProxy(query);
  return parseInfluxCSV(csv);
}

/**
 * Fetch live data from InfluxDB for a specific site
 */
export async function fetchLiveData(siteId: string): Promise<LiveData | null> {

  // Single raw query over the last 5 minutes covering every field the live
  // monitor needs. Latest values and the 1-min / 5-min means are all derived
  // client-side from this one result set, instead of issuing three separate
  // (billable) Flux queries on every 5-second refresh.
  const windowQuery = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) =>
           r._field == "grid_power" or
           r._field == "total_pv_power" or
           r._field == "pcs_power" or
           r._field == "soc" or
           r._field == "active_rule_id" or
           r._field == "active_rule_action" or
           r._field == "active_rule_power" or
           r._field == "control_source" or
           r._field == "operator_source" or
           r._field == "override_id" or
           r._field == "plan_state" or
           r._field == "plan_id" or
           r._field == "plan_revision" or
           r._field == "plan_age_sec" or
           r._field == "capped_by" or
           r._field == "pv_curtail_active" or
           r._field == "pv_curtail_export_kw_max"
      )
      |> sort(columns: ["_time"])
  `;

  try {
    // pv_estimated is hourly data, so it is cached and refreshed at most once
    // every few minutes rather than on every live refresh.
    const [windowRows, pvEstimated] = await Promise.all([
      runFluxQuery(windowQuery),
      getPvEstimatedCached(siteId),
    ]);

    if (windowRows.length === 0) {
      console.warn('[InfluxDB] No data found for site:', siteId);
      return null;
    }

    // Latest value per field (rows are sorted ascending by _time, so the last
    // write wins) plus timestamped samples for the mean fields.
    const numValues: Record<string, number> = {};
    const strValues: Record<string, string> = {};
    const meanFields = ['grid_power', 'total_pv_power', 'pcs_power'];
    const points: Record<string, { t: number; v: number }[]> = {
      grid_power: [],
      total_pv_power: [],
      pcs_power: [],
    };

    let maxTime = 0;
    for (const row of windowRows) {
      const field = row['_field']?.trim();
      const raw = row['_value']?.trim();
      if (!field || !raw) continue;
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        numValues[field] = num;
        if (meanFields.includes(field)) {
          const t = Date.parse(row['_time'] ?? '');
          points[field].push({ t: isNaN(t) ? 0 : t, v: num });
          if (!isNaN(t) && t > maxTime) maxTime = t;
        }
      } else {
        strValues[field] = raw;
      }
    }

    // Reference the most recent sample (not the client clock) for the 1-min
    // window so client/server clock skew can't drop or add points.
    const oneMinAgo = maxTime - 60_000;
    const meanOver = (field: string, sinceMs: number): number | undefined => {
      const pts = points[field].filter(p => p.t >= sinceMs);
      if (pts.length === 0) return undefined;
      return pts.reduce((sum, p) => sum + p.v, 0) / pts.length;
    };

    const gridPower = numValues['grid_power'] ?? 0;
    const pvPower = numValues['total_pv_power'] ?? 0;
    const batteryPower = numValues['pcs_power'] ?? 0;
    const batterySoc = numValues['soc'] ?? 0;

    const activeRuleId = strValues['active_rule_id'] || undefined;
    const activeRuleAction = (strValues['active_rule_action'] || undefined) as 'ch' | 'sb' | 'dis' | undefined;
    const activeRulePower = numValues['active_rule_power'] ?? undefined;

    // Decision telemetry (v1.1.0). All fields are optional — the forwarder
    // mapping is rolling out separately, so absence is expected and must
    // simply yield undefined (never a parse failure).
    const controlSource = (strValues['control_source'] || undefined) as
      import('@/types').ControlSource | undefined;
    const operatorSource = (strValues['operator_source'] || undefined) as
      import('@/types').OperatorSource | undefined;
    const overrideId = strValues['override_id'] || undefined;
    const planState = (strValues['plan_state'] || undefined) as
      import('@/types').PlanState | undefined;
    const planId = strValues['plan_id'] || undefined;
    const planRevision = numValues['plan_revision'] ?? undefined;
    const planAgeSec = numValues['plan_age_sec'] ?? undefined;
    const cappedBy = strValues['capped_by'] || undefined;
    // Booleans can land as true/false strings or 0/1 numbers depending on the
    // line-protocol writer; accept both.
    const pvCurtailRaw = strValues['pv_curtail_active'] ?? (
      numValues['pv_curtail_active'] !== undefined
        ? String(numValues['pv_curtail_active'])
        : undefined
    );
    const pvCurtailActive = pvCurtailRaw !== undefined
      ? pvCurtailRaw === 'true' || pvCurtailRaw === '1'
      : undefined;
    const pvCurtailExportKwMax = numValues['pv_curtail_export_kw_max'] ?? undefined;

    const batteryStatus = getBatteryStatus(batteryPower);

    const round1 = (v: number) => Math.round(v * 10) / 10;

    // 1-min and 5-min means computed client-side from the single window result.
    const avg1mGrid = meanOver('grid_power', oneMinAgo);
    const avg5mGrid = meanOver('grid_power', 0);
    const avg1mPv = meanOver('total_pv_power', oneMinAgo);
    const avg5mPv = meanOver('total_pv_power', 0);
    const avg1mBatt = meanOver('pcs_power', oneMinAgo);
    const avg5mBatt = meanOver('pcs_power', 0);

    const gridPowerAvg1m = avg1mGrid != null ? round1(avg1mGrid) : undefined;
    const gridPowerAvg5m = avg5mGrid != null ? round1(avg5mGrid) : undefined;
    const pvPowerAvg1m = avg1mPv != null ? round1(avg1mPv) : undefined;
    const pvPowerAvg5m = avg5mPv != null ? round1(avg5mPv) : undefined;

    const factoryLoadAvg1m = avg1mGrid != null
      ? round1(calculateFactoryLoad(avg1mGrid, avg1mPv ?? 0, avg1mBatt ?? 0))
      : undefined;
    const factoryLoadAvg5m = avg5mGrid != null
      ? round1(calculateFactoryLoad(avg5mGrid, avg5mPv ?? 0, avg5mBatt ?? 0))
      : undefined;

    const pvTotal = round1(pvPower + pvEstimated);
    const correctedFactoryLoad = calculateFactoryLoad(gridPower, pvTotal, batteryPower);

    const liveData: LiveData = {
      gridPower: round1(gridPower),
      batteryPower: round1(batteryPower),
      batterySoc: round1(batterySoc),
      batteryStatus,
      pvPower: round1(pvPower),
      pvEstimated: round1(pvEstimated),
      pvTotal,
      factoryLoad: round1(correctedFactoryLoad),
      lastUpdate: new Date(),
      activeRuleId,
      activeRuleAction,
      activeRulePower,
      gridPowerAvg1m,
      gridPowerAvg5m,
      pvPowerAvg1m,
      pvPowerAvg5m,
      factoryLoadAvg1m,
      factoryLoadAvg5m,
      controlSource,
      operatorSource,
      overrideId,
      planState,
      planId,
      planRevision,
      planAgeSec,
      cappedBy,
      pvCurtailActive,
      pvCurtailExportKwMax,
    };

    console.log('[LiveData] Data received:', JSON.stringify(liveData));
    return liveData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('503')) {
      console.warn('[InfluxDB] Transient error (auto-retry enabled):', error.message);
    } else {
      console.error('[InfluxDB] Fetch error:', error);
    }
    throw error;
  }
}

/**
 * Execute a Flux query against InfluxDB via edge proxy
 */
async function queryInflux(query: string): Promise<string> {
  return callInfluxProxy(query);
}

/**
 * Compute calendar-aligned period boundaries for a given date and range.
 * - 24h: midnight of that day  ->  next midnight
 * - 7d:  midnight of that day  ->  +7 days midnight
 * - 30d: 1st of that month 00:00  ->  1st of next month 00:00
 * - 365d: Jan 1 of that year 00:00  ->  Jan 1 of next year 00:00
 * Always returns the full period regardless of current time.
 */
function computePeriodRange(selectedDate: Date, timeRange: TimeRange): { start: Date; stop: Date } {
  const s = new Date(selectedDate);
  const e = new Date(selectedDate);

  switch (timeRange) {
    case 'hour':
      s.setMinutes(0, 0, 0);
      e.setMinutes(0, 0, 0);
      e.setHours(e.getHours() + 1);
      break;
    case 'day':
    case '24h':
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      e.setDate(e.getDate() + 1);
      break;
    case 'week':
    case '7d':
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      e.setDate(e.getDate() + 7);
      break;
    case 'month':
    case '30d':
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      e.setDate(1);
      e.setHours(0, 0, 0, 0);
      e.setMonth(e.getMonth() + 1);
      break;
    case '365d':
      s.setMonth(0, 1);
      s.setHours(0, 0, 0, 0);
      e.setMonth(0, 1);
      e.setHours(0, 0, 0, 0);
      e.setFullYear(e.getFullYear() + 1);
      break;
    default:
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      e.setDate(e.getDate() + 1);
  }

  return { start: s, stop: e };
}

/**
 * Fetch chart data for analytics
 */
export async function fetchChartData(
  siteId: string,
  timeRange: TimeRange,
  selectedDate: Date
): Promise<ChartDataPoint[]> {
  const config = ANALYTICS_CONFIG[timeRange];

  const { start, stop } = computePeriodRange(selectedDate, timeRange);
  const rangeClause = `range(start: ${start.toISOString()}, stop: ${stop.toISOString()})`;

  const aggFilter = config.aggregation 
    ? `|> filter(fn: (r) => r.aggregation == "${config.aggregation}")` 
    : '';

  const socMinMaxFields = config.fieldSuffix
    ? `or r._field == "soc_min" or r._field == "soc_max"`
    : '';

  const query = `
    from(bucket: "${config.bucket}")
      |> ${rangeClause}
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      ${aggFilter}
      |> filter(fn: (r) => 
          r._field == "grid_power${config.fieldSuffix}" or 
          r._field == "pcs_power${config.fieldSuffix}" or 
          r._field == "total_pv_power${config.fieldSuffix}" or 
          r._field == "soc${config.fieldSuffix}" or
          r._field == "compensated_power${config.fieldSuffix}"
          ${socMinMaxFields}
      )
      |> aggregateWindow(every: ${config.window}, fn: mean, createEmpty: false)
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  console.log('[Analytics] Fetching chart data:', timeRange, siteId, 'range:', start.toISOString(), '->', stop.toISOString());

  try {
    const csv = await queryInflux(query);
    const rows = parseInfluxCSV(csv);

    console.log('[Analytics] Received', rows.length, 'data points');

    return rows.map(row => {
      const gridPower = parseFloat(row[`grid_power${config.fieldSuffix}`]) || 0;
      const batteryPower = parseFloat(row[`pcs_power${config.fieldSuffix}`]) || 0;
      const pvPower = parseFloat(row[`total_pv_power${config.fieldSuffix}`]) || 0;
      const soc = parseFloat(row[`soc${config.fieldSuffix}`]) || 0;
      const compensatedPower = parseFloat(row[`compensated_power${config.fieldSuffix}`]) || 0;
      const socMinRaw = parseFloat(row['soc_min']);
      const socMaxRaw = parseFloat(row['soc_max']);

      return {
        time: new Date(row['_time']),
        gridPower: Math.round(gridPower * 10) / 10,
        batteryPower: Math.round(batteryPower * 10) / 10,
        pvPower: Math.round(pvPower * 10) / 10,
        soc: Math.round(soc * 10) / 10,
        factoryLoad: Math.round(calculateFactoryLoad(gridPower, pvPower, batteryPower) * 10) / 10,
        compensatedPower: Math.round(compensatedPower * 10) / 10,
        socMin: !isNaN(socMinRaw) ? Math.round(socMinRaw * 10) / 10 : undefined,
        socMax: !isNaN(socMaxRaw) ? Math.round(socMaxRaw * 10) / 10 : undefined,
      };
    }).sort((a, b) => a.time.getTime() - b.time.getTime());
  } catch (error) {
    console.error('[Analytics] Error fetching chart data:', error);
    throw error;
  }
}

/**
 * Calculate energy statistics from chart data
 * Energy (kWh) = Average Power (kW) × Time (hours) / Data Points
 */
export function calculateEnergyStats(data: ChartDataPoint[], timeRange: TimeRange): EnergyStats {
  if (data.length === 0) {
    return {
      gridImport: 0,
      gridExport: 0,
      charged: 0,
      discharged: 0,
      avgSoc: 0,
      pvProduction: 0,
    };
  }

  // Compute actual time span from the data rather than assuming fixed hours,
  // since partial periods (e.g. "today" at 10 AM) have fewer hours.
  const firstTime = data[0].time.getTime();
  const lastTime = data[data.length - 1].time.getTime();
  const actualHours = Math.max((lastTime - firstTime) / 3_600_000, 0.1);
  const hoursPerPoint = actualHours / Math.max(data.length, 1);

  let gridImportSum = 0;
  let gridExportSum = 0;
  let chargedSum = 0;
  let dischargedSum = 0;
  let socSum = 0;
  let pvSum = 0;

  for (const point of data) {
    // Grid: positive = import, negative = export
    if (point.gridPower > 0) {
      gridImportSum += point.gridPower;
    } else {
      gridExportSum += Math.abs(point.gridPower);
    }

    // Battery: positive = discharge, negative = charge
    if (point.batteryPower > 0) {
      dischargedSum += point.batteryPower;
    } else {
      chargedSum += Math.abs(point.batteryPower);
    }

    socSum += point.soc;
    pvSum += point.pvPower;
  }

  // Convert average power to energy (kWh)
  return {
    gridImport: Math.round(gridImportSum * hoursPerPoint * 10) / 10,
    gridExport: Math.round(gridExportSum * hoursPerPoint * 10) / 10,
    charged: Math.round(chargedSum * hoursPerPoint * 10) / 10,
    discharged: Math.round(dischargedSum * hoursPerPoint * 10) / 10,
    avgSoc: Math.round(socSum / data.length),
    pvProduction: Math.round(pvSum * hoursPerPoint * 10) / 10,
  };
}

// ─── Simulation / Forecast Data ─────────────────────────────────

/**
 * Fetch the latest pv_estimated value from the simulation measurement.
 * Used by fetchLiveData to augment real-time PV when arrays are unmonitored.
 */
async function fetchLatestPvEstimated(siteId: string): Promise<number> {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: -6h)
      |> filter(fn: (r) => r._measurement == "energy_simulation")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "pv_estimated")
      |> last()
  `;

  try {
    const rows = await runFluxQuery(query);
    const val = rows.find(r => r['_field'] === 'pv_estimated');
    return val ? parseFloat(val['_value']) || 0 : 0;
  } catch {
    return 0;
  }
}

// pv_estimated comes from hourly simulation data, so there is no value in
// re-querying it on every 5s live refresh. Cache it per site and refresh at
// most once per TTL window to cut query-count on the hot live path.
const PV_ESTIMATED_TTL_MS = 5 * 60 * 1000;
const pvEstimatedCache: Record<string, { value: number; ts: number }> = {};

async function getPvEstimatedCached(siteId: string): Promise<number> {
  const now = Date.now();
  const cached = pvEstimatedCache[siteId];
  if (cached && now - cached.ts < PV_ESTIMATED_TTL_MS) return cached.value;
  const value = await fetchLatestPvEstimated(siteId);
  pvEstimatedCache[siteId] = { value, ts: now };
  return value;
}

/**
 * Fetch simulation data (forecasts / backfill) for charts.
 */
export async function fetchSimulationData(
  siteId: string,
  startDate: Date,
  endDate: Date,
): Promise<SimulationDataPoint[]> {
  const query = `
    from(bucket: "aiess_v1_1h")
      |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
      |> filter(fn: (r) => r._measurement == "energy_simulation")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  try {
    const csv = await queryInflux(query);
    const rows = parseInfluxCSV(csv);

    return rows
      .map(row => {
        const time = new Date(row['_time']);
        if (isNaN(time.getTime())) return null;
        return {
          time,
          pvEstimated: parseFloat(row['pv_estimated']) || 0,
          pvForecast: parseFloat(row['pv_forecast']) || 0,
          loadForecast: parseFloat(row['load_forecast']) || 0,
          factoryLoadCorrected: parseFloat(row['factory_load_corrected']) || 0,
          energyBalance: parseFloat(row['energy_balance']) || parseFloat(row['estimated_surplus']) || 0,
          weatherGti: parseFloat(row['weather_gti']) || 0,
          weatherTemp: parseFloat(row['weather_temp']) || 0,
          weatherCloudCover: parseFloat(row['weather_cloud_cover']) || 0,
          weatherCode: parseInt(row['weather_code']) || 0,
          weatherWindSpeed: parseFloat(row['weather_wind_speed']) || 0,
          source: (row['source'] as 'forecast' | 'backfill' | 'satellite') || 'forecast',
        };
      })
      .filter((p): p is SimulationDataPoint => p !== null)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  } catch (error) {
    console.error('[Simulation] Error fetching simulation data:', error);
    return [];
  }
}

// ─── Battery Live Data (Tier 1 — 5s telemetry) ─────────────────

export async function fetchBatteryLiveData(siteId: string): Promise<BatteryLiveData | null> {

  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -1m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) =>
           r._field == "min_cell_voltage_mv" or
           r._field == "max_cell_voltage_mv" or
           r._field == "voltage_delta_mv" or
           r._field == "min_cell_temp_c" or
           r._field == "max_cell_temp_c" or
           r._field == "active_faults" or
           r._field == "active_fault_count"
      )
      |> last()
  `;

  try {
    const rows = await runFluxQuery(query);
    if (rows.length === 0) return null;

    const numValues: Record<string, number> = {};
    const strValues: Record<string, string> = {};
    for (const row of rows) {
      const field = row['_field']?.trim();
      const raw = row['_value']?.trim();
      if (!field || !raw) continue;
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        numValues[field] = num;
      } else {
        strValues[field] = raw;
      }
    }

    return {
      minCellVoltage: numValues['min_cell_voltage_mv'] ?? 0,
      maxCellVoltage: numValues['max_cell_voltage_mv'] ?? 0,
      voltageDelta: numValues['voltage_delta_mv'] ?? 0,
      minCellTemp: numValues['min_cell_temp_c'] ?? 0,
      maxCellTemp: numValues['max_cell_temp_c'] ?? 0,
      activeFaults: strValues['active_faults'] || '',
      activeFaultCount: numValues['active_fault_count'] ?? 0,
      lastUpdate: new Date(),
    };
  } catch (error) {
    console.error('[BatteryLive] Error fetching battery live data:', error);
    throw error;
  }
}

// ─── Battery Detail Data (Tier 2 — 60s detail) ─────────────────

export async function fetchBatteryDetail(siteId: string): Promise<BatteryDetailData | null> {

  const query = `
    from(bucket: "battery_detail")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) =>
           r._field == "stack_voltage_v" or
           r._field == "stack_current_a" or
           r._field == "stack_soc_percent" or
           r._field == "stack_soh_percent" or
           r._field == "stack_wm" or
           r._field == "cell_count" or
           r._field == "cell_voltage_min" or
           r._field == "cell_voltage_max" or
           r._field == "cell_voltage_delta" or
           r._field == "cell_voltage_csv" or
           r._field == "ntc_count" or
           r._field == "cell_temp_min" or
           r._field == "cell_temp_max" or
           r._field == "cell_temp_csv"
      )
      |> last()
  `;

  try {
    const rows = await runFluxQuery(query);
    if (rows.length === 0) {
      console.warn('[BatteryDetail] No data from battery_detail bucket (token may lack read access — check bucket permissions)');
      return null;
    }

    const STRING_FIELDS = new Set(['cell_voltage_csv', 'cell_temp_csv', 'active_faults']);
    const numValues: Record<string, number> = {};
    const strValues: Record<string, string> = {};
    for (const row of rows) {
      const field = row['_field']?.trim();
      const raw = row['_value']?.trim();
      if (!field || !raw) continue;
      if (STRING_FIELDS.has(field)) {
        strValues[field] = raw;
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          numValues[field] = num;
        } else {
          strValues[field] = raw;
        }
      }
    }

    return {
      stackVoltage: numValues['stack_voltage_v'] ?? 0,
      stackCurrent: numValues['stack_current_a'] ?? 0,
      stackSoc: numValues['stack_soc_percent'] ?? 0,
      stackSoh: numValues['stack_soh_percent'] ?? 0,
      workingMode: (numValues['stack_wm'] ?? 0) as import('@/types').BatteryWorkingMode,
      cellCount: numValues['cell_count'] ?? 0,
      cellVoltageMin: numValues['cell_voltage_min'] ?? 0,
      cellVoltageMax: numValues['cell_voltage_max'] ?? 0,
      cellVoltageDelta: numValues['cell_voltage_delta'] ?? 0,
      cellVoltages: parseCsvToNumbers(strValues['cell_voltage_csv'] || ''),
      ntcCount: numValues['ntc_count'] ?? 0,
      cellTempMin: numValues['cell_temp_min'] ?? 0,
      cellTempMax: numValues['cell_temp_max'] ?? 0,
      cellTemps: parseCsvToNumbers(strValues['cell_temp_csv'] || ''),
      lastUpdate: new Date(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('404')) {
      console.error('[BatteryDetail] 404 — app token lacks read access to battery_detail bucket. Update token permissions in InfluxDB Cloud UI.');
    } else {
      console.error('[BatteryDetail] Error:', msg);
    }
    return null;
  }
}

// TGE Price types
export interface TgePricePoint {
  // Stored "Warsaw-as-Z" timestamp: its UTC fields equal the Warsaw wall clock
  // (see lib/tge-time.ts and aiess-architecture contracts/tge-prices.md).
  time: Date;
  price: number; // PLN/MWh
}

// TGE rows use the Warsaw-as-Z convention; pad the query window by +/-3h so DST
// edges and the offset between stored and true UTC never clip a delivery day.
const TGE_PAD_MS = 3 * 60 * 60 * 1000;

async function fetchTgePricesFromMeasurement(
  measurement: 'energy_prices' | 'energy_prices_15m',
  startDate: Date,
  endDate: Date,
): Promise<TgePricePoint[]> {
  const start = new Date(startDate.getTime() - TGE_PAD_MS).toISOString();
  const stop = new Date(endDate.getTime() + TGE_PAD_MS).toISOString();

  // Filter on source == "real": the energy_prices measurement also holds
  // source=predicted forecast rows that must never be mixed into the actuals.
  const query = `
    from(bucket: "tge_energy_prices")
      |> range(start: ${start}, stop: ${stop})
      |> filter(fn: (r) => r._measurement == "${measurement}" and r._field == "price" and r.source == "real")
      |> sort(columns: ["_time"])
  `;

  try {
    const csv = await queryInflux(query);
    const rows = parseInfluxCSV(csv);

    return rows
      .map(row => {
        const time = new Date(row['_time']);
        if (isNaN(time.getTime())) return null;
        return {
          time,
          price: parseFloat(row['_value']) || 0,
        };
      })
      .filter((p): p is TgePricePoint => p !== null)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  } catch (error) {
    console.error(`[TGE] Error fetching ${measurement}:`, error);
    return [];
  }
}

/**
 * Fetch hourly TGE RDN energy prices (energy_prices, source=real) for a range.
 * 24 points/delivery day. Includes future prices when published.
 */
export async function fetchTgePrices(
  startDate: Date,
  endDate: Date,
): Promise<TgePricePoint[]> {
  return fetchTgePricesFromMeasurement('energy_prices', startDate, endDate);
}

/**
 * Fetch canonical 15-minute TGE RDN energy prices (energy_prices_15m,
 * source=real) for a range. 96 points/delivery day since the 2026-06 cutover.
 * Pre-cutover days have no 15-min rows; callers fall back to the hourly series.
 */
export async function fetchTgePrices15m(
  startDate: Date,
  endDate: Date,
): Promise<TgePricePoint[]> {
  return fetchTgePricesFromMeasurement('energy_prices_15m', startDate, endDate);
}
