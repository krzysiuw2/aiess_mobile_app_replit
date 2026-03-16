# 03 — Monitor Screen

## 1. Function Description

The Monitor screen displays **real-time energy flow** for the user's currently selected device. It visualises how power moves between four energy nodes — Grid, PV (solar), Battery, and Load (factory) — through an animated SVG diagram. Data is polled every 5 seconds from InfluxDB via a React Query hook and rendered into derived flow states, animated flow lines, and status indicators.

### Key responsibilities

| Responsibility | Detail |
|---|---|
| Show live power values | Grid, PV, Battery, Load — in kW |
| Show 1-min & 5-min averages | Displayed under each node card |
| Visualise energy direction | Animated dash lines between nodes and inverter hub |
| Display battery state-of-charge | Animated liquid-fill level inside battery icon |
| Show AI decision state | Active rule ID, action (charge/discharge/standby), target power |
| Handle offline/loading/error | Spinner, error card with retry, offline badge |

---

## 2. UI / UX Description

### 2.1 Screen Layout

File: [`app/(tabs)/monitor.tsx`](../../app/(tabs)/monitor.tsx)

```
┌────────────────────────────────┐
│         Header ("Monitor")     │
├────────────────────────────────┤
│  Device Status Bar             │
│  [Device Name]  [site_id]  🟢 │
├────────────────────────────────┤
│                                │
│     EnergyFlowSVG Diagram      │
│    (full SVG, see §2.3)        │
│                                │
└────────────────────────────────┘
```

### 2.2 Screen States

| State | Trigger | UI |
|---|---|---|
| **No device selected** | `selectedDevice` is `null` | Centred `AlertCircle` icon + "Select a device first" text + hint to go to Devices tab |
| **Loading** | `isLoading && !liveData` | `ActivityIndicator` spinner + "Loading live data…" |
| **Error (no cached data)** | `isError && !liveData` | `WifiOff` icon + error title + error message + Retry button |
| **Data available** | `liveData` is truthy | Renders `EnergyFlowWithFallback` component (wraps `EnergyFlowSVG`) |

### 2.3 Device Status Bar

Sits between the header and the diagram.

| Element | Description |
|---|---|
| **Device name** | `selectedDevice.name` — bold white text |
| **Site ID** | `selectedDevice.device_id` — smaller secondary text |
| **Online badge** | Green `CheckCircle` icon + "Online" text (green pill background) |
| **Offline badge** | Red `WifiOff` icon + "Offline" text (red pill background); shown when `isError` is true |

### 2.4 EnergyFlowSVG Diagram

File: [`components/EnergyFlowSVG/index.tsx`](../../components/EnergyFlowSVG/index.tsx)

The diagram is a single `<Svg>` with a `350×550` viewBox, scaled responsively to fit the screen (max 500 px wide). It contains the following child nodes:

```
┌──────────────────────────────────────────────┐
│  [BatteryNode]     [SocCard] [StatusCard]    │
│                               [PowerCard]    │
│              [AiDecisionNode]                │
│                                              │
│              [InverterHub]                   │
│             ╱      │      ╲                  │
│   [GridNode]   [LoadNode]   [PvNode]         │
└──────────────────────────────────────────────┘
```

All nodes are connected via `FlowLines` (animated dash paths) that pass through the central `InverterHub`.

#### 2.4.1 GridNode

File: [`components/EnergyFlowSVG/GridNode.tsx`](../../components/EnergyFlowSVG/GridNode.tsx)

| Element | Detail |
|---|---|
| Label | Localised "Grid" text |
| Power value | Current grid power in kW (bold) |
| Arrow icon | Directional arrow next to a power-tower icon — **right-pointing red** for import (`gridPower > 0.1`), **left-pointing green** for export (`gridPower < -0.1`), **flat grey dash** for standby |
| Averages | 1-min and 5-min mean values displayed in small grey text |

#### 2.4.2 PvNode

File: [`components/EnergyFlowSVG/PvNode.tsx`](../../components/EnergyFlowSVG/PvNode.tsx)

