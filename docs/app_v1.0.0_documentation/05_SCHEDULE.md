# 05 — Schedule

Battery schedule rule management: create, edit, visualize, and control charge/discharge rules per site.

---

## 1. Function Description

The Schedule module provides full CRUD control over battery schedule rules. Each rule defines **what** the battery should do (charge, discharge, charge-to-target, discharge-to-target), **when** (time window, weekdays, validity period), and **under what conditions** (SoC range, grid power thresholds).

### Core Capabilities

| Capability | Details |
|---|---|
| **Rule actions** | `ch` (charge at power), `dis` (discharge at power), `ct` (charge to target SoC), `dt` (discharge to target SoC) |
| **CRUD** | Create, read, update, delete rules per site via AWS IoT shadow |
| **Toggle** | Activate/deactivate individual rules without deleting them (`act` field) |
| **Calendar view** | Week grid (Mon–Sun × 24h) and day grid (single day × 24h) with color-coded blocks |
| **Rule templates** | Peak Shaving, Night Charging, PV Self-Consumption, Emergency Reserve |
| **Priority system** | P6 (Low), P7 (Normal), P8 (High) — user-editable; P9 (Site Limit) — system-managed |
| **Safety limits** | SoC min/max from backend `safety` object; site power thresholds from P9 `sl` rule |
| **Auto-generated IDs** | Rule IDs are auto-composed from action type, parameters, time period, and weekday pattern |
| **Validation** | Client-side validation before save: required fields, range checks, SoC bounds |

### Priority Hierarchy

| Priority | Label | Purpose |
|---|---|---|
| P4 | Reserved | System use |
| P5 | Baseline | Default/fallback rules |
| P6 | Low | User rules — low priority |
| P7 | Normal | User rules — standard priority |
| P8 | High | User rules — high priority |
| P9 | Site Limit | System-managed site power limits (hidden from schedule list) |

Rules are sorted by priority descending, then alphabetically by ID. P9 rules are filtered out of the user-facing list and calendar views.

---

## 2. UI/UX Description

### 2.1 Schedule List Screen

**File:** [`app/(tabs)/schedule/index.tsx`](../app/(tabs)/schedule/index.tsx)

#### Header

- Title: localized "Schedules"
- Subtitle: `{deviceName} - {ruleCount} rules`

#### View Toggle (Segmented Control)

| Mode | Icon | Description |
|---|---|---|
| **List** | `List` | Scrollable cards with pull-to-refresh |
| **Calendar** | `CalendarDays` | Week or day grid visualization |

#### List View — RuleCard

Each rule renders as a card with the following elements:

| Element | Details |
|---|---|
| **Rule ID** | Bold text, truncated with `numberOfLines={1}` |
| **Priority badge** | Chip showing `P6`, `P7`, or `P8` |
| **AI badge** | Purple Bot icon + "AI" text (visible when `rule.s === 'ai'`) |
| **Active toggle** | `Switch` component — calls `toggleRule()` on change |
| **Summary text** | Auto-generated via `getRuleSummary()` — e.g. "Charge 50 kW (06:00-18:00), Mon-Fri" |
| **Time range** | Clock icon + `HH:MM - HH:MM` or "Always" |
| **Days** | Calendar icon + weekday label (e.g. "Mon, Tue, Wed" or "Everyday") |
| **Validity** | CalendarCheck icon + date range (hidden if permanent) |
| **Edit button** | Pencil icon — navigates to Rule Builder |
| **Delete button** | Trash2 icon — shows confirmation Alert |

Inactive rules render at 55% opacity. Pull-to-refresh triggers `refetch()`.

#### Calendar View

Sub-controls appear when calendar mode is active:

- **Week/Day toggle** — small segmented control
- **Navigation arrows** — `ChevronLeft` / `ChevronRight` to move ±1 week or ±1 day
- **Date label** — tapping resets to today; shows week range or day label

**Week view** — [`ScheduleWeekGrid`](../components/schedule/ScheduleWeekGrid.tsx):
- 7 day columns (Mon–Sun) with date numbers
- 24 hour rows, each 48px tall
- Color-coded blocks per action type (see ACTION_COLORS table below)
- Today's column gets a highlighted background
- Auto-scrolls to the earliest rule's hour on mount
- Overlapping rules are laid out side-by-side within their column

