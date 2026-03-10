# AIESS Mobile App - Rork Template PRD

> **Purpose**: Simplified PRD for Rork AI to generate initial React Native (Expo) app structure.  
> **After Generation**: Export to GitHub, open in Cursor for advanced development with full PRD.

---

## App Overview

**Name**: AIESS Mobile App  
**Type**: Energy Management Mobile App  
**Platform**: React Native with Expo (iOS + Android)  
**Theme**: Light mode only  
**Primary Color**: #008cff (blue)  
**Secondary Colors**: #4CAF50 (success), #F44336 (error), #FF9800 (warning)

---

## Technology Requirements

- **Framework**: React Native with Expo SDK 50+
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based)
- **State Management**: React Context + Hooks
- **Backend**: Supabase (auth + database)
- **Charts**: Victory Native XL (react-native-skia based)
- **i18n**: i18next + react-i18next (English + Polish)

---

## Screen Structure

### Authentication (Unauthenticated)

#### 1. Login Screen (`/login`)
- AIESS logo at top (placeholder)
- Email input field
- Password input field
- "Remember me" checkbox
- "Forgot password" link
- Blue "Sign in" button
- Divider with "Or Sign in with"
- Google sign-in button (white with Google logo)
- Apple sign-in button (black, disabled with "Coming in v1.1" label)
- "Don't have an account? Sign up" link at bottom

#### 2. Sign Up Screen (`/signup`)
- AIESS logo at top
- Email input field
- Password input field
- Retype password input field
- Blue "Sign up" button
- "Have an account? Sign in" link at bottom

---

### Main App (Authenticated - Bottom Tab Navigation)

**Bottom Navigation Bar with 6 tabs:**
1. Devices (sitemap icon)
2. Monitor (performance/gauge icon)
3. AI (chat icon) - placeholder for future
4. Schedule (calendar/clock icon)
5. Analytics (chart/graph icon)
6. Settings (gear icon)

---

#### Tab 1: Devices Screen (`/(tabs)/devices`)

**Header**: "Your Devices" with subtitle "Select or add new devices"

**Content**:
- List of device cards (scrollable)
- Each card shows:
  - Device name and Site ID
  - Status badge (green checkmark or red X)
  - Specs row: Battery Capacity (kWh), Battery Power (kW), PV Power (kW)
- Tap card to select device and go to Monitor

**Footer**:
- "Add new device" button (full width, blue)
- Note: Shows "Coming soon" toast when tapped

---

#### Tab 2: Monitor Screen (`/(tabs)/monitor`)

**Header**: "Your Live Dashboard"

**Content**:
- Status bar with device name, site ID, and status badge
- Energy flow diagram showing:
  - Battery box (top center): SoC percentage, Status, Power
  - Inverter icon (center)
  - Grid box (bottom left): Power in kW
  - Factory box (bottom center): Calculated load in kW
  - PV/Solar box (bottom right): Power in kW
  - Connecting lines/arrows between components
- Auto-refreshes every 5 seconds

**Data Display**:
| Label | Value Format |
|-------|-------------|
| Battery SoC | "65.4%" |
| Battery Status | "Charging" / "Discharging" / "Standby" |
| Battery Power | "20 kW" |
| Grid Power | "20 kW" |
| PV Power | "0 kW" |
| Factory Load | "40 kW" (calculated) |

---

#### Tab 3: AI Screen (`/(tabs)/ai`) - Placeholder

**Header**: "AI Chat" with subtitle "Let's talk about your energy!"

**Content**:
- Simple message: "AI Assistant coming in v1.2"
- Placeholder chat input at bottom

---

#### Tab 4: Schedule Screen (`/(tabs)/schedule`)

**Main List View** (`/(tabs)/schedule/index`)

**Header**: "Schedules" with subtitle "Active rules"

**Content**:
- List of rule cards (scrollable)
- Each card shows:
  - Rule ID (e.g., "CHARGE-TO-50")
  - Status badge
  - Edit button (pencil icon, top right)
  - Two columns:
    - Left: Actions (Type, Power, Max Grid, etc.)
    - Right: Time conditions (Days, Time range, Validity)

**Footer**:
- "Add new rule" button (full width, blue)

---

**Rule Builder View** (`/(tabs)/schedule/[ruleId]`)

**Header**: "Schedules" with subtitle "Rule builder", back arrow

**Content** (scrollable form):

**Section 1: Basic Info**
- Rule ID text input (uppercase only, required)
- Priority dropdown (P4-P8, default P7)
- Active toggle switch

**Section 2: Action Type**
- 6 selectable cards in 2 rows:
  - Charge, Discharge, Standby
  - Charge to SoC, Discharge to SoC, Site Limit

