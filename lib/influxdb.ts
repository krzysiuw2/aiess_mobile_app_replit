/**
 * InfluxDB Client
 * 
 * Handles communication with InfluxDB Cloud for live energy data.
 * Uses HTTP API with Flux queries.
 */

import { LiveData } from '@/types';

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

const INFLUX_URL = process.env.EXPO_PUBLIC_INFLUX_URL || '';
const INFLUX_ORG = process.env.EXPO_PUBLIC_INFLUX_ORG || '';
const INFLUX_TOKEN = process.env.EXPO_PUBLIC_INFLUX_TOKEN || '';

/**
 * Parse InfluxDB CSV response into key-value pairs
 */
function parseInfluxCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: Record<string, string>[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;
    
    const values = line.split(',');
    
    // First non-comment line is headers
    if (headers.length === 0) {
      headers = values;
      continue;
    }

    // Parse data row
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
 * Formula: max(0, grid_power + pv_power - battery_power)
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
  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv',
    },
    body: query,
  });
  if (!response.ok) {
    if (response.status === 503) {
      console.warn('[InfluxDB] Temporary service unavailable');
    }
    throw new Error(`InfluxDB error: ${response.status}`);
  }
  const csv = await response.text();
  return parseInfluxCSV(csv);
}

function extractNumericFields(rows: Record<string, string>[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const row of rows) {
    const field = row['_field']?.trim();
    const raw = row['_value']?.trim();
    if (!field || !raw) continue;
    const num = parseFloat(raw);
    if (!isNaN(num)) values[field] = num;
  }
  return values;
}

/**
 * Fetch live data from InfluxDB for a specific site
 */
export async function fetchLiveData(siteId: string): Promise<LiveData | null> {
  if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_TOKEN) {
    console.error('[InfluxDB] Environment variables not configured');
    throw new Error('InfluxDB configuration missing');
  }

  const liveQuery = `
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
           r._field == "active_rule_power"
      )
      |> last()
  `;

  const meanQuery = (minutes: number) => `
    from(bucket: "aiess_v1")
      |> range(start: -${minutes}m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "grid_power" or r._field == "total_pv_power" or r._field == "pcs_power")
      |> mean()
  `;

  try {
    const [liveRows, avg1mRows, avg5mRows] = await Promise.all([
      runFluxQuery(liveQuery),
      runFluxQuery(meanQuery(1)).catch(() => [] as Record<string, string>[]),
      runFluxQuery(meanQuery(5)).catch(() => [] as Record<string, string>[]),
    ]);

    if (liveRows.length === 0) {
      console.warn('[InfluxDB] No data found for site:', siteId);
      return null;
    }

    // Parse live data (numeric + string _field/_value pairs)
    const numValues: Record<string, number> = {};
    const strValues: Record<string, string> = {};
    for (const row of liveRows) {
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

    const gridPower = numValues['grid_power'] ?? 0;
    const pvPower = numValues['total_pv_power'] ?? 0;
    const batteryPower = numValues['pcs_power'] ?? 0;
    const batterySoc = numValues['soc'] ?? 0;

    const activeRuleId = strValues['active_rule_id'] || undefined;
    const activeRuleAction = (strValues['active_rule_action'] || undefined) as 'ch' | 'sb' | 'dis' | undefined;
    const activeRulePower = numValues['active_rule_power'] ?? undefined;

    const factoryLoad = calculateFactoryLoad(gridPower, pvPower, batteryPower);
    const batteryStatus = getBatteryStatus(batteryPower);

    // Parse 1-min and 5-min averages
    const avg1m = extractNumericFields(avg1mRows);
    const avg5m = extractNumericFields(avg5mRows);

    const round1 = (v: number) => Math.round(v * 10) / 10;

    const gridPowerAvg1m = avg1m['grid_power'] != null ? round1(avg1m['grid_power']) : undefined;
    const gridPowerAvg5m = avg5m['grid_power'] != null ? round1(avg5m['grid_power']) : undefined;
    const pvPowerAvg1m = avg1m['total_pv_power'] != null ? round1(avg1m['total_pv_power']) : undefined;
    const pvPowerAvg5m = avg5m['total_pv_power'] != null ? round1(avg5m['total_pv_power']) : undefined;

    const factoryLoadAvg1m = avg1m['grid_power'] != null
      ? round1(calculateFactoryLoad(avg1m['grid_power'], avg1m['total_pv_power'] ?? 0, avg1m['pcs_power'] ?? 0))
      : undefined;
    const factoryLoadAvg5m = avg5m['grid_power'] != null
      ? round1(calculateFactoryLoad(avg5m['grid_power'], avg5m['total_pv_power'] ?? 0, avg5m['pcs_power'] ?? 0))
      : undefined;

    const liveData: LiveData = {
      gridPower: round1(gridPower),
      batteryPower: round1(batteryPower),
      batterySoc: Math.round(batterySoc),
      batteryStatus,
      pvPower: round1(pvPower),
      factoryLoad: round1(factoryLoad),
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
 * Execute a Flux query against InfluxDB
 */
async function queryInflux(query: string): Promise<string> {
  if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_TOKEN) {
    throw new Error('InfluxDB configuration missing');
  }

  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv',
    },
    body: query,
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Log 503 errors as warnings (transient network issues)
    if (response.status === 503) {
      console.warn('[InfluxDB] Temporary service unavailable (will retry):', response.status);
    } else {
      console.error('[InfluxDB] API error:', response.status, errorText);
    }
    throw new Error(`InfluxDB error: ${response.status}`);
  }

  return response.text();
}

/**
 * Fetch chart data for analytics
 */
export async function fetchChartData(
  siteId: string,
  timeRange: TimeRange,
  startDate?: Date
): Promise<ChartDataPoint[]> {
  const config = ANALYTICS_CONFIG[timeRange];
  
  let rangeClause: string;
  if (startDate) {
    const endDate = new Date(startDate);
    switch (timeRange) {
      case 'hour':
        endDate.setHours(endDate.getHours() + 1);
        break;
      case 'day':
      case '24h':
        endDate.setDate(endDate.getDate() + 1);
        break;
      case 'week':
      case '7d':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'month':
      case '30d':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '365d':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        endDate.setDate(endDate.getDate() + 1);
    }
    rangeClause = `range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})`;
  } else {
    rangeClause = `range(start: ${config.rangeStart})`;
  }

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

  console.log('[Analytics] Fetching chart data for:', timeRange, siteId);

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
        soc: Math.round(soc),
        factoryLoad: Math.round(calculateFactoryLoad(gridPower, pvPower, batteryPower) * 10) / 10,
        compensatedPower: Math.round(compensatedPower * 10) / 10,
        socMin: !isNaN(socMinRaw) ? Math.round(socMinRaw) : undefined,
        socMax: !isNaN(socMaxRaw) ? Math.round(socMaxRaw) : undefined,
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

  const config = ANALYTICS_CONFIG[timeRange];
  const hoursPerPoint = config.hours / Math.max(data.length, 1);

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