**Day view** — [`ScheduleDayGrid`](../components/schedule/ScheduleDayGrid.tsx):
- Single column, 24 hour rows (56px tall each)
- Blocks show: rule ID, priority badge, action label + power, time range
- Same overlap-resolution logic as week view

#### Rule Popup Modal

Tapping a block in calendar view opens a centered modal:

| Element | Details |
|---|---|
| Rule ID | Bold header |
| Priority | Chip (e.g. `P7`) |
| AI indicator | Bot icon if `s === 'ai'` |
| Summary | `getRuleSummary()` output |
| Time + Days | Compact detail line |
| Edit button | Navigates to Rule Builder |
| Delete button | Triggers confirmation Alert |

#### FAB (Floating Action Button)

- "+" icon, bottom-right
- Before navigating to Rule Builder, checks that `siteConfigComplete === true` **and** a P9 site-limit rule exists
- If not ready, shows an alert prompting the user to complete site configuration

#### Empty / Error States

| State | Display |
|---|---|
| No device selected | "No Device Selected" + hint to select one |
| Loading | Centered `ActivityIndicator` + "Loading schedules…" |
| Error | Error message + "Retry" button |
| No rules | "No Rules" + "Create your first rule" hint |

---

### 2.2 Rule Builder Screen

**File:** [`app/(tabs)/schedule/[ruleId].tsx`](../app/(tabs)/schedule/[ruleId].tsx)

Opened with `ruleId=new` for creation or `ruleId={existingId}&priority={P}` for editing.

#### Header

| Left | Center | Right |
|---|---|---|
| `X` close button (discard prompt) | "New Rule" or "Edit Rule" | Save button (disk icon / spinner) |

#### Automation Warning Banner

Shown when `siteConfig.automation.mode === 'automatic'` — yellow banner with `AlertTriangle` icon.

#### AI Source Badge

Purple banner with Bot icon when editing an AI-generated rule (`source === 'ai'`).

#### Templates Section (New Rules Only)

Horizontally scrollable cards, each pre-filling form fields:

| Template | Icon | Action | Key Defaults |
|---|---|---|---|
| **Peak Shaving** | `Zap` (amber) | `dis` | 50 kW, grid condition `> siteHth`, P8 |
| **Night Charging** | `Moon` (indigo) | `ct` | 80% SoC, 22:00–06:00, P7 |
| **PV Self-Consumption** | `Sun` (green) | `ch` | 50 kW, grid condition `< 0` (export), P7 |
| **Emergency Reserve** | `Shield` (red) | `ct` | 100% SoC, one-time today, P8 |

Tapping an active template again resets the form to defaults.

#### Form Sections

**Status Toggle**
- Segmented control: Active / Draft
- Hint text explains the selected state

**Rule ID**
- Auto-generated from action type prefix + parameters + time period + weekday pattern
- "Edit" link toggles manual override (allows free-text input, uppercase A-Z 0-9 - _, max 63 chars)
- Existing rules show the ID as a read-only text input

**Priority Selection**
- Three chips: Low (6) / Normal (7) / High (8)

**Action Type**
- 2×2 grid of cards: Charge, Discharge, Charge to Target, Discharge to Target
- Each card shows label + short description

**Parameters (vary by action type)**

| Action | Parameters |
|---|---|
| `ch` / `dis` | Power slider (0 to `max_charge_kw` or `max_discharge_kw`) + numeric text input; value clamped `onBlur` |
| `ct` | Target SoC (0–100%, clamped to safety min/max), Max power (kW), Max grid import (kW, clamped to `siteHth`), Strategy chips |
| `dt` | Target SoC (0–100%), Max power (kW), Min grid power (kW, signed ± toggle, clamped to `siteLth`–`siteHth`), Strategy chips |

**Strategy options** (for `ct`/`dt`):

| Value | Label | Description |
|---|---|---|
| `eq` | Balanced | Equal spread |
| `agg` | Fast | Aggressive ramp |
| `con` | Conservative | Gentle ramp |

**Schedule Mode**
- Segmented control: One-time / Recurring

*One-time mode:*
- "Today" quick chip + date picker button
- Validity auto-filled to selected date