**Section 3: Action Parameters** (dynamic based on type)
- For Charge/Discharge:
  - Power slider (0-999 kW)
  - PID mode toggle
- For Charge to SoC:
  - Target SoC slider (0-100%)
  - Max Power slider
  - Max Grid Power slider (optional)
  - Strategy dropdown (Equal Spread, Aggressive, Conservative)
- For Discharge to SoC:
  - Target SoC slider
  - Max Power slider
  - Min Grid Power slider (optional)
  - Strategy dropdown
- For Site Limit (P9):
  - High Threshold input (kW)
  - Low Threshold input (kW, negative)

**Section 4: Conditions** (all optional, expandable)
- Time Window: Start/End time pickers
- Weekdays: Chip selector (Mon-Sun) with quick presets
- SoC Range: Dual slider (min-max)
- Grid Power: Operator dropdown + value input
- Validity Period: Start/End date pickers

**Section 5: Preview**
- Human-readable rule summary
- Collapsible JSON preview

**Footer** (sticky):
- Confirm button (blue)
- Discard button (red)

---

#### Tab 5: Analytics Screen (`/(tabs)/analytics`)

**Header**: "Analytics" with subtitle "Your energy flow analysis"

**Content**:
- Time range selector: Day | Week | Month (segmented control)
- Date navigation (< previous, date display, next >)
- Line chart showing:
  - Grid Power (green line)
  - Battery Power (orange line)
  - SoC (blue dashed, right Y-axis)
- Summary cards row:
  - Grid Import (kWh)
  - Grid Export (kWh)
  - Charged (kWh)
  - Discharged (kWh)

---

#### Tab 6: Settings Screen (`/(tabs)/settings`)

**Header**: "Settings"

**Content** (scrollable):

**Language Section**
- Dropdown: English / Polski

**Site Limits Section** (P9)
- High Threshold input (kW)
- Low Threshold input (kW)
- Save button

**Device Info Section** (read-only)
- Device Name
- Site ID
- Location

**Account Section**
- Edit Profile button
- Log Out button (red)

---

## Data Models

### User Profile
```typescript
interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}
```

### Device
```typescript
interface Device {
  id: string;
  device_id: string;        // Human-readable site ID
  name: string;
  status: 'active' | 'inactive' | 'maintenance' | 'offline';
  device_type: 'on_grid' | 'off_grid' | 'hybrid';
  location: string | null;
  battery_capacity_kwh: number | null;
  pcs_power_kw: number | null;
  pv_power_kw: number | null;
}
```

### Live Data
```typescript
interface LiveData {
  gridPower: number;        // kW, + = import, - = export
  batteryPower: number;     // kW, + = charge, - = discharge
  batterySoc: number;       // 0-100%
  batteryStatus: 'Charging' | 'Discharging' | 'Standby';
  pvPower: number;          // kW
  factoryLoad: number;      // kW, calculated: max(0, grid + pv + battery)
  lastUpdate: Date;
}
```

### Schedule Rule (Optimized Format)
```typescript
interface Rule {
  id: string;               // Rule ID (1-63 chars)
  p: number;                // Priority (4-8)
  a: {                      // Action
    t: 'ch' | 'dis' | 'sb' | 'ct' | 'dt' | 'sl';
    pw?: number;            // Power (kW)
    pid?: boolean;          // PID mode
    soc?: number;           // Target SoC (for ct/dt)
    maxp?: number;          // Max power (for ct/dt)
    maxg?: number;          // Max grid (for ct)
    ming?: number;          // Min grid (for dt)
    str?: 'eq' | 'agg' | 'con';  // Strategy
    hth?: number;           // High threshold (for sl)
    lth?: number;           // Low threshold (for sl)
  };
  c?: {                     // Conditions
    ts?: number;            // Time start (HHMM format)
    te?: number;            // Time end (HHMM format)
    d?: string;             // Weekdays ("12345" for Mon-Fri)
    sm?: number;            // SoC min
    sx?: number;            // SoC max
    gpo?: 'gt' | 'lt' | 'bt';  // Grid power operator
    gpv?: number;           // Grid power value
    gpx?: number;           // Grid power max (for between)
    vf?: number;            // Valid from (unix timestamp)
    vu?: number;            // Valid until (unix timestamp)
  };
  act?: boolean;            // Active (default true)
}
```

---

## API Endpoints

### Supabase (Auth + Database)
- Login: `supabase.auth.signInWithPassword()`
- Signup: `supabase.auth.signUp()`
- Google: `supabase.auth.signInWithIdToken()` (Apple deferred to v1.1)
- Devices: `supabase.from('devices').select('*').eq('device_users.user_id', userId)`
- Profile: `supabase.from('user_profiles').select('*').eq('id', userId)`

