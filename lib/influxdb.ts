/**
 * InfluxDB Client
 * 
 * Handles communication with InfluxDB Cloud for live energy data.
 * Uses HTTP API with Flux queries.
 */

import { LiveData } from '@/types';

const INFLUX_URL = process.env.EXPO_PUBLIC_INFLUX_URL;
const INFLUX_ORG = process.env.EXPO_PUBLIC_INFLUX_ORG;
const INFLUX_TOKEN = process.env.EXPO_PUBLIC_INFLUX_TOKEN;

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
  return Math.max(0, gridPower + pvPower - batteryPower);
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

/**
 * Fetch live data from InfluxDB for a specific site
 */
export async function fetchLiveData(siteId: string): Promise<LiveData | null> {
  if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_TOKEN) {
    console.error('[InfluxDB] Environment variables not configured');
    throw new Error('InfluxDB configuration missing');
  }

  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r.site_id == "${siteId}")
      |> filter(fn: (r) => r._field == "grid_power" or r._field == "total_pv_power" or r._field == "pcs_power" or r._field == "soc")
      |> last()
  `;

  try {
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
      console.error('[InfluxDB] API error:', response.status, errorText);
      throw new Error(`InfluxDB error: ${response.status}`);
    }

    const csv = await response.text();
    const rows = parseInfluxCSV(csv);

    if (rows.length === 0) {
      console.warn('[InfluxDB] No data found for site:', siteId);
      return null;
    }

    // Extract values from rows (each row is a different field)
    const values: Record<string, number> = {};
    for (const row of rows) {
      const field = row['_field'];
      const value = parseFloat(row['_value']) || 0;
      if (field) {
        values[field] = value;
      }
    }

    const gridPower = values['grid_power'] || 0;
    const pvPower = values['total_pv_power'] || 0;
    const batteryPower = values['pcs_power'] || 0;
    const batterySoc = values['soc'] || 0;

    const factoryLoad = calculateFactoryLoad(gridPower, pvPower, batteryPower);
    const batteryStatus = getBatteryStatus(batteryPower);

    const liveData: LiveData = {
      gridPower: Math.round(gridPower * 10) / 10,
      batteryPower: Math.round(batteryPower * 10) / 10,
      batterySoc: Math.round(batterySoc),
      batteryStatus,
      pvPower: Math.round(pvPower * 10) / 10,
      factoryLoad: Math.round(factoryLoad * 10) / 10,
      lastUpdate: new Date(),
    };

    console.log('[LiveData] Data received:', JSON.stringify(liveData));
    return liveData;
  } catch (error) {
    console.error('[InfluxDB] Fetch error:', error);
    throw error;
  }
}
