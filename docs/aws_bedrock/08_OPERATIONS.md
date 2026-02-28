# 08 — Operations & Troubleshooting

## Deployment Procedures

### Update Agent Instructions

```powershell
# 1. Edit the instructions file
#    lambda/bedrock-agent-instructions.txt

# 2. Build update payload (Python avoids shell escaping issues)
python -c "
import json
instructions = open('lambda/bedrock-agent-instructions.txt', 'r', encoding='utf-8').read().strip()
obj = {
    'agentId': 'EUNJYANOZX',
    'agentName': 'aiess-energy-core',
    'agentResourceRoleArn': 'arn:aws:iam::896709973986:role/aiess-bedrock-agent-role',
    'foundationModel': 'eu.anthropic.claude-sonnet-4-6',
    'instruction': instructions
}
json.dump(obj, open('C:/temp/update-agent.json', 'w'), ensure_ascii=False)
"

# 3. Update + prepare
aws bedrock-agent update-agent --cli-input-json file://C:/temp/update-agent.json --region eu-central-1
aws bedrock-agent prepare-agent --agent-id EUNJYANOZX --region eu-central-1

# 4. Wait ~30s, verify status
aws bedrock-agent get-agent --agent-id EUNJYANOZX --region eu-central-1 `
  --query "agent.{Status:agentStatus,FailureReasons:failureReasons}"

# 5. Find the new version number
aws bedrock-agent list-agent-versions --agent-id EUNJYANOZX --region eu-central-1 `
  --query "agentVersionSummaries[].{Version:agentVersion,CreatedAt:createdAt}"

# 6. Update alias to new version
python -c "
import json
obj = {'agentId':'EUNJYANOZX','agentAliasId':'ITHHACXCBB','agentAliasName':'live','routingConfiguration':[{'agentVersion':'<NEW_VERSION>'}]}
json.dump(obj, open('C:/temp/update-alias.json','w'))
"
aws bedrock-agent update-agent-alias --cli-input-json file://C:/temp/update-alias.json --region eu-central-1
```

### Update Action Group Schema

```powershell
# 1. Edit the OpenAPI schema file
#    lambda/bedrock-agent-action/openapi-management.json  (or openapi-analytics.json)

# 2. Build update payload
python -c "
import json
schema = json.load(open('lambda/bedrock-agent-action/openapi-management.json'))
payload = json.dumps(schema)
obj = {
    'agentId': 'EUNJYANOZX',
    'agentVersion': 'DRAFT',
    'actionGroupId': 'Q8TOG1MU1U',         # or BCJGWIMQVW for analytics
    'actionGroupName': 'aiess-management',   # or aiess-analytics
    'actionGroupExecutor': {'lambda': 'arn:aws:lambda:eu-central-1:896709973986:function:aiess-bedrock-action'},
    'apiSchema': {'payload': payload}
}
json.dump(obj, open('C:/temp/update-ag.json', 'w'))
"

# 3. Update + prepare + alias (same as above)
aws bedrock-agent update-agent-action-group --cli-input-json file://C:/temp/update-ag.json --region eu-central-1
aws bedrock-agent prepare-agent --agent-id EUNJYANOZX --region eu-central-1
# ... wait, version, alias update
```

### Deploy Action Lambda

```powershell
cd lambda/bedrock-agent-action
Compress-Archive -Path index.mjs -DestinationPath function.zip -Force
aws lambda update-function-code `
  --function-name aiess-bedrock-action `
  --zip-file fileb://function.zip `
  --region eu-central-1
```

### Deploy Chat Proxy Lambda

```powershell
cd lambda/bedrock-chat
Compress-Archive -Path index.mjs -DestinationPath function.zip -Force
aws lambda update-function-code `
  --function-name aiess-bedrock-chat `
  --zip-file fileb://function.zip `
  --region eu-central-1
```

### Deploy API Gateway Changes

After adding new routes:

```powershell
aws apigatewayv2 create-deployment --api-id jyjbeg4h9e --region eu-central-1
# Note the deployment ID, then:
aws apigatewayv2 update-stage --api-id jyjbeg4h9e --stage-name default --deployment-id <ID> --region eu-central-1
```

---

## Troubleshooting

### "Number of enabled APIs exceeded limit"

The Bedrock service quota for APIs per agent is **11** (default). Count all operations across all action groups.

**Fix:** Either consolidate APIs (merge related tools) or request a quota increase:
```powershell
aws service-quotas request-service-quota-increase `
  --service-code bedrock --quota-code L-6B2DA87E `
  --desired-value 20 --region eu-central-1