### InfluxDB (Live Data + Analytics)
- URL: `https://eu-central-1-1.aws.cloud2.influxdata.com/api/v2/query`
- Method: POST
- Headers: `Authorization: Token <read-only-token>`
- Body: Flux query

### AWS API Gateway (Schedules)
- Base URL: `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default`
- GET Rules: `GET /schedules/{site_id}`
- Update Rules: `POST /schedules/{site_id}`
- Headers: `x-api-key: <api-key>`

---

## Internationalization

### Supported Languages
- English (en) - default
- Polish (pl)

### Key Translation Keys
```
common.loading, common.error, common.save, common.cancel
auth.signIn, auth.signUp, auth.email, auth.password
devices.title, devices.addNew
monitor.title, monitor.grid, monitor.battery, monitor.pv
schedules.title, schedules.addRule, schedules.ruleBuilder
analytics.title, analytics.day, analytics.week, analytics.month
settings.title, settings.language, settings.logOut
```

---

## Design Reference (Screenshots)

See the `screenshots/` folder for Figma exports of each screen:

| Screen | File |
|--------|------|
| Login | `01_login.png` |
| Sign Up | `02_signup.png` |
| Devices List | `03_devices_list.png` |
| Devices - Add New | `04_devices_add.png` |
| Monitor (Live Dashboard) | `05_monitor.png` |
| AI Chat (Empty) | `06_ai_chat_empty.png` |
| AI Chat (With Messages) | `07_ai_chat_messages.png` |
| Schedules List | `08_schedules_list.png` |
| Rule Builder | `09_schedules_builder.png` |
| Analytics | `10_analytics.png` |
| Settings | `11_settings.png` |

Use these screenshots as visual reference for colors, spacing, and layout.

---

## Notes for Rork

1. **Focus on UI Structure**: Create all screens with proper navigation and layout. API integration will be refined in Cursor.

2. **Placeholder Data**: Use mock data for lists and charts. Real API connections will be added later.

3. **Chart Library**: Victory Native XL requires react-native-skia setup. Include in dependencies but chart implementation can be simplified.

4. **Social Auth**: Include button UI for Google sign-in (functional in MVP). Apple button should be visible but disabled with "Coming in v1.1" label - Apple auth deferred to v1.1 pending developer enrollment.

5. **Form Validation**: Add basic validation to forms. Advanced validation added later.

6. **Translations**: Set up i18next structure with placeholder strings. Full translations added later.

7. **Theme**: Light mode only. Use the provided colors consistently.

8. **Icons**: Use appropriate icons from popular icon libraries (Ionicons, Material Icons).

9. **Bottom Nav**: All 6 tabs should be present. AI tab is a placeholder.

10. **Responsive**: Target iPhone 12+ and modern Android phones (375px width base).

---

## File Structure (Expected)

```
aiess-mobile/
├── app/
│   ├── _layout.tsx              # Root layout with providers
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (tabs)/
│       ├── _layout.tsx          # Tab navigator
│       ├── devices.tsx
│       ├── monitor.tsx
│       ├── ai.tsx
│       ├── schedule/
│       │   ├── index.tsx
│       │   └── [ruleId].tsx
│       ├── analytics.tsx
│       └── settings.tsx
├── components/
│   ├── DeviceCard.tsx
│   ├── EnergyFlowDiagram.tsx
│   ├── RuleCard.tsx
│   ├── RuleBuilder/
│   │   ├── ActionSelector.tsx
│   │   ├── ConditionsForm.tsx
│   │   └── RulePreview.tsx
│   └── charts/
│       └── EnergyChart.tsx
├── contexts/
│   ├── AuthContext.tsx
│   ├── DeviceContext.tsx
│   └── SettingsContext.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useDevices.ts
│   ├── useLiveData.ts
│   └── useSchedules.ts
├── lib/
│   ├── supabase.ts
│   ├── influxdb.ts
│   └── aws-schedules.ts
├── locales/
│   ├── en.json
│   └── pl.json
├── types/
│   └── index.ts
└── constants/
    └── colors.ts
```

---

## Quick Start for Cursor

After exporting from Rork to GitHub:

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with API keys
4. Refer to `aiess_mobile_prd.md` for detailed specifications
5. Implement API integrations following the hooks structure
6. Add real chart implementation with Victory Native XL
7. Complete social auth flows
8. Add full translations

---

*This template is designed for Rork AI to create the initial app scaffold. Use `aiess_mobile_prd.md` for complete specifications during Cursor development.*

