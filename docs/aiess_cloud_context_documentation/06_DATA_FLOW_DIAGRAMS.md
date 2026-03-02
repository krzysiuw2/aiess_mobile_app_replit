# 06 — Data Flow Diagrams

> Visual documentation of every major data flow in the AIESS system.
> Each diagram shows the complete path from source to destination.

---

## 1. Telemetry Ingestion Pipeline

How energy data flows from the physical BESS to the app.

```mermaid
graph LR
    subgraph physical ["Physical BESS"]
        Controller["BESS Controller"]
    end

    subgraph iot ["AWS IoT Core"]
        MQTT["MQTT Broker"]
        IoTRule["IoT Rule Engine"]
    end

    subgraph ingestion ["Ingestion"]
        TeleLambda["Telemetry Lambda"]
        Telegraf["Telegraf Agent"]
    end

    subgraph influx ["InfluxDB Cloud v3"]
        Raw["aiess_v1 (5s)"]
        Agg1m["aiess_v1_1m"]
        Agg15m["aiess_v1_15m"]
        Agg1h["aiess_v1_1h"]
    end

    subgraph aggregation ["Aggregation (EventBridge)"]
        AggLambda1m["1m Aggregation Lambda"]
        AggLambda15m["15m Aggregation Lambda"]
        AggLambda1h["1h Aggregation Lambda"]
    end

    Controller -->|"MQTT publish (5s)"| MQTT
    MQTT --> IoTRule
    IoTRule --> TeleLambda --> Telegraf --> Raw

    Raw -->|"EventBridge trigger"| AggLambda1m --> Agg1m
    Agg1m -->|"EventBridge trigger"| AggLambda15m --> Agg15m
    Agg15m -->|"EventBridge trigger"| AggLambda1h --> Agg1h
```

**Data at each stage:**

| Stage | Fields | Resolution | Retention |
|-------|--------|------------|-----------|
| MQTT | `grid_power`, `pcs_power`, `soc`, `total_pv_power`, `compensated_power`, `active_rule_*` | 5s | Transient |
| `aiess_v1` | Same as MQTT + `site_id` tag | 5s | 90 days |
| `aiess_v1_1m` | `*_mean`, `*_min`, `*_max`, `sample_count` | 1m | 365 days |
| `aiess_v1_15m` | `*_mean`, `*_min`, `*_max` | 15m | ~3 years |
| `aiess_v1_1h` | `*_mean`, `*_min`, `*_max` | 1h | ~10 years |

---

## 2. User Authentication Flow

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant SB as Supabase Auth
    participant DB as Supabase PostgreSQL
    participant SS as SecureStore

    Note over App: Login screen
    
    alt Email / Password
        App->>SB: signInWithPassword(email, password)
    else Google OAuth
        App->>App: Google Sign-In SDK
        App->>SB: signInWithIdToken(google_token)
    else Apple Sign-In
        App->>App: Apple Auth
        App->>SB: signInWithIdToken(apple_token)
    end

    SB-->>App: Session (access_token, refresh_token)
    App->>SS: Store session in SecureStore

    App->>DB: SELECT * FROM user_profiles WHERE id = user.id
    
    alt Profile exists
        DB-->>App: UserProfile
    else First login
        App->>DB: INSERT INTO user_profiles (id, full_name, ...)
        DB-->>App: New UserProfile
    end

    App->>DB: SELECT devices.* FROM devices JOIN device_users WHERE user_id = user.id
    DB-->>App: Device[]
    
    Note over App: Navigate to (tabs)/devices
```

---

## 3. Device Selection & Live Data Flow

```mermaid
sequenceDiagram
    participant App as DeviceContext
    participant AS as AsyncStorage
    participant SB as Supabase
    participant IDB as InfluxDB
    participant RQ as React Query

    App->>SB: Fetch devices for user
    SB-->>App: Device[] (id, device_id, name, specs)
    
    App->>AS: Load @aiess_selected_device
    AS-->>App: Stored device UUID
    
    alt Stored device valid
        App->>App: selectedDevice = stored
    else Invalid or none
        App->>App: selectedDevice = devices[0]
    end

    Note over App: site_id = selectedDevice.device_id

    loop Every 5 seconds
        RQ->>IDB: Flux query (aiess_v1, last 5m, site_id)
        IDB-->>RQ: CSV response
        RQ->>App: LiveData (gridPower, batteryPower, soc, pvPower, ...)
        Note over App: Monitor screen updates
    end

    par Parallel: 1m average
        RQ->>IDB: Flux query (mean, -1m)
        IDB-->>RQ: avg1m values
    and Parallel: 5m average
        RQ->>IDB: Flux query (mean, -5m)
        IDB-->>RQ: avg5m values
    end
