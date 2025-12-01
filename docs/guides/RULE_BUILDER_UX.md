# AIESS Mobile App - Rule Builder Guide (Add / Edit / Delete)

Complete specification for the Schedule Rule Builder screen in the AIESS mobile application.
Covers creating new rules, editing existing rules, and deleting rules.

> **Schema Reference**: See `v1.4.1_schedules_and_rules_guide.md` for complete rule schema details.
> **API Reference**: See `schedules_parse_and_send_aws_guide.md` for HTTP endpoint documentation.

---

## Table of Contents

1. [Page Overview](#1-page-overview)
2. [Section 1: Basic Info](#2-section-1-basic-info)
3. [Section 2: Action Configuration](#3-section-2-action-configuration)
4. [Section 3: Conditions](#4-section-3-conditions)
5. [Section 4: Rule Preview](#5-section-4-rule-preview)
6. [Conditional Logic](#6-conditional-logic)
7. [Validation Rules](#7-validation-rules)
8. [HTTP Integration](#8-http-integration)
9. [Edit Rule Flow](#9-edit-rule-flow)
10. [Delete Rule Flow](#10-delete-rule-flow)
11. [UI Components Reference](#11-ui-components-reference)
12. [UX Best Practices](#12-ux-best-practices)

---

## 1. Page Overview

### Screen Structure
```
┌─────────────────────────────────────┐
│ ← Schedules                    🔍   │  ← Header with back navigation
│         Rule Builder                │
├─────────────────────────────────────┤
│                                     │
│  ┌─ Section 1: Basic Info ────────┐ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ Section 2: Action ────────────┐ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ Section 3: Conditions ────────┐ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ Section 4: Preview ───────────┐ │
│  └────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│  [ Confirm ]        [ Discard ]     │  ← Sticky bottom bar
└─────────────────────────────────────┘
```

### Design Principles
- **Mobile-first**: Large touch targets (min 44px), thumb-friendly placement
- **Progressive disclosure**: Show only relevant fields based on selections
- **Dropdowns over free input**: Minimize typing, reduce errors
- **Visual feedback**: Real-time validation, section completion indicators
- **Scrollable content**: Fixed header and bottom bar, scrollable middle

---

## 2. Section 1: Basic Info

This section is **always visible** and contains required fields.

### 2.1 Rule ID

| Property | Value |
|----------|-------|
| Type | Text Input |
| Required | Yes |
| Max Length | 63 characters |
| Allowed Characters | `A-Z`, `0-9`, `-`, `_` (uppercase enforced) |
| Default | Auto-generated (e.g., `RULE-{timestamp}`) |

**UI Elements:**
```
┌─────────────────────────────────────┐
│ Rule ID *                           │
│ ┌───────────────────────────┬─────┐ │
│ │ CHARGE-DAYTIME            │ 🔄  │ │  ← Auto-generate button
│ └───────────────────────────┴─────┘ │
│ Unique identifier (A-Z, 0-9, -, _)  │  ← Helper text
└─────────────────────────────────────┘
```

**Behavior:**
- Auto-uppercase on input
- 🔄 button generates: `RULE-{HHMMSS}` format
- Validate uniqueness against existing rules (optional, can be server-side)

### 2.2 Priority

| Property | Value |
|----------|-------|
| Type | Dropdown |
| Required | Yes |
| Options | P4, P5, P6, P7, P8 (for cloud rules) |
| Default | P7 (Normal) |

**Dropdown Options:**
```
┌─────────────────────────────────────┐
│ Priority *                          │
│ ┌─────────────────────────────────┐ │
│ │ P7 - Normal                  ▼  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

Dropdown expanded:
┌─────────────────────────────────────┐
│ P8 - Urgent       (high priority)   │
│ P7 - Normal       (standard)     ✓  │
│ P6 - Low          (background)      │
│ P5 - Baseline     (fallback)        │
│ P4 - Reserved     (special cases)   │
└─────────────────────────────────────┘
```

**Priority Descriptions (shown in dropdown):**
| Priority | Label | Description |
|----------|-------|-------------|
| P8 | Urgent | High-priority commands |
| P7 | Normal | Standard scheduled rules |
| P6 | Low | Background optimization |
| P5 | Baseline | Fallback behavior |
| P4 | Reserved | Special use cases |

> **Note**: P9 (Site Limit) is device-level only, not available in cloud rules.

### 2.3 Active Status

| Property | Value |
|----------|-------|
| Type | Toggle Switch |
| Required | No |
| Default | ON (Active) |

```
┌─────────────────────────────────────┐
│ Rule Status                         │
│ ┌─────────────────────────────────┐ │
│ │ Active                    [●══] │ │  ← Toggle ON
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 3. Section 2: Action Configuration

This section defines **what the rule does**. Fields change based on action type.

### 3.1 Action Type Selector

| Property | Value |
|----------|-------|
| Type | Dropdown or Segmented Control |
| Required | Yes |
| Options | 6 action types |
| Default | Charge |

**Action Types:**
| Value | Label | Icon | Description |
|-------|-------|------|-------------|
| `charge` | Charge | ⚡↓ | Fixed power charging |
| `discharge` | Discharge | ⚡↑ | Fixed power discharging |
| `standby` | Standby | ⏸️ | No power flow |
| `charge_to_target` | Charge to SoC | 🎯↓ | Goal-based charging |
| `discharge_to_target` | Discharge to SoC | 🎯↑ | Goal-based discharging |
| `site_limit` | Site Limit | 🏭 | Grid connection limits (P9 only) |

**UI - Option Cards (recommended for mobile):**
```
┌─────────────────────────────────────┐
│ Action Type *                       │
├─────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐      │
│ │  ⚡↓  │ │  ⚡↑  │ │  ⏸️  │      │
│ │Charge │ │Dischg │ │Standby│      │
│ │  [●]  │ │  [ ]  │ │  [ ]  │      │
│ └───────┘ └───────┘ └───────┘      │
│ ┌───────┐ ┌───────┐ ┌───────┐      │
│ │  🎯↓  │ │  🎯↑  │ │  🏭  │      │
│ │Ch.SoC │ │Dis.SoC│ │ Site  │      │
│ │  [ ]  │ │  [ ]  │ │  [ ]  │      │
│ └───────┘ └───────┘ └───────┘      │
└─────────────────────────────────────┘
```

### 3.2 Action Fields by Type

#### A) Charge / Discharge

| Field | Type | Range | Default | Required |
|-------|------|-------|---------|----------|
| Power (kW) | Slider + Input | 0-999 | 50 | Yes |
| PID Mode | Toggle | ON/OFF | OFF | No |

```
┌─────────────────────────────────────┐
│ Power (kW) *                        │
│ ┌─────────────────────────────────┐ │
│ │ [==========●==========] 50      │ │  ← Slider with value
│ └─────────────────────────────────┘ │
│                                     │
│ PID Mode (smooth grid tracking)     │
│ ┌─────────────────────────────────┐ │
│ │ Enable PID              [═══○] │ │  ← Toggle OFF
│ └─────────────────────────────────┘ │
│ ℹ️ PID adjusts power gradually for  │
│    smooth grid following            │
└─────────────────────────────────────┘
```

#### B) Charge to Target (Goal-Based)

| Field | Type | Range | Default | Required |
|-------|------|-------|---------|----------|
| Target SoC | Slider | 0-100% | 80% | Yes |
| Max Power (kW) | Slider + Input | 0-999 | 50 | Yes |
| Max Grid Import (kW) | Slider + Input | 0-9999 | - | No |
| Strategy | Dropdown | 3 options | equal_spread | No |
| PID Mode | Toggle | ON/OFF | OFF | No |

```
┌─────────────────────────────────────┐
│ Target SoC (%) *                    │
│ ┌─────────────────────────────────┐ │
│ │ [================●====] 80%     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Max Charge Power (kW) *             │
│ ┌─────────────────────────────────┐ │
│ │ [==========●==========] 50      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Optional Grid Limit ───────────┐ │
│ │ Max Grid Import (kW)            │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ [●═══════════════════] 0    │ │ │  ← 0 = no limit
│ │ └─────────────────────────────┘ │ │
│ │ ℹ️ Limit grid import during     │ │
│ │    charging (0 = no limit)      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Charging Strategy                   │
│ ┌─────────────────────────────────┐ │
│ │ Equal Spread                 ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ PID Mode                            │
│ ┌─────────────────────────────────┐ │
│ │ Enable PID              [═══○] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Strategy Options:**
| Value | Label | Description |
|-------|-------|-------------|
| `equal_spread` | Equal Spread | Even power distribution (default) |
| `aggressive` | Aggressive | Fast start, high initial power |
| `conservative` | Conservative | Slow start, gradual ramp-up |

#### C) Discharge to Target (Goal-Based)

| Field | Type | Range | Default | Required |
|-------|------|-------|---------|----------|
| Target SoC | Slider | 0-100% | 20% | Yes |
| Max Power (kW) | Slider + Input | 0-999 | 50 | Yes |
| Min Grid Power (kW) | Slider + Input | -9999 to 9999 | - | No |
| Strategy | Dropdown | 3 options | equal_spread | No |
| PID Mode | Toggle | ON/OFF | OFF | No |

```
┌─────────────────────────────────────┐
│ Target SoC (%) *                    │
│ ┌─────────────────────────────────┐ │
│ │ [====●════════════════] 20%     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Max Discharge Power (kW) *          │
│ ┌─────────────────────────────────┐ │
│ │ [==========●==========] 50      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Optional Grid Constraint ──────┐ │
│ │ Min Grid Power (kW)             │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ [══════════●════════] 30    │ │ │
│ │ └─────────────────────────────┘ │ │
│ │ ℹ️ Discharge only when grid     │ │
│ │    power is above this value    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Discharge Strategy                  │
│ ┌─────────────────────────────────┐ │
│ │ Equal Spread                 ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ PID Mode                            │
│ ┌─────────────────────────────────┐ │
│ │ Enable PID              [═══○] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### D) Standby

No additional fields required.

```
┌─────────────────────────────────────┐
│ ℹ️ Standby Mode                     │
│                                     │
│ The battery will not charge or      │
│ discharge while this rule is        │
│ active. Use for maintenance or      │
│ specific time windows.              │
└─────────────────────────────────────┘
```

#### E) Site Limit (Priority 9 Only)

| Field | Type | Range | Default | Required |
|-------|------|-------|---------|----------|
| High Threshold (kW) | Slider + Input | 0-9999 | 100 | Yes |
| Low Threshold (kW) | Slider + Input | -9999 to high | 0 | Yes |

```
┌─────────────────────────────────────┐
│ ⚠️ Site Limit rules are typically   │
│    set at device level (P9).        │
│    Contact admin for cloud config.  │
├─────────────────────────────────────┤
│ High Threshold (kW) *               │
│ ┌─────────────────────────────────┐ │
│ │ [══════════════════●══] 100    │ │
│ └─────────────────────────────────┘ │
│ ℹ️ Start discharging above this     │
│                                     │
│ Low Threshold (kW) *                │
│ ┌─────────────────────────────────┐ │
│ │ [●════════════════════] 0      │ │
│ └─────────────────────────────────┘ │
│ ℹ️ Start charging below this        │
└─────────────────────────────────────┘
```

---

## 4. Section 3: Conditions

All conditions are **optional**. Use expandable/collapsible cards.

### 4.1 Section Header

```
┌─────────────────────────────────────┐
│ 🎯 CONDITIONS                       │
│ All conditions are optional         │
├─────────────────────────────────────┤
│ ┌─ ⏰ Time Window ──────── [+ Add] │
│ ┌─ 📅 Weekdays ─────────── [+ Add] │
│ ┌─ 🔋 SoC Range ────────── [+ Add] │
│ ┌─ ⚡ Grid Power ───────── [+ Add] │
│ ┌─ 📆 Validity Period ──── [+ Add] │
└─────────────────────────────────────┘
```

### 4.2 Time Window

| Field | Type | Format | Default |
|-------|------|--------|---------|
| Start Time | Time Picker | HH:MM | 00:00 |
| End Time | Time Picker | HH:MM | 23:59 |

```
┌─────────────────────────────────────┐
│ ⏰ Time Window              [Remove]│
├─────────────────────────────────────┤
│ Start Time          End Time        │
│ ┌───────────┐      ┌───────────┐   │
│ │  08:00  ▼ │      │  16:00  ▼ │   │
│ └───────────┘      └───────────┘   │
│                                     │
│ ℹ️ Rule active between these times  │
│    (crosses midnight if end < start)│
└─────────────────────────────────────┘
```

**Behavior:**
- Use native time pickers (iOS/Android)
- If end < start, rule crosses midnight (e.g., 22:00-06:00)
- Display in 24h format

### 4.3 Weekdays

| Field | Type | Options | Default |
|-------|------|---------|---------|
| Days | Multi-select chips | Mon-Sun | All selected |

```
┌─────────────────────────────────────┐
│ 📅 Weekdays                 [Remove]│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ [Mon][Tue][Wed][Thu][Fri][Sat][Sun]│
│ │  ●    ●    ●    ●    ●    ○    ○  │
│ └─────────────────────────────────┘ │
│                                     │
│ Quick Select: [Weekdays] [Weekend]  │
│               [All]      [None]     │
└─────────────────────────────────────┘
```

**Stored Format:**
- Selected days stored as string: `"12345"` (Mon-Fri)
- `1`=Mon, `2`=Tue, ... `7`=Sun

### 4.4 SoC Range

| Field | Type | Range | Default |
|-------|------|-------|---------|
| Min SoC | Slider | 0-100% | 0% |
| Max SoC | Slider | 0-100% | 100% |

```
┌─────────────────────────────────────┐
│ 🔋 SoC Range                [Remove]│
├─────────────────────────────────────┤
│ Rule active when SoC is between:    │
│                                     │
│      10%                      90%   │
│ Min [====●══════════════════●====] Max
│      └─────── Active Range ───────┘ │
│                                     │
│ ┌─────────┐          ┌─────────┐   │
│ │ Min: 10 │    to    │ Max: 90 │   │
│ └─────────┘          └─────────┘   │
└─────────────────────────────────────┘
```

**Note:** For `charge_to_target` and `discharge_to_target` actions, the target SoC is set in the action itself - this SoC condition is for *when* the rule is active, not the target.

### 4.5 Grid Power Condition

| Field | Type | Options/Range | Default |
|-------|------|---------------|---------|
| Operator | Dropdown | 3 options | greater_than |
| Value (kW) | Slider + Input | -9999 to 9999 | 0 |
| Value Max (kW) | Slider + Input | value to 9999 | - |

**Operators:**
| Value | Label | Description |
|-------|-------|-------------|
| `greater_than` | Greater Than | Grid power > value |
| `less_than` | Less Than | Grid power < value |
| `between` | Between | value ≤ Grid power ≤ value_max |

```
┌─────────────────────────────────────┐
│ ⚡ Grid Power Condition     [Remove]│
├─────────────────────────────────────┤
│ Activate when grid power is:        │
│                                     │
│ Operator                            │
│ ┌─────────────────────────────────┐ │
│ │ Greater Than                 ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Value (kW)                          │
│ ┌─────────────────────────────────┐ │
│ │ [══════════●══════════] 30      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ℹ️ Rule activates when grid power   │
│    exceeds 30 kW                    │
└─────────────────────────────────────┘
```

**For "Between" operator:**
```
┌─────────────────────────────────────┐
│ Value Min (kW)                      │
│ ┌─────────────────────────────────┐ │
│ │ [════●════════════════] 20      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Value Max (kW)                      │
│ ┌─────────────────────────────────┐ │
│ │ [══════════════●══════] 50      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ℹ️ Rule activates when grid power   │
│    is between 20-50 kW              │
└─────────────────────────────────────┘
```

**Note:** For goal-based actions with `max_grid_power_kw` or `min_grid_power_kw`, this condition is usually not needed as the constraint is built into the action.

### 4.6 Validity Period

| Field | Type | Format | Default |
|-------|------|--------|---------|
| Valid From | Date Picker | YYYY-MM-DD | Today |
| Valid Until | Date Picker | YYYY-MM-DD | No end (0) |

```
┌─────────────────────────────────────┐
│ 📆 Validity Period          [Remove]│
├─────────────────────────────────────┤
│ Valid From                          │
│ ┌─────────────────────────────────┐ │
│ │ 📅 01 August 2025            ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Valid Until                         │
│ ┌─────────────────────────────────┐ │
│ │ 📅 No end date               ▼  │ │
│ └─────────────────────────────────┘ │
│ [ ] Set end date                    │
│                                     │
│ ℹ️ Rule will be active starting     │
│    from 01.08.2025 indefinitely     │
└─────────────────────────────────────┘
```

**Stored Format:**
- Unix timestamp (seconds since epoch)
- `0` = no restriction (default)

---

## 5. Section 4: Rule Preview

Real-time preview of the rule in human-readable format.

```
┌─────────────────────────────────────┐
│ 📋 RULE PREVIEW                     │
├─────────────────────────────────────┤
│ Rule: CHARGE-DAYTIME                │
│ Priority: P7 (Normal)               │
│ Status: ● Active                    │
│                                     │
│ "Charge at 50 kW with PID when      │
│  grid power exceeds 30 kW,          │
│  Monday-Friday 08:00-16:00,         │
│  starting from 01.08.2025"          │
│                                     │
│ ┌─ JSON Preview ──────────── [▼] ─┐ │
│ │ {                               │ │
│ │   "id": "CHARGE-DAYTIME",       │ │
│ │   "p": 7,                       │ │
│ │   "a": {"t":"ch","pw":50,...},  │ │
│ │   "c": {"ts":800,"te":1600,...} │ │
│ │ }                               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 6. Conditional Logic

### 6.1 Field Visibility by Action Type

| Field | charge | discharge | standby | charge_to_target | discharge_to_target | site_limit |
|-------|--------|-----------|---------|------------------|---------------------|------------|
| Power (kW) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PID Mode | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Target SoC | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Max Power | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Max Grid Import | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Min Grid Power | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Strategy | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| High Threshold | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Low Threshold | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.2 Condition Visibility by Action Type

| Condition | charge | discharge | standby | charge_to_target | discharge_to_target |
|-----------|--------|-----------|---------|------------------|---------------------|
| Time Window | ✅ | ✅ | ✅ | ✅ | ✅ |
| Weekdays | ✅ | ✅ | ✅ | ✅ | ✅ |
| SoC Range | ✅ | ✅ | ✅ | ⚠️ Optional* | ⚠️ Optional* |
| Grid Power | ✅ | ✅ | ✅ | ⚠️ Hidden** | ⚠️ Hidden** |
| Validity | ✅ | ✅ | ✅ | ✅ | ✅ |

*\* For goal-based actions, SoC condition defines when rule is active, not the target.*
*\*\* For goal-based actions with max_grid/min_grid set, grid power condition is redundant.*

### 6.3 Priority Restrictions

```javascript
// Site Limit only available for P9 (device level)
if (actionType === 'site_limit' && priority !== 9) {
  showWarning("Site Limit rules should use Priority 9");
}

// Cloud rules use P4-P8
if (priority < 4 || priority > 8) {
  showError("Cloud rules must use Priority 4-8");
}
```

---

## 7. Validation Rules

### 7.1 Required Field Validation

| Field | Validation |
|-------|------------|
| Rule ID | Required, 1-63 chars, `^[A-Z0-9_-]+$` |
| Priority | Required, 4-8 for cloud rules |
| Action Type | Required |
| Power (kW) | Required for charge/discharge, 0-999 |
| Target SoC | Required for goal-based, 0-100 |
| Max Power | Required for goal-based, 0-999 |
| Thresholds | Required for site_limit, low < high |

### 7.2 Cross-Field Validation

```javascript
// SoC range validation
if (socMin >= socMax) {
  showError("Min SoC must be less than Max SoC");
}

// Time validation (allow crossing midnight)
// No error needed - just note in UI that it crosses midnight

// Grid power "between" validation
if (operator === 'between' && valueMin >= valueMax) {
  showError("Min value must be less than Max value");
}

// Site limit threshold validation
if (lowThreshold >= highThreshold) {
  showError("Low threshold must be less than High threshold");
}
```

### 7.3 Validation Indicators

```
┌─────────────────────────────────────┐
│ Rule ID *                       ✓   │  ← Green check = valid
│ ┌─────────────────────────────────┐ │
│ │ CHARGE-DAYTIME                  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Rule ID *                       ⚠   │  ← Warning = issue
│ ┌─────────────────────────────────┐ │
│ │ charge daytime                  │ │  ← Lowercase entered
│ └─────────────────────────────────┘ │
│ ⚠️ Will be converted to uppercase   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Rule ID *                       ✗   │  ← Red X = error
│ ┌─────────────────────────────────┐ │
│ │                                 │ │  ← Empty
│ └─────────────────────────────────┘ │
│ ❌ Rule ID is required              │
└─────────────────────────────────────┘
```

---

## 8. HTTP Integration

### 8.1 API Configuration

```javascript
const API_CONFIG = {
  endpoint: "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default",
  apiKey: "Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW",
  siteId: "domagala_1"  // From device/user context
};
```

### 8.2 Build Rule Object

```javascript
function buildRuleObject(formData) {
  const rule = {
    id: formData.ruleId,
    p: formData.priority
  };
  
  // Only include active if false (true is default)
  if (!formData.active) {
    rule.act = false;
  }
  
  // Build action
  rule.a = buildAction(formData);
  
  // Build conditions (only if any are set)
  const conditions = buildConditions(formData);
  if (Object.keys(conditions).length > 0) {
    rule.c = conditions;
  }
  
  return rule;
}

function buildAction(formData) {
  const action = {};
  
  switch (formData.actionType) {
    case 'charge':
      action.t = 'ch';
      action.pw = formData.power;
      if (formData.usePid) action.pid = true;
      break;
      
    case 'discharge':
      action.t = 'dis';
      action.pw = formData.power;
      if (formData.usePid) action.pid = true;
      break;
      
    case 'standby':
      action.t = 'sb';
      break;
      
    case 'charge_to_target':
      action.t = 'ct';
      action.soc = formData.targetSoc;
      action.maxp = formData.maxPower;
      if (formData.maxGridPower > 0) action.maxg = formData.maxGridPower;
      if (formData.strategy !== 'equal_spread') {
        action.str = formData.strategy === 'aggressive' ? 'agg' : 'con';
      }
      if (formData.usePid) action.pid = true;
      break;
      
    case 'discharge_to_target':
      action.t = 'dt';
      action.soc = formData.targetSoc;
      action.maxp = formData.maxPower;
      if (formData.minGridPower !== 0) action.ming = formData.minGridPower;
      if (formData.strategy !== 'equal_spread') {
        action.str = formData.strategy === 'aggressive' ? 'agg' : 'con';
      }
      if (formData.usePid) action.pid = true;
      break;
      
    case 'site_limit':
      action.t = 'sl';
      action.hth = formData.highThreshold;
      action.lth = formData.lowThreshold;
      break;
  }
  
  return action;
}

function buildConditions(formData) {
  const conditions = {};
  
  // Time condition
  if (formData.hasTimeCondition) {
    conditions.ts = timeToInt(formData.startTime);  // "08:30" → 830
    conditions.te = timeToInt(formData.endTime);    // "16:00" → 1600
  }
  
  // Weekdays
  if (formData.hasWeekdayCondition && formData.weekdays !== '1234567') {
    conditions.d = formData.weekdays;  // "12345" for Mon-Fri
  }
  
  // SoC range (only if not default 0-100)
  if (formData.hasSocCondition) {
    if (formData.socMin > 0) conditions.sm = formData.socMin;
    if (formData.socMax < 100) conditions.sx = formData.socMax;
  }
  
  // Grid power
  if (formData.hasGridCondition) {
    conditions.gpo = formData.gridOperator === 'greater_than' ? 'gt' :
                     formData.gridOperator === 'less_than' ? 'lt' : 'bt';
    conditions.gpv = formData.gridValue;
    if (formData.gridOperator === 'between') {
      conditions.gpx = formData.gridValueMax;
    }
  }
  
  // Validity period
  if (formData.validFrom > 0) conditions.vf = formData.validFrom;
  if (formData.validUntil > 0) conditions.vu = formData.validUntil;
  
  return conditions;
}

// Helper: Convert "08:30" to 830
function timeToInt(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 100 + minutes;
}
```

### 8.3 Send Rule to API

```javascript
async function sendRule(rule) {
  const { endpoint, apiKey, siteId } = API_CONFIG;
  
  try {
    // Step 1: Get current schedules
    const currentResponse = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!currentResponse.ok) {
      throw new Error(`Failed to get schedules: ${currentResponse.status}`);
    }
    
    const currentData = await currentResponse.json();
    const currentSchedules = currentData.schedules || {};
    
    // Step 2: Add rule to appropriate priority
    const priorityKey = `priority_${rule.p}`;
    const existingRules = currentSchedules[priorityKey] || [];
    
    // Check if rule with same ID exists (update vs add)
    const existingIndex = existingRules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      existingRules[existingIndex] = rule;  // Update
    } else {
      existingRules.push(rule);  // Add
    }
    
    // Step 3: Send updated schedules
    const updateResponse = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        site_id: siteId,
        schedules: {
          [priorityKey]: existingRules
        }
      })
    });
    
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.error || `Failed to update: ${updateResponse.status}`);
    }
    
    const result = await updateResponse.json();
    return {
      success: true,
      shadowVersion: result.shadow_version,
      message: 'Rule saved successfully'
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 8.4 React Native Implementation Example

```javascript
// hooks/useRuleSubmit.js
import { useState } from 'react';
import { Alert } from 'react-native';

export function useRuleSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const submitRule = async (formData, onSuccess) => {
    setIsSubmitting(true);
    
    try {
      const rule = buildRuleObject(formData);
      const result = await sendRule(rule);
      
      if (result.success) {
        Alert.alert(
          'Success',
          `Rule "${rule.id}" saved!\nShadow version: ${result.shadowVersion}`,
          [{ text: 'OK', onPress: onSuccess }]
        );
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save rule. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return { submitRule, isSubmitting };
}
```

### 8.5 Request/Response Examples

**Add New Charge Rule:**
```http
POST /schedules/domagala_1 HTTP/1.1
Host: jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com
x-api-key: Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW
Content-Type: application/json

{
  "site_id": "domagala_1",
  "schedules": {
    "priority_7": [
      {
        "id": "CHARGE-DAYTIME",
        "p": 7,
        "a": { "t": "ch", "pw": 50, "pid": true },
        "c": { "ts": 800, "te": 1600, "d": "12345" }
      }
    ]
  }
}
```

**Success Response:**
```json
{
  "message": "Schedules updated successfully",
  "site_id": "domagala_1",
  "shadow_version": 4285,
  "updated_priorities": ["priority_7"],
  "total_rules": 1
}
```

**Add Goal-Based Discharge Rule:**
```http
POST /schedules/domagala_1 HTTP/1.1
...

{
  "site_id": "domagala_1",
  "schedules": {
    "priority_6": [
      {
        "id": "DISCHARGE-TO-20",
        "p": 6,
        "a": {
          "t": "dt",
          "soc": 20,
          "maxp": 50,
          "ming": 30,
          "str": "agg",
          "pid": true
        },
        "c": {
          "ts": 1700,
          "te": 2100,
          "sm": 25,
          "sx": 100,
          "vf": 1722470400
        }
      }
    ]
  }
}
```

---

## 9. Edit Rule Flow

The same Rule Builder screen is used for both creating and editing rules. The key differences are in initialization and submission.

### 9.1 Entry Points

**From Schedules List Screen:**
```
┌─────────────────────────────────────┐
│ Rule ID: CHARGE-DAYTIME    [Status] │
│                                     │
│ Actions:          Time conditions:  │
│ Type: Charge      Everyday          │
│ Power: 50 kW      08:00-16:00       │
│                                     │
│        [ Edit ]    [ Delete ]       │  ← Action buttons
└─────────────────────────────────────┘
```

**Or via swipe actions:**
```
┌─────────────────────────────────────┐
│ ←←← Swipe left on rule card         │
│                         [✏️][🗑️]    │  ← Edit / Delete icons
└─────────────────────────────────────┘
```

### 9.2 Edit Mode Differences

| Aspect | Add Mode | Edit Mode |
|--------|----------|-----------|
| Header | "Rule Builder" | "Edit Rule" |
| Rule ID | Editable | **Read-only** (locked) |
| Priority | Editable | Editable (with warning) |
| Form State | Empty/defaults | Pre-populated from existing |
| Confirm Button | "Create Rule" | "Save Changes" |
| Extra Button | - | "Delete Rule" |

### 9.3 Pre-populate Form from Existing Rule

```javascript
// Function to convert optimized rule to form state
function ruleToFormData(rule) {
  const formData = {
    // Basic Info
    ruleId: rule.id,
    priority: rule.p,
    active: rule.act !== false,  // Default true if not present
    
    // Action
    actionType: mapActionType(rule.a.t),
    power: rule.a.pw || 0,
    usePid: rule.a.pid || false,
    targetSoc: rule.a.soc || (rule.a.t === 'ct' ? 80 : 20),
    maxPower: rule.a.maxp || 50,
    maxGridPower: rule.a.maxg || 0,
    minGridPower: rule.a.ming || 0,
    strategy: mapStrategy(rule.a.str),
    highThreshold: rule.a.hth || 100,
    lowThreshold: rule.a.lth || 0,
    
    // Conditions
    hasTimeCondition: rule.c?.ts !== undefined,
    startTime: intToTime(rule.c?.ts || 0),
    endTime: intToTime(rule.c?.te || 2359),
    
    hasWeekdayCondition: rule.c?.d !== undefined,
    weekdays: rule.c?.d || '1234567',
    
    hasSocCondition: rule.c?.sm !== undefined || rule.c?.sx !== undefined,
    socMin: rule.c?.sm || 0,
    socMax: rule.c?.sx || 100,
    
    hasGridCondition: rule.c?.gpo !== undefined,
    gridOperator: mapOperator(rule.c?.gpo),
    gridValue: rule.c?.gpv || 0,
    gridValueMax: rule.c?.gpx || 0,
    
    hasValidityCondition: rule.c?.vf > 0 || rule.c?.vu > 0,
    validFrom: rule.c?.vf || 0,
    validUntil: rule.c?.vu || 0
  };
  
  return formData;
}

// Helper: Map action type code to verbose
function mapActionType(code) {
  const map = {
    'ch': 'charge',
    'dis': 'discharge',
    'sb': 'standby',
    'sl': 'site_limit',
    'ct': 'charge_to_target',
    'dt': 'discharge_to_target'
  };
  return map[code] || 'charge';
}

// Helper: Map strategy code to verbose
function mapStrategy(code) {
  const map = {
    'agg': 'aggressive',
    'con': 'conservative'
  };
  return map[code] || 'equal_spread';
}

// Helper: Map operator code to verbose
function mapOperator(code) {
  const map = {
    'gt': 'greater_than',
    'lt': 'less_than',
    'bt': 'between'
  };
  return map[code] || 'greater_than';
}

// Helper: Convert integer time (830) to string ("08:30")
function intToTime(intTime) {
  if (!intTime) return '00:00';
  const hours = Math.floor(intTime / 100);
  const minutes = intTime % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
```

### 9.4 Edit Screen Navigation

```javascript
// Navigation from Schedules list to Edit screen
function navigateToEditRule(rule, priority) {
  navigation.navigate('RuleBuilder', {
    mode: 'edit',
    rule: rule,
    priority: priority
  });
}

// In RuleBuilder screen
function RuleBuilderScreen({ route }) {
  const { mode, rule, priority } = route.params || {};
  const isEditMode = mode === 'edit';
  
  const [formData, setFormData] = useState(() => {
    if (isEditMode && rule) {
      return ruleToFormData(rule);
    }
    return getDefaultFormData();
  });
  
  // Lock Rule ID in edit mode
  const isRuleIdEditable = !isEditMode;
  
  return (
    <View>
      <Header title={isEditMode ? 'Edit Rule' : 'Rule Builder'} />
      
      {/* Rule ID - locked in edit mode */}
      <TextInput
        value={formData.ruleId}
        editable={isRuleIdEditable}
        style={isEditMode ? styles.lockedInput : styles.input}
      />
      {isEditMode && (
        <Text style={styles.hint}>Rule ID cannot be changed</Text>
      )}
      
      {/* ... rest of form ... */}
      
      <View style={styles.buttonRow}>
        <Button 
          title={isEditMode ? "Save Changes" : "Create Rule"} 
          onPress={handleSubmit} 
        />
        <Button title="Discard" onPress={handleDiscard} />
      </View>
    </View>
  );
}
```

### 9.5 Priority Change Warning

When editing, warn if priority is changed (rule will move to different priority group):

```javascript
function handlePriorityChange(newPriority) {
  if (isEditMode && newPriority !== originalPriority) {
    Alert.alert(
      'Change Priority?',
      `This will move the rule from Priority ${originalPriority} to Priority ${newPriority}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change', onPress: () => setFormData({...formData, priority: newPriority}) }
      ]
    );
  } else {
    setFormData({...formData, priority: newPriority});
  }
}
```

### 9.6 HTTP: Update Existing Rule

The update logic handles priority changes by removing from old priority and adding to new:

```javascript
async function updateRule(originalRule, originalPriority, updatedRule) {
  const { endpoint, apiKey, siteId } = API_CONFIG;
  
  try {
    // Step 1: Get current schedules
    const response = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });
    const data = await response.json();
    const schedules = data.schedules || {};
    
    // Step 2: Handle priority change
    const oldPriorityKey = `priority_${originalPriority}`;
    const newPriorityKey = `priority_${updatedRule.p}`;
    const priorityChanged = originalPriority !== updatedRule.p;
    
    // Step 3: Remove from old priority
    let oldPriorityRules = schedules[oldPriorityKey] || [];
    oldPriorityRules = oldPriorityRules.filter(r => r.id !== originalRule.id);
    
    // Step 4: Add to new priority
    let newPriorityRules = priorityChanged 
      ? (schedules[newPriorityKey] || [])
      : oldPriorityRules;
    newPriorityRules.push(updatedRule);
    
    // Step 5: Build update payload
    const updatePayload = {
      site_id: siteId,
      schedules: {}
    };
    
    if (priorityChanged) {
      // Update both priorities
      updatePayload.schedules[oldPriorityKey] = oldPriorityRules;
      updatePayload.schedules[newPriorityKey] = newPriorityRules;
    } else {
      // Update only the current priority
      updatePayload.schedules[newPriorityKey] = newPriorityRules;
    }
    
    // Step 6: Send update
    const updateResponse = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'POST',
      headers: { 
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    
    if (!updateResponse.ok) {
      throw new Error('Failed to update rule');
    }
    
    return { success: true, message: 'Rule updated successfully' };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## 10. Delete Rule Flow

### 10.1 Delete Confirmation

Always confirm before deleting:

```
┌─────────────────────────────────────┐
│            Delete Rule?             │
├─────────────────────────────────────┤
│                                     │
│  Are you sure you want to delete    │
│  rule "CHARGE-DAYTIME"?             │
│                                     │
│  This action cannot be undone.      │
│                                     │
├─────────────────────────────────────┤
│     [ Cancel ]      [ Delete ]      │
│                       (red)         │
└─────────────────────────────────────┘
```

### 10.2 Delete Implementation

```javascript
async function deleteRule(ruleId, priority) {
  const { endpoint, apiKey, siteId } = API_CONFIG;
  
  try {
    // Step 1: Get current schedules
    const response = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });
    const data = await response.json();
    const schedules = data.schedules || {};
    
    // Step 2: Find and remove rule from priority
    const priorityKey = `priority_${priority}`;
    let rules = schedules[priorityKey] || [];
    
    const originalCount = rules.length;
    rules = rules.filter(r => r.id !== ruleId);
    
    if (rules.length === originalCount) {
      throw new Error(`Rule "${ruleId}" not found in priority ${priority}`);
    }
    
    // Step 3: Send update with rule removed
    const updateResponse = await fetch(`${endpoint}/schedules/${siteId}`, {
      method: 'POST',
      headers: { 
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        site_id: siteId,
        schedules: {
          [priorityKey]: rules
        }
      })
    });
    
    if (!updateResponse.ok) {
      throw new Error('Failed to delete rule');
    }
    
    const result = await updateResponse.json();
    return { 
      success: true, 
      message: `Rule "${ruleId}" deleted`,
      shadowVersion: result.shadow_version
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### 10.3 Delete from List Screen

```javascript
function handleDeletePress(rule, priority) {
  Alert.alert(
    'Delete Rule?',
    `Are you sure you want to delete "${rule.id}"?\n\nThis action cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          const result = await deleteRule(rule.id, priority);
          setIsDeleting(false);
          
          if (result.success) {
            // Refresh list
            await refreshSchedules();
            showToast('Rule deleted');
          } else {
            Alert.alert('Error', result.error);
          }
        }
      }
    ]
  );
}
```

### 10.4 Delete from Edit Screen

Add delete button to edit screen:

```javascript
// In RuleBuilder screen (edit mode only)
{isEditMode && (
  <Button
    title="Delete Rule"
    color="red"
    onPress={() => handleDeletePress(originalRule, originalPriority)}
  />
)}
```

### 10.5 Bulk Delete (Optional Feature)

For power users, allow selecting multiple rules to delete:

```javascript
async function deleteMultipleRules(rulesToDelete) {
  // rulesToDelete = [{ id: 'RULE-1', priority: 7 }, { id: 'RULE-2', priority: 6 }, ...]
  
  // Group by priority for efficient update
  const byPriority = {};
  rulesToDelete.forEach(({ id, priority }) => {
    if (!byPriority[priority]) byPriority[priority] = [];
    byPriority[priority].push(id);
  });
  
  // Get current schedules
  const response = await fetch(`${endpoint}/schedules/${siteId}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey }
  });
  const data = await response.json();
  const schedules = data.schedules || {};
  
  // Build update payload with rules removed
  const updatePayload = { site_id: siteId, schedules: {} };
  
  Object.entries(byPriority).forEach(([priority, idsToDelete]) => {
    const priorityKey = `priority_${priority}`;
    const currentRules = schedules[priorityKey] || [];
    const filteredRules = currentRules.filter(r => !idsToDelete.includes(r.id));
    updatePayload.schedules[priorityKey] = filteredRules;
  });
  
  // Single API call to delete all
  const updateResponse = await fetch(`${endpoint}/schedules/${siteId}`, {
    method: 'POST',
    headers: { 
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatePayload)
  });
  
  return updateResponse.ok;
}
```

---

## 11. UI Components Reference

### 11.1 Component Specifications

| Component | Type | Touch Target | Notes |
|-----------|------|--------------|-------|
| Text Input | Native TextInput | 48px height | Auto-capitalize, max length |
| Dropdown | Modal Picker / ActionSheet | 48px height | Native pickers recommended |
| Slider | Native Slider | 48px track height | Show value label |
| Toggle | Switch | 48px height | Clear ON/OFF states |
| Time Picker | Native DateTimePicker | N/A | Use mode="time" |
| Date Picker | Native DateTimePicker | N/A | Use mode="date" |
| Multi-Select Chips | Custom | 44px per chip | Toggle on tap |
| Action Cards | Custom | 80x80px | Visual selection |

### 11.2 Color Scheme (matching existing app)

```javascript
const colors = {
  primary: '#2196F3',      // Blue - primary actions
  secondary: '#757575',    // Gray - secondary text
  success: '#4CAF50',      // Green - success states
  warning: '#FF9800',      // Orange - warnings
  error: '#F44336',        // Red - errors, discard button
  background: '#FFFFFF',   // White - card backgrounds
  surface: '#F5F5F5',      // Light gray - page background
  border: '#E0E0E0',       // Border color
  text: '#212121',         // Primary text
  textSecondary: '#757575' // Secondary text
};
```

### 11.3 Spacing

```javascript
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32
};
```

---

## 12. UX Best Practices

### 12.1 Progressive Disclosure
- Show only relevant fields based on action type
- Use collapsible sections for conditions
- Expand sections on tap, collapse when not needed

### 12.2 Smart Defaults
```javascript
const defaults = {
  priority: 7,
  actionType: 'charge',
  power: 50,
  targetSoc: 80,  // For charge_to_target
  targetSocDischarge: 20,  // For discharge_to_target
  socMin: 0,
  socMax: 100,
  usePid: false,
  strategy: 'equal_spread',
  active: true
};
```

### 12.3 Inline Help
- Add ℹ️ icons with tooltips/modals for complex fields
- Show helper text below inputs
- Display real-time preview of rule effect

### 12.4 Error Prevention
- Disable "Confirm" button until all required fields valid
- Auto-correct common mistakes (lowercase → uppercase)
- Show warnings before destructive actions

### 12.5 Feedback
- Loading indicator during submission
- Success message with shadow version
- Clear error messages with retry option

### 12.6 Accessibility
- Minimum 44px touch targets
- High contrast text
- Screen reader labels on all interactive elements
- Support for system font scaling

---

## Appendix: Quick Reference

### Optimized Field Keys
| Verbose | Optimized | Description |
|---------|-----------|-------------|
| rule_id | id | Unique identifier |
| priority | p | Priority level |
| active | act | Active status |
| action | a | Action object |
| conditions | c | Conditions object |
| type | t | Action type |
| power_kw | pw | Power in kW |
| use_pid | pid | PID mode |
| target_soc | soc | Target SoC % |
| max_power_kw | maxp | Max power |
| max_grid_power_kw | maxg | Max grid import |
| min_grid_power_kw | ming | Min grid power |
| strategy | str | Goal strategy |
| high_threshold_kw | hth | Site limit high |
| low_threshold_kw | lth | Site limit low |
| time.start | ts | Start time (HHMM) |
| time.end | te | End time (HHMM) |
| soc.min | sm | Min SoC condition |
| soc.max | sx | Max SoC condition |
| grid_power.operator | gpo | Grid operator |
| grid_power.value | gpv | Grid value |
| grid_power.value_max | gpx | Grid value max |
| weekdays | d | Active days |
| valid_from | vf | Start timestamp |
| valid_until | vu | End timestamp |

### Action Type Codes
| Verbose | Optimized |
|---------|-----------|
| charge | ch |
| discharge | dis |
| standby | sb |
| site_limit | sl |
| charge_to_target | ct |
| discharge_to_target | dt |

### Strategy Codes
| Verbose | Optimized |
|---------|-----------|
| equal_spread | es (default, omit) |
| aggressive | agg |
| conservative | con |

### Operator Codes
| Verbose | Optimized |
|---------|-----------|
| greater_than | gt |
| less_than | lt |
| between | bt |

