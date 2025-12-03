# AIESS Mobile App v1.0 MVP - Product Requirements Document

> **Version**: 1.0 (MVP)  
> **Last Updated**: December 1, 2025  
> **Target Platforms**: iOS & Android (React Native + Expo)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Target Users](#3-target-users)
4. [Technology Stack](#4-technology-stack)
5. [Feature Specifications](#5-feature-specifications)
6. [Data Architecture](#6-data-architecture)
7. [API Integrations](#7-api-integrations)
8. [UI/UX Design](#8-uiux-design)
9. [Internationalization](#9-internationalization)
10. [Security Considerations](#10-security-considerations)
11. [Out of Scope (v1.0)](#11-out-of-scope-v10)
12. [Success Metrics](#12-success-metrics)

---

## 1. Executive Summary

### 1.1 Product Overview

AIESS Mobile App is a React Native application for monitoring and controlling Battery Energy Storage Systems (BESS). The app enables users to:

- Monitor real-time energy data (grid, battery, PV)
- View and manage schedule rules for battery operation
- Analyze historical energy performance
- Configure site settings

### 1.2 MVP Scope

| Feature | Priority | Status |
|---------|----------|--------|
| Authentication (Email + Google) | P0 | MVP |
| Device List | P0 | MVP |
| Live Monitor Dashboard | P0 | MVP |
| Schedule Rules Management | P0 | MVP |
| Analytics Charts | P1 | MVP |
| Settings (Language, Site Limits) | P1 | MVP |
| Apple Sign-In | P2 | v1.1 |
| Push Notifications | P2 | v1.1 |
| Device Adding | P2 | v1.1 |
| Alerts Configuration | P2 | v1.1 |

---

## 2. Product Vision

### 2.1 Problem Statement

BESS operators need a mobile-friendly way to:
- Monitor energy flow in real-time from anywhere
- Create and manage schedule rules without technical knowledge
- Understand energy patterns and optimize usage

### 2.2 Solution

A cross-platform mobile app that provides:
- Intuitive live dashboard with energy flow visualization
- Simple rule builder for battery schedules
- Clear analytics and historical data
- Multi-language support (EN/PL)

---

## 3. Target Users

### 3.1 Primary Persona

**BESS Site Owner**
- Owns or manages a battery energy storage installation
- Wants to optimize energy costs and self-consumption
- Moderate technical knowledge
- Uses smartphone daily
- Languages: English or Polish

### 3.2 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | User | Log in with email or Google | I can securely access my devices |
| US-02 | User | See a list of my devices | I can select which site to monitor |
| US-03 | User | View live energy data | I know current grid, battery, and PV status |
| US-04 | User | See battery charge level (SoC) | I know available energy capacity |
| US-05 | User | Create a new schedule rule | The battery operates automatically at set times |
| US-06 | User | Edit existing rules | I can adjust schedules as needed |
| US-07 | User | Delete a rule | I can remove unwanted schedules |
| US-08 | User | View energy history charts | I understand usage patterns |
| US-09 | User | Change app language | I can use the app in my preferred language |
| US-10 | User | Set site power limits (P9) | The system respects grid connection limits |

---

## 4. Technology Stack

### 4.1 Frontend

| Component | Technology | Reason |
|-----------|------------|--------|
| Framework | React Native + Expo | Cross-platform, rapid development |
| Language | TypeScript | Type safety, better DX |
| Navigation | Expo Router | File-based routing |
| State | React Context + Hooks | Simple, built-in |
| Charts | Victory Native XL | High-performance native charts using Skia |
| i18n | i18next + react-i18next | Industry standard, supports EN/PL |
| HTTP Client | fetch (native) | Built-in, no extra deps |

### 4.2 Backend Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Auth | Supabase Auth | Email + Google login (Apple in v1.1) |
| Database | Supabase (PostgreSQL) | User profiles, devices, device_users |
| Time-Series | InfluxDB | Live monitoring data |
| IoT Shadow | AWS IoT + API Gateway | Schedule rules |

### 4.3 Key Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",
  "expo": "~50.x",
  "expo-router": "~3.x",
  "expo-secure-store": "~13.x",
  "victory-native": "^41.x",
  "react-native-reanimated": "~3.x",
  "@shopify/react-native-skia": "~1.x",
  "i18next": "^23.x",
  "react-i18next": "^14.x"
}
```

---

## 5. Feature Specifications

### 5.1 Authentication (F-AUTH)

#### 5.1.1 Login Screen

**UI Elements:**
- AIESS logo
- Email input field
- Password input field
- "Remember me" checkbox
- "Forgot password" link
- "Sign in" button
- Divider: "Or Sign in with"
- Google sign-in button
- Apple sign-in button (disabled with "Coming in v1.1" label)
- "Don't have an account? Sign up" link

**Behavior:**
- Email/Password: Standard Supabase email auth
- Google: Native sign-in via `@react-native-google-signin/google-signin`
- Apple: Deferred to v1.1 (pending Apple Developer enrollment)
- Session persisted using Expo SecureStore
- Auto-login if valid session exists

**Validation:**
- Email: Valid email format required
- Password: Minimum 6 characters

#### 5.1.2 Sign Up Screen

**UI Elements:**
- AIESS logo
- Email input field
- Password input field
- Retype password input field
- "Sign up" button
- "Have an account? Sign in" link

**Behavior:**
- Create new user via Supabase Auth
- Email verification required (configurable)
- Auto-create `user_profiles` entry via trigger

#### 5.1.3 Session Management

| Aspect | Implementation |
|--------|----------------|
| Storage | Expo SecureStore (encrypted) |
| Persistence | Auto-refresh tokens |
| Timeout | Follow iOS/Android best practices (indefinite with refresh) |
| Logout | Clear all tokens, navigate to login |

---

### 5.2 Device List (F-DEVICES)

#### 5.2.1 Device List Screen

**UI Elements:**
- Header: "Your Devices" with subtitle "Select or add new devices"
- Device cards showing:
  - Device name
  - Site ID
  - Status indicator (online/offline badge)
  - Specs: Battery Capacity (kWh), Battery Power (kW), PV Power (kW)
- "Add new device" button (disabled in v1.0, shows "Coming soon")

**Data Source:** Supabase

```sql
-- Query to get user's devices
SELECT d.* 
FROM devices d
JOIN device_users du ON d.id = du.device_id
WHERE du.user_id = auth.uid()
ORDER BY d.name;
```

**Device Card Data:**
| Field | Source | Display |
|-------|--------|---------|
| name | `devices.name` | "Device: {name}" |
| device_id | `devices.device_id` | "Site: {device_id}" |
| status | Computed | Green check or gray X |
| battery_capacity | `devices.battery_capacity_kwh` | "{value} kWh" |
| battery_power | `devices.pcs_power_kw` | "{value} kW" |
| pv_power | `devices.pv_power_kw` | "{value} kW" |

**Navigation:**
- Tap on device card → Navigate to Live Monitor for selected device
- Store `selected_device_id` in app state/context

---

### 5.3 Live Monitor (F-MONITOR)

#### 5.3.1 Dashboard Screen

**UI Elements:**
- Header: "Your Live Dashboard"
- Status bar with device name, site ID, and status
- Energy Flow Diagram showing:
  - Battery (with SoC %, Status, Power)
  - Grid (with power in kW)
  - PV/Solar (with power in kW)
  - Factory Load (with calculated power in kW)
  - Flow arrows between components
- Auto-refresh indicator

**Data Source:** InfluxDB via HTTP API

**Query Configuration:**
```typescript
const INFLUX_CONFIG = {
  url: "https://eu-central-1-1.aws.cloud2.influxdata.com",
  org: "aiess",
  bucket: "aiess_v1",
  token: "READ_ONLY_TOKEN" // from .env
};
```

**InfluxDB Query (Flux):**
```flux
from(bucket: "aiess_v1")
  |> range(start: -1m)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${site_id}")
  |> last()
```

**Live Data Fields:**

| Field | InfluxDB Key | Unit | Description |
|-------|--------------|------|-------------|
| Grid Power | `grid_power` | kW | + = importing, - = exporting |
| Battery Power | `pcs_power` | kW | - = charging, + = discharging |
| Battery SoC | `soc` | % | State of charge (0-100) |
| Battery Status | Calculated | enum | Based on pcs_power sign |
| PV Power | `total_pv_power` | kW | Solar generation |
| Compensated Power | `compensated_power` | kW | Grid compensation |
| Factory Load | Calculated | kW | `max(0, grid_power + total_pv_power - pcs_power)` |

**Refresh Configuration:**
- Interval: 5 seconds
- Method: HTTP POST to InfluxDB API
- Error handling: Show "Connection error" toast, retry

#### 5.3.2 Energy Flow Visualization

**Visual Elements:**
- Battery icon (with SoC fill level)
- Inverter icon (center)
- Grid icon (house + power line)
- Factory icon (building)
- PV/Solar icon (solar panels)
- Animated flow arrows (direction based on power flow sign)

**Flow Arrow Logic:**
| Condition | Arrow Direction |
|-----------|-----------------|
| grid_power > 0 | Grid → Inverter (importing) |
| grid_power < 0 | Inverter → Grid (exporting) |
| battery_power > 0 | Inverter → Battery (charging) |
| battery_power < 0 | Battery → Inverter (discharging) |
| pv_power > 0 | PV → Inverter |

---

### 5.4 Schedule Rules (F-SCHEDULES)

#### 5.4.1 Schedules List Screen

**UI Elements:**
- Header: "Schedules" with subtitle "Active rules"
- Rule cards showing:
  - Rule ID (e.g., "CHARGE-TO-50")
  - Status badge (Active/Inactive)
  - Actions section (Type, Power, Max Grid)
  - Time conditions section (Days, Time range, Validity)
  - Edit button (pencil icon)
- "Add new rule" button

**Data Source:** AWS API Gateway

```typescript
const SCHEDULES_API = {
  endpoint: "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default",
  apiKey: "API_KEY_FROM_SECURE_STORAGE"
};

// GET schedules
const response = await fetch(
  `${SCHEDULES_API.endpoint}/schedules/${device_id}`,
  { headers: { "x-api-key": SCHEDULES_API.apiKey } }
);
```

**Response Structure:**
```json
{
  "site_id": "domagala_1",
  "schedules": {
    "priority_5": [...],
    "priority_6": [...],
    "priority_7": [...],
    "priority_8": [...]
  },
  "shadow_version": 4275
}
```

**Rule Card Display:**

| Display Field | Data Source |
|---------------|-------------|
| Rule ID | `rule.id` or `rule.rule_id` |
| Status | `rule.active` (default: true) |
| Type | `rule.a.t` mapped to readable name |
| Power | `rule.a.pw` + "kW" |
| Target SoC | `rule.a.soc` + "%" (for ct/dt) |
| Max Power | `rule.a.maxp` + "kW" (for ct/dt) |
| Max Grid | `rule.a.maxg` + "kW" (for ct) |
| Days | `rule.c.d` or "Everyday" |
| Time | `rule.c.ts` + "-" + `rule.c.te` |
| Valid From/Until | `rule.c.vf` / `rule.c.vu` |

#### 5.4.2 Rule Builder Screen (Add/Edit)

> **Reference:** See `add_new_rule_app_guide.md` for complete specification

**Screen Sections:**

1. **Basic Info**
   - Rule ID (text input, auto-uppercase, 1-63 chars)
   - Priority (dropdown: P4-P8, default P7)
   - Active toggle (default: ON)

2. **Action Configuration**
   - Action Type selector (cards):
     - Charge (ch)
     - Discharge (dis)
     - Standby (sb)
     - Charge to Target (ct)
     - Discharge to Target (dt)
   - Dynamic fields based on action type (see guide)

3. **Conditions (all optional)**
   - Time Window (start/end time pickers)
   - Weekdays (chip selector with quick presets)
   - SoC Range (dual slider, 0-100%)
   - Grid Power (operator dropdown + value)
   - Validity Period (date pickers)

4. **Rule Preview**
   - Human-readable summary
   - Collapsible JSON preview

5. **Action Buttons**
   - Confirm (blue button)
   - Discard (red button)

**API Integration for Create/Update:**

```typescript
async function saveRule(rule: Rule, siteId: string) {
  // 1. GET current schedules
  const current = await getSchedules(siteId);
  
  // 2. Add/update rule in appropriate priority
  const priorityKey = `priority_${rule.p}`;
  const rules = current.schedules[priorityKey] || [];
  const existingIndex = rules.findIndex(r => r.id === rule.id);
  
  if (existingIndex >= 0) {
    rules[existingIndex] = rule;
  } else {
    rules.push(rule);
  }
  
  // 3. POST updated schedules
  return await fetch(`${ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      site_id: siteId,
      schedules: { [priorityKey]: rules }
    })
  });
}
```

**API Integration for Delete:**

```typescript
async function deleteRule(ruleId: string, priority: number, siteId: string) {
  const current = await getSchedules(siteId);
  const priorityKey = `priority_${priority}`;
  const rules = current.schedules[priorityKey].filter(r => r.id !== ruleId);
  
  return await fetch(`${ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      site_id: siteId,
      schedules: { [priorityKey]: rules }
    })
  });
}
```

---

### 5.5 Analytics (F-ANALYTICS)

#### 5.5.1 Analytics Screen

**UI Elements:**
- Header: "Analytics" with subtitle "Your energy flow analysis"
- **Time range selector at top** (1 Hour, Day, Week, Month)
- Date navigation (previous/next, date picker)
- Charts section

**Charts to Implement:**

1. **Energy Flow Chart (Line)**
   - Grid Power (green line)
   - Battery Power (yellow/orange line)
   - SoC (blue dashed line, right Y-axis in %)
   - X-axis: Time
   - Y-axis left: Power (kW)
   - Y-axis right: SoC (%)

2. **Summary Cards**
   - Total Grid Import (kWh)
   - Total Grid Export (kWh)
   - Total Charge Energy (kWh)
   - Total Discharge Energy (kWh)
   - Average SoC (%)

**Data Source:** InfluxDB with different buckets based on timeframe

> **Important:** Never use `aiess_v1` (5-second data) for analytics - only for live dashboard!

#### 5.5.2 InfluxDB Bucket Strategy

| Bucket | Data Resolution | Retention | Use Case |
|--------|-----------------|-----------|----------|
| `aiess_v1` | 5 seconds | Short | **Live dashboard only** |
| `aiess_v1_1m` | 1 minute | Medium | Hourly analytics |
| `aiess_v1_15m` | 15 minutes | Long | Daily analytics |
| `aiess_v1_1h` | 1 hour | Extended | Weekly/Monthly analytics |

#### 5.5.3 Timeframe Configuration

| Timeframe | Bucket | Query Range | Data Points (~) |
|-----------|--------|-------------|-----------------|
| **1 Hour** | `aiess_v1_1m` | `-1h` | 60 points |
| **Day** | `aiess_v1_15m` | `-24h` | 96 points |
| **Week** | `aiess_v1_1h` | `-7d` | 168 points |
| **Month** | `aiess_v1_1h` | `-30d` | 720 points |

**InfluxDB Query Examples:**

```flux
// Hourly view (1-minute aggregates)
from(bucket: "aiess_v1_1m")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${site_id}")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc")

// Daily view (15-minute aggregates)
from(bucket: "aiess_v1_15m")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${site_id}")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc")

// Weekly view (1-hour aggregates)
from(bucket: "aiess_v1_1h")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${site_id}")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc")

// Monthly view (1-hour aggregates)
from(bucket: "aiess_v1_1h")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "energy_telemetry")
  |> filter(fn: (r) => r.site_id == "${site_id}")
  |> filter(fn: (r) => r._field == "grid_power" or r._field == "pcs_power" or r._field == "soc")
```

**Chart Implementation (Victory Native XL):**

```tsx
import { CartesianChart, Line, useChartPressState } from "victory-native";

<CartesianChart
  data={chartData}
  xKey="time"
  yKeys={["grid_power", "battery_power"]}
>
  {({ points }) => (
    <>
      <Line
        points={points.grid_power}
        color="#4ade80"
        strokeWidth={2}
      />
      <Line
        points={points.battery_power}
        color="#f59e0b"
        strokeWidth={2}
      />
    </>
  )}
</CartesianChart>
```

---

### 5.6 Settings (F-SETTINGS)

#### 5.6.1 Settings Screen

**UI Elements:**
- Header: "Settings"
- Sections:
  - **Language**
    - Dropdown: English / Polski
  - **Site Limits (P9)**
    - High Threshold input (kW)
    - Low Threshold input (kW, negative)
    - Save button
  - **Device Info** (read-only)
    - Device Name
    - Site ID
    - Location
  - **Account**
    - Edit Profile button
    - Log Out button

**Language Implementation:**

```typescript
// i18n configuration
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: require('./locales/en.json') },
    pl: { translation: require('./locales/pl.json') }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});
