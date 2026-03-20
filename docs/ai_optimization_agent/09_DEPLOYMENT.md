# AI Optimization Agent — Deployment Guide

This document provides step-by-step instructions for deploying the AI Optimization Agent to AWS.

---

## 1. Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured
- Node.js 20.x (for local Lambda packaging if needed)
- Supabase project with `aws-proxy` configured
- InfluxDB instance (shared infrastructure)
- Access to TGE price data and site telemetry

---

## 2. DynamoDB Tables

Create the following tables before deploying Lambda functions.

### 2.1 `aiess_agent_state`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| **site_id** | String | PK | Site identifier; one item per site |

**Settings:**
- Billing mode: On-demand (or provisioned if preferred)
- No sort key
- Enable point-in-time recovery (optional, for production)

**AWS CLI example:**

```bash
aws dynamodb create-table \
  --table-name aiess_agent_state \
  --attribute-definitions AttributeName=site_id,AttributeType=S \
  --key-schema AttributeName=site_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 2.2 `aiess_agent_decisions`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| **PK** | String | PK | `DECISION#{site_id}` or `NOTIFICATION#{site_id}` |
| **SK** | String | SK | Sort key; format varies by record type |

**Settings:**
- Billing mode: On-demand
- **TTL enabled:** Attribute name `ttl` (Unix timestamp)

**AWS CLI example:**

```bash
aws dynamodb create-table \
  --table-name aiess_agent_decisions \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-time-to-live \
  --table-name aiess_agent_decisions \
  --time-to-live-specification Enabled=true,AttributeName=ttl
```

---

## 3. Lambda Functions

The agent consists of **5 Lambda functions**:

| Function | Purpose | Trigger |
|----------|---------|---------|
| **optimization-engine** | Math pipeline: charge/discharge windows, peak shaving, PV self-consumption, bell curve | Invoked by agent Lambdas |
| **agent-api** | REST API for mobile app: state, decisions, notifications | API Gateway |
| **agent-daily** | Daily Planner: 48h optimization, rule generation | EventBridge (10:00 UTC daily) |
| **agent-weekly** | Weekly Strategist: 7-day planning, lessons | EventBridge (Sunday 09:00 UTC) |
| **agent-intraday** | Intraday Adjuster: 15-min adjustments, health checks | EventBridge (every 15 min) |

---

## 4. CloudFormation Templates

Each agent Lambda has a CloudFormation template in its directory:

| Lambda | Template Path |
|--------|---------------|
| agent-daily | `lambda/agent-daily/cloudformation.yaml` |
| agent-weekly | `lambda/agent-weekly/cloudformation.yaml` |
| agent-intraday | `lambda/agent-intraday/cloudformation.yaml` |

The **optimization-engine** and **agent-api** may be deployed via separate stacks or combined.

### 4.1 Typical Stack Contents

- Lambda function resource
- IAM role with least-privilege permissions
- EventBridge rule (cron) for scheduled Lambdas
- Environment variables
- VPC configuration (if required for InfluxDB/private APIs)

### 4.2 EventBridge Triggers

| Lambda | Cron Expression | Description |
|--------|-----------------|-------------|
| agent-weekly | `cron(0 9 ? * SUN *)` | Every Sunday at 09:00 UTC |
| agent-daily | `cron(0 10 * * ? *)` | Every day at 10:00 UTC |
| agent-intraday | `rate(15 minutes)` | Every 15 minutes |

---

## 5. API Gateway Routes

Add the following routes to your API Gateway (or existing REST API):

| Method | Path | Integration |
|--------|------|-------------|
| GET | `/agent/*` | Proxy to agent-api Lambda |
| POST | `/agent/*` | Proxy to agent-api Lambda |

### 5.1 Route Examples

- `GET /agent/state?site_id=xxx` — Fetch agent state
- `GET /agent/decisions?site_id=xxx&since=...` — Fetch decisions
- `GET /agent/notifications?site_id=xxx` — Fetch notifications
- `POST /agent/decisions/{sk}/comment` — Add customer comment

