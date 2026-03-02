# 05 — API & Lambda Reference

> Complete reference for all API endpoints, Lambda functions, client libraries,
> IAM permissions, and external service integrations.

---

## 1. API Gateway

| Property | Value |
|----------|-------|
| **Type** | AWS HTTP API Gateway |
| **Base URL** | `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default` |
| **Auth** | API key via `x-api-key` header |
| **Region** | `eu-central-1` |

### Routes

| Method | Path | Lambda | Purpose |
|--------|------|--------|---------|
| POST | `/chat` | `aiess-bedrock-chat` | AI chat (message or confirmation) |
| GET | `/site-config/{site_id}` | `aiess-site-config` | Read site configuration |
| PUT | `/site-config/{site_id}` | `aiess-site-config` | Update site configuration |
| PUT | `/site-config/{site_id}/geocode` | `aiess-site-config` | Geocode address and save coordinates |
| GET | `/schedules/{site_id}` | `aiess-get-schedules` | Read schedule rules |
| POST | `/schedules/{site_id}` | `aiess-update-schedules` | Update schedule rules |

---

## 2. Lambda Functions

### 2.1 `aiess-bedrock-chat` — AI Chat Proxy

| Property | Value |
|----------|-------|
| **File** | `lambda/bedrock-chat/index.mjs` |
| **Runtime** | Node.js 20 (ESM) |
| **Trigger** | API Gateway `POST /chat` |
| **Timeout** | 60s (streaming agent responses) |

#### Request Format

**New message:**
```json
{
  "message": "Jaki jest aktualny stan magazynu?",
  "session_id": "session-1709312400000",
  "site_id": "domagala_1",
  "current_datetime": "2026-03-01T12:00:00Z"
}
```

**Confirmation result:**
```json
{
  "session_id": "session-1709312400000",
  "site_id": "domagala_1",
  "return_control_results": [{
    "apiResult": {
      "actionGroup": "aiess-management",
      "apiPath": "/send_schedule_rule",
      "httpMethod": "POST",
      "httpStatusCode": 200,
      "responseBody": {
        "application/json": {
          "body": "{\"status\":\"confirmed\",\"message\":\"User confirmed the action\"}"
        }
      }
    }
  }]
}
```

#### Response Format

```json
{
  "text": "Aktualny stan magazynu: SoC 72%, ładowanie...",
  "session_id": "session-1709312400000",
  "charts": [
    {
      "_chart": true,
      "chart_type": "line",
      "title": "SoC (24h)",
      "labels": ["2026-03-01T00:00:00Z", "..."],
      "datasets": [{ "label": "soc", "data": [65, 68, 72], "color": "#22c55e" }],
      "point_count": 144,
      "hours": 24
    }
  ],
  "confirmation": {
    "invocation_id": "inv-abc123",
    "action_group": "aiess-management",
    "tool_name": "send_schedule_rule",
    "http_method": "POST",
    "parameters": {
      "site_id": "domagala_1",
      "priority": 7,
      "rule": { "id": "night_charge", "a": { "t": "ch", "pw": 15 } }
    }
  },
  "return_control": {
    "invocationId": "inv-abc123",
    "invocationInputs": ["..."]
  }
}
```

Fields `charts`, `confirmation`, and `return_control` are optional — only present when relevant.

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region (`eu-central-1`) |
| `BEDROCK_AGENT_ID` | Bedrock agent ID |
| `BEDROCK_AGENT_ALIAS_ID` | Bedrock agent alias ID |

#### IAM Permissions

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeAgent"],
  "Resource": "arn:aws:bedrock:eu-central-1:*:agent-alias/*/*"
}
```

---

### 2.2 `aiess-bedrock-action` — Agent Action Lambda

| Property | Value |
|----------|-------|
| **File** | `lambda/bedrock-agent-action/index.mjs` |
| **Runtime** | Node.js 20 (ESM) |
| **Trigger** | Bedrock Agent action groups |
| **OpenAPI** | `openapi-management.json`, `openapi-analytics.json` |

#### Routing

The handler extracts `toolName` from `event.apiPath` and dispatches to the matching handler function. Parameters come from `event.parameters` (GET) and `event.requestBody` (POST).

#### Handler Map

| Handler | Tool Name | Action Group |
|---------|-----------|--------------|
| `get_site_config` | get_site_config | aiess-management |
| `get_current_schedules` | get_current_schedules | aiess-management |
| `send_schedule_rule` | send_schedule_rule | aiess-management |
| `delete_schedule_rule` | delete_schedule_rule | aiess-management |
| `set_system_mode` | set_system_mode | aiess-management |
| `set_safety_limits` | set_safety_limits | aiess-management |
| `update_site_config` | update_site_config | (internal only) |
| `get_battery_status` | get_battery_status | aiess-analytics |
| `get_energy_summary` | get_energy_summary | aiess-analytics |
| `get_tge_prices` | get_tge_prices | aiess-analytics |
| `get_chart_data` | get_chart_data | aiess-analytics |
| `get_rule_history` | get_rule_history | aiess-analytics |

#### Response Format (Bedrock compatible)

```json
{
  "messageVersion": "1.0",
  "response": {
    "actionGroup": "aiess-analytics",
    "apiPath": "/get_battery_status",
    "httpMethod": "GET",
    "httpStatusCode": 200,
    "responseBody": {
      "application/json": {
        "body": "{\"soc\":72,\"battery_power_kw\":-15.3,...}"
      }
    }
  }
}
```

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `SITE_CONFIG_TABLE` | DynamoDB table name (`site_config`) |
| `SCHEDULES_API` | Schedules API base URL |
| `SCHEDULES_API_KEY` | API key for Schedules API |
| `INFLUX_URL` | InfluxDB Cloud endpoint |
| `INFLUX_TOKEN` | InfluxDB auth token |
| `INFLUX_ORG` | InfluxDB organization |

#### IAM Permissions

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "dynamodb:PutItem"
  ],
  "Resource": "arn:aws:dynamodb:eu-central-1:*:table/site_config"
}
```

