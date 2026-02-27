# SVG Energy Flow Dashboard - Implementation Package

> **Purpose**: Drop-in replacement for the Rive animation (`energy_dashboard_v4.riv`) used in the AIESS energy monitoring app. This package contains everything an implementing agent needs to integrate the SVG dashboard into **Next.js (web)** and **React Native / Expo (mobile)**.

---

## Implementation Status

| Platform | Status | Notes |
|---|---|---|
| **Web (Next.js)** | **COMPLETED** | Fully working declarative React component with live data |
| Mobile (React Native) | Not started | See [PLATFORM_MOBILE.md](PLATFORM_MOBILE.md) for spec |

---

## Quick Visual Reference

```
┌────────────────────────────────────────┐
│            Your Live Dashboard         │
│                                        │
│   ╔══════╗  ┌─────────┐ ┌──────────┐  │
│   ║ BATT ║  │ SoC     │ │ Status   │  │
│   ║ icon ║  │ 42.0 %  │ │Dischargin│  │
│   ╚══════╝  └─────────┘ └──────────┘  │
│                         ┌──────────┐   │
│                         │ Power    │   │
│                         │ 0.7 kW   │   │
│                         └──────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ AI LOGIC                        │   │
│  │ RULE ID │ ACTION │ TARGET POWER │   │
│  └─────────────────────────────────┘   │
│                  │                     │
│           ┌──────┴──────┐              │
│           │  INVERTER   │              │
│           │    (hub)    │              │
│           └──────┬──────┘              │
│          ┌───────┼───────┐             │
│   ┌──────┴┐ ┌───┴────┐ ┌┴───────┐    │
│   │ Grid  │ │ Load   │ │  PV    │    │
│   │23.6 kW│ │24.3 kW │ │ 0.0 kW │    │
│   └───────┘ └────────┘ └────────┘    │
└────────────────────────────────────────┘
```

SVG ViewBox: **350 x 550** (aspect ratio ~0.64:1)

---

## Package Contents

| File | Purpose |
|---|---|
| `README.md` | This file -- overview, migration checklist |
| [PROPS_CONTRACT.md](PROPS_CONTRACT.md) | Data interface, AI fields, i18n keys, sign conventions |
| [SVG_TEMPLATE.svg](SVG_TEMPLATE.svg) | Raw SVG markup with placeholder tokens -- the visual "source of truth" |
| [ANIMATION_LOGIC.md](ANIMATION_LOGIC.md) | Complete state machine: every animation rule, threshold, color, and timing |
| [PLATFORM_WEB.md](PLATFORM_WEB.md) | Next.js implementation guide (reflects ACTUAL working code) |
| [PLATFORM_MOBILE.md](PLATFORM_MOBILE.md) | React Native guide: `react-native-svg` + `react-native-reanimated` strategy |
| `reference/dashboard_v2.html` | Working English prototype (open in browser to test) |
| `reference/dashboard_v3_pl.html` | Working Polish prototype (open in browser to test) |

---

## Web App Migration (COMPLETED)

### Files CREATED

| File | Purpose |
|---|---|
| `src/components/dashboard/EnergyFlowSVG.tsx` | New declarative SVG component |
| `src/components/dashboard/EnergyFlowSVG.module.css` | CSS keyframes for all animations |

### Files MODIFIED

| File | Change |
|---|---|
| `src/types/influxdb.ts` | Added `active_rule_id`, `active_rule_action`, `active_rule_power` to `LiveTelemetryPoint` |
| `src/lib/influxdb/queries.ts` | Added 3 AI fields to the Flux query filter in `buildLiveDataQuery` |
| `src/app/api/influxdb/route.ts` | Maps AI fields from InfluxDB through to API response |
| `src/components/dashboard/index.ts` | Barrel export: `EnergyFlowSVG` replaces `EnergyFlowRive` |
| `src/app/dashboard/DashboardView.tsx` | Renders `<EnergyFlowSVG>` instead of `<EnergyFlowRive>` |
| `public/locales/en/dashboard.json` | Added `energyFlow.*` translation keys |
| `public/locales/pl/dashboard.json` | Added Polish `energyFlow.*` translations |
| `next.config.mjs` | Removed Rive `.riv` file headers |

### Files DELETED

| File | Reason |
|---|---|
| `src/components/dashboard/EnergyFlowRive.tsx` | Replaced by `EnergyFlowSVG.tsx` |

### Dependencies REMOVED

| Package | Reason |
|---|---|
| `@rive-app/react-canvas` | No longer needed |

### Files UNCHANGED

| File | Why |
|---|---|
| `src/hooks/useInfluxData.ts` | `useLiveData()` hook unchanged |
| `src/contexts/DeviceContext.tsx` | `useDeviceContext()` unchanged |

---

## Mobile App Migration (NOT YET DONE)

### Files to REPLACE

| File | Action |
|---|---|
| `components/EnergyFlowRive.tsx` | **Replace** with new `EnergyFlowSVG.tsx` (see [PLATFORM_MOBILE.md](PLATFORM_MOBILE.md)) |
| `components/EnergyFlowWithFallback.tsx` | **Simplify** -- remove dynamic Rive loading, just render SVG directly |
| `components/EnergyFlowDiagram.tsx` | **Remove** -- static fallback is no longer needed |

### Files to CLEAN UP

| File | Change |
|---|---|
| `metro.config.js` | Remove the line `config.resolver.assetExts.push('riv');` |
| `package.json` | Remove dependency `"rive-react-native": "^9.7.0"` |
| `assets/` or native dirs | Delete `energy_dashboard_v4.riv` and `intro_animation_v1.riv` (if present) |

---

## Key Differences from Rive

| Aspect | Rive (old) | SVG (new) |
|---|---|---|
| Animation engine | Rive State Machine (`sm_energy_flow`) | CSS `@keyframes` (web) / `react-native-reanimated` (mobile) + JS `requestAnimationFrame` for battery liquid |
| Flow speed | Proportional to power magnitude | **Constant speed** -- only direction changes |
| Battery visual | Static icon | Animated liquid fill with wave motion, color-coded by SoC |
| AI Decision node | Not present | New card showing `active_rule_id`, `active_rule_action`, `active_rule_power` |
| Sign inversion | `cabinet_battery_power_kw = -batteryPower` (Rive quirk) | Use `batteryPower` directly -- no inversion needed |
| Text scaling | Fixed font sizes | Dynamic `textLength` + `lengthAdjust` for values > 1000 kW |
| i18n labels | Via Rive text runs | Via `useTranslation('dashboard')` with `energyFlow.*` namespace |
| Rendering approach | Imperative (useEffect + getElementById) | **Declarative** (React JSX with computed props) |
| Dependencies | `@rive-app/react-canvas` (~150KB) | Zero extra dependencies |
