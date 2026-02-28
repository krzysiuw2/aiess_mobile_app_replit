# AIESS Energy Core — Frontend Protocol

This document describes the WebSocket message protocol between the frontend (`index.html`) and backend (`main.py`), along with all UI components.

---

## WebSocket Connection

| Property | Value |
|----------|-------|
| Endpoint | `ws://{host}/ws/chat` (or `wss://` for HTTPS) |
| Protocol | Plain WebSocket (no sub-protocol) |
| Auth | None (single-user local deployment) |
| Reconnect | Automatic, 3-second delay after disconnect |
| Session | Per-connection; closing WebSocket resets conversation history |

### Connection States

| State | Status Dot | Title |
|-------|-----------|-------|
| Connected | Green `bg-green-400` | "Połączono" |
| Disconnected | Red `bg-red-400` | "Rozłączono" |
| Error | Amber `bg-amber-400` | "Błąd połączenia" |

---

## Message Types: Client → Server

### 1. Chat Message (plain text)

When the user types a message, it's sent as plain text (not JSON):

```
Jaki jest status magazynu?
```

The backend receives this as `await websocket.receive_text()` and appends it to the conversation as `{"role": "user", "content": text}`.

### 2. Confirmation Response (JSON)

When the user clicks "Akceptuj" or "Odrzuć" on a confirmation card:

```json
{
  "type": "confirm_response",
  "tool_use_id": "toolu_01ABC...",
  "accepted": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"confirm_response"` |
| `tool_use_id` | string | The tool_use block ID that triggered the confirmation |
| `accepted` | boolean | `true` if accepted, `false` if rejected |

---

## Message Types: Server → Client

### 1. `text` — Assistant Text

Claude's text response, sent incrementally (one text block at a time within a turn, not streamed token-by-token).

```json
{
  "type": "text",
  "content": "Aktualny status magazynu:\n\n- **SoC**: 65.4%\n- **Moc baterii**: -12.5 kW (ładowanie)\n..."
}
```

Frontend behavior:
- Removes any typing indicators and tool indicators
- If no assistant bubble exists, creates one
- Appends text content (accumulates across multiple `text` messages in same turn)
- Renders through custom Markdown parser

### 2. `tool_call` — Tool Execution Notification

Sent when Claude requests a tool execution. Purely informational for the UI.

```json
{
  "type": "tool_call",
  "name": "get_battery_status",
  "input": {}
}
```

Frontend behavior:
- Removes typing indicator
- Shows a tool indicator pill with a pulsing lightning icon and Polish label

### Tool Indicator Labels

| Tool Name | Display Label |
|-----------|---------------|
| `get_current_schedules` | Odczyt harmonogramu |
| `send_schedule_rule` | Przygotowanie reguły |
| `delete_schedule_rule` | Przygotowanie usunięcia |
| `set_system_mode` | Przygotowanie zmiany trybu |
| `set_safety_limits` | Przygotowanie limitów |
| `get_battery_status` | Odczyt statusu baterii |
| `get_energy_summary` | Analiza energii |
| `query_energy_data` | Pobieranie z bazy danych |
| `get_tge_price` | Ceny TGE |
| `get_tge_price_history` | Historia cen TGE |
| `get_rule_config_history` | Historia konfiguracji |
| `get_active_rule_history` | Historia aktywnych reguł |
| `get_chart_data` | Przygotowanie wykresu |

### 3. `tool_result` — Tool Result Notification

Sent after a tool completes execution. Not displayed to the user directly; it carries a preview for debugging.

```json
{
  "type": "tool_result",
  "name": "get_battery_status",
  "result_preview": "{\"time\": \"2026-02-09T10:30:00Z\", \"soc_percent\": 65.4, ..."
}
```

Frontend behavior: No visible action (the `tool_result` case in the switch statement is intentionally empty).

### 4. `confirm` — Confirmation Request

Sent when a confirmable tool is about to execute. Pauses execution until user responds.

```json
{
  "type": "confirm",
  "tool_use_id": "toolu_01ABC...",
  "name": "send_schedule_rule",
  "label": "Wysłanie reguły harmonogramu",
  "input": {
    "priority": 7,
    "rule": {
      "id": "AI-CHARGE-NIGHT",
      "a": {"t": "ch", "pw": 50},
      "c": {"ts": 2200, "te": 600}
    }
  }
}
```

Frontend behavior:
- Removes typing indicators and tool indicators
- Calls `showConfirmation(data)` which renders the confirmation card
- `formatConfirmDetails(name, input)` extracts key details for display (rule ID, action type, power, priority, time window)
- Two buttons: "Akceptuj" (green) and "Odrzuć" (gray)
- On click, sends `confirm_response` back and disables buttons

### 5. `chart` — Chart Data

Sent when a tool result contains chart data (detected by `_chart: true` marker).

```json
{
  "type": "chart",
  "data": {
    "_chart": true,
    "chart_type": "line",
    "title": "Dane energetyczne — dziś",
    "labels": ["2026-02-09T00:00:00Z", "..."],
    "datasets": [
      {"label": "Moc sieci (kW)", "data": [25.3, "..."], "color": "#2196F3"},
      {"label": "SoC (%)", "data": [65.4, "..."], "color": "#FF9800", "yAxisID": "y1", "fill": true}
    ],
    "point_count": 480,
    "hours": 8,
    "y_unit": "kW"
  }
}
```

Frontend behavior:
- Removes tool indicators
- Calls `renderChart(data.data)` which creates a Chart.js canvas inline in the chat
- See [05_CHART_SYSTEM.md](05_CHART_SYSTEM.md) for rendering details

### 6. `done` — Turn Complete

Sent when Claude's response turn is complete (no more tool calls).