Network access to Schedules API and InfluxDB via HTTPS.

---

### 2.3 `aiess-site-config` — Site Configuration API

| Property | Value |
|----------|-------|
| **File** | `lambda/site-config/index.mjs` |
| **Runtime** | Node.js 20 (ESM) |
| **Trigger** | API Gateway `GET/PUT /site-config/{site_id}` |

#### Endpoints

**GET** `/site-config/{site_id}`
- Reads `site_config` from DynamoDB by `site_id`
- Returns full config JSON

**PUT** `/site-config/{site_id}`
- Deep-merges request body into existing config
- Preserves unchanged sections
- Automatically sets `updated_at` timestamp

**PUT** `/site-config/{site_id}/geocode`
- Takes `{ "address": "..." }` in body
- Calls Amazon Location Service `SearchPlaceIndexForText`
- Stores `latitude`, `longitude` in `site_config.location`

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `SITE_CONFIG_TABLE` | DynamoDB table name |
| `LOCATION_INDEX` | Amazon Location Service place index name |

#### IAM Permissions

- DynamoDB: `GetItem`, `PutItem`, `UpdateItem` on `site_config`
- Location: `geo:SearchPlaceIndexForText`
- CloudWatch: `logs:*`

---

### 2.4 `aiess-export-guard` — Scheduled Export Guard

| Property | Value |
|----------|-------|
| **File** | `lambda/export-guard/index.mjs` |
| **Runtime** | Node.js 20 (ESM) |
| **Trigger** | EventBridge Scheduler (~15 min interval) |

#### Behavior

1. Runs 4 consecutive checks, 15 seconds apart
2. Each check:
   - If within daylight hours: reads grid power from InfluxDB
   - If grid power < `export_threshold`: turns inverter OFF via Supla, saves state
   - If inverter is off and grid power > `restart_threshold`: turns inverter ON, clears state
   - If outside daylight hours and inverter was off by guard: turns inverter ON

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `INFLUX_URL` | InfluxDB endpoint |
| `INFLUX_TOKEN` | InfluxDB token |
| `INFLUX_ORG` | InfluxDB org |
| `GUARD_TABLE` | DynamoDB table (`export_guard_state`) |
| `SUPLA_BASE_URL` | Supla Cloud API base URL |
| `SITE_ID` | Site ID to monitor |
| `COOLDOWN_MINUTES` | Min time before restart check |
| `EXPORT_THRESHOLD` | Grid power shutdown trigger (kW, negative) |
| `RESTART_THRESHOLD` | Grid power restart trigger (kW, negative) |
| `DAYLIGHT_START` | Monitoring start hour (e.g. 6) |
| `DAYLIGHT_END` | Monitoring end hour (e.g. 21) |

#### IAM Permissions

- DynamoDB: `GetItem`, `PutItem` on `export_guard_state`
- CloudWatch: `logs:*`

---

### 2.5 `aiess-export-guard-api` — Export Guard HTTP API

| Property | Value |
|----------|-------|
| **File** | `lambda/export-guard-api/index.mjs` |
| **Runtime** | Node.js 20 (ESM) |
| **Trigger** | Lambda Function URL (not API Gateway) |
| **Auth** | None (CORS: `*`) |

#### Endpoints

**GET** — Read current state
```json
{
  "grid_power_kw": -25.3,
  "inverter_on": true,
  "guard": {
    "status": "monitoring",
    "shutdown_at": null,
    "next_check_at": null
  },
  "config": {
    "export_threshold": -40,
    "restart_threshold": -20
  }
}
```

**PATCH** — Update thresholds
```json
{
  "export_threshold": -50,
  "restart_threshold": -25
}
```

**POST** — Force inverter on
```json
{
  "action": "turn_on"
}
```

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `GUARD_TABLE` | DynamoDB table name |
| `SUPLA_BASE_URL` | Supla Cloud API |
| `SITE_ID` | Site ID |
| `INFLUX_URL` | InfluxDB endpoint |
| `INFLUX_TOKEN` | InfluxDB token |
| `INFLUX_ORG` | InfluxDB org |

---

### 2.6 Schedules Lambdas (External — Not in Repo)