```

---

## 4. AI Chat Flow (Read Operation)

```mermaid
sequenceDiagram
    participant User as User
    participant ChatUI as AI Chat Screen
    participant Lib as lib/aws-chat.ts
    participant APIGW as API Gateway
    participant Proxy as bedrock-chat Lambda
    participant Agent as Bedrock Agent
    participant Action as bedrock-agent-action Lambda
    participant IDB as InfluxDB

    User->>ChatUI: Types "Pokaż stan magazynu"
    ChatUI->>Lib: sendChatMessage(text, sessionId, siteId)
    Lib->>APIGW: POST /chat { message, session_id, site_id, current_datetime }
    APIGW->>Proxy: Forward request
    
    Proxy->>Agent: InvokeAgentCommand { inputText, sessionAttributes: {site_id}, promptAttributes: {datetime, day} }
    
    Note over Agent: Agent reasons: need battery status
    
    Agent->>Action: get_battery_status { site_id }
    Action->>IDB: Flux query (aiess_v1, last 2m)
    IDB-->>Action: CSV (soc, pcs_power, grid_power, ...)
    Action-->>Agent: { soc: 72, battery_power_kw: -15.3, ... }
    
    Note over Agent: Agent formats Polish response
    
    Agent-->>Proxy: Stream text chunks
    Proxy-->>APIGW: { text: "Aktualny stan: SoC 72%...", session_id }
    APIGW-->>Lib: Response JSON
    Lib-->>ChatUI: ChatResponse
    ChatUI-->>User: Display formatted message
```

---

## 5. AI Chat Flow (Write Operation with Confirmation)

```mermaid
sequenceDiagram
    participant User as User
    participant ChatUI as AI Chat Screen
    participant Lib as lib/aws-chat.ts
    participant APIGW as API Gateway
    participant Proxy as bedrock-chat Lambda
    participant Agent as Bedrock Agent
    participant Action as bedrock-agent-action Lambda
    participant SchedAPI as Schedules API
    participant IoT as IoT Shadow

    User->>ChatUI: "Ustaw ładowanie nocne 15 kW od 22 do 6"
    ChatUI->>Lib: sendChatMessage(text, sessionId, siteId)
    Lib->>APIGW: POST /chat { message, session_id, site_id }
    APIGW->>Proxy: Forward
    Proxy->>Agent: InvokeAgentCommand

    Note over Agent: Agent reads current schedules first (safety rule)
    Agent->>Action: get_current_schedules { site_id }
    Action->>SchedAPI: GET /schedules/{site_id}
    SchedAPI-->>Action: Current rules
    Action-->>Agent: SchedulesResponse

    Note over Agent: Agent prepares send_schedule_rule
    Note over Agent: x-requireConfirmation: ENABLED → returnControl

    Agent-->>Proxy: returnControl { invocationId, invocationInputs }
    Proxy-->>APIGW: { text: "Chcę ustawić...", confirmation: { tool_name, params } }
    APIGW-->>ChatUI: Response with confirmation

    ChatUI-->>User: Confirmation card (Accept / Reject)
    User->>ChatUI: Taps "Accept"

    ChatUI->>Lib: sendConfirmationResult(sessionId, invocationId, true, "send_schedule_rule")
    Lib->>APIGW: POST /chat { session_id, return_control_results: [{apiResult: {httpStatusCode: 200}}] }
    APIGW->>Proxy: Forward
    Proxy->>Agent: returnControlInvocationResults

    Note over Agent: Confirmed! Execute the tool
    Agent->>Action: send_schedule_rule { site_id, priority: 7, rule: {...} }
    Action->>SchedAPI: GET /schedules/{site_id}
    SchedAPI-->>Action: Current rules
    Action->>SchedAPI: POST /schedules/{site_id} { sch: { p_7: [...updated] } }
    SchedAPI->>IoT: UpdateThingShadow
    IoT-->>SchedAPI: Shadow version
    SchedAPI-->>Action: Success
    Action-->>Agent: { message: "Updated", shadow_version: 42 }

    Agent-->>Proxy: "Gotowe! Reguła ładowania nocnego..."
    Proxy-->>APIGW: { text: "..." }
    APIGW-->>ChatUI: Response
    ChatUI-->>User: Success message