```json
{
  "type": "done"
}
```

Frontend behavior:
- Removes typing indicators and tool indicators
- Resets `currentAssistantEl` (next text creates a new bubble)
- Re-enables input field and send button
- Sets `isProcessing = false`
- Focuses the input field

### 7. `error` — Error

Sent on API errors, server errors, or max tool rounds exceeded.

```json
{
  "type": "error",
  "content": "Anthropic API error: 429 Rate limit exceeded"
}
```

Frontend behavior:
- Removes typing/tool indicators
- Appends bold red error text to the assistant bubble: `**Błąd:** <content>`
- Re-enables input

---

## UI Components

### Header

- Back arrow button (left) — calls `resetConversation()` to start a new conversation
- Brand title (center): "**AI**ESS Energy Core" using Montserrat Alt1 font (Bold 700), "AI" in blue `#008CFF`
- Subtitle: "Porozmawiajmy o Twojej energii!" in blue accent
- Status dot (right) — green/red/amber based on WebSocket state

### Chat Bubbles

| Sender | Alignment | Background | Text Color | Border Radius |
|--------|-----------|------------|------------|---------------|
| User | Right | `#2196F3` (accent blue) | White | `rounded-2xl rounded-br-md` |
| Assistant | Left | White | Gray-800 | `rounded-2xl rounded-tl-md` |

Max width: 80% (user), 85% (assistant).

### Quick Action Buttons

Shown once after the welcome message. Three pre-defined buttons:
1. "Jaki jest status magazynu?"
2. "Co się działo wczoraj?"
3. "Wykres z tego tygodnia"

Styled as light blue (`bg-blue-50`, `border-blue-100`, `text-app-accent`) rounded pills. Clicking sends the message and removes all quick action buttons.

### Tool Indicators

Blue pills (`bg-blue-50`, `border-blue-100`) with:
- Pulsing lightning bolt icon (`tool-pulse` animation, 1.5s infinite)
- Polish label text
- Removed when text arrives, confirmation appears, or turn ends

### Typing Indicator

Three animated dots in a white bubble:
- Gray dots with staggered bounce animation (`typing` keyframes)
- Added when user sends a message
- Removed when first response arrives

### Confirmation Card

Styled container with:
- Background: gradient from `#fff8e1` to white
- Border: `#ffe082` (amber)
- Amber warning triangle icon (SVG)
- "Potwierdzenie akcji" header
- Tool label and extracted details
- Two buttons: "Akceptuj" (green), "Odrzuć" (gray → red on hover)
- After action: buttons disabled + status text ("Zaakceptowano" / "Odrzucono")

### Inline Charts

- Full-width (95% max) white container
- Title text above the chart
- 240px fixed-height Chart.js canvas
- Interactive: hover tooltips, legend toggle

### Bottom Navigation Bar

Six tabs (non-functional, visual only for mobile app screenshot purposes):

| Tab | Icon | Active State |
|-----|------|-------------|
| Urządzenia | Users icon | Gray (inactive) |
| Monitor | Bar chart icon | Gray (inactive) |
| **AI** | Chat bubble icon | **Blue (active)** |
| Harmonogram | Calendar icon | Gray (inactive) |
| Analityka | Bar chart icon | Gray (inactive) |
| Ustawienia | Gear icon | Gray (inactive) |

### Input Bar

- Microphone button (left, disabled — placeholder)
- Text input with Polish placeholder: "Zapytaj o status baterii, harmonogramy lub dane energetyczne..."
- Send button (right, blue circle with arrow icon)
- Both input and send button disabled during processing

---

## Markdown Rendering

The frontend includes a custom Markdown parser (`renderMarkdown()`) that supports:

| Syntax | Rendered As |
|--------|-------------|
| `` `code` `` | `<code>` with blue background |
| ```` ```code block``` ```` | `<pre><code>` with border |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `# / ## / ###` | `<h1>` / `<h2>` / `<h3>` |
| `- item` | `<ul><li>` |
| `1. item` | `<li>` (ordered) |
| `| table |` | `<table>` wrapped in `.table-wrap` (horizontal scroll) |

Table cells use `white-space: nowrap` except the last column which wraps. Tables are horizontally scrollable on mobile.

---

## Conversation Reset

The back arrow button triggers `resetConversation()`:

1. If processing, does nothing
2. Closes existing WebSocket
3. Resets `messagesEl.innerHTML` to the saved `welcomeHTML` (welcome message + quick actions)
4. Clears all state variables
5. Disables input
6. Reconnects after 300ms delay

This effectively starts a fresh conversation — the server-side message history is per-WebSocket-connection and is lost when the connection closes.

---

## Styling

| Technology | Purpose |
|------------|---------|
| Tailwind CSS (CDN) | Utility-first layout, spacing, colors |
| Custom CSS | Markdown rendering, animations, brand fonts |
| Inter font | Body text |
| JetBrains Mono | Code blocks |
| Montserrat Alt1 | Brand logo ("AIESS Energy Core") — loaded from GitHub CDN |

### Color Palette

| Name | Value | Usage |
|------|-------|-------|
| `app-bg` | `#f5f5f5` | Page background |
| `app-surface` | `#ffffff` | Cards, bubbles |
| `app-bubble` | `#f0f0f0` | (unused) |
| `app-border` | `#e5e5e5` | Dividers |
| `app-text` | `#1a1a1a` | Primary text |
| `app-muted` | `#888888` | Secondary text |
| `app-accent` | `#2196F3` | Buttons, links, active states |
| `app-accentLight` | `#e3f2fd` | Light accent backgrounds |
| `app-danger` | `#ef4444` | Error states |
| `app-success` | `#22c55e` | Accept button |