*Recurring mode:*
- Quick buttons: Mon–Fri, Sat–Sun, All
- 7 individual weekday toggle buttons (Su Mo Tu We Th Fr Sa)
- Always shows start/end time pickers (custom modal with scrollable hour/minute columns, 5-minute steps)

**SoC Condition (Optional)**
- Enable toggle with hint text
- When enabled: min SoC + max SoC numeric inputs (clamped to safety limits)

**Grid Power Condition (Optional)**
- Enable toggle with hint text
- `GridRangeBar` visualization: shows export zone (red), import zone (green), active trigger zone (blue), zero mark, threshold markers
- Operator chips: Above (`gt`), Below (`lt`), Between (`bt`)
- Value input(s) with ± sign toggle (supports negative = export)
- Between mode shows two value inputs

**Validity Period**
- *One-time mode:* read-only, auto-set from date selection
- *Recurring mode:* quick presets (This Week, This Month, This Year, Permanent) + custom From/Until date pickers with clear links

**Rule Summary Preview**
- Card at bottom showing: generated rule ID, human-readable summary text, "Draft" badge if inactive

#### Footer

- Primary "Create Rule" / "Save Changes" button
- Secondary "Cancel" button (triggers discard confirmation)

#### Save Flow

1. Validate rule ID (non-empty, ≤63 chars)
2. Build `ScheduleRuleFormData` from form state
3. Convert to `OptimizedScheduleRule` via `formDataToOptimizedRule()`
4. Run `validateRule()` — show errors if any
5. Call `createRule()` or `updateRule()` (handles priority changes by removing from old bucket)
6. Success alert → navigate back

---

## 3. Backend Description

### 3.1 Data Flow

```
┌───────────────┐     callAwsProxy()      ┌──────────────────┐
│  Mobile App    │ ◄──────────────────────► │  Edge Proxy      │
│  useSchedules  │   /schedules/{siteId}   │  (Supabase Edge) │
│                │   GET / POST            │                  │
└───────────────┘                          └──────┬───────────┘
                                                  │
                                                  ▼
                                           ┌──────────────────┐
                                           │  AWS IoT Shadow  │
                                           │  (Device Twin)   │
                                           └──────────────────┘
```

### 3.2 Hook: `useSchedules`

**File:** [`hooks/useSchedules.ts`](../hooks/useSchedules.ts)

| Method | Signature | Description |
|---|---|---|
| `refetch` | `() => Promise<void>` | Fetches schedules for selected device |
| `createRule` | `(rule, priority) => Promise<void>` | Appends rule to `p_{priority}` array, saves, re-fetches |
| `updateRule` | `(rule, priority, oldPriority?) => Promise<void>` | Replaces rule in-place; if priority changed, removes from old bucket |
| `deleteRule` | `(ruleId, priority) => Promise<void>` | Filters out rule from `p_{priority}`, saves |
| `toggleRule` | `(ruleId, priority) => Promise<void>` | Flips `act` field (omit = active, `false` = inactive) |
| `setSafety` | `(socMin, socMax) => Promise<void>` | Updates safety SoC bounds |
| `setSiteLimit` | `(hth, lth) => Promise<void>` | Updates P9 site limit rule (`sl` action) |

**Derived state:**
- `rules`: flattened from `rawSchedules.sch` via `flattenRules()`, sorted by priority desc
- `safety`: `{ soc_min, soc_max }` from response, defaults to `5` / `100`

### 3.3 API Layer

**File:** [`lib/aws-schedules.ts`](../lib/aws-schedules.ts)

