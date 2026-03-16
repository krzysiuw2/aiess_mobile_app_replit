# 02 — Devices

## 1. Function Description

The devices module lets authenticated users browse the energy storage devices assigned to them, inspect their specifications, scan new device QR codes, and select a device for real-time monitoring. Device data is fetched from Supabase (joined through a `device_users` relation), while live telemetry is streamed from InfluxDB via a polling hook.

### Device Listing

[`app/(tabs)/devices.tsx`](../app/(tabs)/devices.tsx)

Devices are fetched through the `useDevices()` context hook, which queries Supabase:

```sql
SELECT
  id, device_id, name, status, device_type, location,
  battery_capacity_kwh, pcs_power_kw, pv_power_kw,
  device_users!inner (user_id, role)
FROM devices
WHERE device_users.user_id = :current_user_id
ORDER BY name
```

The `!inner` join ensures only devices linked to the current user via `device_users` are returned.

### Device Selection

When a user taps a device card:

1. `selectDevice(device.id)` is called, which:
   - Sets `selectedDeviceId` in state.
   - Persists the ID to `AsyncStorage` under key `@aiess_selected_device`.
2. The router navigates to `/(tabs)/monitor`.

On next app launch, the stored device ID is loaded from `AsyncStorage`. If it still exists in the fetched device list, it is automatically re-selected; otherwise the first device in the list is used as fallback.

### QR Scanner

A full-screen modal (`QRScannerModal`) allows adding new devices by scanning QR codes:

- Camera permissions are requested via `useCameraPermissions()` from `expo-camera`.
- `CameraView` is configured for back-facing camera with `barcodeTypes: ['qr']`.
- On scan, the data string is displayed in an alert. (The actual device-linking API is not yet wired.)

### Live Data

The `useLiveData(siteId)` hook, exported from [`contexts/DeviceContext.tsx`](../contexts/DeviceContext.tsx), polls InfluxDB every 5 seconds for real-time telemetry.

---

## 2. UI / UX Description

### Screen States

| State | Render |
|---|---|
| **Loading** | Centered `ActivityIndicator` with "Loading…" text |
| **Error** | `XCircle` icon (64px, red), error title, error message, "Try Again" button calling `refreshDevices()` |
| **Empty** | `Search` icon (64px, light), "No devices found" title, hint subtitle, "Add New" button at footer |
| **Devices present** | Header + scrollable device card list + "Add New" footer button |

### Header

Centered layout with three columns:
- Left: `ArrowLeft` icon button
- Center: Title ("Devices") + subtitle
- Right: `Search` icon button

### DeviceCard

**File:** [`app/(tabs)/devices.tsx`](../app/(tabs)/devices.tsx) — `DeviceCard` component (lines 32–131)

| Section | Content |
|---|---|
| **Card header** | Device name (`"Device: {name}"`) + site ID (`"Site: {device_id}"`) on the left; status badge on the right |
| **Status badge** | Rounded pill — `CheckCircle` (green bg) for `active`, `XCircle` (red bg) for `inactive` |
| **Specs row** | Three columns separated by vertical dividers |

**Specs row layout:**

| Column | Value | Unit | Label |
|---|---|---|---|
| Battery Capacity | `battery_capacity_kwh` | kWh | Localized label |
| Battery Power | `pcs_power_kw` | kW | Localized label |
| PV Power | `pv_power_kw` | kW | Localized label |

**Selection animation:**

When `isSelected` is `true`, an `Animated.loop` runs a sinusoidal pulse (1500 ms per half-cycle) that interpolates:

| Property | Range (unselected → selected) |
|---|---|
| `borderColor` | `rgba(0, 140, 255, 0.25)` ↔ `rgba(0, 140, 255, 0.9)` |
| `backgroundColor` | `rgba(0, 140, 255, 0.02)` ↔ `rgba(0, 140, 255, 0.06)` |

The selected card also receives elevated shadow and a thicker border (`borderWidth: 2`).

**Card styling:**

- `borderRadius: 16`, `padding: 18`
- iOS: shadow (`shadowOpacity: 0.1`, `shadowRadius: 10`)
- Android: `elevation: 4` (8 when selected)

### QR Scanner Modal

| Element | Details |
|---|---|
| Presentation | Full-screen modal with `animationType="slide"`, black background |
| Header | Close button (`X` icon) on the left, centered title, spacer on the right |
| Camera | `CameraView` from `expo-camera`, fills the container |
| Scan frame overlay | Centered 250×250 box with corner brackets (3px borders, `borderRadius: 8`) in primary color |
| Permission fallback | `Camera` icon, permission text, "Grant Permission" button |
| Footer | `Camera` icon + instruction text |

