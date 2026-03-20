import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const INFLUX_URL = process.env.INFLUX_URL || 'https://eu-central-1-1.aws.cloud2.influxdata.com';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'aiess';
const TARIFF_TABLE = process.env.TARIFF_TABLE || 'aiess_tariff_data';
const ROUND_TRIP_EFFICIENCY = 0.90;

// ─── InfluxDB Helpers ───────────────────────────────────────────

async function fluxQuery(query) {
  const res = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: 'POST',
    headers: { Authorization: `Token ${INFLUX_TOKEN}`, 'Content-Type': 'application/vnd.flux', Accept: 'application/csv' },
    body: query,
  });
  if (!res.ok) throw new Error(`InfluxDB ${res.status}: ${await res.text()}`);
  return res.text();
}

function parseCsv(csv) {
  const lines = csv.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = vals[i]?.trim(); });
    return obj;
  });
}

// ─── Data Fetchers ──────────────────────────────────────────────

async function fetchTgePrices(siteId, hoursAhead = 48) {
  const q = `
    from(bucket: "aiess_v1")
      |> range(start: -1h, stop: ${hoursAhead}h)
      |> filter(fn: (r) => r._measurement == "tge_rdn_prices")
      |> filter(fn: (r) => r._field == "price_pln_mwh")
      |> sort(columns: ["_time"])
  `;
  const csv = await fluxQuery(q);
  const rows = parseCsv(csv);
  return rows.map(r => ({
    time: r._time,
    hour: new Date(r._time).getHours(),
    price_pln_mwh: parseFloat(r._value) || 0,
    price_pln_kwh: (parseFloat(r._value) || 0) / 1000,
  }));
}

async function fetchForecasts(siteId, hoursAhead = 48) {
  const bucket = 'aiess_v1';
  const q = `
    import "date"
    from(bucket: "${bucket}")
      |> range(start: -1h, stop: ${hoursAhead}h)
      |> filter(fn: (r) => r.site_id == "${siteId}" and r._measurement == "energy_forecast")
      |> filter(fn: (r) => r._field == "pv_forecast_kw" or r._field == "load_forecast_kw")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;
  try {
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    return rows.map(r => ({
      time: r._time,
      hour: new Date(r._time).getHours(),
      pv_kw: parseFloat(r.pv_forecast_kw) || 0,
      load_kw: parseFloat(r.load_forecast_kw) || 0,
    }));
  } catch {
    return [];
  }
}

async function fetchCurrentSoc(siteId) {
  const q = `
    from(bucket: "aiess_v1")
      |> range(start: -5m)
      |> filter(fn: (r) => r.site_id == "${siteId}" and r._measurement == "energy_telemetry")
      |> filter(fn: (r) => r._field == "soc")
      |> last()
  `;
  try {
    const csv = await fluxQuery(q);
    const rows = parseCsv(csv);
    return rows.length > 0 ? parseFloat(rows[0]._value) : 50;
  } catch {
    return 50;
  }
}

async function fetchTariffData(operator, tariffGroup) {
  const year = new Date().getFullYear();
  const pk = `TARIFF#${operator}#${tariffGroup}`;
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: TARIFF_TABLE,
    Key: marshall({ PK: pk, SK: String(year) }),
  }));
  return Item ? unmarshall(Item) : null;
}

// ─── Price Window Optimizer ─────────────────────────────────────

