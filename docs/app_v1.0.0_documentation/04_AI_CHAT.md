# 04 — AI Chat Screen

## 1. Function Description

The AI Chat screen provides a **conversational interface** for querying energy system data and issuing control commands. Users interact with an AWS Bedrock Agent through natural-language messages. The agent can return text responses, inline charts, and **confirmation cards** for destructive or state-changing actions (e.g. sending schedule rules, changing system mode). Voice input is supported via `expo-speech-recognition`.

### Key responsibilities

| Responsibility | Detail |
|---|---|
| Chat with AI agent | Natural-language queries about battery, PV, prices, rules, etc. |
| Display inline charts | Line/bar charts rendered from AI-returned `ChartData` payloads |
| Confirmation flow | User must Accept / Reject before the agent executes write operations |
| Voice input | Speech-to-text via `expo-speech-recognition` (Polish / English) |
| Per-device session management | Each device has its own chat session; messages persisted in AsyncStorage |
| Quick action chips | Suggested topics shown at conversation start |

---

## 2. UI / UX Description

### 2.1 Screen Layout

File: [`app/(tabs)/ai.tsx`](../../app/(tabs)/ai.tsx)

```
┌──────────────────────────────────────┐
│  Header                              │
│  "AIESS Energy Core"                 │
│  [device name]           [⟲ reset]   │
├──────────────────────────────────────┤
│                                      │
│  Message List (FlatList)             │
│  ┌─────────────────────────────┐     │
│  │  🤖  AI bubble (left)       │     │
│  │           User bubble  👤   │     │
│  │  🤖  AI bubble + chart      │     │
│  │  🤖  AI bubble + confirm    │     │
│  └─────────────────────────────┘     │
│                                      │
│  [Quick action chips]  (if ≤1 msg)   │
│  ⏳ "Thinking…" indicator            │
│                                      │
│  ┌──────────────────┐ 🎤 ▲          │
│  │  Text input       │ mic send      │
│  └──────────────────┘                │
└──────────────────────────────────────┘
```

### 2.2 Screen States

| State | Trigger | UI |
|---|---|---|
| **No device selected** | `selectedDevice` is `null` | Header + centred Bot icon + "Select a device" text |
| **Initial (≤ 1 message)** | First load or after reset | Welcome message from AI + quick action chips shown |
| **Conversation active** | `messages.length > 1` | Full message list, chips hidden |
| **Loading** | `isLoading` is `true` | `ActivityIndicator` + "Thinking…" text below message list; input disabled |

### 2.3 Header

| Element | Description |
|---|---|
| **Title** | "**AI**ESS Energy Core" — branded with blue "AI" prefix (MontserratAlt1-Bold font) |
| **Subtitle** | `selectedDevice.name` in primary colour |
| **Reset button** | `RotateCcw` icon in a circular surface button; creates a new session, clears messages |

### 2.4 Chat Bubbles

| Bubble | Alignment | Style | Content rendering |
|---|---|---|---|
| **User** | Right-aligned | Blue background (`Colors.primary`), white text, bottom-right radius 4 px | Plain `<Text>` |
| **AI** | Left-aligned | Surface background with 1 px border, bottom-left radius 4 px | `<Markdown>` with full style map (headings, tables, code blocks, blockquotes, links, etc.) |

Each AI bubble has a circular **Bot avatar** (light blue background, Bot icon) on the left. Each user bubble has a **User avatar** (blue background, User icon) on the right.

### 2.5 Quick Action Chips

File: [`app/(tabs)/ai.tsx`](../../app/(tabs)/ai.tsx) (line 207)

Shown when `messages.length <= 1 && !isLoading`. Three chips are randomly selected from a pool of five on each session start:

| Key | Icon | Example label (EN) |
|---|---|---|
| `battery` | `Battery` | "What's the battery status?" |
| `chart` | `BarChart3` | "Show me today's energy chart" |
| `rules` | `List` | "List active schedule rules" |
| `prices` | `Zap` | "Show current energy prices" |
| `pvForecast` | `Sun` | "What's the PV forecast?" |

Tapping a chip sends its label as a user message.

### 2.6 Voice Input

| Aspect | Detail |
|---|---|
| Library | `expo-speech-recognition` (`ExpoSpeechRecognitionModule`) — lazy-loaded via `require()` with try/catch fallback |
| Languages | `pl-PL` when app language is Polish, `en-US` otherwise |
| Mic button | Toggles between `Mic` and `MicOff` icons; active state turns button red with red input border |
| Behaviour | Non-continuous; `interimResults: true` updates `inputText` in real-time |
| Permissions | Calls `requestPermissionsAsync()` before starting |

