# 07 — Mobile App Integration

## Client Library

**Source:** `lib/aws-chat.ts`

### Configuration

Uses Expo environment variables:

```
EXPO_PUBLIC_AWS_ENDPOINT=https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
EXPO_PUBLIC_AWS_API_KEY=<your-api-key>
```

### `ChatResponse` Interface

```typescript
interface ChatResponse {
  text: string;
  session_id: string;
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

### Functions

**`sendChatMessage(message, sessionId, siteId)`**
Sends a user message to the agent. The `siteId` is attached on every request so the agent knows which installation it's working with.

**`sendConfirmationResult(sessionId, invocationId, accepted, toolName, actionGroup?, httpMethod?)`**
Sends the user's accept/reject decision for a confirmable tool call back to the agent.

## Chat UI

**Source:** `app/(tabs)/ai.tsx`

### Session Management

- A unique `session_id` is generated per conversation using `session-${Date.now()}`
- The session persists for the lifecycle of the chat screen (10-minute TTL on the Bedrock side)
- The `selectedDevice.device_id` is passed as `site_id`

### Message Types

| Type | Description |
|---|---|
| User message | Blue bubble on the right, user avatar |
| Agent response | White bubble on the left, bot avatar |
| Confirmation card | Embedded in agent bubble with orange border, Accept/Reject buttons |
| Loading indicator | "Thinking..." spinner below messages |

### Confirmation Card Labels

Tool names are mapped to user-friendly labels in both languages:

```typescript
const CONFIRM_LABELS = {
  send_schedule_rule:  { en: 'Send schedule rule',   pl: 'Wysłanie reguły harmonogramu' },
  delete_schedule_rule:{ en: 'Delete schedule rule',  pl: 'Usunięcie reguły harmonogramu' },
  set_system_mode:     { en: 'Change system mode',    pl: 'Zmiana trybu systemu' },
  set_safety_limits:   { en: 'Change safety limits',  pl: 'Zmiana limitów bezpieczeństwa' },
};
```

### Error Handling

- If `API_ENDPOINT` or `API_KEY` is missing, throws immediately
- HTTP errors are caught and displayed as agent error messages
- No device selected → shows a prompt to select a device

## Chart Rendering (Planned)

The `get_chart_data` tool returns structured datasets with `_chart: true`. The mobile app will detect this marker in the response and render a React Native chart component. This is a frontend-only enhancement — the data pipeline is already operational.

## Prerequisites

The chat screen requires:
1. User is authenticated (via Supabase)
2. A device is selected in the app
3. Environment variables `EXPO_PUBLIC_AWS_ENDPOINT` and `EXPO_PUBLIC_AWS_API_KEY` are set
