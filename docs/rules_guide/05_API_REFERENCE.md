# API Reference

> Complete API reference for managing BESS schedule rules via AWS API Gateway.

---

## Base Configuration

```
Endpoint: https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
Auth:     x-api-key header
Region:   eu-central-1
```

```typescript
const API_ENDPOINT = process.env.AWS_ENDPOINT || '';
const API_KEY = process.env.AWS_API_KEY || '';
```

---

## GET /schedules/{siteId}

Fetch all cloud-managed rules (P4-P9) for a device.

### Request

```
GET /schedules/{siteId}
Headers:
  x-api-key: <API_KEY>
```

### Response Type

```typescript
interface SchedulesResponse {
  site_id: string;
  v: string;                                          // "1.2"
  mode?: 'automatic' | 'semi-automatic' | 'manual';  // Management mode
  safety?: {                                          // SoC safety limits
    soc_min?: number;
    soc_max?: number;
  };
  sch: {                                              // Schedules container
    p_4?: OptimizedScheduleRule[];
    p_5?: OptimizedScheduleRule[];
    p_6?: OptimizedScheduleRule[];
    p_7?: OptimizedScheduleRule[];
    p_8?: OptimizedScheduleRule[];
    p_9?: OptimizedScheduleRule[];
  };
  metadata: {
    total_rules: number;
    local_rules: number;
    cloud_rules: number;
    scada_safety_rules: number;
  };
  last_updated: number | null;
}
```

### Example Response

```json
{
  "site_id": "domagala_1",
  "v": "1.2",
  "mode": "automatic",
  "safety": { "soc_min": 5, "soc_max": 100 },
  "sch": {
    "p_7": [
      {
        "id": "EVENING-CHARGE",
        "s": "man",
        "a": { "t": "ch", "pw": 30 },
        "c": { "ts": 1800, "te": 2200 },
        "d": "weekdays"
      }
    ],
    "p_9": [
      {
        "id": "SITE-LIMIT",
        "a": { "t": "sl", "hth": 100, "lth": -50 },
        "c": {}
      }
    ]
  },
  "metadata": {
    "total_rules": 3,
    "cloud_rules": 3,
    "local_rules": 0,
    "scada_safety_rules": 0
  },
  "last_updated": null
}
```

### TypeScript Implementation

```typescript
async function getSchedules(siteId: string): Promise<SchedulesResponse> {
  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedules: ${response.status}`);
  }

  return response.json();
}
```

### cURL

```bash
curl -s -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/domagala_1" | jq .
```

---

## POST /schedules/{siteId}

Update one or more priorities. **Replaces ALL rules** in the specified priorities.

### Request

```
POST /schedules/{siteId}
Headers:
  x-api-key: <API_KEY>
  Content-Type: application/json
Body:
  {
    "site_id": "domagala_1",
    "mode": "automatic",           // Optional
    "safety": { ... },             // Optional
    "sch": {
      "p_7": [ ... ]              // Priority arrays to update
    }
  }