### 2.7 Confirmation Flow

When the Bedrock Agent returns a `confirmation` payload, the AI bubble renders an embedded **confirmation card**:

```
┌─────────────────────────────────┐
│  ⚠ Confirm Action               │
│  "Send schedule rule"            │
│  action: Charge — 25 kW         │
│  time: 08:00 – 16:00            │
│  days: Weekdays                  │
│  ┌─────────┐  ┌─────────┐      │
│  │ ✓ Accept │  │ ✗ Reject │      │
│  └─────────┘  └─────────┘      │
└─────────────────────────────────┘
```

| Tool name | Human-readable label (EN / PL) |
|---|---|
| `send_schedule_rule` | Send schedule rule / Wysłanie reguły harmonogramu |
| `delete_schedule_rule` | Delete schedule rule / Usunięcie reguły harmonogramu |
| `set_system_mode` | Change system mode / Zmiana trybu systemu |
| `set_safety_limits` | Change safety limits / Zmiana limitów bezpieczeństwa |

For `send_schedule_rule`, parameters are formatted with a dedicated `formatRuleParams()` function showing action type, time range, days, SOC range, target SOC, max power, and grid triggers.

After the user taps Accept or Reject, `sendConfirmationResult()` is called and the card becomes inert (`confirmationHandled: true`).

### 2.8 ChatChart — Inline Charts

File: [`components/ChatChart.tsx`](../../components/ChatChart.tsx)

When the AI response includes a `charts` array, each `ChartData` object is rendered as a chart embedded in the AI bubble:

| Feature | Detail |
|---|---|
| Chart types | `line` (curved, area fill for single dataset) or `bar` |
| Library | `react-native-gifted-charts` (`LineChart`, `BarChart`) |
| Sizing | Width = 78% of screen width minus padding; height = 160 px |
| Axis labels | Time-formatted based on `hours` field: HH:MM for ≤ 24h, weekday+hour for ≤ 7d, day+month otherwise |
| Legend | Shown when datasets > 1: coloured dot + label for each dataset |
| Label thinning | Labels shown every `Math.floor(count / 5)` points (line) or `Math.floor(count / 6)` points (bar) |

---

## 3. Backend Description / Tools Used / Tools Needed

### 3.1 Data Flow

```
User message
    │
    ▼
sendChatMessage()               ← lib/aws-chat.ts
    │  callAwsProxy('/chat', 'POST', {message, session_id, site_id, language})
    ▼
Supabase Edge Function (aws-proxy)
    │
    ▼
AWS API Gateway → Lambda (aiess-bedrock-chat)
    │
    ▼
AWS Bedrock Agent (with action groups)
    │
    ├──▶ Text response → returned as ChatResponse.text
    ├──▶ Chart data    → returned as ChatResponse.charts[]
    └──▶ Confirmation  → returned as ChatResponse.confirmation
                           │
                           ▼
                User Accept / Reject
                           │
                           ▼
              sendConfirmationResult()   ← lib/aws-chat.ts
                           │
                           ▼
              Bedrock Agent continues execution
```

### 3.2 `ChatResponse` Type

File: [`lib/aws-chat.ts`](../../lib/aws-chat.ts)

```typescript
export interface ChatResponse {
  text: string;
  session_id: string;
  charts?: ChartData[];
  return_control?: {
    invocationId: string;
    invocationInputs: any[];
  };
  confirmation?: {
    invocation_id: string;
    action_group: string;
    tool_name: string;
    http_method: string;
    parameters: Record<string, any>;
  };
}
```

### 3.3 `ChartData` Type

File: [`lib/aws-chat.ts`](../../lib/aws-chat.ts)

```typescript
export interface ChartData {
  _chart: true;
  chart_type: 'line' | 'bar';
  title: string;
  labels: string[];          // X-axis labels (timestamps or categories)
  datasets: ChartDataset[];  // 1–5 series
  point_count: number;
  hours: number;             // time span for label formatting
}

export interface ChartDataset {
  label: string;
  data: number[];
  color: string;
}
```

### 3.4 `sendChatMessage`

File: [`lib/aws-chat.ts`](../../lib/aws-chat.ts) (line 36)