function optimizePriceWindows(prices, config) {
  const {
    battery_capacity_kwh = 100,
    current_soc = 50,
    max_charge_kw = 50,
    max_discharge_kw = 50,
    safety_soc_min = 10,
    safety_soc_max = 95,
    backup_reserve_pct = 20,
  } = config;

  if (prices.length === 0) return { charge_windows: [], discharge_windows: [] };

  const effectiveMin = Math.max(safety_soc_min, backup_reserve_pct);
  const usableCapacity = battery_capacity_kwh * (safety_soc_max - effectiveMin) / 100;

  const sorted = [...prices].sort((a, b) => a.price_pln_mwh - b.price_pln_mwh);
  const median = sorted[Math.floor(sorted.length / 2)]?.price_pln_mwh || 0;

  const chargeHoursNeeded = Math.ceil(usableCapacity / max_charge_kw);
  const dischargeHoursNeeded = Math.ceil(usableCapacity / max_discharge_kw);

  const cheapest = sorted.slice(0, chargeHoursNeeded);
  const mostExpensive = [...sorted].reverse().slice(0, dischargeHoursNeeded);

  const avgChargePrice = cheapest.reduce((s, p) => s + p.price_pln_mwh, 0) / (cheapest.length || 1);
  const avgDischargePrice = mostExpensive.reduce((s, p) => s + p.price_pln_mwh, 0) / (mostExpensive.length || 1);

  const profitableSpread = avgDischargePrice - (avgChargePrice / ROUND_TRIP_EFFICIENCY);
  if (profitableSpread <= 0) {
    return { charge_windows: [], discharge_windows: [], arbitrage_not_profitable: true };
  }

  const charge_windows = groupConsecutiveHours(cheapest).map(group => ({
    start: formatHour(group[0].hour),
    end: formatHour((group[group.length - 1].hour + 1) % 24),
    avg_price_pln_mwh: group.reduce((s, p) => s + p.price_pln_mwh, 0) / group.length,
    recommended_power_kw: max_charge_kw,
  }));

  const discharge_windows = groupConsecutiveHours(mostExpensive).map(group => ({
    start: formatHour(group[0].hour),
    end: formatHour((group[group.length - 1].hour + 1) % 24),
    avg_price_pln_mwh: group.reduce((s, p) => s + p.price_pln_mwh, 0) / group.length,
    recommended_power_kw: max_discharge_kw,
  }));

  const estimatedArbitrage = usableCapacity * (avgDischargePrice - avgChargePrice / ROUND_TRIP_EFFICIENCY) / 1000;

  return { charge_windows, discharge_windows, estimated_arbitrage_pln: estimatedArbitrage };
}

// ─── PV Self-Consumption Calculator ─────────────────────────────

function calculatePvSelfConsumption(forecasts, config) {
  const {
    battery_capacity_kwh = 100,
    current_soc = 50,
    max_charge_kw = 50,
    export_allowed = true,
    safety_soc_max = 95,
  } = config;

  let soc = current_soc;
  const maxSocKwh = battery_capacity_kwh * safety_soc_max / 100;
  const pv_surplus_windows = [];
  let totalSurplus = 0;
  let totalSelfConsumed = 0;

  for (const f of forecasts) {
    const surplus = f.pv_kw - f.load_kw;
    if (surplus > 0) {
      const currentKwh = battery_capacity_kwh * soc / 100;
      const canCharge = Math.min(surplus, max_charge_kw, maxSocKwh - currentKwh);

      if (canCharge > 0) {
        soc += (canCharge / battery_capacity_kwh) * 100;
        totalSelfConsumed += canCharge;
      }

      totalSurplus += surplus;
      pv_surplus_windows.push({
        start: formatHour(f.hour),
        end: formatHour((f.hour + 1) % 24),
        surplus_kw: Math.round(surplus * 10) / 10,
      });
    }
  }

  return {
    pv_surplus_windows: groupSurplusWindows(pv_surplus_windows),
    total_surplus_kwh: Math.round(totalSurplus * 10) / 10,
    self_consumed_kwh: Math.round(totalSelfConsumed * 10) / 10,
  };
}

// ─── Peak Shaving Calculator ────────────────────────────────────

function calculatePeakShaving(forecasts, config) {
  const {
    moc_zamowiona_kw,
    target_grid_kw,
    max_discharge_kw = 50,
    battery_capacity_kwh = 100,
    safety_margin_pct = 3,
  } = config;

  if (!target_grid_kw && !moc_zamowiona_kw) {
    return { peak_shaving_needed: false };
  }

  const limit = target_grid_kw || moc_zamowiona_kw;
  const safeLimit = limit * (1 - safety_margin_pct / 100);

  const windows = [];
  let peakNeeded = false;

  for (const f of forecasts) {
    if (f.load_kw > safeLimit) {
      peakNeeded = true;
      const overshoot = f.load_kw - safeLimit;
      const dischargePower = Math.min(overshoot, max_discharge_kw);
      windows.push({
        start: formatHour(f.hour),
        end: formatHour((f.hour + 1) % 24),
        target_grid_kw: Math.round(safeLimit),
        discharge_needed_kw: Math.round(dischargePower),
      });
    }
  }

  return {
    peak_shaving_needed: peakNeeded,
    peak_shaving_windows: groupPeakWindows(windows),
    safe_limit_kw: Math.round(safeLimit),
  };
}

