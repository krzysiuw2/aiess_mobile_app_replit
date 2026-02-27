# React Native (Expo) Implementation Guide

React Native does NOT support CSS `@keyframes` or `class`-based animations on SVG elements. All animations must use `react-native-reanimated` shared values or raw `requestAnimationFrame`.

---

## 1. Dependencies

Already installed (no new packages needed):

| Package | Version | Purpose |
|---|---|---|
| `react-native-svg` | 15.12.1 | SVG rendering |
| `react-native-reanimated` | (bundled with Expo ~54) | Animations |

---

## 2. SVG Element Mapping

| HTML SVG | react-native-svg Import |
|---|---|
| `<svg>` | `Svg` |
| `<g>` | `G` |
| `<rect>` | `Rect` |
| `<circle>` | `Circle` |
| `<path>` | `Path` |
| `<line>` | `Line` |
| `<text>` | `Text` (from `react-native-svg`, NOT React Native) |
| `<polygon>` | `Polygon` |
| `<defs>` | `Defs` |
| `<clipPath>` | `ClipPath` |
| `<filter>` | **NOT SUPPORTED** -- see section 6 |

### Attribute Naming

react-native-svg uses camelCase props identical to JSX:

| HTML | RN-SVG Prop |
|---|---|
| `stroke-width` | `strokeWidth` |
| `stroke-linecap` | `strokeLinecap` |
| `stroke-linejoin` | `strokeLinejoin` |
| `stroke-dasharray` | `strokeDasharray` |
| `stroke-dashoffset` | `strokeDashoffset` |
| `font-size` | `fontSize` |
| `font-weight` | `fontWeight` |
| `text-anchor` | `textAnchor` |
| `clip-path` | `clipPath` |
| `fill-opacity` | `fillOpacity` |
| `text` content | Children of `<Text>` component |

---

## 3. Component Structure

```typescript
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  G, Rect, Circle, Path, Line, Text as SvgText,
  Polygon, Defs, ClipPath,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import type { LiveData } from '@/types';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DIAGRAM_WIDTH = SCREEN_WIDTH - 32;
const ASPECT_RATIO = 350 / 550;
const DIAGRAM_HEIGHT = DIAGRAM_WIDTH / ASPECT_RATIO;

interface EnergyFlowProps {
  liveData: LiveData | null | undefined;
  t: {
    monitor: {
      soc: string; status: string; power: string;
      grid: string; load: string; pv: string;
      aiLogic: string; ruleId: string; action: string; targetPower: string;
    };
  };
}

const formatValue = (value: number): string =>
  Math.abs(value) < 100 ? value.toFixed(1) : Math.round(value).toString();

export default function EnergyFlowSVG({ liveData, t }: EnergyFlowProps) {
  // ... implementation below
}
```

---

## 4. Animation Strategy

### A. Flow Lines (stroke-dashoffset animation)

Each of the 4 flow lines needs an independent animated `strokeDashoffset`.

```typescript
// Inside the component:
const battFlowOffset = useSharedValue(0);
const gridFlowOffset = useSharedValue(0);
const loadFlowOffset = useSharedValue(0);
const pvFlowOffset = useSharedValue(0);

// Opacity shared values (0 = standby, 1 = flowing)
const battFlowOpacity = useSharedValue(0);
const gridFlowOpacity = useSharedValue(0);
const loadFlowOpacity = useSharedValue(0);
const pvFlowOpacity = useSharedValue(0);

// Helper to start/stop flow
function startFlow(offsetSV: Animated.SharedValue<number>, direction: 'forward' | 'reverse') {
  cancelAnimation(offsetSV);
  if (direction === 'forward') {
    offsetSV.value = 24;
    offsetSV.value = withRepeat(
      withTiming(0, { duration: 1000, easing: Easing.linear }),
      -1, // infinite
      false
    );
  } else {
    offsetSV.value = 0;
    offsetSV.value = withRepeat(
      withTiming(24, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
  }
}

function stopFlow(offsetSV: Animated.SharedValue<number>) {
  cancelAnimation(offsetSV);
  offsetSV.value = 0;
}

// Animated props for each line
const battLineProps = useAnimatedProps(() => ({
  strokeDashoffset: battFlowOffset.value,
  opacity: battFlowOpacity.value,
}));
// ... same for grid, load, pv

// Usage in JSX:
<AnimatedPath
  d="M 50 150 L 50 250 Q 50 270 70 270 L 155 270 Q 175 270 175 290 L 175 320"
  stroke="#3b82f6"
  strokeWidth={4}
  strokeLinecap="round"
  strokeLinejoin="round"
  strokeDasharray="8 16"
  fill="none"
  animatedProps={battLineProps}
/>
```

### B. Battery Liquid (requestAnimationFrame)