```typescript
sendChatMessage(message, sessionId, siteId, language) → Promise<ChatResponse>
```

Calls `callAwsProxy('/chat', 'POST', { message, session_id, site_id, current_datetime, language })`.

The message is prepended with a language hint: `"[Respond in English]\n\n"` or `"[Odpowiadaj po polsku]\n\n"`.

### 3.5 `sendConfirmationResult`

File: [`lib/aws-chat.ts`](../../lib/aws-chat.ts) (line 58)

```typescript
sendConfirmationResult(sessionId, invocationId, accepted, toolName, actionGroup?, httpMethod?, siteId?)
  → Promise<ChatResponse>
```

Builds a `returnControlResults` array with:

| Field | Value |
|---|---|
| `actionGroup` | From confirmation payload or `'aiess-management'` |
| `apiPath` | `/${toolName}` |
| `httpMethod` | From confirmation payload or `'POST'` |
| `httpStatusCode` | `200` if accepted, `400` if rejected |
| `responseBody` | JSON with `status: 'confirmed'` or `status: 'rejected'` |

### 3.6 Session Management

| Aspect | Detail |
|---|---|
| Session ID | `session-{timestamp}` string stored in `sessionIdRef` |
| Persistence key | `@aiess_chat_{deviceId}` in AsyncStorage |
| Stored data | `{ sessionId, messages[] }` — last 50 messages |
| Device switching | On device change, loads stored chat for new device or creates fresh session |
| Reset | Creates a new session ID, clears messages, re-shuffles quick action chips |

### 3.7 `Message` Type (internal)

```typescript
interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  confirmation?: ChatResponse['confirmation'];
  confirmationHandled?: boolean;
  charts?: ChartData[];
}
```

### 3.8 AWS Bedrock Agent Tools

The Bedrock Agent (`aiess-bedrock-agent-action` Lambda) exposes the following tools via action groups:

| Tool | Method | Description |
|---|---|---|
| `send_schedule_rule` | POST | Create or update a battery schedule rule |
| `delete_schedule_rule` | POST | Delete an existing schedule rule by ID |
| `set_system_mode` | POST | Switch between automatic / semi-automatic / manual modes |
| `set_safety_limits` | POST | Update SOC limits, power limits, grid thresholds |
| *(query tools)* | GET | Query InfluxDB for historical data, read `site_config` from DynamoDB |

Write operations (`send_schedule_rule`, `delete_schedule_rule`, `set_system_mode`, `set_safety_limits`) trigger the confirmation flow. Read/query operations execute directly and return data (potentially including `ChartData` payloads).

### 3.9 Tools Used

| Tool / Library | Purpose |
|---|---|
| **AWS Bedrock** (Agents for Amazon Bedrock) | Conversational AI with tool-use / action groups |
| **AWS Lambda** (`aiess-bedrock-chat`) | Chat gateway — forwards messages to Bedrock Agent, extracts charts/confirmations |
| **AWS Lambda** (`aiess-bedrock-agent-action`) | Action group handler — executes schedule rules, queries InfluxDB, reads config |
| **AWS API Gateway** | HTTP endpoint for `/chat` |
| **Supabase Edge Functions** (`aws-proxy`) | Auth-gated proxy — attaches credentials, forwards to API Gateway |
| **react-native-markdown-display** | Renders AI markdown responses (tables, code blocks, headings, etc.) |
| **react-native-gifted-charts** | Line and bar charts inside chat bubbles |
| **expo-speech-recognition** | Voice-to-text input (Polish / English) |
| **AsyncStorage** (`@react-native-async-storage/async-storage`) | Persists chat sessions per device |
| **Lucide React Native** | Icons: ArrowUp, Bot, User, Check, X, RotateCcw, Battery, BarChart3, List, Zap, Mic, MicOff, Sun |

### 3.10 Tools / Infrastructure Needed

| Requirement | Detail |
|---|---|
| **AWS account** | With Bedrock access (agent + action groups configured) |
| **Bedrock Agent** | Configured with knowledge base and action groups for energy management |
| **Lambda functions** | `aiess-bedrock-chat` (chat gateway) and `aiess-bedrock-agent-action` (tool executor) |
| **API Gateway** | REST API with `/chat` POST endpoint |
| **Supabase project** | Edge function `aws-proxy` for authenticated forwarding |
| **InfluxDB Cloud** | For agent query tools (historical data, real-time telemetry) |
| **DynamoDB** | `site_config` table read by the agent action Lambda |