| Function | Description |
|---|---|
| `getSchedules(siteId)` | `GET /schedules/{siteId}` via `callAwsProxy` → `SchedulesResponse` |
| `saveSchedules(siteId, schedules, options?)` | `POST /schedules/{siteId}` — sends `{ site_id, sch, safety? }` → `SaveSchedulesResponse` |
| `flattenRules(sch)` | Iterates P4–P9 buckets, attaches priority to each rule, sorts desc priority then alpha ID |
| `formDataToOptimizedRule(data)` | Converts `ScheduleRuleFormData` → `OptimizedScheduleRule` (builds action + conditions) |
| `optimizedRuleToFormData(rule, priority)` | Inverse: `OptimizedScheduleRule` → `ScheduleRuleFormData` for form population |
| `validateRule(rule, priority)` | Returns `string[]` of error messages (empty = valid) |
| `formatTime(hhmm)` | Converts integer `1430` → `"14:30"` |
| `parseTime(str)` | Converts `"14:30"` → `1430` |
| `getRuleSummary(rule)` | Builds human-readable summary from rule fields |
| `getDaysLabel(d)` | Converts weekday data to display label (e.g. `"Mon, Tue"`, `"Everyday"`) |
| `getActionTypeLabel(type)` | Maps action code to display name |
| `getPriorityLabel(priority)` | Maps priority number to label |
| `getStrategyLabel(str)` | Maps strategy code to label |
| `getGridOperatorLabel(op)` | Maps grid operator code to label |

### 3.4 Calendar Helpers

**File:** [`lib/schedule-calendar.ts`](../lib/schedule-calendar.ts)

| Function | Description |
|---|---|
| `mapRulesToBlocks(rules, weekStart)` | Maps rules to positioned `RuleBlock[]` for a 7-day week grid. Handles overnight rules (split into two blocks), validity filtering, weekday filtering, and overlap resolution. |
| `mapRulesToBlocksForDay(rules, date)` | Same as above but for a single day. |
| `resolveOverlaps(blocks)` | Detects overlapping blocks per day column and assigns `overlapIndex` / `overlapCount` for side-by-side layout. |
| `getMonday(date)` | Returns the Monday of the week containing the given date. |
| `formatWeekRange(monday)` | Formats `"3 Mar – 9 Mar 2026"`. |
| `formatDayLabel(date)` | Formats `"Mon, 3 Mar 2026"`. |

#### ACTION_COLORS Map

```typescript
const ACTION_COLORS: Record<ActionType, string> = {
  ch:  '#22c55e',  // green   — Charge
  dis: '#f97316',  // orange  — Discharge
  sb:  '#9ca3af',  // gray    — Standby
  sl:  '#64748b',  // slate   — Site Limit
  ct:  '#3b82f6',  // blue    — Charge to Target
  dt:  '#a855f7',  // purple  — Discharge to Target
};
```

#### RuleBlock Interface

```typescript
interface RuleBlock {
  rule: ScheduleRuleWithPriority;
  dayIndex: number;       // 0=Mon .. 6=Sun (display order)
  startMinute: number;    // minutes since midnight
  endMinute: number;      // minutes since midnight
  isAlwaysTime: boolean;  // true if no time condition
  overlapIndex: number;   // position within overlap group
  overlapCount: number;   // total overlapping blocks
}
```

### 3.5 Calendar Components

**ScheduleWeekGrid** — [`components/schedule/ScheduleWeekGrid.tsx`](../components/schedule/ScheduleWeekGrid.tsx)

| Constant | Value | Purpose |
|---|---|---|
| `HOUR_HEIGHT` | 48px | Height of one hour row |
| `TIME_COL_WIDTH` | 36px | Width of time label column |
| `GRID_HEIGHT` | 1152px | Total grid height (24 × 48) |

Renders 7 day columns. Block width = `dayColWidth / overlapCount`. Today's column has a subtle blue tint. Blocks show priority label, truncated ID, and AI dot indicator.

**ScheduleDayGrid** — [`components/schedule/ScheduleDayGrid.tsx`](../components/schedule/ScheduleDayGrid.tsx)

| Constant | Value | Purpose |
|---|---|---|
| `HOUR_HEIGHT` | 56px | Height of one hour row |
| `TIME_COL_WIDTH` | 42px | Width of time label column |
| `GRID_HEIGHT` | 1344px | Total grid height (24 × 56) |

Single column layout. Blocks show full rule ID, priority badge, action label with power, and time range text.

### 3.6 Key Types

**File:** [`types/index.ts`](../types/index.ts)

