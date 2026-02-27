# Adding 1-min and 5-min Averages to Energy Flow Diagram

## Overview

The Grid, Load (Odbiornik), and PV cards in the SVG energy flow diagram now display
rolling 1-minute and 5-minute power averages below the live instantaneous value.

---

## 1. Data Model Changes

### `LiveData` interface (`types/index.ts`)

Six optional numeric fields were added:

```typescript
gridPowerAvg1m?: number;
gridPowerAvg5m?: number;
pvPowerAvg1m?: number;
pvPowerAvg5m?: number;
factoryLoadAvg1m?: number;   // derived: max(0, gridAvg + pvAvg + battAvg)
factoryLoadAvg5m?: number;
```

`factoryLoad` averages are **not** queried directly — they are computed from the
raw field averages using the same formula as the live factory load:

```typescript
factoryLoadAvgXm = max(0, grid_power_avg + total_pv_power_avg + pcs_power_avg)
```

---

## 2. InfluxDB Query Changes (`lib/influxdb.ts`)

### Architecture

Three Flux queries run **in parallel** via `Promise.all` inside `fetchLiveData()`:

| Query | Purpose | Flux aggregation |
|-------|---------|-----------------|
| `liveQuery` | Instantaneous values + AI fields | `\|> last()` |
| `meanQuery(1)` | 1-minute rolling averages | `\|> mean()` with `range(start: -1m)` |
| `meanQuery(5)` | 5-minute rolling averages | `\|> mean()` with `range(start: -5m)` |

Average queries fail gracefully (`.catch(() => [])`) so the live data always works
even if the mean queries fail.

### Helper: `runFluxQuery(query)`

Extracted shared helper that sends a Flux query to InfluxDB and returns parsed CSV rows:

```typescript
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
  if (!response.ok) throw new Error(`InfluxDB error: ${response.status}`);
  const csv = await response.text();
  return parseInfluxCSV(csv);
}
```

### Helper: `extractNumericFields(rows)`

Parses `_field`/`_value` pairs into a `Record<string, number>`:

```typescript
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
```

### Mean Query Template

```flux
from(bucket: "aiess_v1")
  |> range(start: -${minutes}m)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${siteId}")
  |> filter(fn: (r) =>
       r._field == "grid_power" or
       r._field == "total_pv_power" or
       r._field == "pcs_power"
  )
  |> mean()
```

Only `grid_power`, `total_pv_power`, and `pcs_power` are averaged — `soc` and AI
string fields are not relevant for averages.

### Parallel Execution

```typescript
const [liveRows, avg1mRows, avg5mRows] = await Promise.all([
  runFluxQuery(liveQuery),
  runFluxQuery(meanQuery(1)).catch(() => []),
  runFluxQuery(meanQuery(5)).catch(() => []),
]);

const avg1m = extractNumericFields(avg1mRows);
const avg5m = extractNumericFields(avg5mRows);

const gridPowerAvg1m = avg1m['grid_power'] != null ? round1(avg1m['grid_power']) : undefined;
const pvPowerAvg1m   = avg1m['total_pv_power'] != null ? round1(avg1m['total_pv_power']) : undefined;
const factoryLoadAvg1m = avg1m['grid_power'] != null
  ? round1(calculateFactoryLoad(avg1m['grid_power'], avg1m['total_pv_power'] ?? 0, avg1m['pcs_power'] ?? 0))
  : undefined;
// ... same pattern for 5m
```

---

## 3. SVG Component Changes

### Card Layout (GridNode, LoadNode, PvNode)

Each bottom card was expanded:

| Property | Before | After |
|----------|--------|-------|
| Card height | 50 | 76 |
| Label y | 20 | 18 |
| Main value y | 40 | 36 |
| Avg 1m line y | — | 54 |
| Avg 5m line y | — | 68 |

### New Props

Each card component received two new optional props:

```typescript
avg1m: string | null;   // e.g. "5.4 kW" or null
avg5m: string | null;   // e.g. "3.5 kW" or null
```

### SVG Text Elements

Two `<SvgText>` elements were added per card:

```xml
<SvgText x={12} y={54} fill="#94a3b8" fontSize={9}>
  {avg1m ? `${avg1m} (1 min)` : '— (1 min)'}
</SvgText>
<SvgText x={12} y={66} fill="#94a3b8" fontSize={9}>
  {avg5m ? `${avg5m} (5 min)` : '— (5 min)'}
</SvgText>
```

- Font size: 9 (vs 16 for the main value)
- Color: `#94a3b8` (muted gray, secondary info)
- Fallback: dash `—` when data is not yet available

### Derived State (`DerivedState` in `types.ts`)

Six new string fields for the formatted averages:

```typescript
gridAvg1m: string | null;
gridAvg5m: string | null;
loadAvg1m: string | null;
loadAvg5m: string | null;
pvAvg1m:   string | null;
pvAvg5m:   string | null;
```

Formatting in `deriveState()`:

```typescript
const fmtAvg = (v: number | undefined): string | null =>
  v != null ? `${formatValue(v)} kW` : null;
```

### ViewBox

No change needed. The viewBox remains `0 0 350 550`. Card bottoms now sit at
y ≈ 498, well within the 550 height.

---

## 4. Context Layer Fix

`DeviceContext.tsx` previously reconstructed `LiveData` from scratch inside
`useLiveData()`, dropping any fields not explicitly listed. This was changed to
pass through the complete object from `fetchLiveData()`:

```typescript
// Before (dropped new fields):
const liveData: LiveData = {
  gridPower: Math.round(influxData.gridPower * 10) / 10,
  // ... only 7 original fields
};

// After (pass-through):
const liveData = await fetchLiveData(siteId);
if (!liveData) throw new Error('No data returned from InfluxDB');
return liveData;
```

---

## 5. Web / Cloud Adaptation Notes

For a web (non-React-Native) implementation:

- The Flux queries are identical — reuse `meanQuery(1)` and `meanQuery(5)`.
- The `factoryLoad` derivation formula is identical.
- For SVG rendering, replace `react-native-svg` `<SvgText>` with standard SVG `<text>`.
- The card height, text positions, font sizes, and colors listed above map directly
  to standard SVG attributes.
- The `"(1 min)"` / `"(5 min)"` labels don't require i18n — they are the same in
  Polish and English.