// ─── Bell Curve Compliance ──────────────────────────────────────

function calculateBellCurve(config) {
  const {
    export_follows_sun = false,
    pv_peak_kw = 50,
    latitude = 52,
  } = config;

  if (!export_follows_sun) return { bell_curve_active: false };

  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400_000);
  const solarNoon = 12;
  const dayLength = 8 + 6 * Math.sin((dayOfYear - 80) / 365 * 2 * Math.PI);
  const sunrise = solarNoon - dayLength / 2;
  const sunset = solarNoon + dayLength / 2;

  const limits = [];
  for (let h = 0; h < 24; h++) {
    if (h < sunrise || h > sunset) {
      limits.push({ hour: h, max_export_kw: 0 });
    } else {
      const normalized = (h - sunrise) / (sunset - sunrise);
      const bellValue = Math.sin(normalized * Math.PI);
      const maxExport = Math.round(pv_peak_kw * bellValue * 10) / 10;
      limits.push({ hour: h, max_export_kw: Math.max(1, maxExport) });
    }
  }

  return { bell_curve_active: true, bell_curve_limits: limits };
}

// ─── Distribution Tariff Zone Mapper ────────────────────────────

async function mapTariffZones(config) {
  const { distribution_operator, distribution_tariff_group } = config;
  if (!distribution_operator || !distribution_tariff_group) return { zones: [] };

  const tariffData = await fetchTariffData(distribution_operator, distribution_tariff_group);
  if (!tariffData?.zones) return { zones: [] };

  const now = new Date();
  const dayOfWeek = now.getDay();
  const scheduleKey = dayOfWeek === 0 ? 'sunday_holiday' : dayOfWeek === 6 ? 'saturday' : 'weekday';

  const hourlyZones = [];
  for (let h = 0; h < 24; h++) {
    const hourStr = `${String(h).padStart(2, '0')}:00`;
    let zone = tariffData.zones[0];

    for (const z of tariffData.zones) {
      if (z.schedule?.[scheduleKey]?.includes(hourStr)) {
        zone = z;
        break;
      }
    }

    hourlyZones.push({
      hour: h,
      zone_name: zone.name,
      rate_pln_kwh: zone.rate_pln_kwh,
    });
  }

  return { zones: hourlyZones, tariff_data: tariffData };
}

// ─── Safety Constraint Validator ────────────────────────────────

function validateConstraints(schedule, config) {
  const {
    safety_soc_min = 5,
    safety_soc_max = 100,
    max_charge_kw = 50,
    max_discharge_kw = 50,
    grid_capacity_kva,
    export_allowed = true,
    export_buffer_kw = 1,
    import_safety_margin_pct = 3,
  } = config;

  const constraints = [];
  const violations = [];

  constraints.push(`SoC range: ${safety_soc_min}% – ${safety_soc_max}%`);
  constraints.push(`Max charge: ${max_charge_kw} kW`);
  constraints.push(`Max discharge: ${max_discharge_kw} kW`);

  if (!export_allowed) {
    constraints.push(`Export not allowed (buffer: ${export_buffer_kw} kW)`);
  }

  if (grid_capacity_kva) {
    const safeImport = grid_capacity_kva * (1 - import_safety_margin_pct / 100);
    constraints.push(`Grid import limit: ${Math.round(safeImport)} kW (${import_safety_margin_pct}% margin on ${grid_capacity_kva} kVA)`);
  }

  return { constraints_applied: constraints, violations };
}

// ─── Utility Functions ──────────────────────────────────────────

function formatHour(h) {
  return `${String(h % 24).padStart(2, '0')}:00`;
}

function groupConsecutiveHours(hourlyData) {
  if (hourlyData.length === 0) return [];
  const sorted = [...hourlyData].sort((a, b) => a.hour - b.hour);
  const groups = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].hour === sorted[i - 1].hour + 1) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  return groups;
}

