/**
 * InfluxDB HTTP Client for fetching live energy data
 * 
 * Uses the InfluxDB v2 API with Flux queries
 * Returns data in CSV format which is parsed into JavaScript objects
 * 
 * Bucket: aiess_v1
 * Measurement: energy_telemetry
 * Fields: grid_power, pcs_power, soc, total_pv_power, compensated_power
 */

const INFLUX_URL = process.env.EXPO_PUBLIC_INFLUX_URL!;
const INFLUX_ORG = process.env.EXPO_PUBLIC_INFLUX_ORG!;
const INFLUX_TOKEN = process.env.EXPO_PUBLIC_INFLUX_TOKEN!;

// InfluxDB configuration
const INFLUX_BUCKET = 'aiess_v1';
const INFLUX_MEASUREMENT = 'energy_telemetry';

export interface InfluxLiveData {
  gridPower: number;      // grid_power: + = importing, - = exporting
  batteryPower: number;   // pcs_power: + = charging, - = discharging
  batterySoc: number;     // soc: 0-100%
  pvPower: number;        // total_pv_power: solar generation
  compensatedPower: number; // compensated_power
  timestamp: Date;
}

/**
 * Parse InfluxDB CSV response into structured data
 * InfluxDB returns CSV with columns including _field and _value
 */
function parseInfluxCSV(csv: string): Record<string, number> {
  const lines = csv.trim().split('\n');
  const result: Record<string, number> = {};
  
  if (lines.length < 2) {
    console.log('[InfluxDB] No data in response');
    return result;
  }
  
  // Find the header line (contains column names)
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('_field') && lines[i].includes('_value')) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    console.warn('[InfluxDB] Could not find header row');
    return result;
  }
  
  const headers = lines[headerIndex].split(',');
  const fieldIndex = headers.indexOf('_field');
  const valueIndex = headers.indexOf('_value');
  
  if (fieldIndex === -1 || valueIndex === -1) {
    console.warn('[InfluxDB] Could not find _field or _value columns');
    return result;
  }
  
  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    
    const values = line.split(',');
    if (values.length <= Math.max(fieldIndex, valueIndex)) continue;
    
    const field = values[fieldIndex];
    const value = parseFloat(values[valueIndex]);
    
    if (field && !isNaN(value)) {
      result[field] = value;
    }
  }
  
  return result;
}

/**
 * Fetch live data from InfluxDB for a specific device
 * 
 * @param siteId - The device's site_id (e.g., "domagala_1")
 */
export async function fetchLiveData(siteId: string): Promise<InfluxLiveData> {
  console.log('[InfluxDB] Fetching live data for site:', siteId);
  
  // Flux query to get the latest values for each field
  const query = `
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "${INFLUX_MEASUREMENT}")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc" or r._field == "total_pv_power" or r._field == "compensated_power")
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
      console.error('[InfluxDB] Query failed:', response.status, errorText);
      throw new Error(`InfluxDB query failed: ${response.status}`);
    }
    
    const csv = await response.text();
    console.log('[InfluxDB] CSV response length:', csv.length);
    
    const data = parseInfluxCSV(csv);
    console.log('[InfluxDB] Parsed data:', data);
    
    return {
      gridPower: data.grid_power ?? 0,
      batteryPower: data.pcs_power ?? 0,
      batterySoc: data.soc ?? 0,
      pvPower: data.total_pv_power ?? 0,
      compensatedPower: data.compensated_power ?? 0,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[InfluxDB] Error fetching live data:', error);
    throw error;
  }
}

/**
 * Calculate factory load from live data
 * Formula: max(0, grid_power + total_pv_power - pcs_power)
 * 
 * Explanation:
 * - grid_power: + = importing from grid, - = exporting to grid
 * - pcs_power (battery): + = charging, - = discharging  
 * - total_pv_power: always positive (solar generation)
 * - factory_load: consumption = what comes in (grid + pv) minus what goes to battery
 */
export function calculateFactoryLoad(
  gridPower: number,
  pvPower: number,
  batteryPower: number
): number {
  const factoryLoad = gridPower + pvPower - batteryPower;
  return Math.max(0, factoryLoad);
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