```

**Site Limits (P9) Configuration:**

This sends a P9 site_limit rule to AWS IoT Shadow:

```typescript
async function saveSiteLimits(highThreshold: number, lowThreshold: number) {
  const rule = {
    id: "SITE-LIMIT-MAIN",
    p: 9,
    a: { t: "sl", hth: highThreshold, lth: lowThreshold },
    c: {}
  };
  
  return await saveRule(rule, siteId);
}
```

---

## 6. Data Architecture

### 6.1 Supabase Schema (Existing)

#### Tables

**`user_profiles`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK, FK→auth.users) | User ID |
| full_name | text | User's display name |
| phone | text | Phone number |
| avatar_url | text | Profile picture URL |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update |

**`devices`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Internal device ID |
| device_id | text (unique) | Human-readable site ID (e.g., "domagala_1") |
| name | text | Device display name |
| status | enum | active, inactive, maintenance, offline |
| device_type | enum | on_grid, off_grid, hybrid |
| location | text | Location description |
| latitude | numeric | GPS latitude |
| longitude | numeric | GPS longitude |
| timezone | text | Default: 'UTC' |
| battery_capacity_kwh | numeric | Battery capacity |
| pcs_power_kw | numeric | Inverter power |
| pv_power_kw | numeric | Solar capacity |
| influxdb_bucket | text | InfluxDB bucket name |
| influxdb_measurement | text | Measurement name |

**`device_users`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Record ID |
| device_id | uuid (FK→devices) | Device reference |
| user_id | uuid (FK→auth.users) | User reference |
| role | enum | owner, admin, viewer |
| granted_at | timestamptz | When access was granted |
| granted_by | uuid | Who granted access |

### 6.2 App State Structure

```typescript
interface AppState {
  // Auth
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  
  // Devices
  devices: Device[];
  selectedDeviceId: string | null;
  
