# 01 — Architecture

## High-Level Flow

```
Mobile App (ai.tsx)
    │
    ▼  POST /chat  { message, session_id, site_id }
API Gateway (jyjbeg4h9e)
    │
    ▼  Lambda proxy integration
aiess-bedrock-chat  (Chat Proxy Lambda)
    │
    ▼  InvokeAgentCommand
Bedrock Agent  (EUNJYANOZX / alias ITHHACXCBB)
    │  ┌──────────────────────────┐
    │  │  eu.anthropic.claude-     │
    │  │  sonnet-4-6 (EU CRIS)    │
    │  └──────────────────────────┘
    │
    ├──▶ Action Group: aiess-management (6 APIs)  ──┐
    │                                                │
    ├──▶ Action Group: aiess-analytics  (5 APIs)  ──┤
    │                                                ▼
    │                                     aiess-bedrock-action Lambda
    │                                         │         │         │
    │                                         ▼         ▼         ▼
    │                                     DynamoDB   Schedules   InfluxDB
    │                                   (site_config)  API      (telemetry)
    │
    ├──▶ returnControl (confirmation needed)
    │        ▼
    │    Chat Proxy returns { confirmation: {...} }
    │        ▼
    │    Mobile App shows Accept / Reject card
    │        ▼
    │    POST /chat  { return_control_results }
    │        ▼
    │    Bedrock Agent executes or cancels the tool
    │
    ▼
  Response streamed back → Chat Proxy collects chunks → JSON to mobile app
```

## Components

### 1. Mobile App (`app/(tabs)/ai.tsx`)
- React Native chat UI with message bubbles, confirmation cards
- Uses `lib/aws-chat.ts` client library
- Generates unique `session_id` per conversation
- Passes `site_id` (selected device) on every request

### 2. API Gateway HTTP API
- Endpoint: `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default`
- Route: `POST /chat` → `aiess-bedrock-chat` Lambda
- No authorizer on the HTTP API itself; API key validated by downstream Lambdas

### 3. Chat Proxy Lambda (`aiess-bedrock-chat`)
- Thin proxy between mobile app and Bedrock Agent Runtime
- Translates REST request into `InvokeAgentCommand`
- Passes `site_id` as both `sessionAttributes` and `promptSessionAttributes`
- Collects streaming response chunks into a single JSON response
- Extracts `returnControl` events into a structured `confirmation` object

### 4. Bedrock Agent (`aiess-energy-core`)
- Orchestration: DEFAULT (Bedrock manages tool selection and chaining)
- Extended thinking enabled (1024 budget tokens)
- Session TTL: 600 seconds (10 minutes)
- Two action groups, both pointing to the same Lambda

### 5. Action Group Lambda (`aiess-bedrock-action`)
- Single Lambda handling all 11+ tool implementations
- Reads `event.apiPath` to route to the correct handler
- Parses parameters from both `event.parameters` (GET query) and `event.requestBody` (POST body)
- Integrates with DynamoDB, Schedules API, and InfluxDB

## Data Sources

| Source | What it stores | Access pattern |
|---|---|---|
| DynamoDB (`site_config`) | Site configuration (battery, PV, grid, tariff, location) | Direct SDK calls |
| IoT Named Shadow (`schedule`) | Schedule rules (P4–P9), system mode, safety limits | Via Schedules API (HTTP) |
| InfluxDB Cloud v3 | Real-time telemetry, aggregated data, TGE prices, rule history | Flux queries over HTTP |
