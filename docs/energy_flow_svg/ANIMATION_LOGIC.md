# Animation Logic - Complete State Machine

This document describes **every** animation in the SVG dashboard, its trigger conditions, timing, colors, and implementation details.

> **Web implementation note**: On the web, all animation state is computed declaratively in `deriveState()` and rendered as JSX props/class names. The only imperative animation is the battery liquid `requestAnimationFrame` loop. See [PLATFORM_WEB.md](PLATFORM_WEB.md) for details on the declarative approach.

---

## A. Flow Lines (4 lines)

### Architecture

Each connection between a node and the central hub uses **two identical SVG paths stacked on top of each other**:

1. **Base wire** (class `wire-base`): Solid grey line, always visible. This is the "pipe".
2. **Electron wire** (class `wire-electrons`): Blue dashed line drawn on top. Hidden by default (`opacity: 0`). When active, the dashes animate along the path to simulate energy flow.

### CSS Classes

| Class | Effect |
|---|---|
| `wire-base` | `fill: none; stroke: #cbd5e1; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round;` |
| `wire-electrons` | `fill: none; stroke: #3b82f6; stroke-width: 4; stroke-dasharray: 8 16; opacity: 0;` |
| `flowing` | `opacity: 1;` (makes electrons visible) |
| `flow-forward` | `animation: flowAnim 1s linear infinite;` (dashes move along path direction) |
| `flow-reverse` | `animation: flowAnimReverse 1s linear infinite;` (dashes move against path direction) |

### Keyframes

```css
@keyframes flowAnim {
  from { stroke-dashoffset: 24; }
  to   { stroke-dashoffset: 0; }
}
@keyframes flowAnimReverse {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: 24; }
}
```

The dash pattern is `8 16` = 24px total. Offsetting by exactly 24px creates a seamless loop.

### Speed

**Constant**: 1 second per loop. Speed does NOT change based on power values. Only direction changes.

### Direction Rules

All paths are drawn **from the node toward the hub** or **from the hub outward**. The "forward" direction follows the path's `d` attribute direction.

| Line | Path direction | Forward means | Reverse means |
|---|---|---|---|
| `line-batt` | Battery (top) --> Hub | Battery discharging | Battery charging |
| `line-load` | Hub --> Load (bottom center) | Load consuming | *(never happens)* |
| `line-grid` | Hub --> Grid (bottom left) | Exporting to grid | Importing from grid |
| `line-pv` | Hub --> PV (bottom right) | *(never happens)* | PV producing |

### Trigger Logic

```typescript
const battFlowState = batteryPower < -0.2 ? 'reverse' : batteryPower > 0.2 ? 'forward' : 'standby';
const loadFlowState = loadPower > 0.2 ? 'forward' : 'standby';
const gridFlowState = gridPower < -0.1 ? 'forward' : gridPower > 0.1 ? 'reverse' : 'standby';
const pvFlowState   = pvPower > 0.1 ? 'reverse' : 'standby';
```

### Web Implementation (Declarative)

Flow line classes are computed and rendered directly in JSX:

```tsx
function flowClass(state: FlowState): string {
  if (state === 'forward') return 'wire-electrons flowing flow-forward';
  if (state === 'reverse') return 'wire-electrons flowing flow-reverse';
  return 'wire-electrons';
}

<path className={flowClass(d.battFlowState)} d="M 50 150 L 50 250 ..." />
```

---

## B. Battery Liquid Animation

The battery icon has an animated liquid fill that rises/falls with SoC and waves left/right based on charge/discharge.

### Architecture

A wide wave-shaped `<path>` is drawn inside a `<clipPath>` that masks it to the battery's inner area. The wave is moved via `transform="translate(X, Y)"` on a parent `<g>`.

### Y Position (SoC Level)

```
targetY = 130 - (soc / 100 * 100)
```

- `soc = 0%` --> `targetY = 130` (wave at very bottom, below clip = empty)
- `soc = 100%` --> `targetY = 30` (wave at very top = full)

The displayed Y is **interpolated** for smooth movement:

```javascript
displayY += (targetY - displayY) * 0.1;  // 10% per frame
```

### X Offset (Wave Motion)

- **Constant speed**: 60 pixels/second
- **Direction**: `batteryPower < 0` (charging) = left (`-1`), `batteryPower > 0` (discharging) = right (`+1`)
- The wave path spans from x=-120 to x=240 (360px wide) to ensure no visible edges during panning
- Offset wraps: if `> 0`, subtract 120; if `<= -120`, add 120

### Wave Shape

Two path variants (rendered declaratively in JSX):

| State | Path `d` attribute |
|---|---|
| **Active** (wavy) | `M -120 0 Q -105 -10 -90 0 T -60 0 ...` |
| **Standby** (flat) | `M -120 0 Q -105 0 -90 0 T -60 0 ...` |

Switch to flat when `abs(batteryPower) <= 0.2`.

### Color

| SoC Range | Color | Hex |
|---|---|---|
| 0 - 20% | Red | `#ef4444` |
| 21 - 50% | Yellow | `#f59e0b` |
| 51 - 100% | Green | `#10b981` |

Applied declaratively as `fill={d.battColor}` on the liquid path.

### Animation Loop (requestAnimationFrame)

This is the **only imperative DOM operation** in the web component:

```typescript
useEffect(() => {
  const waveContainer = svg.getElementById('batt-wave-container');
  stateRef.current.bTime = performance.now();

  const loop = (time: number) => {
    const s = stateRef.current;
    const dt = Math.min(time - s.bTime, 100);
    s.bTime = time;
    s.bY += (s.bTargetY - s.bY) * 0.1;
    if (s.bSpeed > 0) {
      s.bOffset += s.bSpeed * s.bDir * (dt / 1000);
      if (s.bOffset > 0) s.bOffset -= 120;
      if (s.bOffset <= -120) s.bOffset += 120;
    }
    waveContainer.setAttribute('transform', `translate(${s.bOffset}, ${s.bY})`);
    animRef.current = requestAnimationFrame(loop);
  };
  animRef.current = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(animRef.current);
}, []);
```

A separate `useEffect` syncs `bTargetY`, `bSpeed`, and `bDir` from the derived state into the ref.

---

## C. PV Sun Animation

### Trigger

`pvPower >= 0.1` --> className includes `sun-active`.
`pvPower < 0.1` --> no `sun-active` class (sun fades out).

### Web Implementation (Declarative)

```tsx
<g className={d.sunActive ? 'sun-group sun-active' : 'sun-group'}>
```

### CSS

```css
.sun-group { opacity: 0; transition: opacity 0.5s ease; }
.sun-active { opacity: 1; }
.sun-active .sun-rays { animation: rayPulse 3s ease-in-out infinite; }
```

### Ray Pulse (NOT rotation)

> **Important**: Do NOT use CSS `rotate()` on the rays. Rotation breaks when the sun is nested inside multiple `<g transform="translate(...)">` layers because `transform-origin` cannot find the correct center.

```css
@keyframes rayPulse {
  0%   { opacity: 0.3; }
  50%  { opacity: 1; }
  100% { opacity: 0.3; }
}
```

### Shine Beams (light hitting panels)

```css
@keyframes shineDash {
  0%   { stroke-dashoffset: 20; opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { stroke-dashoffset: -20; opacity: 0; }
}
```

Two beam lines with staggered delays (0s and 0.5s).

---

## D. Load (Factory) Smoke Animation

### Trigger

`loadPower > 0.2` --> className includes `smoke-active`.
`loadPower <= 0.2` --> no `smoke-active` class.

### Smoke Puffs

Three `<circle>` elements at the same position (chimney tip), staggered by `animation-delay`:

| Element | Delay |
|---|---|
| smoke-1 | 0s |
| smoke-2 | 0.8s |
| smoke-3 | 1.6s |

### Animation

```css
.smoke-puff {
  transform-origin: center;
  opacity: 0;
}
.smoke-active {
  animation: smokeRise 2.5s ease-in infinite;
}
@keyframes smokeRise {
  0%   { transform: translateY(0) scale(1); opacity: 0.5; }
  100% { transform: translateY(-1.5px) scale(1.15); opacity: 0; }
}
```