### 5.2 Supabase aws-proxy

The Supabase `aws-proxy` already forwards `/agent/*` paths to the backend. **No changes needed** to the proxy configuration if routes are set up correctly on the API Gateway side.

---

## 6. Environment Variables

All agent Lambdas require the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| **INFLUX_URL** | InfluxDB API URL | `https://influx.example.com` |
| **INFLUX_TOKEN** | InfluxDB API token | `***` |
| **INFLUX_ORG** | InfluxDB organization | `aiess` |
| **SITE_CONFIG_TABLE** | DynamoDB table for site config | `site_config` |
| **AGENT_STATE_TABLE** | DynamoDB table for agent state | `aiess_agent_state` |
| **AGENT_DECISIONS_TABLE** | DynamoDB table for decisions | `aiess_agent_decisions` |
| **SCHEDULES_API** | Schedules API base URL | `https://api.example.com/schedules` |
| **SCHEDULES_API_KEY** | API key for Schedules API | `***` |
| **BEDROCK_MODEL_ID** | Bedrock model ID (Claude) | `anthropic.claude-sonnet-v2` |

Additional variables may be required per Lambda (e.g. `OPTIMIZATION_ENGINE_ARN` for agent Lambdas that invoke it).

---

## 7. Deployment Order

Deploy components in this order to avoid dependency failures:

| Step | Component | Action |
|------|-----------|--------|
| 1 | DynamoDB tables | Create `aiess_agent_state`, `aiess_agent_decisions` |
| 2 | optimization-engine | Deploy Lambda; note ARN |
| 3 | agent-api | Deploy Lambda; add API Gateway routes |
| 4 | agent-daily | Deploy Lambda with EventBridge rule |
| 5 | agent-weekly | Deploy Lambda with EventBridge rule |
| 6 | agent-intraday | Deploy Lambda with EventBridge rule |

### 7.1 Rationale

- Tables must exist before any Lambda writes to them.
- `optimization-engine` is invoked by agent Lambdas, so it must be deployed first.
- `agent-api` is user-facing; deploy early for testing.
- Agent Lambdas can be deployed in any order after optimization-engine and tables are ready.

---

## 8. IAM Permissions

Each Lambda needs permissions for:

- **DynamoDB:** GetItem, PutItem, UpdateItem, Query, BatchGetItem (as needed)
- **Bedrock:** InvokeModel (for agent-daily, agent-weekly, agent-intraday)
- **Lambda:** InvokeFunction (for agent Lambdas invoking optimization-engine)
- **Secrets Manager / SSM:** If API keys or tokens are stored there

Reference the `permissions.json` and `trust-policy.json` files in each Lambda directory for the exact policy documents.

---

## 9. Testing Checklist

After deployment, verify:

- [ ] **DynamoDB:** Tables exist; can read/write test items
- [ ] **optimization-engine:** Invoke with test payload; returns structured result
- [ ] **agent-api:** `GET /agent/state?site_id=test` returns 200 (or 404 if no state)
- [ ] **agent-daily:** Trigger manually; check CloudWatch logs and `aiess_agent_state` for `last_daily_run`
- [ ] **agent-weekly:** Trigger manually (or wait for Sunday); check `weekly_plan` in state
- [ ] **agent-intraday:** Trigger manually; check logs for health check and (if applicable) rollback logic
- [ ] **EventBridge:** Rules are enabled; next scheduled run times are correct
- [ ] **API Gateway:** Routes return expected responses; CORS configured if needed
- [ ] **End-to-end:** Enable automation for a test site; observe one full daily + intraday cycle

---

## 10. Related Documentation

- [01_DATA_MODEL.md](./01_DATA_MODEL.md) — DynamoDB schemas
- [08_SAFETY_AND_ROLLBACK.md](./08_SAFETY_AND_ROLLBACK.md) — Safety and rollback
- [10_COST_ANALYSIS.md](./10_COST_ANALYSIS.md) — Cost estimates
