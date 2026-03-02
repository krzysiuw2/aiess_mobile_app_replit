# 07 — Web Panel UI Patterns

> Practical guidance for building the rule editor UI in the web panel.
> Covers form structure, conditional field visibility, editor workflow,
> and the rule list display.

---

## 1. Rule Editor Form Structure

The editor should show/hide fields dynamically based on the selected action type.

### Always Visible Fields

| Field | Input Type | Notes |
|-------|-----------|-------|
| Rule ID | text | 1-63 chars, auto-generate or user-defined |
| Priority | select | P5-P8 for most rules, P9 only for `sl` |
| Action Type | select | `ch`, `dis`, `sb`, `sl`, `ct`, `dt` |
| Active | toggle | Default: on |

### Conditional Fields by Action Type

| Action | Show These Action Fields | Hide These |
|--------|-------------------------|------------|
| `ch` | Power (kW), PID toggle | soc, maxp, maxg, ming, str, hth, lth |
| `dis` | Power (kW), PID toggle | soc, maxp, maxg, ming, str, hth, lth |
| `sb` | (none — pw is auto-set to 0) | Everything |
| `sl` | High Threshold (kW), Low Threshold (kW) | pw, pid, soc, maxp, maxg, ming, str |
| `ct` | Target SoC (%), Max Power (kW), Max Grid Import (kW), Strategy | pw, pid, hth, lth, ming |
| `dt` | Target SoC (%), Max Power (kW), Min Grid Power (kW), Strategy | pw, pid, hth, lth, maxg |

### Condition Fields (always available)

| Field | Input Type | Notes |
|-------|-----------|-------|
| Time Start | time picker | Converts to HHMM integer |
| Time End | time picker | Converts to HHMM integer |
| SoC Min (%) | number slider 0-100 | Condition: rule only active when SoC >= this |
| SoC Max (%) | number slider 0-100 | Condition: rule only active when SoC <= this |
| Grid Power Operator | select | `gt`, `lt`, `gte`, `lte`, `eq`, `bt` |
| Grid Power Value (kW) | number | Primary threshold |
| Grid Power Max (kW) | number | Only visible when operator = `bt` |

### Schedule Fields

| Field | Input Type | Notes |
|-------|-----------|-------|
| Weekdays | 7-day checkbox group | Sun(0)–Sat(6), all selected = omit |
| Valid From | date picker | Convert to Unix timestamp |
| Valid Until | date picker | Convert to Unix timestamp |

---

## 2. Form Validation Rules

### Per Action Type

```typescript
function getValidationRules(actionType: ActionType) {
  switch (actionType) {
    case 'ch':
    case 'dis':
      return { power: { required: true, min: 0 } };
    case 'sb':
      return {}; // no editable fields
    case 'sl':
      return {
        highThreshold: { required: true },
        lowThreshold: { required: true },
        priority: { fixed: 9, message: 'Site limit must be P9' },
      };
    case 'ct':
      return { targetSoc: { required: true, min: 0, max: 100 } };
    case 'dt':
      return { targetSoc: { required: true, min: 0, max: 100 } };
  }
}
```

### Global Validations

- Rule ID: required, 1-63 characters, unique within its priority array
- Priority: 4-9 (enforce P9 for `sl`)
- SoC conditions: `sm < sx` when both provided, both 0-100
- Time: valid HHMM (0-2359)
- Shadow size: total payload <= 7,680 bytes after adding/updating the rule

---

## 3. Rule List Display

### Recommended Columns

| Column | Source | Rendering |
|--------|--------|-----------|
| Priority | parent `p_X` key | Badge: "P7 Normal" |
| Status | `act` field | Green dot = active, gray = inactive |
| Action | `a.t` | Label: "Charge 30 kW" / "Discharge to 30%" |
| Schedule | `c.ts`/`c.te` + `d` | "17:00-21:00, Mon-Fri" |
| Conditions | `c.sm`/`c.sx`/`c.gpo` | "SoC 30-80%, Grid > 20 kW" |
| Source | `s` | Icon: AI / Manual |
| Actions | — | Edit, Delete, Toggle buttons |

### Rule Summary Function

Use `getRuleSummary()` from `03_API_AND_CRUD.md` for the compact one-line description.

### Sorting

Default sort: by priority descending (P9 first), then by ID alphabetically.

