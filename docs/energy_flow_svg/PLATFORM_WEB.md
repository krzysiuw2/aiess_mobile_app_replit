# Next.js (Web) Implementation Guide

> **Status**: COMPLETED. This document reflects the actual working implementation.

The web component uses a **fully declarative** React approach. All text, colors, CSS classes, and SVG attributes are computed from `liveData` via `useMemo` and rendered directly in JSX. The only imperative operation is the `requestAnimationFrame` loop for the battery liquid wave animation.

---

## 1. Architecture

### Why Declarative (Not Imperative)

The original spec proposed using `useEffect` + `getElementById` + `setAttribute` to imperatively update SVG elements. This approach **does not work** in React because:

- React re-renders overwrite DOM changes back to JSX static values
- Every 5-second data refresh triggers a re-render that resets all text to defaults
- The battery liquid animation (via `stateRef`) appeared to work, but text/color updates were silently lost

**Solution**: Compute all display values from `liveData` in a pure `deriveState()` function, memoize with `useMemo`, and render them directly as JSX props/children. React manages the DOM naturally.

### Data Flow

```
InfluxDB (aiess_v1)
  → POST /api/influxdb
  → useLiveData(siteId) hook (5s polling)
  → liveData.data[0] (LiveTelemetryPoint)
  → useMemo(deriveState(latest))
  → JSX renders with computed values
  → requestAnimationFrame loop (battery wave only)
```

### Component Structure

```
src/components/dashboard/
├── EnergyFlowSVG.tsx          # Main component (~400 lines)
├── EnergyFlowSVG.module.css   # Animation keyframes
└── index.ts                   # Barrel export
```

---

## 2. Component File

**Path**: `src/components/dashboard/EnergyFlowSVG.tsx`

### Key Patterns

**Pure derivation function** (outside component):
```typescript
function deriveState(latest: LiveTelemetryPoint | null): DerivedState {
  const gridPower = latest?.grid_kw ?? 0;
  const batteryPower = latest?.battery_kw ?? 0;
  // ... compute all colors, classes, paths, labels
  return { gridPower, battColor, statusClass, battFlowState, ... };
}
```

**Memoized in component**:
```typescript
const latest = liveData?.data?.[0] ?? null;
const d = useMemo(() => deriveState(latest), [latest]);
```

**Declarative JSX rendering** (all dynamic values are React props):
```typescript
<text fill={d.battColor} fontSize="18" fontWeight="bold" textAnchor="middle">
  {formatValue(d.batterySoc)} %
</text>

<path className={flowClass(d.gridFlowState)} d="M 155 350 L 60 350 ..." />

<g className={d.sunActive ? 'sun-group sun-active' : 'sun-group'}>
```

**Battery wave animation** (only imperative part):
```typescript
useEffect(() => {
  const waveContainer = svg.getElementById('batt-wave-container');
  const loop = (time: number) => {
    // smooth interpolation of bY toward bTargetY
    // horizontal offset for wave motion
    waveContainer.setAttribute('transform', `translate(${offset}, ${y})`);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => cancelAnimationFrame(animRef.current);
}, []);
```

### Props Interface

```typescript
export interface EnergyFlowSVGProps {
  width?: string | number;   // Default: '100%'
  height?: string | number;  // Default: 'auto'
}
```

The component fetches its own data internally via `useLiveData(activeDevice?.site_id)` and translations via `useTranslation('dashboard')`. No props needed for data or i18n.

### Internal Data Hooks

- `useDeviceContext()` -- provides `activeDevice.site_id`
- `useLiveData(siteId)` -- 5-second polling from `/api/influxdb`
- `useTranslation('dashboard')` -- i18n with `energyFlow.*` namespace

---

## 3. CSS Module

**Path**: `src/components/dashboard/EnergyFlowSVG.module.css`

All animation classes use `:global()` because they are applied as string class names in JSX (not CSS module references).

### Flow Lines

```css
:global(.wire-electrons)         /* Blue dashed, opacity: 0 */
:global(.wire-electrons.flowing) /* opacity: 1 */
:global(.flow-forward)           /* strokeDashoffset 24→0, 1s loop */
:global(.flow-reverse)           /* strokeDashoffset 0→24, 1s loop */
```

### Factory Smoke

```css
@keyframes smokeRise {
  0%   { transform: translateY(0) scale(1); opacity: 0.5; }
  100% { transform: translateY(-1.5px) scale(1.15); opacity: 0; }
}
```

> **Important**: The original spec used `translateY(-15px) scale(2)` which caused smoke to fly across the screen because SVG viewBox units map 1:1 to CSS px. Reduced to `-1.5px` and `scale(1.15)` for subtle wisps.

### Status Icon

```css
:global(.icon-pulse) { animation: pulse 2s ease-in-out infinite; transform-origin: 0px 0px; }
:global(.icon-spin)  { animation: spin 3s linear infinite; transform-origin: 0px 0px; }
```