This works identically to the web version. React Native supports `requestAnimationFrame`.

```typescript
const waveTransformRef = useRef({ x: 0, y: 70 });
const waveStateRef = useRef({ targetY: 70, speed: 0, dir: 1 });
const waveGroupRef = useRef<any>(null);

useEffect(() => {
  let lastTime = performance.now();
  let running = true;

  const loop = (time: number) => {
    if (!running) return;
    const dt = Math.min(time - lastTime, 100);
    lastTime = time;
    const t = waveTransformRef.current;
    const s = waveStateRef.current;

    t.y += (s.targetY - t.y) * 0.1;

    if (s.speed > 0) {
      t.x += s.speed * s.dir * (dt / 1000);
      if (t.x > 0) t.x -= 120;
      if (t.x <= -120) t.x += 120;
    }

    // Use setNativeProps for best performance
    waveGroupRef.current?.setNativeProps({
      matrix: [1, 0, 0, 1, t.x, t.y],
    });

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  return () => { running = false; };
}, []);
```

> **Alternative**: If `setNativeProps` with matrix is problematic, use a reanimated shared value for `translateX` and `translateY` and apply via `useAnimatedProps` on the `<G>` element.

### C. Sun Ray Pulse (opacity animation)

```typescript
const sunOpacity = useSharedValue(0);
const rayOpacity = useSharedValue(0.3);

// When pvPower >= 0.1:
sunOpacity.value = withTiming(1, { duration: 500 });
rayOpacity.value = withRepeat(
  withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
  -1,
  true // reverse (ping-pong between 0.3 and 1)
);

// When pvPower < 0.1:
sunOpacity.value = withTiming(0, { duration: 500 });
cancelAnimation(rayOpacity);

const sunGroupProps = useAnimatedProps(() => ({ opacity: sunOpacity.value }));
const rayGroupProps = useAnimatedProps(() => ({ opacity: rayOpacity.value }));
```

### D. Smoke Animation (translateY + opacity + scale)

```typescript
// For each smoke puff (3 total, with staggered start):
const smokeY = useSharedValue(0);
const smokeOpacity = useSharedValue(0);
const smokeScale = useSharedValue(1);

function startSmoke(delay: number) {
  setTimeout(() => {
    smokeY.value = withRepeat(
      withTiming(-15, { duration: 2500, easing: Easing.in(Easing.ease) }),
      -1, false
    );
    smokeOpacity.value = withRepeat(
      withTiming(0, { duration: 2500, easing: Easing.in(Easing.ease) }),
      -1, false
    );
    smokeScale.value = withRepeat(
      withTiming(2, { duration: 2500, easing: Easing.in(Easing.ease) }),
      -1, false
    );
  }, delay);
}

// Reset on stop:
function stopSmoke() {
  cancelAnimation(smokeY);
  cancelAnimation(smokeOpacity);
  cancelAnimation(smokeScale);
  smokeY.value = 0;
  smokeOpacity.value = 0;
  smokeScale.value = 1;
}

const smokePuffProps = useAnimatedProps(() => ({
  cy: 4 + smokeY.value,
  r: 2.5 * smokeScale.value,
  opacity: smokeOpacity.value,
}));
```

### E. Status Icon

For the status icon, use animated opacity for the pulse effect:

```typescript
const statusPulseOpacity = useSharedValue(1);

// Charging: start pulse
statusPulseOpacity.value = withRepeat(
  withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
  -1, true
);

// Standby: stop
cancelAnimation(statusPulseOpacity);
statusPulseOpacity.value = 1;
```

> **Note**: The spin animation for the discharging state is harder in RN. A simple approach: use a rotating `strokeDashoffset` on the outer circle's `strokeDasharray` to simulate rotation, or just use a pulse for both charging and discharging (with different colors).

---

## 5. Data Update (useEffect)

```typescript
useEffect(() => {
  const batteryPower = liveData?.batteryPower ?? 0;
  const batterySoc = liveData?.batterySoc ?? 0;
  const gridPower = liveData?.gridPower ?? 0;
  const loadPower = liveData?.factoryLoad ?? 0;
  const pvPower = liveData?.pvPower ?? 0;

  // Update battery wave state
  waveStateRef.current.targetY = 130 - (batterySoc / 100) * 100;
  const bAbs = Math.abs(batteryPower);
  if (bAbs <= 0.2) {
    waveStateRef.current.speed = 0;
    // Switch to flat wave path via state
  } else {
    waveStateRef.current.speed = 60;
    waveStateRef.current.dir = batteryPower < 0 ? -1 : 1;
    // Switch to wavy path via state
  }

  // Update flow lines
  if (batteryPower < -0.2) {
    battFlowOpacity.value = withTiming(1, { duration: 300 });
    startFlow(battFlowOffset, 'reverse');
  } else if (batteryPower > 0.2) {
    battFlowOpacity.value = withTiming(1, { duration: 300 });
    startFlow(battFlowOffset, 'forward');
  } else {
    battFlowOpacity.value = withTiming(0, { duration: 300 });
    stopFlow(battFlowOffset);
  }

  // ... same pattern for grid, load, pv lines

  // Update smoke
  if (loadPower > 0.2) { startSmoke(0); startSmoke(800); startSmoke(1600); }
  else { stopSmoke(); }

  // Update sun
  if (pvPower >= 0.1) { /* start sun animation */ }
  else { /* stop sun animation */ }

  // Update text values via React state (useState for each text)
  // Text elements re-render via React, not imperative setAttribute

}, [liveData]);
```

