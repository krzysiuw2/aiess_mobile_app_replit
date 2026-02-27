# Safety SoC Limits (v1.4.3)

> Battery safety limits that override ALL rules, including P11.
> Stored in `desired.safety` in the AWS IoT Shadow.

---

## Overview

Safety SoC limits define the absolute boundaries for battery operation:
- `soc_min`: Never discharge below this percentage
- `soc_max`: Never charge above this percentage

These limits are the **highest authority** in the system. They override every rule, including P11 safety rules and P10 SCADA commands.

---

## Shadow Location

```json
{
  "state": {
    "desired": {
      "v": "1.2",
      "mode": "automatic",
      "safety": {
        "soc_min": 10,
        "soc_max": 90
      },
      "sch": { ... }
    }
  }
}
```

The `safety` object sits at the same level as `sch` (schedules), NOT inside it.

---

## Field Specification

| Field | Type | Required | Range | Default | Description |
|-------|------|----------|-------|---------|-------------|
| `safety` | object | No | -- | `{soc_min: 5, soc_max: 100}` | Safety limits container |
| `safety.soc_min` | number | If safety present | 0-100 | 5 | Minimum SoC % |
| `safety.soc_max` | number | If safety present | 0-100 | 100 | Maximum SoC % |

### Validation Rules

- `soc_min` must be >= 0 and <= 100
- `soc_max` must be >= 0 and <= 100
- `soc_min` must be < `soc_max`

---

## Priority Hierarchy

Safety limits override **everything**:

```
1. Safety SoC Limits (desired.safety)    <-- HIGHEST
2. P11 (Local Safety Rules)
3. P10 (SCADA Commands)
4. P9 (Site Limits)
5. P8-P4 (Cloud Rules)
6. P3-P1 (Local Rules)                   <-- LOWEST
```

If shadow says `soc_min: 10`, the device **must not** discharge below 10% regardless of any other rule.

---

## API Usage

### Read Current Safety Limits

```typescript
const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
  headers: { 'x-api-key': API_KEY },
});
const data = await response.json();

console.log(data.safety);
// { soc_min: 5, soc_max: 100 }
```

If the shadow has no `safety` object, the GET response returns defaults: `{ soc_min: 5, soc_max: 100 }`.

### Update Safety Limits

```typescript
async function setSafetyLimits(siteId: string, socMin: number, socMax: number) {
  if (socMin >= socMax) {
    throw new Error('soc_min must be less than soc_max');
  }

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_id: siteId,
      safety: { soc_min: socMin, soc_max: socMax },
      sch: {},  // Empty -- don't modify rules
    }),
  });

  return response.json();
}

// Usage
await setSafetyLimits('domagala_1', 10, 90);
```

### Update Safety Limits Only (Without Touching Rules)

Send `sch: {}` to update safety without modifying any rules:

```json
{
  "site_id": "domagala_1",
  "safety": { "soc_min": 15, "soc_max": 85 },
  "sch": {}
}
```

---

## Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| Old shadow (no `safety` field) | GET returns defaults `{soc_min: 5, soc_max: 100}` |
| Old app calling new Lambda | Works (ignores the new `safety` field) |
| New app calling with `safety` | Sets safety limits in shadow |
| Old device reading new shadow | Device ignores `safety` (uses hardcoded P11 limits) |

**Recommendation**: Update edge device firmware to read and enforce `safety` limits for centralized control.

---

## Validation Errors

```json
// Invalid soc_min (out of range)
{ "error": "Invalid soc_min: 150. Must be between 0 and 100" }

// Invalid relationship
{ "error": "soc_min (50) must be less than soc_max (30)" }

// Invalid type
{ "error": "Safety must be an object with soc_min and soc_max fields" }
```

---

## Practical Recommendations

| Setting | Recommended | Notes |
|---------|-------------|-------|
| `soc_min` | 5-10% | Deep discharge damages battery |
| `soc_max` | 80-95% | 100% is valid but reduces battery longevity |
| Daily use | 10/90 | Good balance of usable capacity and longevity |
| Warranty safe | 5/100 | Maximum usable range |

---

## FAQ

**Q: Can I set `soc_min` to 0?**
A: Technically valid (0-100 range), but not recommended. Deep discharge damages the battery.

**Q: Can I remove safety limits?**
A: No. They always have defaults (5/100). Set to desired values or leave at defaults.

**Q: What happens during shadow merge conflicts?**
A: AWS IoT Shadow uses "last write wins" for nested objects. Use version checks for optimistic locking if needed.
