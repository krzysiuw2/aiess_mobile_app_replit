# 04 — Lambda Functions

## `aiess-bedrock-action` — Action Group Handler

**Source:** `lambda/bedrock-agent-action/index.mjs`

Handles all tool invocations from both action groups. A single Lambda serves both `aiess-management` and `aiess-analytics` action groups — no code duplication.

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `SITE_CONFIG_TABLE` | DynamoDB table name | `site_config` |
| `SCHEDULES_API` | Base URL for schedules API | `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default` |
| `SCHEDULES_API_KEY` | API key for schedules endpoints | *(secret)* |
| `INFLUX_URL` | InfluxDB Cloud endpoint | `https://eu-central-1-1.aws.cloud2.influxdata.com` |
| `INFLUX_TOKEN` | InfluxDB read/write token | *(secret)* |
| `INFLUX_ORG` | InfluxDB organization | `aiess` |

### Request Routing

The Lambda extracts the tool name from `event.apiPath` (e.g., `/get_battery_status` → handler `get_battery_status`). Parameters come from two sources:

- **GET requests:** `event.parameters[]` array with `{ name, value }` objects
- **POST requests:** `event.requestBody.content['application/json'].properties[]` array

### Handler Map

The Lambda contains 13 handler functions (11 exposed via action groups + 2 internal):

| Handler | Exposed | Data Source |
|---|---|---|
| `get_site_config` | Management | DynamoDB |
| `get_current_schedules` | Management | Schedules API |
| `send_schedule_rule` | Management | Schedules API |
| `delete_schedule_rule` | Management | Schedules API |
| `set_system_mode` | Management | Schedules API |
| `set_safety_limits` | Management | Schedules API |
| `update_site_config` | *(pending quota)* | DynamoDB |
| `get_battery_status` | Analytics | InfluxDB |
| `get_energy_summary` | Analytics | InfluxDB |
| `get_tge_prices` | Analytics | InfluxDB (delegates to `get_tge_price` + `get_tge_price_history`) |
| `get_rule_history` | Analytics | InfluxDB (delegates to `get_rule_config_history` + `get_active_rule_history`) |
| `get_chart_data` | Analytics | InfluxDB |
| `get_tge_price` | Internal | InfluxDB |
| `get_tge_price_history` | Internal | InfluxDB |
| `get_rule_config_history` | Internal | InfluxDB |
| `get_active_rule_history` | Internal | InfluxDB |

### Response Format

All responses follow the Bedrock Action Group Lambda response format:

```json
{
  "messageVersion": "1.0",
  "response": {
    "actionGroup": "<from event>",
    "apiPath": "<from event>",
    "httpMethod": "<from event>",
    "httpStatusCode": 200,
    "responseBody": {
      "application/json": {
        "body": "<JSON string of the tool result>"
      }
    }
  }
}
```

### InfluxDB Bucket Selection

The Lambda auto-selects the optimal InfluxDB bucket based on the requested time range:

| Range | Bucket | Resolution |
|---|---|---|
| ≤ 1 hour | `aiess_v1` | Raw (~5s) |
| ≤ 24 hours | `aiess_v1_1m` | 1-minute aggregates |
| ≤ 168 hours (1 week) | `aiess_v1_15m` | 15-minute aggregates |
| > 168 hours | `aiess_v1_1h` | 1-hour aggregates |

### Deployment

```powershell
cd lambda/bedrock-agent-action
Compress-Archive -Path index.mjs -DestinationPath function.zip -Force
aws lambda update-function-code `
  --function-name aiess-bedrock-action `
  --zip-file fileb://function.zip `
  --region eu-central-1
```

---

## `aiess-bedrock-chat` — Chat Proxy

**Source:** `lambda/bedrock-chat/index.mjs`

Thin proxy between the mobile app's HTTP request and the Bedrock Agent Runtime SDK. Handles streaming response collection and `returnControl` extraction.

### Environment Variables

| Variable | Description | Value |
|---|---|---|
| `BEDROCK_AGENT_ID` | Agent ID | `EUNJYANOZX` |
| `BEDROCK_AGENT_ALIAS_ID` | Alias ID | `ITHHACXCBB` |

### Request Body

**Send message:**
```json
{
  "message": "Jaki jest stan baterii?",
  "session_id": "session-1709123456789",
  "site_id": "domagala_1"
}
```

**Send confirmation result:**
```json
{
  "session_id": "session-1709123456789",
  "site_id": "domagala_1",
  "return_control_results": [{
    "apiResult": {
      "actionGroup": "aiess-management",
      "apiPath": "/send_schedule_rule",
      "httpMethod": "POST",
      "httpStatusCode": 200,
      "responseBody": {
        "application/json": {
          "body": "{\"status\":\"confirmed\"}"
        }
      }
    }
  }]
}
```

### Response Body

**Normal response:**
```json
{
  "text": "Agent's response text...",
  "session_id": "session-1709123456789"
}
```

**Confirmation required:**
```json
{
  "text": "Chcę utworzyć regułę...",
  "session_id": "session-1709123456789",
  "return_control": { "invocationId": "...", "invocationInputs": [...] },
  "confirmation": {
    "invocation_id": "abc123",
    "action_group": "aiess-management",
    "tool_name": "send_schedule_rule",
    "http_method": "POST",
    "parameters": { "site_id": "domagala_1", "priority": 7, "rule_json": "{...}" }
  }
}
```

### Session Attributes

The `site_id` is passed to the Bedrock Agent in two ways:
- `sessionAttributes` — persisted across turns, available to action group Lambda via session context
- `promptSessionAttributes` — injected directly into the model's prompt so the agent can see it

### Deployment

```powershell
cd lambda/bedrock-chat
Compress-Archive -Path index.mjs -DestinationPath function.zip -Force
aws lambda update-function-code `
  --function-name aiess-bedrock-chat `
  --zip-file fileb://function.zip `
  --region eu-central-1
```