  // Live Data
  liveData: {
    gridPower: number;
    batteryPower: number;
    batterySoc: number;
    batteryStatus: 'Charging' | 'Discharging' | 'Standby';
    pvPower: number;
    factoryLoad: number;
    lastUpdate: Date;
  } | null;
  
  // Schedules
  schedules: {
    [priority: string]: Rule[];
  };
  shadowVersion: number;
  
  // Settings
  language: 'en' | 'pl';
  siteLimits: {
    highThreshold: number;
    lowThreshold: number;
  } | null;
}
```

---

## 7. API Integrations

### 7.1 Supabase

**Configuration:**
```typescript
const SUPABASE_CONFIG = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
};
```

**Client Setup:**
```typescript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

### 7.2 InfluxDB

**Configuration:**
```typescript
const INFLUX_CONFIG = {
  url: process.env.EXPO_PUBLIC_INFLUX_URL,
  org: process.env.EXPO_PUBLIC_INFLUX_ORG,
  token: process.env.EXPO_PUBLIC_INFLUX_TOKEN // Read-only
};
```

**Query Function:**
```typescript
async function queryInflux(query: string): Promise<any[]> {
  const response = await fetch(`${INFLUX_CONFIG.url}/api/v2/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_CONFIG.token}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query
  });
  
  const csv = await response.text();
  return parseInfluxCSV(csv);
}
```

### 7.3 AWS API Gateway (Schedules)

**Configuration:**
```typescript
const AWS_SCHEDULES_CONFIG = {
  endpoint: process.env.EXPO_PUBLIC_AWS_ENDPOINT,
  apiKey: process.env.EXPO_PUBLIC_AWS_API_KEY
};
```

**Headers:**
```typescript
const headers = {
  'x-api-key': AWS_SCHEDULES_CONFIG.apiKey,
  'Content-Type': 'application/json'
};
```

---

## 8. UI/UX Design

### 8.1 Design System

**Brand Colors:**
| Name | Hex | Usage |
|------|-----|-------|
| AIESS Blue | `#008cff` | Primary, active nav, buttons |
| Success | `#4CAF50` | Status OK, positive values |
| Error | `#F44336` | Errors, delete, discard |
| Warning | `#FF9800` | Warnings, pending |
| Background | `#FFFFFF` | Page background |
| Surface | `#F2F2F2` | Cards, navbar |
| Text Primary | `#141520` | Main text |
| Text Secondary | `#6F7183` | Subtitles, hints |
| Text Muted | `#A4A4A4` | Inactive nav items |