```typescript
type ActionType = 'ch' | 'dis' | 'sb' | 'sl' | 'ct' | 'dt';
type GridOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'bt';
type Strategy = 'eq' | 'agg' | 'con';
type Priority = 4 | 5 | 6 | 7 | 8 | 9;

interface OptimizedAction {
  t: ActionType;
  pw?: number;    // power (kW)
  pid?: boolean;  // PID control enabled
  hth?: number;   // high threshold (site limit)
  lth?: number;   // low threshold (site limit)
  soc?: number;   // target SoC %
  maxp?: number;  // max power (kW)
  maxg?: number;  // max grid import (kW)
  ming?: number;  // min grid power (kW)
  str?: Strategy; // charging strategy
}

interface OptimizedConditions {
  ts?: number;        // time start (HHMM integer)
  te?: number;        // time end (HHMM integer)
  sm?: number;        // SoC min %
  sx?: number;        // SoC max %
  gpo?: GridOperator; // grid power operator
  gpv?: number;       // grid power value (kW)
  gpx?: number;       // grid power max value (kW, for 'bt')
}

interface OptimizedScheduleRule {
  id: string;
  s?: 'ai' | 'man';                  // source
  a: OptimizedAction;                 // action
  c?: OptimizedConditions;            // conditions
  act?: boolean;                      // active (omit = true, false = draft)
  d?: WeekdayShorthand | number[];    // weekdays
  vf?: number;                        // valid from (unix timestamp)
  vu?: number;                        // valid until (unix timestamp)
}

interface ScheduleRuleWithPriority extends OptimizedScheduleRule {
  priority: Priority;
}

interface SchedulesResponse {
  site_id: string;
  v: string;
  safety?: { soc_min?: number; soc_max?: number };
  sch: {
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
  };
  metadata: {
    total_rules: number;
    local_rules: number;
    cloud_rules: number;
    scada_safety_rules: number;
  };
  last_updated: number | null;
}

interface ScheduleRuleFormData {
  id: string;
  priority: Priority;
  actionType: ActionType;
  active: boolean;
  power?: number;
  usePid?: boolean;
  highThreshold?: number;
  lowThreshold?: number;
  targetSoc?: number;
  maxPower?: number;
  maxGridPower?: number;
  minGridPower?: number;
  strategy?: Strategy;
  timeStart?: string;
  timeEnd?: string;
  socMin?: number;
  socMax?: number;
  gridPowerOperator?: GridOperator;
  gridPowerValue?: number;
  gridPowerValueMax?: number;
  weekdays?: number[];
  validFrom?: number;
  validUntil?: number;
}
```

### 3.7 Tools Used

| Tool / Library | Purpose |
|---|---|
| **Expo Router** | File-based navigation (`router.push`, `useLocalSearchParams`) |
| **React Navigation** | `useFocusEffect` for refetch on screen focus |
| **lucide-react-native** | Icons (Plus, Pencil, Trash2, Clock, Calendar, Bot, ChevronLeft/Right, Zap, Moon, Sun, Shield, etc.) |
| **react-native-safe-area-context** | `SafeAreaView` for safe insets |
| **callAwsProxy** | Edge function proxy for AWS IoT shadow API ([`lib/edge-proxy.ts`](../lib/edge-proxy.ts)) |

### 3.8 File Index

| File | Role |
|---|---|
| [`app/(tabs)/schedule/index.tsx`](../app/(tabs)/schedule/index.tsx) | Schedule list + calendar screen |
| [`app/(tabs)/schedule/[ruleId].tsx`](../app/(tabs)/schedule/[ruleId].tsx) | Rule builder/editor screen |
| [`hooks/useSchedules.ts`](../hooks/useSchedules.ts) | Schedule CRUD hook |
| [`lib/aws-schedules.ts`](../lib/aws-schedules.ts) | API calls, flatten, convert, validate, display helpers |
| [`lib/schedule-calendar.ts`](../lib/schedule-calendar.ts) | Calendar block mapping, overlap resolution, date helpers |
| [`components/schedule/ScheduleWeekGrid.tsx`](../components/schedule/ScheduleWeekGrid.tsx) | Week calendar grid component |
| [`components/schedule/ScheduleDayGrid.tsx`](../components/schedule/ScheduleDayGrid.tsx) | Day calendar grid component |
| [`types/index.ts`](../types/index.ts) | TypeScript type definitions for all schedule entities |
| [`lib/edge-proxy.ts`](../lib/edge-proxy.ts) | Supabase Edge Function proxy to AWS |
