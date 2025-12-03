
---

# 📄 CURSOR AGENT DESCRIPTION — Energy Flow Dashboard (AIESS)

## Overview

This project uses a **Rive animation** (`energy_flow_v3.riv`) to visualize real-time energy flows between:

* Grid
* Factory
* PV (solar)
* Battery Storage Cabinet (Hub)

The Rive file contains:

* Static base wiring lines (`__base`)
* Animated overlay lines with trim path flow (`__flow`)
* Four independent state machines controlling animation direction

The **numeric values** (kW, %, text) are NOT inside Rive.
They must be rendered via React using absolutely positioned `<div>` elements on top of the Rive canvas.

---

## Rive State Machines

There are **4 independent State Machines**:

```
sm_cabinet_grid
sm_cabinet_factory
sm_cabinet_pv
sm_cabinet_battery
```

### Inputs (Number)

Each machine exposes one numeric input:

```
grid_cabinet_power_kw
cabinet_factory_power_kw
pv_cabinet_power_kw
cabinet_battery_power_kw
```

These values come from application data (InfluxDB live query).

### Behavior

#### sm_cabinet_grid

* Positive values → grid → cabinet flow
* Negative values → cabinet → grid flow
* Near zero → idle (no flow)

#### sm_cabinet_factory

* Positive values → cabinet → factory flow
* Near zero → idle

#### sm_pv_cabinet

* Positive values → pv → cabinet flow
* Near zero → idle

#### sm_cabinet_battery

* Positive values → cabinet → battery flow (charging)
* Negative values → battery → cabinet flow (discharging)
* Near zero → idle

---

## React Integration Protocol

Import Rive:

```ts
import { useRive } from '@rive-app/react-canvas';
```

Initialize:

```ts
const { rive, RiveComponent } = useRive({
  src: '/assets/rive/energy_flow_v3.riv',
  stateMachines: [
    'sm_cabinet_grid',
    'sm_cabinet_factory',
    'sm_pv_cabinet',
    'sm_cabinet_battery',
  ],
  autoplay: true,
});
```

### Updating power values

```ts
function updateInput(sm: string, name: string, value: number) {
  if (!rive) return;
  const inputs = rive.stateMachineInputs(sm);
  const input = inputs.find(i => i.name === name);
  if (input && input.type === 'number') {
    input.value = value;
  }
}
```

Example usage:

```ts
updateInput('sm_cabinet_grid', 'grid_cabinet_power_kw', data.gridKw);
updateInput('sm_cabinet_factory', 'cabinet_factory_power_kw', data.factoryKw);
updateInput('sm_pv_cabinet', 'pv_cabinet_power_kw', data.pvKw);
updateInput('sm_cabinet_battery', 'cabinet_battery_power_kw', data.batteryKw);
```

> These calls should run on data refresh: websockets, polling, or server event.

---

## Dynamic Text Rendering (IMPORTANT)

Rive **does not** contain any numeric dynamic text inside.

All numeric values must be rendered **in HTML** positioned over the Rive canvas.

Typical styling:

```html
<div class="absolute w-[368px] h-[510px] relative">
  <RiveComponent />

  <div class="absolute top-[420px] left-[50px]">
    {gridKw.toFixed(1)} kW
  </div>

  <div class="absolute top-[420px] left-[165px]">
    {factoryKw.toFixed(1)} kW
  </div>

  <div class="absolute top-[420px] left-[275px]">
    {pvKw.toFixed(1)} kW
  </div>
</div>
```

### Cursor MUST NOT:

* Try to inject dynamic values into Rive text objects
* Modify `.riv` at runtime
* Add state machines for numeric text

**All numeric UI is HTML overlay.**

---

## Rules for Cursor

### DO:

* Control animation direction by setting numeric inputs
* Render kW values, percentages, and status text in HTML

### DO NOT:

* Attempt to change Rive animations with text
* Add new timeline animations automatically
* Rename Rive inputs or state machine names
* Edit `.riv` file dynamically via code

---

## Data Source Spec (for Cursor agents)

Cursor will receive time-series data from InfluxDB containing:

```
gridKw: number        // signed import/export
factoryKw: number     // >= 0
pvKw: number          // >= 0
batteryKw: number     // signed charge/discharge
socPercent: number    // 0–100
statusText: string    // "charging", "discharging", "idle"
```

Cursor can use:

* `setInterval`
* `SSE`
* `WebSocket`
* or `React Query + refetchInterval`

to update state machine values every 3–10 seconds.

---

## Performance Considerations

* Rive animations run on 60 fps canvas, cheap
* HTML overlays are cheap, no DOM thrash
* No re-render blocking

---