```

---

## 6. AI Chat Flow (Chart Response)

```mermaid
sequenceDiagram
    participant User as User
    participant ChatUI as Chat Screen
    participant Proxy as bedrock-chat Lambda
    participant Agent as Bedrock Agent
    participant Action as bedrock-agent-action Lambda
    participant IDB as InfluxDB
    participant ChartComp as ChatChart Component

    User->>ChatUI: "Pokaż wykres SoC z ostatnich 24h"
    ChatUI->>Proxy: POST /chat { message }
    Proxy->>Agent: InvokeAgentCommand

    Agent->>Action: get_chart_data { site_id, fields: "soc", hours: 24 }
    Action->>IDB: Flux query (aiess_v1_1m, 24h, soc_mean)
    IDB-->>Action: CSV data (144 points)
    Action-->>Agent: { _chart: true, chart_type: "line", datasets: [...], ... }

    Note over Proxy: Intercepts trace output
    Note over Proxy: Detects _chart: true → adds to charts[]

    Agent-->>Proxy: Text: "Oto wykres SoC..."
    Proxy-->>ChatUI: { text, charts: [{ _chart: true, ... }] }

    ChatUI->>ChartComp: Render chart data
    ChartComp-->>User: Interactive line chart
```

---

## 7. Schedule CRUD Flow

```mermaid
sequenceDiagram
    participant User as User
    participant ScheduleUI as Schedule Screen
    participant Hook as useSchedules Hook
    participant Lib as lib/aws-schedules.ts
    participant APIGW as API Gateway
    participant Lambda as Schedules Lambda
    participant IoT as IoT Shadow
    participant BESS as BESS Controller

    Note over User: Create new rule

    User->>ScheduleUI: Fill rule form (action, conditions, priority)
    ScheduleUI->>Hook: createRule(formData)
    Hook->>Lib: formDataToOptimizedRule(formData)
    Lib-->>Hook: OptimizedScheduleRule
    
    Hook->>Lib: getSchedules(siteId)
    Lib->>APIGW: GET /schedules/{siteId}
    APIGW->>Lambda: Forward
    Lambda->>IoT: GetThingShadow (schedule)
    IoT-->>Lambda: Shadow document
    Lambda-->>APIGW: SchedulesResponse
    APIGW-->>Lib: Current schedules

    Hook->>Hook: Merge new rule into priority array
    
    Hook->>Lib: saveSchedules(siteId, { p_7: [...updated] })
    Lib->>APIGW: POST /schedules/{siteId} { site_id, sch: { p_7: [...] } }
    APIGW->>Lambda: Forward
    Lambda->>IoT: UpdateThingShadow { state: { desired: { sch: { p_7: [...] } } } }
    IoT-->>Lambda: { version: 43 }
    Lambda-->>APIGW: SaveSchedulesResponse
    APIGW-->>Lib: Success
    Lib-->>Hook: { shadow_version: 43, total_rules: 5 }

    Note over IoT: Shadow delta published
    IoT-->>BESS: Delta notification (MQTT)
    BESS->>BESS: Apply new rules
```

---

## 8. Export Guard Flow

```mermaid
sequenceDiagram
    participant EB as EventBridge Scheduler
    participant Lambda as export-guard Lambda
    participant IDB as InfluxDB
    participant DDB as DynamoDB
    participant Supla as Supla Cloud
    participant Inverter as Inverter

    EB->>Lambda: Trigger (~every 15 min)
    
    loop 4 checks (15s apart)
        Lambda->>Lambda: Check daylight hours
        
        alt Within daylight
            Lambda->>IDB: Query grid_power (last 2 min)
            IDB-->>Lambda: grid_power = -45 kW
            
            Lambda->>DDB: Read guard state
            DDB-->>Lambda: { inverter_off: false }
            
            alt grid_power < export_threshold (-40)
                Lambda->>Supla: Turn inverter OFF
                Supla->>Inverter: OFF command
                Lambda->>DDB: Save { inverter_off: true, shutdown_at: now }
            else grid_power > restart_threshold (-20) AND inverter_off
                Lambda->>Supla: Turn inverter ON
                Supla->>Inverter: ON command
                Lambda->>DDB: Save { inverter_off: false }
            else Normal operation
                Note over Lambda: No action needed
            end
        else Outside daylight
            Lambda->>DDB: Read guard state
            alt inverter_off by guard
                Lambda->>Supla: Turn inverter ON (night restore)
                Supla->>Inverter: ON command
                Lambda->>DDB: Clear state
            end
        end
        
        Lambda->>Lambda: Sleep 15s
    end