**Typography:**
| Style | Font | Size | Weight |
|-------|------|------|--------|
| Title | Inter | 22px | Medium (500) |
| Subtitle | Inter | 14px | Regular (400) |
| Body | Inter | 12-16px | Regular/Medium |
| Button | Inter | 16px | SemiBold (600) |

**Spacing:**
| Size | Value |
|------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |

### 8.2 Navigation Structure

```
App
├── (auth)                    # Unauthenticated routes
│   ├── login                 # Sign in screen
│   └── signup                # Sign up screen
│
└── (tabs)                    # Authenticated routes with bottom nav
    ├── devices               # Device list (index)
    ├── monitor               # Live dashboard
    ├── ai                    # AI Chat (placeholder for v1.1)
    ├── schedule              # Schedules
    │   ├── index             # Rules list
    │   └── [ruleId]          # Rule builder (add/edit)
    ├── analytics             # Charts
    └── settings              # Settings
```

### 8.3 Bottom Navigation

**Items (left to right):**
1. **Devices** - `mdi:sitemap-outline`
2. **Monitor** - `eos-icons:performance`
3. **AI** - `hugeicons:ai-chat-02` (placeholder)
4. **Schedule** - `akar-icons:schedule`
5. **Analytics** - `streamline:money-graph-analytics`
6. **Settings** - `material-symbols:settings-outline-rounded`

