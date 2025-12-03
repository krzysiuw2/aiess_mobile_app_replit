# AIESS Schedules API Guide

Quick reference for reading and writing schedules via AWS API Gateway.

> **Rule Schema Reference**: See `RULES_SCHEMA.md` for complete rule structure and field definitions.

---

## ⚠️ Critical: Mobile App Implementation Notes

### 1. Rule Merging - Always GET → Merge → POST!

**Problem:** When sending rules to a priority, the API **replaces ALL rules** in that priority.

```javascript
// ❌ WRONG - Sending just one rule DELETES all others in P7!
POST { "schedules": { "priority_7": [newRule] } }

// ✅ CORRECT - Merge with existing rules
const current = await GET(`/schedules/${siteId}`);
const existing = current.schedules.priority_7 || [];
const filtered = existing.filter(r => (r.id || r.rule_id) !== newRule.id);
const merged = [...filtered, newRule];
POST { "schedules": { "priority_7": merged } }
```

### 2. `vf`/`vu` Fields - At RULE Level!

**Problem:** `valid_from` and `valid_until` go at the **rule level**, NOT inside conditions.

```json
// ❌ WRONG - Lambda ignores vf/vu inside conditions
{ "id": "MY-RULE", "c": { "vf": 1733270400, "vu": 1735775999 } }

// ✅ CORRECT - At rule level
{ "id": "MY-RULE", "c": {}, "vf": 1733270400, "vu": 1735775999 }
```

### 3. Priority Changes During Edit

When user changes priority, update **BOTH** old and new priorities:

```javascript
if (newPriority !== oldPriority) {
  const oldRules = schedules[`priority_${oldPriority}`].filter(r => r.id !== ruleId);
  const newRules = [...(schedules[`priority_${newPriority}`] || []), updatedRule];
  
  POST { "schedules": { 
    [`priority_${oldPriority}`]: oldRules,
    [`priority_${newPriority}`]: newRules 
  }}
}
```

### 4. Weekdays Field - At RULE Level!

The `d` (weekdays) field is also at the **rule level**, not inside conditions:

```json
// ✅ CORRECT
{ "id": "MY-RULE", "c": { "ts": 900, "te": 1800 }, "d": "Fri" }
```

---

## API Configuration

```powershell
$API_KEY  = "Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW"
$ENDPOINT = "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default"
$SITE_ID  = "domagala_1"
```

---

## 1. Reading Schedules (GET)

### PowerShell
```powershell
$response = Invoke-RestMethod `
    -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY } `
    -Method GET

# Access schedules
$response.schedules | ConvertTo-Json -Depth 10
```

### curl
```bash
curl -X GET \
  "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default/schedules/domagala_1" \
  -H "x-api-key: Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW"
```

### Response Structure
```json
{
  "site_id": "domagala_1",
  "schedules": {
    "priority_9": [...],
    "priority_8": [...],
    "priority_7": [...],
    "priority_6": [...],
    "priority_5": [...]
  },
  "shadow_version": 4275
}
```

---

## 2. Sending Schedules (POST)

### Request Body Format
```json
{
  "site_id": "domagala_1",
  "schedules": {
    "priority_7": [
      {
        "id": "MY-RULE",
        "p": 7,
        "a": { "t": "ch", "pw": 30 },
        "c": { "ts": 800, "te": 1600 }
      }
    ]
  }
}
```

> **Note**: You only need to include the priorities you're updating. Omitted priorities remain unchanged.

### PowerShell - Simple Rule
```powershell
$body = @{
    site_id = $SITE_ID
    schedules = @{
        priority_7 = @(
            @{
                id = "CHARGE-DAY"
                p = 7
                a = @{ t = "ch"; pw = 30 }
                c = @{ ts = 800; te = 1600 }
            }
        )
    }
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod `
    -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
    -Method POST `
    -Body $body
```

### curl
```bash
curl -X POST \
  "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default/schedules/domagala_1" \
  -H "x-api-key: Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "schedules": {
      "priority_7": [{
        "id": "CHARGE-DAY",
        "p": 7,
        "a": {"t": "ch", "pw": 30},
        "c": {"ts": 800, "te": 1600}
      }]
    }
  }'
```

### Success Response
```json
{
  "message": "Schedules updated successfully",
  "site_id": "domagala_1",
  "shadow_version": 4276,
  "updated_priorities": ["priority_7"],
  "total_rules": 1
}
```

---

## 3. Common Operations