```

### "Agent Instruction cannot be null"

The `update-agent` CLI command requires ALL fields (name, role ARN, model, instruction). If any is omitted, it gets cleared.

**Fix:** Always use `--cli-input-json` with a complete payload. Never update individual fields via positional arguments.

### "Failed to create OpenAPI 3 model from JSON/YAML"

PowerShell mangles JSON when passed inline to AWS CLI. The OpenAPI schema must be embedded as an escaped string inside the `payload` field.

**Fix:** Use Python to build the `--cli-input-json` file with proper escaping:
```python
payload = json.dumps(schema)  # schema as string
obj = { ..., 'apiSchema': { 'payload': payload } }
json.dump(obj, open('file.json', 'w'))
```

### "Model use case details have not been submitted"

Anthropic models require a one-time use case form per AWS account.

**Fix:**
```python
import json, base64, boto3
form = json.dumps({
    "companyName": "AIESS",
    "companyWebsite": "https://aiess.pl",
    "intendedUsers": "1",
    "industryOption": "Energy",
    "otherIndustryOption": "Battery Energy Storage Systems",
    "useCases": "AI-powered BESS management agent."
})
client = boto3.client('bedrock', region_name='eu-central-1')
client.put_use_case_for_model_access(formData=form)
```
Then create the model agreement:
```powershell
aws bedrock list-foundation-model-agreement-offers --model-id anthropic.claude-sonnet-4-6 --region eu-central-1
# Extract offerToken from the response
aws bedrock create-foundation-model-agreement --model-id anthropic.claude-sonnet-4-6 --offer-token <TOKEN> --region eu-central-1
```

### "The ARN you specified was not found" (ResourceNotFoundException)

The agent role's IAM policy must cover all regions in the cross-region inference profile. `eu.anthropic.claude-sonnet-4-6` routes to 6 EU regions.

**Fix:** The `agent-perms` policy must include `bedrock:InvokeModel` on:
- `arn:aws:bedrock:eu-central-1:896709973986:inference-profile/eu.anthropic.claude-sonnet-4-6`
- `arn:aws:bedrock:<REGION>::foundation-model/anthropic.claude-sonnet-4-6` for each EU region

### "Invalid API key" from Schedules API

The `aiess-bedrock-action` Lambda's `SCHEDULES_API_KEY` must match the key configured in `aiess-get-schedules` Lambda's `API_KEY` env var.

**Check:**
```powershell
aws lambda get-function-configuration --function-name aiess-get-schedules --region eu-central-1 `
  --query "Environment.Variables.API_KEY"
```

### Agent asks for site_id despite it being passed

The `site_id` must be sent as `promptSessionAttributes` (visible to the model), not just `sessionAttributes` (only visible to action group Lambdas).

**Verify** the chat proxy passes both:
```javascript
params.sessionState = {
  sessionAttributes: { site_id },
  promptSessionAttributes: { site_id },
};
```

---

## Monitoring

### CloudWatch Logs

| Log Group | Content |
|---|---|
| `/aws/lambda/aiess-bedrock-action` | Tool invocations, parameters, errors |
| `/aws/lambda/aiess-bedrock-chat` | Chat proxy requests, Bedrock API errors |

### Key Log Patterns

```
[Agent Action] get_battery_status {"site_id":"domagala_1"}
[Agent Action] Error in get_tge_prices: InfluxDB 401: ...
[Chat] Error: ResourceNotFoundException: ...
```

---

## File Reference

| File | Purpose |
|---|---|
| `lambda/bedrock-agent-instructions.txt` | Agent system prompt |
| `lambda/bedrock-agent-action/index.mjs` | Action group Lambda handler |
| `lambda/bedrock-agent-action/openapi-management.json` | Management action group schema (6 APIs) |
| `lambda/bedrock-agent-action/openapi-analytics.json` | Analytics action group schema (5 APIs) |
| `lambda/bedrock-chat/index.mjs` | Chat proxy Lambda handler |
| `lib/aws-chat.ts` | Mobile app chat client library |
| `app/(tabs)/ai.tsx` | Mobile app chat UI screen |
