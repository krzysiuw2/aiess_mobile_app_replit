# Props Contract & Data Interface

> **Web implementation note**: The web component does NOT accept `liveData` or `t` as props. It fetches data internally via `useLiveData()` and translations via `useTranslation('dashboard')`. This document describes the data contract for both platforms.

---

## 1. Web Component Interface

```typescript
export interface EnergyFlowSVGProps {
  width?: string | number;   // Default: '100%'
  height?: string | number;  // Default: 'auto'
}
```

The component is self-contained: it uses `useDeviceContext()` for the active device, `useLiveData(siteId)` for live data, and `useTranslation('dashboard')` for i18n.

---

## 2. Data Type (Web: `LiveTelemetryPoint`)

Defined in `src/types/influxdb.ts`:

```typescript
export interface LiveTelemetryPoint {
  time: string;
  site_id: string;

  // Power measurements (kW)
  grid_kw: number;       // + = importing, - = exporting
  battery_kw: number;    // + = discharging, - = charging
  pv_kw: number;         // Always >= 0
  load_kw?: number;      // Optional (calculated server-side)
  soc_pct: number;       // 0-100 (%)

  // AI decision engine fields
  active_rule_id?: string;                    // e.g. "local_default_standby", "PEAK-SHAVING"
  active_rule_action?: 'ch' | 'sb' | 'dis';  // charge / standby / discharge
  active_rule_power?: number;                 // kW target from AI rule
}
```

### InfluxDB Field Mapping

| InfluxDB Field | TypeScript Property | Type | Notes |
|---|---|---|---|
| `grid_power` | `grid_kw` | number | + = import, - = export |
| `pcs_power` | `battery_kw` | number | + = discharge, - = charge |
| `soc` | `soc_pct` | number | 0-100 |
| `total_pv_power` | `pv_kw` | number | Always >= 0 |
| *(calculated)* | `load_kw` | number | `max(0, grid_kw + pv_kw + battery_kw)` |
| `active_rule_id` | `active_rule_id` | string | e.g. "SHAVE-SURPLUS" |
| `active_rule_action` | `active_rule_action` | string | "ch" / "sb" / "dis" |
| `active_rule_power` | `active_rule_power` | number | kW target |

---

## 3. Mobile Component Interface (Planned)

For mobile, the component will accept props directly (since hooks differ from web):

```typescript
interface EnergyFlowProps {
  liveData: LiveData | null | undefined;
  t: { monitor: { soc, status, power, grid, load, pv, aiLogic, ruleId, action, targetPower } };
}
```

---

## 4. Critical Sign Convention

> This is the most error-prone part. Read carefully.

### Summary Table

| Condition | What it means | Flow line direction | Visual |
|---|---|---|---|
| `grid_kw > 0` | Importing from grid | Grid --> Inverter | Red arrow on grid icon |
| `grid_kw < 0` | Exporting to grid | Inverter --> Grid | Green arrow on grid icon |
| `battery_kw > 0` | Battery discharging | Battery --> Inverter | Orange status, wave moves right |
| `battery_kw < 0` | Battery charging | Inverter --> Battery | Blue status, wave moves left |
| `pv_kw > 0` | Solar generating | PV --> Inverter | Sun animation active |
| `load > 0` | Load consuming | Inverter --> Load | Smoke animation active |

### Battery Sign -- NO INVERSION NEEDED

The old Rive code inverted the battery sign:
```typescript
// OLD Rive code:
batteryInput.value = -(latest.battery_kw ?? 0);
```

The SVG implementation uses `battery_kw` **directly**. No negation. The Rive inversion was an artifact of Rive's internal convention.

---

## 5. Derived Calculations

### Factory Load (calculated client-side in component)
```typescript
const loadPower = Math.max(0, gridPower + batteryPower + pvPower);
```

### Battery Status (derived from power threshold)
```typescript
const status = batteryPower < -0.5 ? 'Charging'
             : batteryPower > 0.5  ? 'Discharging'
             : 'Standby';
```

The 0.5 kW deadband prevents status flickering at near-zero power.

---

## 6. Value Formatting

```typescript
const formatValue = (value: number): string =>
  Math.abs(value) < 100 ? value.toFixed(1) : Math.round(value).toString();
```

- Values below 100: 1 decimal place (e.g. `"23.6"`)
- Values 100+: rounded integer (e.g. `"124"`)

---

## 7. i18n Translation Keys (Web)

**Namespace**: `dashboard` | **Prefix**: `energyFlow.*`

**Files**: `public/locales/en/dashboard.json`, `public/locales/pl/dashboard.json`

### Labels

| Key | English | Polish | Used For |
|---|---|---|---|
| `energyFlow.soc` | SoC | SoC | SoC card label |
| `energyFlow.status` | Status | Status | Status card label |
| `energyFlow.power` | Power | Moc | Battery power card label |
| `energyFlow.grid` | Grid | Sieć | Grid node label |
| `energyFlow.load` | Load | Odbiornik | Load node label |
| `energyFlow.pv` | PV Power | Moc PV | PV node label |
| `energyFlow.aiLogic` | AI LOGIC | LOGIKA AI | AI Decision card header |
| `energyFlow.ruleId` | RULE ID | ID REGUŁY | Column 1 label |
| `energyFlow.action` | ACTION | AKCJA | Column 2 label |
| `energyFlow.targetPower` | TARGET | MOC DOC. | Column 3 label |

### Status/Action Texts

| Key | English | Polish | Used For |
|---|---|---|---|
| `energyFlow.charging` | Charging | Ładowanie | Battery status text |
| `energyFlow.discharging` | Discharging | Rozład. | Battery status text |
| `energyFlow.standby` | Standby | Czuwanie | Battery status + default rule ID |
| `energyFlow.charge` | Charge | Ładowanie | AI action column |
| `energyFlow.discharge` | Discharge | Rozład. | AI action column |

### UI States

| Key | English | Polish |
|---|---|---|
| `energyFlow.loading` | Loading energy flow... | Ładowanie przepływu energii... |
| `energyFlow.selectDevice` | Select a device... | Wybierz urządzenie... |
| `energyFlow.unavailable` | Energy Flow Unavailable | Przepływ energii niedostępny |
| `energyFlow.unavailableDesc` | Unable to load... | Nie można załadować... |

---

## 8. AI Decision Node Color Mapping

| `active_rule_action` | Display Text (EN) | Display Text (PL) | Color |
|---|---|---|---|
| `'ch'` | Charge | Ładowanie | `#3b82f6` (blue) |
| `'sb'` | Standby | Czuwanie | `#64748b` (grey) |
| `'dis'` | Discharge | Rozład. | `#f59e0b` (orange) |

The Rule ID text and Action text both use this color. The Target Power text is `#1e293b` (dark) when active, `#64748b` (grey) when standby.

### Rule ID Display Override

`local_default_standby` is displayed as the translated standby label instead of the raw internal ID.
