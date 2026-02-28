# 06 — Confirmation Flow

Write operations (rule changes, mode changes, safety limits) require explicit user approval before execution. This is implemented using Bedrock's `returnControl` mechanism.

## How It Works

```
1. User: "Ustaw tryb na automatyczny"
       │
2. Agent decides to call set_system_mode
       │
3. OpenAPI schema has x-requireConfirmation: ENABLED
       │
4. Bedrock PAUSES execution, returns returnControl event
       │
5. Chat Proxy extracts confirmation details
       │
6. Mobile App shows Accept / Reject card
       │
   ┌───┴───┐
   │       │
 Accept  Reject
   │       │
7a. POST /chat with          7b. POST /chat with
    httpStatusCode: 200           httpStatusCode: 400
    "User confirmed"              "Użytkownik odrzucił"
   │       │
8a. Bedrock EXECUTES         8b. Bedrock CANCELS
    set_system_mode               and explains rejection
       │
9. Response returned to mobile app
```

## OpenAPI Schema Annotation

In the OpenAPI schema files, confirmable operations include:

```json
"x-requireConfirmation": "ENABLED"
```

This tells Bedrock to pause before executing and return control to the caller.

## Chat Proxy (`aiess-bedrock-chat`)

### Extracting Confirmation

When iterating over the streaming response, the proxy checks for `returnControl` events:

```javascript
if (event.returnControl) {
  returnControl = {
    invocationId: event.returnControl.invocationId,
    invocationInputs: event.returnControl.invocationInputs,
  };
}
```

It then builds a structured `confirmation` object:

```json
{
  "invocation_id": "abc-123",
  "action_group": "aiess-management",
  "tool_name": "set_system_mode",
  "http_method": "POST",
  "parameters": { "site_id": "domagala_1", "mode": "automatic" }
}
```

### Sending Confirmation Result

The mobile app sends the result back as `return_control_results`:

```json
{
  "session_id": "...",
  "site_id": "domagala_1",
  "return_control_results": [{
    "apiResult": {
      "actionGroup": "aiess-management",
      "apiPath": "/set_system_mode",
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

For rejection, `httpStatusCode` is `400` and body contains `"status": "rejected"`.

## Mobile App Client (`lib/aws-chat.ts`)

The `sendConfirmationResult` function constructs the return control payload:

```typescript
sendConfirmationResult(
  sessionId: string,
  invocationId: string,
  accepted: boolean,
  toolName: string,
  actionGroup?: string,   // defaults to 'aiess-management'
  httpMethod?: string,     // defaults to 'POST'
)
```

## Mobile App UI (`app/(tabs)/ai.tsx`)

Confirmation cards display:
- Tool name (localized via `CONFIRM_LABELS` map)
- All parameters the agent wants to use
- Accept button (green, check icon)
- Reject button (red outline, X icon)

Once handled, the card is marked `confirmationHandled: true` and buttons are hidden.

## Confirmable Tools

| Tool | Action Group | What it does |
|---|---|---|
| `send_schedule_rule` | aiess-management | Creates/updates a schedule rule |
| `delete_schedule_rule` | aiess-management | Deletes a schedule rule |
| `set_system_mode` | aiess-management | Changes operating mode |
| `set_safety_limits` | aiess-management | Modifies battery SoC safety bounds |