function groupSurplusWindows(windows) {
  if (windows.length === 0) return [];
  const groups = [{ ...windows[0] }];
  for (let i = 1; i < windows.length; i++) {
    const last = groups[groups.length - 1];
    if (windows[i].start === last.end) {
      last.end = windows[i].end;
      last.surplus_kw = Math.max(last.surplus_kw, windows[i].surplus_kw);
    } else {
      groups.push({ ...windows[i] });
    }
  }
  return groups;
}

function groupPeakWindows(windows) {
  if (windows.length === 0) return [];
  const groups = [{ ...windows[0] }];
  for (let i = 1; i < windows.length; i++) {
    const last = groups[groups.length - 1];
    if (windows[i].start === last.end) {
      last.end = windows[i].end;
      last.target_grid_kw = Math.min(last.target_grid_kw, windows[i].target_grid_kw);
    } else {
      groups.push({ ...windows[i] });
    }
  }
  return groups;
}

// ─── Load vs PV Profile ─────────────────────────────────────────

function buildLoadPvProfile(forecasts, pvPeakKw) {
  if (forecasts.length === 0) {
    return {
      data_available: false,
      pv_peak_kw: pvPeakKw,
      note: 'No forecast data available. The LLM should use site description and PV peak to estimate.',
    };
  }

  const byHour = {};
  for (const f of forecasts) {
    if (!byHour[f.hour]) byHour[f.hour] = { pv: [], load: [] };
    byHour[f.hour].pv.push(f.pv_kw);
    byHour[f.hour].load.push(f.load_kw);
  }

  const hourly = [];
  let peakLoad = 0, avgLoad = 0, peakPv = 0, totalSurplusHours = 0;
  const loads = [], pvs = [];

  for (let h = 0; h < 24; h++) {
    const data = byHour[h];
    if (!data) continue;
    const avgPv = data.pv.reduce((s, v) => s + v, 0) / data.pv.length;
    const avgLd = data.load.reduce((s, v) => s + v, 0) / data.load.length;
    const surplus = avgPv - avgLd;

    hourly.push({
      hour: h,
      avg_pv_kw: Math.round(avgPv * 10) / 10,
      avg_load_kw: Math.round(avgLd * 10) / 10,
      net_surplus_kw: Math.round(surplus * 10) / 10,
    });

    peakLoad = Math.max(peakLoad, avgLd);
    peakPv = Math.max(peakPv, avgPv);
    loads.push(avgLd);
    pvs.push(avgPv);
    if (surplus > 1) totalSurplusHours++;
  }

  avgLoad = loads.length > 0 ? loads.reduce((s, v) => s + v, 0) / loads.length : 0;

  return {
    data_available: true,
    pv_peak_kw: pvPeakKw,
    pv_actual_peak_kw: Math.round(peakPv * 10) / 10,
    load_peak_kw: Math.round(peakLoad * 10) / 10,
    load_avg_kw: Math.round(avgLoad * 10) / 10,
    surplus_hours_count: totalSurplusHours,
    hourly_profile: hourly,
  };
}

function buildTariffZoneSummary(zones) {
  if (zones.length === 0) return null;

  const byZone = {};
  for (const z of zones) {
    const name = z.zone_name || 'unknown';
    if (!byZone[name]) byZone[name] = { name, rate_pln_kwh: z.rate_pln_kwh, hours: [] };
    byZone[name].hours.push(`${String(z.hour).padStart(2, '0')}:00`);
  }

  return Object.values(byZone).map(z => ({
    zone: z.name,
    rate_pln_kwh: z.rate_pln_kwh,
    hours: `${z.hours[0]}-${z.hours[z.hours.length - 1]}`,
    hour_count: z.hours.length,
  }));
}

// ─── Main Handler ───────────────────────────────────────────────