---

## 6. Filters (NOT supported in react-native-svg)

These SVG filters from the template are **NOT available** in `react-native-svg`:

- `<feDropShadow>` (card shadows)
- `<feGaussianBlur>` (smoke blur, lamp glow, sun glow)

### Workarounds

| Filter | Workaround |
|---|---|
| Card shadows (`card-shadow`) | Use `react-native-shadow-2`, or wrap the card SVG group in a `<View>` with `style={{ shadowColor, shadowOffset, shadowOpacity, shadowRadius }}` |
| Smoke blur (`smoke-blur`) | Skip the blur -- the smoke circles still look fine without it, just slightly sharper |
| Lamp glow (`lamp-glow`) | Skip -- the green circle is still visible and clear |
| Sun glow (`sun-glow`) | Skip -- the yellow circle is bright enough on its own |

Alternatively, if visual parity is critical, consider using `@shopify/react-native-skia` which supports full filter effects, but this adds a significant new dependency.

---

## 7. Text Rendering

SVG `<Text>` in `react-native-svg` works differently:

```tsx
// HTML SVG:
<text x="55" y="42" fill="#10b981" font-size="18">42.0 %</text>

// react-native-svg:
<SvgText x={55} y={42} fill="#10b981" fontSize={18} fontWeight="bold" textAnchor="middle">
  {socValue}
</SvgText>
```

### textLength / lengthAdjust

`textLength` and `lengthAdjust` are **supported** in `react-native-svg` >= 13. Since version 15.12.1 is installed, this works:

```tsx
<SvgText
  x={12} y={40}
  fontSize={formattedValue.length >= 6 ? 13 : 16}
  fontWeight="bold"
  textLength={formattedValue.length >= 6 ? 45 : undefined}
  lengthAdjust={formattedValue.length >= 6 ? 'spacingAndGlyphs' : undefined}
>
  {formattedValue}
</SvgText>
```

---

## 8. Component Architecture Recommendation

Break the SVG into sub-components for maintainability:

```
components/
  EnergyFlowSVG/
    index.tsx              # Main component, orchestrates data flow
    FlowLines.tsx          # The 4 animated flow lines
    BatteryNode.tsx        # Battery icon with liquid animation
    SocCard.tsx            # SoC percentage card
    StatusCard.tsx         # Status text + icon
    PowerCard.tsx          # Battery power card
    AiDecisionNode.tsx     # AI logic card
    InverterHub.tsx        # Central inverter icon
    GridNode.tsx           # Grid card + tower icon
    LoadNode.tsx           # Load card + factory icon + smoke
    PvNode.tsx             # PV card + panels + sun
```

Each sub-component receives its slice of data as props and manages its own animations internally. The main `index.tsx` maps `liveData` fields to each sub-component.

---

## 9. Replacing the Rive Component

### Before (EnergyFlowWithFallback.tsx):

```typescript
import EnergyFlowRive from './EnergyFlowRive';
// Dynamic loading, fallback logic, etc.
```

### After:

```typescript
import EnergyFlowSVG from './EnergyFlowSVG';

export default function EnergyFlowWithFallback({ liveData, t }: Props) {
  return <EnergyFlowSVG liveData={liveData} t={t} />;
}
```

Or just replace the import in `monitor.tsx` directly and remove the fallback wrapper entirely.

---

## 10. Testing

1. Open `reference/dashboard_v3_pl.html` in a desktop browser as the visual reference
2. Build the RN component and compare side-by-side
3. Test all states:
   - All values at 0 (everything standby, no animations)
   - Battery charging at -10 kW (blue flow to battery, wave left, blue status)
   - Battery discharging at +10 kW (orange flow from battery, wave right, orange status)
   - Grid importing at +20 kW (blue flow from grid)
   - Grid exporting at -20 kW (blue flow to grid, green arrow)
   - Load at 15 kW (blue flow to load, smoke active)
   - PV at 5 kW (blue flow from PV, sun active)
   - Values > 1000 kW (text scaling kicks in)
