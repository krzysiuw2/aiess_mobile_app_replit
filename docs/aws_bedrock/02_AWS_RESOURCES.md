# 02 — AWS Resources

All resources are in **eu-central-1** under account **896709973986**.

## Bedrock Agent

| Property | Value |
|---|---|
| Agent Name | `aiess-energy-core` |
| Agent ID | `EUNJYANOZX` |
| Agent ARN | `arn:aws:bedrock:eu-central-1:896709973986:agent/EUNJYANOZX` |
| Foundation Model | `eu.anthropic.claude-sonnet-4-6` (EU cross-region inference profile) |
| Orchestration | DEFAULT |
| Extended Thinking | Enabled (1024 budget tokens) |
| Session TTL | 600s |
| Agent Role | `arn:aws:iam::896709973986:role/aiess-bedrock-agent-role` |

### Agent Alias

| Property | Value |
|---|---|
| Alias Name | `live` |
| Alias ID | `ITHHACXCBB` |
| Routes to | Agent Version 2 |

### Action Groups

| Name | ID | API Count | Schema File |
|---|---|---|---|
| `aiess-management` | `Q8TOG1MU1U` | 6 | `lambda/bedrock-agent-action/openapi-management.json` |
| `aiess-analytics` | `BCJGWIMQVW` | 5 | `lambda/bedrock-agent-action/openapi-analytics.json` |

## Lambda Functions

| Function | Purpose | Runtime | Memory |
|---|---|---|---|
| `aiess-bedrock-action` | Action group handler (all tools) | Node.js 20.x | 256 MB |
| `aiess-bedrock-chat` | Chat proxy (mobile app ↔ Bedrock) | Node.js 20.x | 256 MB |

## IAM Roles

### `aiess-bedrock-agent-role`
Bedrock Agent's execution role. Trust policy allows `bedrock.amazonaws.com`.

**Inline policy `agent-perms`:**
- `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:GetInferenceProfile` on the EU inference profile and all underlying regional foundation model ARNs (eu-central-1, eu-north-1, eu-west-1, eu-west-3, eu-south-1, eu-south-2)
- `lambda:InvokeFunction` on `aiess-bedrock-action`

### `aiess-bedrock-chat-role`
Chat proxy Lambda's execution role.

**Inline policy `chat-perms`:**
- `bedrock:InvokeAgent` on `*`
- CloudWatch Logs permissions

### `aiess-bedrock-action` (Lambda execution role)
Uses the Lambda's default execution role with:
- DynamoDB read/write on `site_config` table
- CloudWatch Logs permissions

## API Gateway

| Property | Value |
|---|---|
| API Name | `aiess-schedules-api` |
| API ID | `jyjbeg4h9e` |
| Type | HTTP API (v2) |
| Stage | `default` |
| Base URL | `https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default` |

### Routes

| Route | Target | Integration |
|---|---|---|
| `POST /chat` | `aiess-bedrock-chat` | `pw2v9za` |
| `GET /schedules/{site_id}` | `aiess-get-schedules` | `4hps60j` |
| `POST /schedules/{site_id}` | `aiess-update-schedules` | `jy16aql` |
| `GET /site-config/{site_id}` | `aiess-site-config` | `o759krb` |
| `PUT /site-config/{site_id}` | `aiess-site-config` | `o759krb` |
| `PUT /site-config/{site_id}/geocode` | `aiess-site-config` | `o759krb` |

## Service Quotas

| Quota | Current | Requested |
|---|---|---|
| APIs per Agent | 11 | 20 (pending) |
| Action Groups per Agent | 15 | — |

## Model Access

Anthropic use case form submitted and approved. Foundation model agreement created for `anthropic.claude-sonnet-4-6`. The EU cross-region inference profile routes to models in: eu-central-1, eu-north-1, eu-west-1, eu-west-3, eu-south-1, eu-south-2.