export const handler = async (event) => {
  const { site_id, site_config, mode = 'daily' } = event;

  console.log(`[OptEngine] Run for ${site_id}, mode=${mode}`);

  const hoursAhead = mode === 'weekly' ? 168 : mode === 'intraday' ? 12 : 48;

  const sc = site_config;
  const batteryCapacity = sc.battery?.capacity_kwh || 100;
  const maxCharge = sc.power_limits?.max_charge_kw || 50;
  const maxDischarge = sc.power_limits?.max_discharge_kw || 50;
  const safetySocMin = 5;
  const safetySocMax = 100;
  const backupReserve = sc.ai_profile?.backup_reserve_percent ?? 0;
  const exportFollowsSun = sc.grid_connection?.export_follows_sun || false;
  const exportAllowed = sc.grid_connection?.export_allowed ?? true;
  const pvPeak = sc.pv_system?.total_peak_kw || 0;
  const latitude = sc.location?.latitude || 52;
  const isRdn = sc.financial?.energy_price_model === 'tge_rdn';
  const gridCapacity = sc.grid_connection?.capacity_kva;
  const mocZamowiona = sc.financial?.moc_zamowiona_after_bess_kw || sc.financial?.moc_zamowiona_before_bess_kw;

  const [prices, forecasts, currentSoc] = await Promise.all([
    isRdn ? fetchTgePrices(site_id, hoursAhead) : Promise.resolve([]),
    fetchForecasts(site_id, hoursAhead),
    fetchCurrentSoc(site_id),
  ]);

  const optimConfig = {
    battery_capacity_kwh: batteryCapacity,
    current_soc: currentSoc,
    max_charge_kw: maxCharge,
    max_discharge_kw: maxDischarge,
    safety_soc_min: safetySocMin,
    safety_soc_max: safetySocMax,
    backup_reserve_pct: backupReserve,
    export_allowed: exportAllowed,
    export_follows_sun: exportFollowsSun,
    pv_peak_kw: pvPeak,
    latitude,
    moc_zamowiona_kw: mocZamowiona,
    target_grid_kw: mocZamowiona ? mocZamowiona * 0.97 : undefined,
    distribution_operator: sc.financial?.distribution_operator,
    distribution_tariff_group: sc.financial?.distribution_tariff_group,
  };

  const priceResult = isRdn
    ? optimizePriceWindows(prices, optimConfig)
    : { charge_windows: [], discharge_windows: [] };

  const pvResult = calculatePvSelfConsumption(forecasts, optimConfig);
  const peakResult = calculatePeakShaving(forecasts, optimConfig);
  const bellResult = calculateBellCurve(optimConfig);
  const tariffResult = await mapTariffZones(optimConfig);
  const safetyResult = validateConstraints({}, optimConfig);

  const projectedSavings = {
    arbitrage_pln: priceResult.estimated_arbitrage_pln || 0,
    peak_shaving_pln: peakResult.peak_shaving_needed
      ? (sc.financial?.moc_zamowiona_price_pln_kw || 25) * ((mocZamowiona || 0) - (peakResult.safe_limit_kw || 0)) / 12
      : 0,
    pv_self_consumption_pln: pvResult.self_consumed_kwh * (prices[0]?.price_pln_kwh || 0.5),
  };

  // Build load vs PV profile summary for LLM context
  const loadPvProfile = buildLoadPvProfile(forecasts, pvPeak);

  const result = {
    site_id,
    mode,
    timestamp: new Date().toISOString(),
    current_soc: currentSoc,
    charge_windows: priceResult.charge_windows || [],
    discharge_windows: priceResult.discharge_windows || [],
    pv_surplus_windows: pvResult.pv_surplus_windows || [],
    peak_shaving_needed: peakResult.peak_shaving_needed || false,
    peak_shaving_windows: peakResult.peak_shaving_windows || [],
    bell_curve_active: bellResult.bell_curve_active || false,
    bell_curve_limits: bellResult.bell_curve_limits || [],
    tariff_zones: tariffResult.zones || [],
    tariff_zone_summary: buildTariffZoneSummary(tariffResult.zones || []),
    projected_savings: projectedSavings,
    constraints_applied: safetyResult.constraints_applied || [],
    load_pv_profile: loadPvProfile,
    data_summary: {
      tge_prices_count: prices.length,
      forecast_points: forecasts.length,
      price_range: prices.length > 0 ? {
        min: Math.min(...prices.map(p => p.price_pln_mwh)),
        max: Math.max(...prices.map(p => p.price_pln_mwh)),
        avg: prices.reduce((s, p) => s + p.price_pln_mwh, 0) / prices.length,
      } : null,
    },
  };

  console.log(`[OptEngine] Result: ${result.charge_windows.length} charge, ${result.discharge_windows.length} discharge, savings=${JSON.stringify(projectedSavings)}`);

  return result;
};