### Add Rule to Existing Priority
```powershell
# 1. Get current rules
$current = (Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY } -Method GET).schedules

# 2. Append new rule
$rules = @($current.priority_7)  # Existing rules
$rules += @{ id = "NEW-RULE"; p = 7; a = @{ t = "dis"; pw = 20 } }

# 3. Send updated list
$body = @{ site_id = $SITE_ID; schedules = @{ priority_7 = $rules } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
    -Method POST -Body $body
```

### Update Specific Rule
```powershell
# 1. Get current rules
$current = (Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY } -Method GET).schedules

# 2. Find and modify rule
$rules = @($current.priority_7) | ForEach-Object {
    if ($_.id -eq "MY-RULE") {
        $_.a.pw = 50  # Update power
    }
    $_
}

# 3. Send updated list
$body = @{ site_id = $SITE_ID; schedules = @{ priority_7 = $rules } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
    -Method POST -Body $body
```

### Delete Rule
```powershell
# 1. Get current rules
$current = (Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY } -Method GET).schedules

# 2. Filter out the rule to delete
$rules = @($current.priority_7) | Where-Object { $_.id -ne "RULE-TO-DELETE" }

# 3. Send filtered list
$body = @{ site_id = $SITE_ID; schedules = @{ priority_7 = $rules } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
    -Method POST -Body $body
```

### Clear Entire Priority
```powershell
$body = @{ site_id = $SITE_ID; schedules = @{ priority_7 = @() } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
    -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
    -Method POST -Body $body
```

---

## 4. Verify via AWS IoT Shadow (Optional)

Direct shadow access for verification:

```powershell
$outputFile = "$env:TEMP\shadow.json"
aws iot-data get-thing-shadow `
    --thing-name $SITE_ID `
    --shadow-name schedule `
    --region eu-central-1 `
    $outputFile

$shadow = Get-Content $outputFile -Raw | ConvertFrom-Json
$shadow.state.desired.schedules | ConvertTo-Json -Depth 10
```

---

## 5. Format Reference (Quick)

### Optimized Format (Recommended)
| Field | Description | Example | Location |
|-------|-------------|---------|----------|
| `id` | Rule ID (1-63 chars) | `"CHARGE-DAY"` | Rule level |
| `p` | Priority (4-9 for cloud) | `7` | Rule level |
| `a` | Action object | `{ "t": "ch", "pw": 30 }` | Rule level |
| `c` | Conditions object | `{ "ts": 800, "te": 1600 }` | Rule level |
| `act` | Active (only if false) | `false` | Rule level |
| `d` | Weekdays | `"Fri"`, `"weekdays"`, `"12345"` | **Rule level!** |
| `vf` | Valid from (Unix timestamp) | `1733270400` | **Rule level!** |
| `vu` | Valid until (Unix timestamp) | `1735775999` | **Rule level!** |

### Action Types
| Key | Type | Fields |
|-----|------|--------|
| `ch` | Charge | `pw`, `pid` |
| `dis` | Discharge | `pw`, `pid` |
| `sb` | Standby | `pw` (always 0) |
| `sl` | Site Limit (P9 only) | `hth`, `lth` |
| `ct` | Charge to Target | `soc`, `maxp`, `maxg`, `str`, `pid` |
| `dt` | Discharge to Target | `soc`, `maxp`, `ming`, `str`, `pid` |

### Condition Keys (inside `c` object)
| Key | Description | Format |
|-----|-------------|--------|
| `ts` | Time start | `830` = 08:30 |
| `te` | Time end | `1630` = 16:30 |
| `sm` | SoC min | `10` = 10% |
| `sx` | SoC max | `90` = 90% |
| `gpo` | Grid power operator | `gt`, `lt`, `bt` |
| `gpv` | Grid power value | kW |
| `gpx` | Grid power max (for `bt`) | kW |

---

## 6. Error Handling

```powershell
try {
    $response = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SITE_ID" `
        -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
        -Method POST -Body $body
    
    Write-Host "Success! Shadow version: $($response.shadow_version)"
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Details: $($error.error)" -ForegroundColor Yellow
    }
}
```

### Common Errors
| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid API key | Check `x-api-key` header |
| `400 Bad Request` | Invalid JSON/schema | Validate rule structure |
| `404 Not Found` | Invalid site_id | Check device exists |
| `500 Internal Error` | Lambda error | Check CloudWatch logs |

---

## 7. Interactive Tool

For easier management, use the interactive script:

```powershell
cd C:\Users\krzys\Desktop\Apps\aws_mastermind\aws\shadow_related_lambdas
.\manage-rules.ps1
```

Features:
- Menu-driven interface
- Read/Create/Update/Delete rules
- Quick charge/discharge shortcuts
- Automatic shadow verification