> **Important**: The animation class must be on a **nested** `<g>` inside the positioning `<g transform="translate(20, 27)">`. If both are on the same element, CSS `transform` from the animation overrides the SVG `transform` attribute, causing the icon to fly away from the card.

Correct JSX structure:
```jsx
<g transform="translate(20, 27)">     {/* positioning */}
  <g className={d.statusClass}>        {/* animation */}
    <circle cx="0" cy="0" r="10" />
    <circle cx="0" cy="0" r="4" />
  </g>
</g>
```

### Sun, Shine Beams

```css
:global(.sun-group)   /* opacity: 0, transition 0.5s */
:global(.sun-active)  /* opacity: 1 */
:global(.sun-active .sun-rays)       /* rayPulse 3s */
:global(.sun-active .shine-beam-line) /* shineDash 2s */
```

---

## 4. Integration in Dashboard

**File**: `src/app/dashboard/DashboardView.tsx`

```typescript
import { EnergyFlowSVG } from '@/components/dashboard';

// In the render:
<section>
  <h2>{t('realTimeChart.title', 'Energy Flow')}</h2>
  <EnergyFlowSVG width="100%" />
</section>
```

### Sizing

The SVG scales automatically via `viewBox="0 0 350 550"` + `preserveAspectRatio="xMidYMid meet"`. The container has `max-width: 500px` and centers with `margin: 0 auto`.

### Loading & Error States

- **Loading** / no device selected: Spinner with translated message
- **Error**: Lightning bolt icon with "Energy Flow Unavailable" message
- **Data**: Full SVG renders with live-updating values

---

## 5. i18n Translation Keys

**Namespace**: `dashboard` (accessed via `useTranslation('dashboard')`)

**Key prefix**: `energyFlow.*`

| Key | English | Polish |
|---|---|---|
| `energyFlow.soc` | SoC | SoC |
| `energyFlow.status` | Status | Status |
| `energyFlow.power` | Power | Moc |
| `energyFlow.grid` | Grid | Sieć |
| `energyFlow.load` | Load | Odbiornik |
| `energyFlow.pv` | PV Power | Moc PV |
| `energyFlow.aiLogic` | AI LOGIC | LOGIKA AI |
| `energyFlow.ruleId` | RULE ID | ID REGUŁY |
| `energyFlow.action` | ACTION | AKCJA |
| `energyFlow.targetPower` | TARGET | MOC DOC. |
| `energyFlow.charging` | Charging | Ładowanie |
| `energyFlow.discharging` | Discharging | Rozład. |
| `energyFlow.standby` | Standby | Czuwanie |
| `energyFlow.charge` | Charge | Ładowanie |
| `energyFlow.discharge` | Discharge | Rozład. |

---

## 6. AI Rule ID Display Mapping

The raw `active_rule_id` from InfluxDB is displayed as-is, with one exception:

| Raw ID | Display |
|---|---|
| `local_default_standby` | Translated standby label (`t('energyFlow.standby')`) |
| Any other ID | Displayed verbatim (e.g. `"TEST-5KW"`, `"PEAK-SHAVING"`) |

---

## 7. InfluxDB Data Changes

### Type Extension (`src/types/influxdb.ts`)

Three new optional fields added to `LiveTelemetryPoint`:

```typescript
active_rule_id?: string;
active_rule_action?: 'ch' | 'sb' | 'dis';
active_rule_power?: number;
```

### Flux Query Update (`src/lib/influxdb/queries.ts`)

`buildLiveDataQuery` filter now includes:
```flux
r._field == "active_rule_id" or r._field == "active_rule_action" or r._field == "active_rule_power"
```

### API Route Update (`src/app/api/influxdb/route.ts`)

Data transformation maps the new fields through:
```typescript
active_rule_id: record.active_rule_id ?? undefined,
active_rule_action: record.active_rule_action ?? undefined,
active_rule_power: record.active_rule_power != null ? Number(record.active_rule_power) : undefined,
```

---

## 8. SVG Attribute Naming in JSX

When pasting SVG markup into JSX, these attributes must be renamed:

| HTML/SVG | JSX |
|---|---|
| `class` | `className` |
| `stroke-width` | `strokeWidth` |
| `stroke-linecap` | `strokeLinecap` |
| `stroke-linejoin` | `strokeLinejoin` |
| `stroke-dasharray` | `strokeDasharray` |
| `font-size` | `fontSize` |
| `font-weight` | `fontWeight` |
| `text-anchor` | `textAnchor` |
| `clip-path` | `clipPath` |
| `flood-opacity` | `floodOpacity` |
| `letter-spacing` | `letterSpacing` |
| `style="animation-delay: 0.8s;"` | `style={{ animationDelay: '0.8s' }}` |

---

## 9. Performance

- `requestAnimationFrame` loop: 60fps, one `setAttribute` call per frame (battery wave only)
- CSS animations (flow lines, smoke, sun): GPU-accelerated, zero JS overhead
- `useMemo`: `deriveState()` only recomputes when `latest` data point changes (every 5s)
- React reconciliation: Only changed attributes are updated in the DOM