**States:**
- Active: AIESS Blue (`#008cff`)
- Inactive: Muted (`#A4A4A4`)

---

## 9. Internationalization

### 9.1 Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `en` | English | Primary |
| `pl` | Polish | Secondary |

### 9.2 Translation Structure

```
/locales
├── en.json
└── pl.json
```

**Example Structure:**
```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "discard": "Discard"
  },
  "auth": {
    "signIn": "Sign in",
    "signUp": "Sign up",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot password",
    "rememberMe": "Remember me",
    "noAccount": "Don't have an account?",
    "hasAccount": "Have an account?",
    "signInWithGoogle": "Sign in with Google",
    "signInWithApple": "Sign in with Apple"
  },
  "devices": {
    "title": "Your Devices",
    "subtitle": "Select or add new devices",
    "addNew": "Add new device",
    "batteryCapacity": "Battery Capacity",
    "batteryPower": "Battery Power",
    "pvPower": "PV Power"
  },
  "monitor": {
    "title": "Your Live Dashboard",
    "grid": "Grid",
    "battery": "Battery",
    "pv": "PV",
    "factory": "Factory",
    "soc": "SoC",
    "status": "Status",
    "power": "Power",
    "charging": "Charging",
    "discharging": "Discharging",
    "standby": "Standby"
  },
  "schedules": {
    "title": "Schedules",
    "subtitle": "Active rules",
    "addRule": "Add new rule",
    "ruleBuilder": "Rule builder",
    "ruleId": "Rule ID",
    "priority": "Priority",
    "action": "Actions",
    "conditions": "Time conditions",
    "type": "Type",
    "power": "Power",
    "maxPower": "Max Power",
    "maxGrid": "Max Grid",
    "targetSoc": "Target SoC",
    "everyday": "Everyday"
  },
  "analytics": {
    "title": "Analytics",
    "subtitle": "Your energy flow analysis",
    "hour": "1 Hour",
    "day": "Day",
    "week": "Week",
    "month": "Month",
    "gridImport": "Grid Import",
    "gridExport": "Grid Export",
    "charged": "Charged",
    "discharged": "Discharged",
    "avgSoc": "Avg SoC"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "siteLimits": "Site Limits",
    "highThreshold": "High Threshold (kW)",
    "lowThreshold": "Low Threshold (kW)",
    "deviceInfo": "Device Info",
    "account": "Account",
    "logOut": "Log Out"
  }
}
```