Two Lambda functions handle IoT Shadow operations for schedules:

| Function | Route | Operation |
|----------|-------|-----------|
| `aiess-get-schedules` | `GET /schedules/{site_id}` | `GetThingShadow` (named shadow: `schedule`) |
| `aiess-update-schedules` | `POST /schedules/{site_id}` | `UpdateThingShadow` (merges into desired state) |

---

## 3. Client Libraries

### 3.1 `lib/aws-chat.ts`

```typescript
// Send a chat message to the AI agent
sendChatMessage(
  message: string,
  sessionId: string,
  siteId: string,
): Promise<ChatResponse>

// Send a confirmation result (accept/reject)
sendConfirmationResult(
  sessionId: string,
  invocationId: string,
  accepted: boolean,
  toolName: string,
  actionGroup?: string,    // default: 'aiess-management'
  httpMethod?: string,     // default: 'POST'
  siteId?: string,
): Promise<ChatResponse>
```

### 3.2 `lib/aws-schedules.ts`

```typescript
// Read all schedule rules
getSchedules(siteId: string): Promise<SchedulesResponse>

// Write schedule rules (partial update by priority key)
saveSchedules(
  siteId: string,
  schedules: Record<string, OptimizedScheduleRule[]>,
  options?: { safety?: { soc_min: number; soc_max: number } }
): Promise<SaveSchedulesResponse>

// Helpers
flattenRules(sch): ScheduleRuleWithPriority[]
formDataToOptimizedRule(data: ScheduleRuleFormData): OptimizedScheduleRule
optimizedRuleToFormData(rule, priority): ScheduleRuleFormData
validateRule(rule, priority): string[]
formatTime(hhmm: number): string     // 2200 → "22:00"
parseTime(timeStr: string): number    // "22:00" → 2200
getActionTypeLabel(type): string
getPriorityLabel(priority): string
getStrategyLabel(str): string
getGridOperatorLabel(op): string
getDaysLabel(d): string
getRuleSummary(rule): string
weekdayShorthandToArray(d): number[]
```

### 3.3 `lib/aws-site-config.ts`

```typescript
// Read site configuration from DynamoDB
getSiteConfig(siteId: string): Promise<SiteConfig>

// Partial update (deep merge)
updateSiteConfig(siteId: string, patch: Partial<SiteConfig>): Promise<SiteConfig>

// Geocode address and save to site config
geocodeSiteAddress(siteId: string, address: string): Promise<SiteConfig>
```

### 3.4 `lib/influxdb.ts`

```typescript
// Fetch real-time data (5s resolution, last 5 minutes)
fetchLiveData(siteId: string): Promise<LiveData | null>

// Fetch historical chart data with auto-bucket selection
fetchChartData(
  siteId: string,
  timeRange: TimeRange,         // 'hour' | 'day' | 'week' | 'month' | '24h' | '7d' | '30d' | '365d'
  selectedDate: Date
): Promise<ChartDataPoint[]>

// Compute energy statistics from chart data
calculateEnergyStats(data: ChartDataPoint[], timeRange: TimeRange): EnergyStats

// Helper functions
calculateFactoryLoad(gridPower, pvPower, batteryPower): number
getBatteryStatus(batteryPower): 'Charging' | 'Discharging' | 'Standby'
```

### 3.5 `lib/supabase.ts`

```typescript
// Supabase client with Expo SecureStore auth adapter
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: new ExpoSecureStoreAdapter(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 4. External Service Integrations

### 4.1 Supla Cloud API

Used by the Export Guard for inverter control.

| Operation | HTTP | Description |
|-----------|------|-------------|
| Read device state | GET | Check if inverter is on/off |
| Turn on | PATCH/POST | Send turn-on command |
| Turn off | PATCH/POST | Send turn-off command |

### 4.2 Amazon Location Service

Used by the site-config Lambda for geocoding.

| Operation | API | Description |
|-----------|-----|-------------|
| Geocode | `SearchPlaceIndexForText` | Convert address string to lat/lng |

### 4.3 InfluxDB Cloud v3

| Property | Value |
|----------|-------|
| **API** | HTTP POST `/api/v2/query?org={org}` |
| **Auth** | `Authorization: Token {token}` |
| **Content-Type** | `application/vnd.flux` |
| **Accept** | `application/csv` |
| **Query Language** | Flux |

---

## 5. AWS Services Summary

| Service | Usage | Accessed By |
|---------|-------|-------------|
| **API Gateway HTTP API** | REST endpoint routing | Mobile app |
| **Lambda** | 5 serverless functions | API Gateway, Bedrock, EventBridge |
| **Bedrock Agent Runtime** | AI chat with tool use | bedrock-chat Lambda |
| **DynamoDB** | Site config, guard state | site-config Lambda, action Lambda, guard Lambdas |
| **IoT Core** | Device shadows, MQTT | Schedules Lambdas, BESS controller |
| **EventBridge Scheduler** | Periodic export guard | export-guard Lambda |
| **Amazon Location** | Geocoding | site-config Lambda |
| **CloudWatch Logs** | Lambda logging | All Lambdas |