```

---

## 9. Analytics Data Flow

```mermaid
graph TB
    subgraph userAction ["User Action"]
        SelectRange["Select time range (24h/7d/30d/365d)"]
        SelectDate["Select date"]
    end

    subgraph bucketSelection ["Auto Bucket Selection"]
        Hour["hour/24h → aiess_v1_1m"]
        Week["7d → aiess_v1_15m"]
        Month["30d/365d → aiess_v1_1h"]
    end

    subgraph query ["InfluxDB Query"]
        Flux["Flux query with aggregateWindow"]
        CSV["CSV response"]
    end

    subgraph processing ["Client Processing"]
        Parse["parseInfluxCSV()"]
        ChartData["ChartDataPoint[]"]
        Stats["calculateEnergyStats()"]
    end

    subgraph display ["Display"]
        Charts["Energy Flow / SoC / Load Charts"]
        Summary["Energy Summary Cards"]
    end

    SelectRange --> Hour
    SelectRange --> Week
    SelectRange --> Month
    SelectDate --> Flux

    Hour --> Flux
    Week --> Flux
    Month --> Flux

    Flux --> CSV --> Parse --> ChartData
    ChartData --> Charts
    ChartData --> Stats --> Summary
```

---

## 10. Site Configuration Update Flow

```mermaid
sequenceDiagram
    participant User as Settings Screen
    participant Hook as useSiteConfig Hook
    participant Lib as lib/aws-site-config.ts
    participant APIGW as API Gateway
    participant Lambda as site-config Lambda
    participant DDB as DynamoDB
    participant Location as Amazon Location

    Note over User: User edits battery specs

    User->>Hook: updateConfig({ battery: { capacity_kwh: 200 } })
    Hook->>Lib: updateSiteConfig(siteId, patch)
    Lib->>APIGW: PUT /site-config/{siteId} { battery: { capacity_kwh: 200 } }
    APIGW->>Lambda: Forward
    Lambda->>DDB: GetItem (site_id)
    DDB-->>Lambda: Existing config
    Lambda->>Lambda: Deep merge (existing + patch)
    Lambda->>DDB: UpdateItem (merged config)
    DDB-->>Lambda: Success
    Lambda-->>APIGW: Updated SiteConfig
    APIGW-->>Lib: Response
    Lib-->>Hook: SiteConfig
    Hook->>Hook: Invalidate query cache

    Note over User: User enters address for geocoding

    User->>Hook: geocodeAddress("ul. Kwiatowa 5, Warszawa")
    Hook->>Lib: geocodeSiteAddress(siteId, address)
    Lib->>APIGW: PUT /site-config/{siteId}/geocode { address }
    APIGW->>Lambda: Forward
    Lambda->>Location: SearchPlaceIndexForText(address)
    Location-->>Lambda: { latitude: 52.23, longitude: 21.01 }
    Lambda->>DDB: Update location.latitude, location.longitude
    DDB-->>Lambda: Success
    Lambda-->>User: Updated config with coordinates
```

---

## 11. Complete System — Single Request Lifecycle

A complete lifecycle showing how a user's chat request touches every part of the system:

```mermaid
graph TB
    subgraph user ["User Layer"]
        Phone["Mobile App"]
    end

    subgraph auth ["Auth Layer"]
        SupaAuth["Supabase Auth"]
        SecStore["SecureStore (tokens)"]
    end

    subgraph api ["API Layer"]
        APIGW["API Gateway"]
        ChatLambda["bedrock-chat"]
    end

    subgraph ai ["AI Layer"]
        Agent["Bedrock Agent (Claude)"]
        ActionLambda["bedrock-agent-action"]
    end

    subgraph data ["Data Layer"]
        DDB["DynamoDB"]
        IDB["InfluxDB"]
        SchedAPI["Schedules API"]
    end

    subgraph control ["Control Layer"]
        IoT["IoT Shadow"]
        BESS["BESS Controller"]
    end

    Phone -->|"1. Auth"| SupaAuth
    SupaAuth -->|"2. Token"| SecStore
    Phone -->|"3. POST /chat"| APIGW
    APIGW -->|"4. Forward"| ChatLambda
    ChatLambda -->|"5. InvokeAgent"| Agent
    Agent -->|"6. Tool calls"| ActionLambda
    ActionLambda -->|"7a. Read config"| DDB
    ActionLambda -->|"7b. Read telemetry"| IDB
    ActionLambda -->|"7c. Read/write rules"| SchedAPI
    SchedAPI -->|"8. Shadow update"| IoT
    IoT -->|"9. Delta"| BESS
```