| Element | Detail |
|---|---|
| Label | Localised "PV" text; appends "*est.*" suffix when `pvEstimated > 0` |
| Power value | Current PV power in kW |
| Sun animation | Sun circle + ray lines; opacity animated via `sunGroupRef` / `rayGroupRef` — visible when `pvPower >= 0.1` |
| Ray pulse | 3-second cosine cycle between 0.3 and 1.0 opacity |
| Solar panel icon | Static dark panel graphic beneath the sun |
| Averages | 1-min and 5-min mean values |

#### 2.4.3 BatteryNode

File: [`components/EnergyFlowSVG/BatteryNode.tsx`](../../components/EnergyFlowSVG/BatteryNode.tsx)

| Element | Detail |
|---|---|
| Battery casing | Dark rounded rectangle with terminal on top |
| Liquid fill | Animated colour fill clipped inside the casing; height = `(batterySoc / 100) * 100` px |
| Fill colour | Red (`#ef4444`) for SOC ≤ 20%, amber (`#f59e0b`) for SOC ≤ 50%, green (`#10b981`) for SOC > 50% |
| Wave animation | When `|batteryPower| > 0.2`, the fill surface uses a sinusoidal `WAVY_PATH` that scrolls horizontally at 60 px/s; direction follows charge/discharge. Standby uses a `FLAT_PATH`. |
| Scale lines | Tick marks at 25%, 50%, 75% along the right edge |

#### 2.4.4 LoadNode

File: [`components/EnergyFlowSVG/LoadNode.tsx`](../../components/EnergyFlowSVG/LoadNode.tsx)

| Element | Detail |
|---|---|
| Label | Localised "Load" text |
| Power value | Current factory load in kW |
| Factory icon | Stepped polygon resembling a factory building with lit windows |
| Smoke puffs | 3 animated `Circle` elements above the chimney; each follows a 2500 ms lifecycle (rise, expand, fade); active when `loadPower > 0.2` |
| Averages | 1-min and 5-min mean values |

#### 2.4.5 InverterHub

File: [`components/EnergyFlowSVG/InverterHub.tsx`](../../components/EnergyFlowSVG/InverterHub.tsx)

Static centre node (40×56 dark rectangle) positioned at `translate(155, 320)`. Depicts a simplified inverter with a small status LED (green circle). All flow lines converge at/diverge from this hub.

#### 2.4.6 FlowLines

File: [`components/EnergyFlowSVG/FlowLines.tsx`](../../components/EnergyFlowSVG/FlowLines.tsx)

| Line | SVG Path | Direction semantics |
|---|---|---|
| **Battery** | `M 50 150 → 175 320` (via curve) | forward = discharge (away from battery), reverse = charge |
| **Load** | `M 175 376 → 175 420` | forward = power consumed |
| **Grid** | `M 155 350 → 40 420` (via curve) | forward = export, reverse = import |
| **PV** | `M 195 350 → 306 420` (via curve) | reverse = generation flowing in |

Each line has two layers:

1. **Base wire** — static light-grey stroke (`#cbd5e1`, width 4)
2. **Animated overlay** — blue stroke (`#3b82f6`, width 4) with `strokeDasharray="8 16"`, dash offset animated at 24 px/s via `requestAnimationFrame`. Opacity fades in over 300 ms when flow starts, fades out when standby.

#### 2.4.7 StatusCards

File: [`components/EnergyFlowSVG/StatusCards.tsx`](../../components/EnergyFlowSVG/StatusCards.tsx)

Three cards displayed to the right of the battery node:

| Card | Position | Content |
|---|---|---|
| **SOC Card** | `translate(100, 20)` | Label "SOC" + value e.g. `"87.0 %"` (green) |
| **Status Card** | `translate(220, 20)` | Label "Status" + text e.g. "Charging" (colour-coded); animated pulsing ring for charge/discharge; dashed ring for discharge |
| **Power Card** | `translate(220, 80)` | Label "Power" + value e.g. `"12.5 kW"` with lightning-bolt icon |

#### 2.4.8 AiDecisionNode

File: [`components/EnergyFlowSVG/AiDecisionNode.tsx`](../../components/EnergyFlowSVG/AiDecisionNode.tsx)

