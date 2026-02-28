# AIESS Energy Core — Architecture Overview

## System Summary

AIESS Energy Core is an AI-powered conversational agent for managing a Battery Energy Storage System (BESS). It uses Claude Sonnet 4.6 with tool-use to read/write schedule rules via AWS IoT Device Shadow, query real-time and historical energy telemetry from InfluxDB Cloud, and render interactive charts inline in a mobile-style chat UI.

The agent operates in Polish and is designed for a single site (`domagala_1`), with hot-reloadable site-specific configuration.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph frontend [Frontend]
        UI["index.html<br/>WebSocket Chat UI<br/>Chart.js rendering"]
    end

    subgraph backend [Backend - FastAPI]
        Main["main.py<br/>WebSocket handler<br/>Tool loop + confirmation"]
        Tools["tools.py<br/>13 tool definitions<br/>Execution dispatcher"]
        Prompt["system_prompt.py<br/>Domain knowledge<br/>Rule schema reference"]
        SiteOvw["site_overview.md<br/>Site-specific config<br/>Hot-reloadable"]
    end

    subgraph external [External Services]
        Claude["Anthropic API<br/>Claude Sonnet 4.6"]
        InfluxDB["InfluxDB Cloud<br/>eu-central-1"]
        APIGW["AWS API Gateway<br/>jyjbeg4h9e..."]
    end

    subgraph aws [AWS IoT]
        Lambda["aiess-update-schedules<br/>aiess-get-schedules"]
        Shadow["IoT Device Shadow<br/>Named: schedule"]
        Device["Edge Device<br/>domagala_1"]
    end

    UI <-->|WebSocket| Main
    Main --> Claude
    Claude --> Main
    Main --> Tools
    Tools -->|"schedule_api.py"| APIGW
    Tools -->|"influx_client.py"| InfluxDB
    APIGW --> Lambda
    Lambda --> Shadow
    Shadow <-->|MQTT delta| Device
    Device -->|"MQTT telemetry<br/>(5s interval)"| InfluxDB
```

---

## Agent Conversation Loop

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Main as main.py
    participant Claude as Claude 4.6
    participant Tools as tools.py

    User->>Frontend: Types message
    Frontend->>Main: WebSocket text
    Main->>Claude: messages.create(system, tools, messages)

    loop Up to 15 rounds
        Claude->>Main: text blocks + tool_use blocks
        Main->>Frontend: {"type":"text"} for text
        Main->>Frontend: {"type":"tool_call"} for each tool

        alt Confirmable tool
            Main->>Frontend: {"type":"confirm", ...}
            Frontend->>User: Shows Accept/Reject buttons
            User->>Frontend: Clicks Accept or Reject
            Frontend->>Main: {"type":"confirm_response", "accepted": true/false}
            Note over Main: If rejected, skip execution
        end

        Main->>Tools: execute_tool(name, input)
        Tools-->>Main: JSON result

        alt Chart data detected
            Main->>Frontend: {"type":"chart", "data": {...}}
        end

        Main->>Claude: tool_result in next turn
    end

    Main->>Frontend: {"type":"done"}
```

---

## Data Flow — Telemetry Pipeline

```mermaid
graph LR
    Device["Edge Device<br/>domagala_1"] -->|"MQTT 5s"| IoTCore["AWS IoT Core"]
    IoTCore -->|"IoT Rule"| Forwarder["Lambda<br/>iot-to-telegraf-forwarder"]
    Forwarder -->|"HTTP POST"| Telegraf["EC2 Telegraf<br/>3.66.189.107:8080"]
    Telegraf -->|"Line Protocol"| Raw["aiess_v1<br/>(5s, 90d)"]
    Raw -->|"Lambda 1m"| Agg1m["aiess_v1_1m<br/>(180d)"]
    Agg1m -->|"Lambda 15m"| Agg15m["aiess_v1_15m<br/>(1095d)"]
    Agg15m -->|"Lambda 1h"| Agg1h["aiess_v1_1h<br/>(3650d)"]
```