---

## 10. Security Considerations

### 10.1 Credential Storage

| Credential | Storage Method |
|------------|----------------|
| Auth Session | Expo SecureStore (encrypted) |
| API Keys | Environment variables (build-time) |
| User Tokens | Managed by Supabase client |

### 10.2 API Keys

**Environment Variables (`.env`):**
```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_INFLUX_URL=https://eu-central-1-1.aws.cloud2.influxdata.com
EXPO_PUBLIC_INFLUX_ORG=aiess
EXPO_PUBLIC_INFLUX_TOKEN=xxxxx  # Read-only token
EXPO_PUBLIC_AWS_ENDPOINT=https://xxxxx.execute-api.eu-central-1.amazonaws.com/default
EXPO_PUBLIC_AWS_API_KEY=xxxxx
```

> **Note:** These are bundled at build time. For production:
> - Use different keys per environment
> - InfluxDB token must be read-only
> - AWS API key should have minimal permissions
> - Consider fetching sensitive keys from authenticated endpoint

### 10.3 Row Level Security (RLS)

Supabase RLS policies ensure:
- Users can only see devices they have access to (`device_users`)
- Users can only modify their own profile
- Device data is scoped by `device_users` relationship

---

## 11. Out of Scope (v1.0)

The following features are planned for future versions:

| Feature | Target Version | Notes |
|---------|----------------|-------|
| Apple Sign-In | v1.1 | Pending Apple Developer enrollment (48h) |
| Push Notifications | v1.1 | SoC/Grid alerts |
| SoC/Grid Alerts | v1.1 | Configurable thresholds |
| Add New Device (full flow) | v1.1 | |
| AI Chat Assistant | v1.2 | |
| Dark Mode | v1.2 | |
| Device Offline Mode | v1.2 | |
| Multi-site Dashboard | v1.3 | |
| Energy Cost Calculator | v1.3 | |

---

## 12. Success Metrics

### 12.1 MVP Launch Criteria

- [ ] User can sign in/up with email
- [ ] User can sign in with Google
- [ ] Apple Sign-In button present (shows "Coming in v1.1")
- [ ] Device list loads from Supabase
- [ ] Live dashboard shows real-time data (5s refresh)
- [ ] Factory load is calculated correctly
- [ ] User can view existing schedule rules
- [ ] User can create a new rule
- [ ] User can edit an existing rule
- [ ] User can delete a rule
- [ ] Analytics shows daily/weekly/monthly charts
- [ ] User can change language (EN/PL)
- [ ] User can set P9 site limits
- [ ] App works on iOS 15+ and Android 10+

### 12.2 Performance Targets

| Metric | Target |
|--------|--------|
| App Launch Time | < 2 seconds |
| Live Data Latency | < 1 second |
| Chart Render Time | < 500ms |
| API Response Time | < 3 seconds |
| Crash-Free Rate | > 99.5% |

---

## Appendices

### A. Rule Schema Reference

See `v1.4.1_schedules_and_rules_guide.md` for complete rule structure.

### B. API Endpoint Reference

See `schedules_parse_and_send_aws_guide.md` for API details.

### C. Rule Builder UX Guide

See `add_new_rule_app_guide.md` for complete UI specifications.

---

**Document Maintainer:** AIESS Development Team  
**Related Files:**
- `template_prd.md` - Simplified PRD for Rork AI
- `v1.4.1_schedules_and_rules_guide.md` - Rule schema
- `schedules_parse_and_send_aws_guide.md` - API reference
- `add_new_rule_app_guide.md` - Rule builder specs

