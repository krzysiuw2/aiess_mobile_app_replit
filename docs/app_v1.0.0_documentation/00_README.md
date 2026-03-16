# AIESS Energy Core v1.0.0 — App Documentation

## App Identity

| Property | Value |
|----------|-------|
| Name | AIESS Energy Core |
| Version | 1.0.0 |
| Bundle ID | `com.aiess.mobile` (iOS + Android) |
| Expo Slug | `aiess-energy-core` |
| Scheme | `aiess` |
| Deep Link Origin | `https://aiess.app/` |
| EAS Project ID | `7876f371-52f5-4f41-923d-bc1ec284b2a9` |
| Owner | `kdub49` |

## Documentation Index

| Doc | Title | Content |
|-----|-------|---------|
| [01](01_AUTHENTICATION.md) | Authentication | Login, signup, social auth, session management |
| [02](02_DEVICES.md) | Devices Tab | Device listing, selection, QR scanner |
| [03](03_MONITOR.md) | Monitor Tab | Real-time energy flow visualization |
| [04](04_AI_CHAT.md) | AI Chat Tab | AI assistant, quick actions, voice input |
| [05](05_SCHEDULE.md) | Schedule Tab | Rule management, calendar views, rule builder |
| [06](06_ANALYTICS.md) | Analytics Tab | Usage data, forecasts, financial analysis, battery data |
| [07](07_SETTINGS.md) | Settings Tab | Site config, financial, system, account, language |
| [08](08_BACKEND_SERVICES.md) | Backend Services | AWS, Supabase, InfluxDB infrastructure |
| [09](09_DATA_FLOW.md) | Data Flows | End-to-end data pipelines |
| [10](10_LOCALIZATION.md) | Localization | Translation system (en/pl) |

## Tech Stack

### Frontend
- **Framework:** React Native 0.81.5 with Expo SDK 54
- **Router:** Expo Router 6 (file-based routing, typed routes)
- **State:** React Query (@tanstack/react-query), Zustand, React Context
- **Charts:** react-native-gifted-charts, react-native-chart-kit
- **Icons:** lucide-react-native
- **SVG:** react-native-svg (custom EnergyFlowSVG diagram)
- **Auth UI:** expo-apple-authentication, @react-native-google-signin
- **Voice:** expo-speech-recognition
- **Camera:** expo-camera (QR scanning)

### Backend
- **Auth & DB:** Supabase (PostgreSQL, Auth, Edge Functions)
- **Compute:** AWS Lambda (Node.js 20, Python 3.11)
- **Time-series:** InfluxDB Cloud (eu-central-1)
- **NoSQL:** AWS DynamoDB (site config, tariffs, financial summaries)
- **AI:** AWS Bedrock (Agent Runtime)
- **Scheduling:** AWS EventBridge
- **API:** AWS API Gateway (REST)
- **Geocoding:** AWS Location Service

### Infrastructure
- **Region:** `eu-central-1`
- **AWS Account:** `896709973986`
- **Client secrets:** Stored in Supabase Edge Function secrets, never in client bundle

## Navigation Map

```
app/
├── _layout.tsx                     # Root: providers stack
├── index.tsx                       # Auth gate (redirect)
├── +not-found.tsx                  # 404 screen
│
├── (auth)/
│   ├── _layout.tsx                # Auth stack
│   ├── login.tsx                  # Email/password + social
│   └── signup.tsx                 # Registration
│
└── (tabs)/
    ├── _layout.tsx                # Tab navigator (6 tabs)
    ├── devices.tsx                # Tab 1: Device list
    ├── monitor.tsx                # Tab 2: Live monitor
    ├── ai.tsx                     # Tab 3: AI chat
    ├── analytics.tsx              # Tab 5: Analytics (4 sub-tabs)
    │
    ├── schedule/                  # Tab 4: Schedule stack
    │   ├── _layout.tsx
    │   ├── index.tsx              # Rule list / calendar
    │   └── [ruleId].tsx           # Rule builder (create/edit)
    │
    └── settings/                  # Tab 6: Settings stack
        ├── _layout.tsx
        ├── index.tsx              # Settings menu
        ├── site.tsx               # Physical site config
        ├── financial.tsx          # Financial settings
        ├── system.tsx             # Operating mode
        ├── account.tsx            # Logout / delete
        └── app-settings.tsx       # Language
```

### Tab Bar Order

| # | Tab | Icon | Route |
|---|-----|------|-------|
| 1 | Devices | `Network` | `devices` |
| 2 | Monitor | `Gauge` | `monitor` |
| 3 | AI | `MessageSquare` | `ai` |
| 4 | Schedule | `CalendarClock` | `schedule` |
| 5 | Analytics | `BarChart3` | `analytics` |
| 6 | Settings | `Settings` | `settings` |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile App (Expo)                      │
│  React Native + Expo Router + React Query                │
└────────────┬───────────────────┬────────────────────────┘
             │                   │
     ┌───────▼───────┐   ┌──────▼──────┐
     │   Supabase    │   │  Supabase   │
     │   Auth        │   │  Edge Fns   │
     │   Database    │   │  influx-    │
     │  (Postgres)   │   │  proxy      │
     └───────────────┘   │  aws-proxy  │
                         └──────┬──────┘
                  ┌─────────────┼─────────────┐
                  │             │             │
           ┌──────▼──────┐ ┌───▼───┐  ┌──────▼──────┐
           │   AWS API   │ │Influx │  │   AWS       │
           │   Gateway   │ │  DB   │  │ Bedrock     │
           └──────┬──────┘ │ Cloud │  │ Agent       │
                  │        └───────┘  └─────────────┘
        ┌─────────┼─────────┐
        │         │         │
  ┌─────▼───┐ ┌──▼───┐ ┌───▼────┐
  │site-    │ │sched-│ │export- │
  │config   │ │ules  │ │guard   │
  │Lambda   │ │ API  │ │ API    │
  └────┬────┘ └──────┘ └────────┘
       │
  ┌────▼─────┐
  │ DynamoDB │
  │site_config│
  └──────────┘
```

**Async pipelines (EventBridge-triggered):**
```
Device (MQTT) → InfluxDB (5s) → aggregate-1m → aggregate-15m → aggregate-1h
Open-Meteo API → forecast-engine → InfluxDB (energy_simulation)
Telemetry + TGE + Tariffs → financial-engine → InfluxDB + DynamoDB
```

## Environment Variables

### Client (.env)

```bash
# Required
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional (social auth)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

All sensitive credentials (InfluxDB tokens, AWS keys) are stored as **Supabase Edge Function secrets** and never exposed in the client bundle.

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | ~54.0.30 | App framework |
| `react-native` | 0.81.5 | UI runtime |
| `expo-router` | ~6.0.21 | File-based routing |
| `@supabase/supabase-js` | ^2.86.0 | Auth + database client |
| `@tanstack/react-query` | ^5.83.0 | Server state management |
| `react-native-gifted-charts` | ^1.4.70 | Bar/line/pie charts |
| `react-native-svg` | 15.12.1 | SVG rendering (energy flow) |
| `lucide-react-native` | ^0.562.0 | Icon library |
| `expo-camera` | ~17.0.10 | QR code scanning |
| `expo-speech-recognition` | ^3.1.1 | Voice input for AI chat |
| `expo-apple-authentication` | ~8.0.8 | Apple Sign-In |
| `@react-native-google-signin/google-signin` | ^16.0.0 | Google Sign-In |
| `zustand` | ^5.0.2 | Lightweight state store |
| `react-native-markdown-display` | ^7.0.2 | AI chat markdown rendering |
| `lodash` | ^4.17.21 | Utility functions |