```

### Response Type

```typescript
interface SaveSchedulesResponse {
  message: string;
  shadow_version: number;
  updated_priorities: number[];
  total_rules: number;
}
```

### Example Response

```json
{
  "message": "Schedules updated successfully",
  "site_id": "domagala_1",
  "shadow_version": 4276,
  "updated_priorities": ["priority_7"],
  "total_rules": 1
}
```

### TypeScript Implementation

```typescript
async function saveSchedules(
  siteId: string,
  schedules: Record<string, OptimizedScheduleRule[]>,
  options?: {
    mode?: 'automatic' | 'semi-automatic' | 'manual';
    safety?: { soc_min: number; soc_max: number };
  }
): Promise<SaveSchedulesResponse> {
  const body: any = {
    site_id: siteId,
    sch: schedules,
  };
  if (options?.mode) body.mode = options.mode;
  if (options?.safety) body.safety = options.safety;

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to save schedules: ${response.status}`);
  }

  return response.json();
}
```

---

## CRUD Operations

### CRITICAL: Always GET Before POST

The POST endpoint **replaces all rules** in the specified priorities. You **must** merge with existing rules.

```typescript
// CORRECT: GET-before-POST pattern
const current = await getSchedules(siteId);
const p7Rules = [...(current.sch.p_7 || []), newRule];
await saveSchedules(siteId, { p_7: p7Rules });

// WRONG: This DELETES all other P7 rules!
await saveSchedules(siteId, { p_7: [newRule] });
```

---

### Create a Rule

```typescript
async function createRule(
  siteId: string,
  rule: OptimizedScheduleRule,
  priority: number
) {
  // 1. GET current schedules
  const current = await getSchedules(siteId);

  // 2. Get existing rules for the priority
  const priorityKey = `p_${priority}` as keyof typeof current.sch;
  const existingRules = current.sch[priorityKey] || [];

  // 3. Add new rule
  const updatedRules = [...existingRules, rule];

  // 4. POST merged rules
  return saveSchedules(siteId, { [priorityKey]: updatedRules });
}

// Usage
await createRule('domagala_1', {
  id: 'MORNING-CHARGE',
  a: { t: 'ch', pw: 30 },
  c: { ts: 600, te: 900 },
  d: 'weekdays',
}, 7);
```

---

### Update a Rule (Same Priority)

```typescript
async function updateRule(
  siteId: string,
  updatedRule: OptimizedScheduleRule,
  priority: number
) {
  const current = await getSchedules(siteId);
  const priorityKey = `p_${priority}` as keyof typeof current.sch;
  const existingRules = current.sch[priorityKey] || [];

  const updatedRules = existingRules.map(rule =>
    rule.id === updatedRule.id ? updatedRule : rule
  );

  return saveSchedules(siteId, { [priorityKey]: updatedRules });
}

// Usage: change power from 30 to 50 kW
await updateRule('domagala_1', {
  id: 'MORNING-CHARGE',
  a: { t: 'ch', pw: 50 },
  c: { ts: 600, te: 900 },
  d: 'weekdays',
}, 7);
```

---

### Delete a Rule

```typescript
async function deleteRule(
  siteId: string,
  ruleId: string,
  priority: number
) {
  const current = await getSchedules(siteId);
  const priorityKey = `p_${priority}` as keyof typeof current.sch;
  const existingRules = current.sch[priorityKey] || [];

  const filtered = existingRules.filter(r => r.id !== ruleId);

  return saveSchedules(siteId, { [priorityKey]: filtered });
}

// Usage
await deleteRule('domagala_1', 'MORNING-CHARGE', 7);
```

---

### Toggle Rule Active State

```typescript
async function toggleRuleActive(
  siteId: string,
  ruleId: string,
  priority: number
) {
  const current = await getSchedules(siteId);
  const priorityKey = `p_${priority}` as keyof typeof current.sch;
  const existingRules = current.sch[priorityKey] || [];

  const updatedRules = existingRules.map(rule => {
    if (rule.id !== ruleId) return rule;
    const isCurrentlyActive = rule.act !== false;
    if (isCurrentlyActive) {
      return { ...rule, act: false };
    } else {
      const { act, ...rest } = rule;  // Remove 'act' to default to true
      return rest;
    }
  });

  return saveSchedules(siteId, { [priorityKey]: updatedRules });
}
```

---

### Move Rule Between Priorities

When changing a rule's priority, update **both** the old and new priorities in a single POST.

```typescript
async function moveRulePriority(
  siteId: string,
  ruleId: string,
  oldPriority: number,
  newPriority: number,
  updatedRule: OptimizedScheduleRule
) {
  const current = await getSchedules(siteId);

  // Remove from old priority
  const oldKey = `p_${oldPriority}` as keyof typeof current.sch;
  const oldRules = (current.sch[oldKey] || []).filter(r => r.id !== ruleId);

  // Add to new priority
  const newKey = `p_${newPriority}` as keyof typeof current.sch;
  const newRules = [...(current.sch[newKey] || []), updatedRule];

  // POST both priorities in one request
  return saveSchedules(siteId, {
    [oldKey]: oldRules,
    [newKey]: newRules,
  });
}

// Usage: Move rule from P7 to P8
await moveRulePriority('domagala_1', 'MORNING-CHARGE', 7, 8, {
  id: 'MORNING-CHARGE',
  a: { t: 'ch', pw: 30 },
  c: { ts: 600, te: 900 },
});
```

---

### Set System Mode

```typescript
async function setSystemMode(
  siteId: string,
  mode: 'automatic' | 'semi-automatic' | 'manual'
) {
  return saveSchedules(siteId, {}, { mode });
}

// Usage
await setSystemMode('domagala_1', 'semi-automatic');
```

Note: Pass empty `sch` object `{}` to update mode without touching rules.

---

### Set Safety Limits

```typescript
async function setSafetyLimits(
  siteId: string,
  socMin: number,
  socMax: number
) {
  if (socMin >= socMax) {
    throw new Error('soc_min must be less than soc_max');
  }
  return saveSchedules(siteId, {}, { safety: { soc_min: socMin, soc_max: socMax } });
}

// Usage
await setSafetyLimits('domagala_1', 10, 90);
```

---

## Flatten All Rules

Utility to flatten all priority arrays into a single sorted array:

```typescript
interface RuleWithPriority extends OptimizedScheduleRule {
  priority: number;
}

function flattenRules(sch: SchedulesResponse['sch']): RuleWithPriority[] {
  const allRules: RuleWithPriority[] = [];

  for (let p = 4; p <= 9; p++) {
    const key = `p_${p}` as keyof typeof sch;
    const rules = sch[key] || [];
    rules.forEach(rule => allRules.push({ ...rule, priority: p }));
  }

  return allRules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}
```

---

## Error Handling

```typescript
async function safeGetSchedules(siteId: string): Promise<SchedulesResponse | null> {
  try {
    return await getSchedules(siteId);
  } catch (error) {
    console.error('Failed to fetch schedules:', error);
    return null;
  }
}

async function safeCreateRule(
  siteId: string,
  rule: OptimizedScheduleRule,
  priority: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await createRule(siteId, rule, priority);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
```

---

## cURL Quick Reference

```bash
# Variables
ENDPOINT="https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default"
API_KEY="your-api-key"
SITE_ID="domagala_1"

# GET all schedules
curl -s -H "x-api-key: $API_KEY" "$ENDPOINT/schedules/$SITE_ID" | jq .

# POST: Create a charge rule in P7 (MUST merge with existing!)
# Step 1: GET existing P7 rules first, then include them in the array
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "sch": {
      "p_7": [
        {"id": "EXISTING-RULE", "a": {"t": "dis", "pw": 50}, "c": {}},
        {"id": "NEW-CHARGE", "a": {"t": "ch", "pw": 30}, "c": {"ts": 800, "te": 1600}}
      ]
    }
  }' | jq .

# POST: Update safety limits only
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "safety": {"soc_min": 10, "soc_max": 90},
    "sch": {}
  }' | jq .

# POST: Set system mode
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "mode": "semi-automatic",
    "sch": {}
  }' | jq .
```