Horizontal card at `translate(100, 145)` (236×60) displaying the currently active AI rule:

| Column | Content | Colour logic |
|---|---|---|
| **Rule ID** | Active rule name (truncated to 13 chars + `…` if > 15) | Colour from `AI_COLOR_MAP`: `ch` → blue, `dis` → amber, `sb` → slate |
| **Action** | Localised action text: "Charge" / "Discharge" / "Standby" | Same as Rule ID |
| **Target Power** | e.g. `"25.0 kW"` or `"—"` if standby | Slate for standby, dark otherwise |

When no rule is active, defaults to `local_default_standby` → displayed as localised "Standby".

---

## 3. Backend Description / Tools Used / Tools Needed

### 3.1 Data Flow

```
InfluxDB Cloud (aiess_v1 bucket)
        │
        ▼
  Supabase Edge Proxy (callInfluxProxy)
        │
        ▼
  fetchLiveData()          ← lib/influxdb.ts
        │
        ▼
  useLiveData() hook       ← contexts/DeviceContext.tsx
  (React Query, 5s poll)
        │
        ▼
  MonitorScreen            ← app/(tabs)/monitor.tsx
        │
        ▼
  EnergyFlowSVG            ← components/EnergyFlowSVG/index.tsx
  └─ deriveState() → DerivedState
  └─ rAF animation loop
```

### 3.2 `LiveData` Type

File: [`types/index.ts`](../../types/index.ts)

```typescript
export interface LiveData {
  gridPower: number;
  batteryPower: number;
  batterySoc: number;
  batteryStatus: 'Charging' | 'Discharging' | 'Standby';
  pvPower: number;
  pvEstimated: number;
  pvTotal: number;
  factoryLoad: number;
  lastUpdate: Date;
  activeRuleId?: string;
  activeRuleAction?: 'ch' | 'sb' | 'dis';
  activeRulePower?: number;
  gridPowerAvg1m?: number;
  gridPowerAvg5m?: number;
  pvPowerAvg1m?: number;
  pvPowerAvg5m?: number;
  factoryLoadAvg1m?: number;
  factoryLoadAvg5m?: number;
}
```

### 3.3 `fetchLiveData` — InfluxDB Query

File: [`lib/influxdb.ts`](../../lib/influxdb.ts) (line 219)

Executes **three parallel Flux queries** against the `aiess_v1` bucket:

| Query | Purpose | Flux range | Fields |
|---|---|---|---|
| `liveQuery` | Latest value per field | `range(start: -5m)` → `last()` | `grid_power`, `total_pv_power`, `pcs_power`, `soc`, `active_rule_id`, `active_rule_action`, `active_rule_power` |
| `meanQuery(1)` | 1-minute average | `range(start: -1m)` → `mean()` | `grid_power`, `total_pv_power`, `pcs_power` |
| `meanQuery(5)` | 5-minute average | `range(start: -5m)` → `mean()` | `grid_power`, `total_pv_power`, `pcs_power` |

Additionally fetches `pv_estimated` from the `aiess_v1_1h` bucket (`energy_simulation` measurement) to augment PV when arrays are unmonitored.

#### Factory load formula

```typescript
calculateFactoryLoad(gridPower, pvPower, batteryPower) =
  Math.max(0, gridPower + pvPower + batteryPower)
```

### 3.4 `useLiveData` Hook

File: [`contexts/DeviceContext.tsx`](../../contexts/DeviceContext.tsx) (line 147)

```typescript
export const useLiveData = (siteId: string | null) => {
  return useQuery({
    queryKey: ['liveData', siteId],
    queryFn: () => fetchLiveData(siteId!),
    enabled: !!siteId,
    refetchInterval: 5000, // 5-second auto-polling
    retry: 2,
  });
};
```

Returns standard React Query result: `{ data, isLoading, isError, error, refetch }`.

### 3.5 `DerivedState` — Computed Visualisation State

File: [`components/EnergyFlowSVG/types.ts`](../../components/EnergyFlowSVG/types.ts)