> **Important**: The original spec used `translateY(-15px) scale(2)` but in an SVG with `viewBox="0 0 350 550"`, CSS `px` values map 1:1 to SVG user units, causing the smoke to fly far across the screen. The values were reduced to `translateY(-1.5px) scale(1.15)` for a subtle wisp effect. The blur filter (`#smoke-blur`) makes even these tiny puffs look soft.

---

## E. Status Icon Animation

The status card has a circular icon with an outer ring and inner dot.

### States

| State | Text | Text Color | Icon Color | Outer Ring | Animation |
|---|---|---|---|---|---|
| Standby | "Standby" / "Czuwanie" | `#64748b` | `#64748b` | Solid | None |
| Charging | "Charging" / "Ładowanie" | `#3b82f6` | `#3b82f6` | Solid | Pulse |
| Discharging | "Discharging" / "Rozład." | `#f59e0b` | `#f59e0b` | Dashed `15 6` | Spin |

### Trigger

Based on `batteryPower`:
- `< -0.5` = Charging
- `> 0.5` = Discharging
- otherwise = Standby

### CSS

```css
@keyframes pulse {
  0%   { transform: scale(0.95); opacity: 0.5; }
  50%  { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.5; }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.icon-pulse { animation: pulse 2s ease-in-out infinite; transform-origin: 0px 0px; }
.icon-spin  { animation: spin 3s linear infinite; transform-origin: 0px 0px; }
```

### Critical: Nested Group Structure

> **Important**: The animation class MUST be on a **nested** `<g>` inside the positioning group. If both the CSS `transform` animation and SVG `transform="translate()"` are on the same element, CSS overrides the SVG attribute, causing the icon to fly away from its card.

Correct structure:
```jsx
<g transform="translate(20, 27)">     {/* positioning -- outer */}
  <g className={d.statusClass}>        {/* animation -- inner */}
    <circle cx="0" cy="0" r="10" />
    <circle cx="0" cy="0" r="4" />
  </g>
</g>
```

---

## F. Text Scaling

### Problem

When values exceed ~1000 kW (e.g. "1500 kW"), the text string physically overflows into the node's icon area.

### Solution

SVG `textLength` + `lengthAdjust` attributes are applied to the AI Rule ID text element to handle long rule names.

### Value Formatting

```typescript
const formatValue = (v: number) => Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toString();
```

Display strings are always `formatValue(absValue) + " kW"`, e.g.: `"23.6 kW"`, `"1500 kW"`.

---

## G. Grid Arrow Direction

The grid node has a small directional arrow next to the tower icon.

| Condition | Arrow Direction | Arrow Color | Meaning |
|---|---|---|---|
| `gridPower > 0.1` | Points right (toward tower) | `#ef4444` (red) | Importing from grid |
| `gridPower < -0.1` | Points left (away from tower) | `#10b981` (green) | Exporting to grid |
| Near zero | Flat line (no arrowhead) | `#475569` (grey) | No flow |

### SVG Path Variants (computed in deriveState)

```typescript
// Import (right-pointing arrow)
"M 4 18 L 10 18 M 8 16 L 10 18 L 8 20"

// Export (left-pointing arrow)
"M 10 18 L 4 18 M 6 16 L 4 18 L 6 20"

// Standby (flat line)
"M 4 18 L 10 18"
```

---

## H. AI Decision Node Colors

The AI node color-codes its text based on `activeRuleAction`:

```typescript
const aiColorMap: Record<string, string> = {
  ch:  '#3b82f6',  // Blue
  sb:  '#64748b',  // Grey
  dis: '#f59e0b',  // Orange
};
```

Applied to both Rule ID and Action text fills. The Target Power text is dark (`#1e293b`) when active, grey (`#64748b`) when standby.

### Rule ID Display

The internal rule ID `local_default_standby` is replaced with the translated standby label (e.g. "Czuwanie" in Polish, "Standby" in English). All other rule IDs are displayed verbatim.