### Grouping (Optional)

Group rules by priority level with section headers:

```
─── P9 - Site Limit ───
  SITE-LIMIT-MAIN: Site Limit -40 to 70 kW

─── P8 - High Priority ───
  PEAK-SHAVING: Discharge 50 kW (17:00-21:00, Mon-Fri)

─── P7 - Normal ───
  NIGHT-CHARGE: Charge to Target to 80% (23:00-06:00, Mon-Fri)
  PEAK-DISCHARGE: Discharge to Target to 30% (17:00-21:00, Mon-Fri)

─── P5 - Baseline ───
  EMERGENCY-LOW: Charge 10 kW
```

---

## 4. Editor Workflow

### Create New Rule

```
1. User clicks "Add Rule" → open empty editor
2. User selects action type → form fields update dynamically
3. User fills in parameters, conditions, schedule
4. Client validates (validateRule + shadow size check)
5. On submit:
   a. GET current schedules
   b. Merge new rule into the target priority array
   c. POST merged array
   d. Refresh rule list
```

### Edit Existing Rule

```
1. User clicks "Edit" on a rule → open editor pre-filled
2. Convert wire format to form data: optimizedRuleToFormData(rule, priority)
3. User makes changes
4. On submit:
   a. Convert form back to wire format: formDataToOptimizedRule(formData)
   b. If priority changed: moveRule() (updates both old and new arrays)
   c. If same priority: updateRule()
   d. Refresh rule list
```

### Delete Rule

```
1. User clicks "Delete" → confirmation dialog
2. On confirm: deleteRule(siteId, ruleId, priority)
3. Refresh rule list
```

### Toggle Active/Inactive

```
1. User clicks toggle switch on rule card
2. toggleRule(siteId, ruleId, priority)
3. Refresh rule list
```

---

## 5. Special UI Considerations

### Site Limit (P9) Rules

- Auto-set priority to P9 when user selects `sl` action type
- Disable priority selector for `sl` rules
- Only allow one `sl` rule (or warn if multiple exist)
- Show thresholds as a visual range indicator (e.g., -40 kW to 70 kW on a number line)

### Goal-Based Rules (ct/dt)

- Clearly label `maxg`/`ming` as "Grid Import Limit" / "Min Grid Power" — not "Grid Condition"
- Add a helper tooltip explaining the difference between conditions and action parameters
- Show strategy as a visual selector (equal spread / aggressive / conservative)

### Time Window Visualization

Consider showing a 24-hour timeline bar that visually represents the time window, with shading for the active period. Handle overnight spanning (e.g., 22:00-06:00) by wrapping the highlight.

### Weekday Selector

A row of 7 toggle buttons (S M T W T F S) is the most intuitive pattern. If all 7 are selected, omit the `d` field from the wire format.

### Safety Limits Section

Display safety limits (soc_min / soc_max) separately from rules, since they live outside the `sch` object. A dual-range slider (min/max) works well here.

---

## 6. Error Handling

### Optimistic Updates

Show the change immediately in the UI, then revert if the POST fails:

```typescript
async function handleCreateRule(rule, priority) {
  // Optimistic: add to local state immediately
  setRules(prev => [...prev, { ...rule, priority }]);
  
  try {
    await createRule(siteId, rule, priority);
  } catch (error) {
    // Revert on failure
    setRules(prev => prev.filter(r => r.id !== rule.id));
    showError(error.message);
  }
}
```

### Shadow Size Warning

Before saving, check if the total payload will exceed the limit:

```typescript
function checkShadowSize(currentSch, newRules, priority): { ok: boolean; size: number } {
  const merged = { ...currentSch, [`p_${priority}`]: newRules };
  const size = new TextEncoder().encode(JSON.stringify(merged)).length;
  return { ok: size <= 7680, size };
}
```

Show a warning banner when approaching 80% capacity (~6,144 bytes).

---

## 7. Polling & Real-Time Updates

The web panel should periodically refresh the rule list to catch changes made by:
- The AI agent (creates/modifies rules via Bedrock)
- The mobile app (another user editing rules)
- The device itself (reporting rule sync status)

Recommended: poll every 30-60 seconds, or use a WebSocket if available.

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const data = await getSchedules(siteId);
    setSchedules(data);
  }, 30000);
  return () => clearInterval(interval);
}, [siteId]);
```