The `deriveState()` function (in `index.tsx`) transforms raw `LiveData` into a `DerivedState` object consumed by all child SVG nodes:

```typescript
export type FlowState = 'forward' | 'reverse' | 'standby';
export type BattStatus = 'charging' | 'discharging' | 'standby';

export interface DerivedState {
  // Raw values
  batteryPower: number;  batterySoc: number;
  gridPower: number;     pvPower: number;
  pvEstimated: number;   loadPower: number;

  // Flow directions
  battFlowState: FlowState;   // < -0.2 → reverse (charge), > 0.2 → forward (discharge)
  gridFlowState: FlowState;   // < -0.1 → forward (export), > 0.1 → reverse (import)
  loadFlowState: FlowState;   // > 0.2 → forward
  pvFlowState: FlowState;     // > 0.1 → reverse (generating)

  // Battery visuals
  battColor: string;     // red / amber / green based on SOC thresholds
  battStatus: BattStatus;
  statusColor: string;   statusText: string;

  // Formatted display strings
  socValue: string;      battPowerValue: string;
  gridValue: string;     loadValue: string;   pvValue: string;

  // Grid arrow
  gridArrowPath: string;   gridArrowColor: string;

  // Averages (formatted or null)
  gridAvg1m: string | null;  gridAvg5m: string | null;
  loadAvg1m: string | null;  loadAvg5m: string | null;
  pvAvg1m: string | null;    pvAvg5m: string | null;

  // Animation flags
  sunActive: boolean;    smokeActive: boolean;
  waveActive: boolean;   waveDir: 1 | -1;

  // AI decision
  aiRuleId: string;   aiAction: string;
  aiPower: string;     aiColor: string;   aiPowerColor: string;
}
```

### 3.6 Animation System

The `EnergyFlowSVG` component runs a **single `requestAnimationFrame` loop** that drives all animations by mutating refs directly via `setNativeProps` (avoiding React re-renders):

| Animation | Mechanism | Trigger |
|---|---|---|
| Flow line dashes | `strokeDashoffset` incremented at 24 px/s; opacity fade in/out over 300 ms | `FlowState !== 'standby'` |
| Battery liquid wave | Horizontal translation of wavy SVG path at 60 px/s; vertical position lerps toward target SOC | `|batteryPower| > 0.2` |
| Sun glow | Opacity lerps toward 0 or 1 over 200 ms | `pvPower >= 0.1` |
| Sun ray pulse | Cosine cycle over 3000 ms (0.3–1.0 opacity) | `pvPower >= 0.1` |
| Smoke puffs | 3 circles each cycling a 2500 ms phase (rise from y=4 to y=2.5, expand radius, fade) | `loadPower > 0.2` |
| Status icon pulse | Cosine cycle over 2000 ms (0.5–1.0 opacity) | `battStatus !== 'standby'` |

### 3.7 Tools Used

| Tool / Library | Purpose |
|---|---|
| **React Native SVG** (`react-native-svg`) | Rendering the energy flow diagram |
| **React Query** (`@tanstack/react-query`) | Data fetching with 5-second polling, caching, retry |
| **InfluxDB Cloud** (Flux query language) | Time-series database for energy telemetry |
| **Supabase Edge Functions** (proxy) | Auth-gated proxy for InfluxDB HTTP API |
| **Lucide React Native** | Status icons (CheckCircle, AlertCircle, WifiOff, RefreshCw) |
| **requestAnimationFrame** | 60 fps animation loop for SVG element updates |

### 3.8 Tools / Infrastructure Needed

| Requirement | Detail |
|---|---|
| **InfluxDB Cloud** account | Organisation with `aiess_v1` (raw 5s telemetry) and `aiess_v1_1h` (hourly simulation) buckets |
| **Supabase project** | Edge function `influx-proxy` that forwards authenticated Flux queries |
| **Site telemetry pipeline** | On-site controller writing `energy_telemetry` measurement every ~5 seconds with fields: `grid_power`, `total_pv_power`, `pcs_power`, `soc`, `active_rule_id`, `active_rule_action`, `active_rule_power` |