The telemetry payload from the device includes:
- `grid_power`, `pcs_power`, `soc`, `total_pv_power`, `compensated_power`
- `active_rule_id`, `active_rule_priority`, `active_rule_action`, `active_rule_power`

Aggregation Lambdas run on EventBridge schedules and compute `*_mean`, `*_min`, `*_max` for each window.

---

## Control Flow — Schedule Rules

```mermaid
graph LR
    Agent["AI Agent"] -->|"HTTP POST<br/>x-api-key auth"| APIGW["API Gateway<br/>jyjbeg4h9e..."]
    APIGW --> UpdateLambda["aiess-update-schedules"]
    UpdateLambda -->|"iot:UpdateThingShadow"| Shadow["IoT Shadow<br/>(named: schedule)"]
    Shadow -->|"MQTT delta<br/>~100ms"| Device["Edge Device"]

    Agent -->|"HTTP GET"| APIGW2["API Gateway"]
    APIGW2 --> GetLambda["aiess-get-schedules"]
    GetLambda -->|"iot:GetThingShadow"| Shadow
```

---

## Component File Map

| File | Purpose |
|------|---------|
| `ai_agent/main.py` | FastAPI server, WebSocket chat handler, tool loop, confirmation gate |
| `ai_agent/tools.py` | 13 tool definitions (Anthropic format), execution dispatcher |
| `ai_agent/system_prompt.py` | System prompt with domain knowledge, rule schema, InfluxDB reference |
| `ai_agent/influx_client.py` | InfluxDB Cloud client, Flux queries, chart data generation |
| `ai_agent/schedule_api.py` | AWS API Gateway client for schedule CRUD operations |
| `ai_agent/site_overview.md` | Site-specific config (hot-reloadable without server restart) |
| `ai_agent/static/index.html` | Frontend: WebSocket chat UI, Chart.js rendering, confirmation dialogs |
| `ai_agent/.env` | Environment variables (API keys, tokens) |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for Claude Sonnet 4.6 |
| `AIESS_API_KEY` | No | Hardcoded | AWS API Gateway key for schedule API |
| `INFLUX_TOKEN` | Yes | — | InfluxDB Cloud read token (aiess org) |
| `INFLUX_URL` | No | `https://eu-central-1-1.aws.cloud2.influxdata.com` | InfluxDB Cloud URL |
| `INFLUX_ORG` | No | `aiess` | InfluxDB organization |
| `PORT` | No | `8100` | Server port (default avoids Windows Hyper-V reserved range) |

### Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `MODEL` | `claude-sonnet-4-6` | `main.py` |
| `MAX_TOKENS` | `4096` | `main.py` |
| `MAX_TOOL_ROUNDS` | `15` | `main.py` |
| `SITE_ID` | `domagala_1` | `influx_client.py`, `schedule_api.py` |
| API Gateway endpoint | `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default` | `schedule_api.py` |

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /` | HTTP | Serves chat UI (`static/index.html`) |
| `GET /health` | HTTP | Health check (returns model, tools list) |
| `WebSocket /ws/chat` | WS | Main conversation endpoint |
| `GET /static/*` | HTTP | Static file serving |

---

## Key Design Decisions

1. **Single-file frontend** — Everything in one `index.html` with inline JS/CSS for simplicity and portability.
2. **Hot-reloadable site config** — `site_overview.md` is re-read on every message, allowing live edits without server restart.
3. **Confirmation gate** — Write operations require explicit user Accept/Reject via WebSocket round-trip before execution.
4. **Chart detection via marker** — Tool results with `_chart: True` are intercepted by `main.py` and sent as a separate `chart` message type to the frontend.
5. **Polish language** — All user-facing text is in Polish; system prompt enforces Polish responses from Claude.
6. **Source tagging** — All AI-created rules automatically get `"s": "ai"` to distinguish from manual rules.