### Footer

A sticky bottom area with a full-width "Add New" button (`borderRadius: 30`, primary background) containing a `Camera` icon and text.

---

## 3. Backend Description / Tools Used / Tools Needed

### DeviceContext

**File:** [`contexts/DeviceContext.tsx`](../contexts/DeviceContext.tsx)

Built with `@nkzw/create-context-hook` and `@tanstack/react-query`.

#### Device Query Configuration

```typescript
useQuery({
  queryKey: ['devices', user?.id],
  enabled: isAuthenticated && !!user?.id,
  staleTime: 1000 * 60 * 5,          // 5 minutes
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  refetchOnReconnect: true,
})
```

- A 10-second `AbortController` timeout wraps the Supabase call.
- Numeric fields (`battery_capacity_kwh`, `pcs_power_kw`, `pv_power_kw`) are explicitly cast with `Number()` to avoid string coercion from Postgres.

#### Selected Device Persistence

```typescript
const SELECTED_DEVICE_KEY = '@aiess_selected_device';

// On load:
const stored = await AsyncStorage.getItem(SELECTED_DEVICE_KEY);

// On select:
await AsyncStorage.setItem(SELECTED_DEVICE_KEY, deviceId);
```

On logout (`isAuthenticated` becomes `false`), `selectedDeviceId` is set to `null` and the `['devices']` query is removed from the cache.

#### Exposed Values

```typescript
{
  devices: Device[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  selectedDevice: Device | null;
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string) => Promise<void>;
  refreshDevices: () => void;
}
```

### Device Type

**File:** [`types/index.ts`](../types/index.ts)

```typescript
interface Device {
  id: string;
  device_id: string;
  name: string;
  status: 'active' | 'inactive' | 'maintenance' | 'offline';
  device_type: 'on_grid' | 'off_grid' | 'hybrid';
  location: string | null;
  battery_capacity_kwh: number | null;
  pcs_power_kw: number | null;
  pv_power_kw: number | null;
}
```

### LiveData Type

**File:** [`types/index.ts`](../types/index.ts)

```typescript
interface LiveData {
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

### useLiveData Hook

**File:** [`contexts/DeviceContext.tsx`](../contexts/DeviceContext.tsx) (lines 147–179)

```typescript
export const useLiveData = (siteId: string | null) => {
  return useQuery({
    queryKey: ['liveData', siteId],
    queryFn: () => fetchLiveData(siteId!),
    enabled: !!siteId,
    refetchInterval: 5000,   // polls every 5 seconds
    retry: 2,
    retryDelay: 1000,
  });
};
```

- Calls `fetchLiveData(siteId)` from [`lib/influxdb.ts`](../lib/influxdb.ts).
- HTTP 503 errors are logged as warnings (transient) rather than errors; React Query handles retries automatically.

### Supabase Tables Involved

| Table | Role |
|---|---|
| `devices` | Stores device metadata: name, status, type, location, battery/PCS/PV specs |
| `device_users` | Join table linking `devices.id` → `auth.users.id` with a `role` column. The `!inner` join ensures the user only sees their own devices. |

### Tools / Libraries

| Library | Purpose |
|---|---|
| `@supabase/supabase-js` | Querying `devices` table with inner join |
| `@tanstack/react-query` | `useQuery` for devices, selected device, and live data; automatic retry + polling |
| `@nkzw/create-context-hook` | Context + hook creation for `DeviceProvider` / `useDevices` |
| `@react-native-async-storage/async-storage` | Persisting selected device ID (`@aiess_selected_device`) |
| `expo-camera` | `CameraView` and `useCameraPermissions` for QR scanning |
| `expo-router` | Navigation to `/(tabs)/monitor` on device selection |
| `lucide-react-native` | Icons (`CheckCircle`, `XCircle`, `Search`, `ArrowLeft`, `Camera`, `X`) |
| `react-native` Animated API | Pulsing border/background animation on selected card |
| InfluxDB (via [`lib/influxdb.ts`](../lib/influxdb.ts)) | Real-time telemetry source for `useLiveData` |

### External Services

| Service | Usage |
|---|---|
| **Supabase (PostgreSQL)** | Device registry and user-device association |
| **InfluxDB** | Time-series telemetry data (grid power, battery SoC, PV output, factory load, etc.) polled every 5 s |
