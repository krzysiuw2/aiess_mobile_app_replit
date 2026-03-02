# 03 — API & CRUD Operations

> Complete API reference and ready-to-use TypeScript functions for
> Create, Read, Update, Delete, Toggle, and Move operations.
> Designed for the web panel.

---

## API Configuration

```typescript
const API_ENDPOINT = import.meta.env.VITE_AWS_ENDPOINT || '';  // or your framework's env
const API_KEY = import.meta.env.VITE_AWS_API_KEY || '';

const headers = (json = false) => ({
  'x-api-key': API_KEY,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});
```

---

## Core API Functions

### getSchedules

```typescript
async function getSchedules(siteId: string): Promise<SchedulesResponse> {
  const res = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`GET schedules failed: ${res.status}`);
  return res.json();
}
```

### saveSchedules

```typescript
async function saveSchedules(
  siteId: string,
  schedules: Record<string, OptimizedScheduleRule[]>,
  options?: {
    mode?: SystemMode;
    safety?: { soc_min: number; soc_max: number };
  }
): Promise<SaveSchedulesResponse> {
  const body: any = { site_id: siteId, sch: schedules };
  if (options?.mode) body.mode = options.mode;
  if (options?.safety) body.safety = options.safety;

  const res = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST schedules failed: ${res.status}`);
  return res.json();
}
```

---

## CRITICAL: Always GET Before POST

The POST endpoint **replaces all rules** in the specified priority arrays. You MUST merge with existing rules or you will delete them.

```typescript
// CORRECT
const current = await getSchedules(siteId);
const p7 = [...(current.sch.p_7 || []), newRule];
await saveSchedules(siteId, { p_7: p7 });

// WRONG — this deletes all other P7 rules!
await saveSchedules(siteId, { p_7: [newRule] });
```

Priorities NOT included in the POST body are left untouched by the shadow merge.

---

## CRUD Operations

### Create Rule

```typescript
async function createRule(
  siteId: string,
  rule: OptimizedScheduleRule,
  priority: Priority
): Promise<SaveSchedulesResponse> {
  const current = await getSchedules(siteId);
  const key = `p_${priority}` as keyof typeof current.sch;
  const existing = current.sch[key] || [];

  // Check for duplicate ID
  if (existing.some(r => r.id === rule.id)) {
    throw new Error(`Rule with ID "${rule.id}" already exists in P${priority}`);
  }

  return saveSchedules(siteId, { [key]: [...existing, rule] });
}
```

### Update Rule (same priority)

```typescript
async function updateRule(
  siteId: string,
  rule: OptimizedScheduleRule,
  priority: Priority
): Promise<SaveSchedulesResponse> {
  const current = await getSchedules(siteId);
  const key = `p_${priority}` as keyof typeof current.sch;
  const existing = current.sch[key] || [];

  const updated = existing.map(r => r.id === rule.id ? rule : r);
  return saveSchedules(siteId, { [key]: updated });
}
```

### Delete Rule

```typescript
async function deleteRule(
  siteId: string,
  ruleId: string,
  priority: Priority
): Promise<SaveSchedulesResponse> {
  const current = await getSchedules(siteId);
  const key = `p_${priority}` as keyof typeof current.sch;
  const filtered = (current.sch[key] || []).filter(r => r.id !== ruleId);
  return saveSchedules(siteId, { [key]: filtered });
}
```

### Toggle Active/Inactive

```typescript
async function toggleRule(
  siteId: string,
  ruleId: string,
  priority: Priority
): Promise<SaveSchedulesResponse> {
  const current = await getSchedules(siteId);
  const key = `p_${priority}` as keyof typeof current.sch;
  const rules = current.sch[key] || [];

  const updated = rules.map(rule => {
    if (rule.id !== ruleId) return rule;
    const isActive = rule.act !== false;
    if (isActive) {
      return { ...rule, act: false as const };
    } else {
      const { act, ...rest } = rule;
      return rest; // removing `act` defaults to true
    }
  });

  return saveSchedules(siteId, { [key]: updated });
}
```

### Move Rule Between Priorities

When changing priority, update BOTH the old and new arrays in a single POST.

```typescript
async function moveRule(
  siteId: string,
  ruleId: string,
  oldPriority: Priority,
  newPriority: Priority,
  updatedRule: OptimizedScheduleRule
): Promise<SaveSchedulesResponse> {
  const current = await getSchedules(siteId);

  const oldKey = `p_${oldPriority}` as keyof typeof current.sch;
  const newKey = `p_${newPriority}` as keyof typeof current.sch;

  const oldRules = (current.sch[oldKey] || []).filter(r => r.id !== ruleId);
  const newRules = [...(current.sch[newKey] || []).filter(r => r.id !== ruleId), updatedRule];

  return saveSchedules(siteId, { [oldKey]: oldRules, [newKey]: newRules });
}
```

### Set Safety Limits

```typescript
async function setSafetyLimits(
  siteId: string,
  socMin: number,
  socMax: number
): Promise<SaveSchedulesResponse> {
  if (socMin >= socMax) throw new Error('soc_min must be < soc_max');
  if (socMin < 0 || socMin > 100) throw new Error('soc_min must be 0-100');
  if (socMax < 0 || socMax > 100) throw new Error('soc_max must be 0-100');
  return saveSchedules(siteId, {}, { safety: { soc_min: socMin, soc_max: socMax } });
}
```

### Set System Mode

```typescript
async function setSystemMode(
  siteId: string,
  mode: SystemMode
): Promise<SaveSchedulesResponse> {
  return saveSchedules(siteId, {}, { mode });
}
```

---

## Flatten Rules for Display

Extracts all rules from the `sch` object into a single sorted array, attaching the priority number.

```typescript
function flattenRules(sch: SchedulesResponse['sch']): ScheduleRuleWithPriority[] {
  const all: ScheduleRuleWithPriority[] = [];

  for (let p = 4; p <= 9; p++) {
    const key = `p_${p}` as keyof typeof sch;
    const rules = sch[key] || [];
    rules.forEach(rule => all.push({ ...rule, priority: p as Priority }));
  }

  // Sort: highest priority first, then alphabetically by ID
  return all.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}
```

---

## Form Data Conversion

### Form -> Wire Format

```typescript
function formDataToOptimizedRule(data: ScheduleRuleFormData): OptimizedScheduleRule {
  const rule: OptimizedScheduleRule = {
    id: data.id,
    a: buildAction(data),
  };

  const conditions = buildConditions(data);
  rule.c = Object.keys(conditions).length > 0 ? conditions : {};

  if (!data.active) rule.act = false;
  if (data.weekdays && data.weekdays.length > 0 && data.weekdays.length < 7) {
    rule.d = data.weekdays;
  }
  if (data.validFrom && data.validFrom > 0) rule.vf = data.validFrom;
  if (data.validUntil && data.validUntil > 0) rule.vu = data.validUntil;

  return rule;
}

function buildAction(data: ScheduleRuleFormData): OptimizedAction {
  const action: OptimizedAction = { t: data.actionType };
  switch (data.actionType) {
    case 'ch':
    case 'dis':
      if (data.power !== undefined) action.pw = data.power;
      if (data.usePid) action.pid = true;
      break;
    case 'sb':
      action.pw = 0;
      break;
    case 'sl':
      if (data.highThreshold !== undefined) action.hth = data.highThreshold;
      if (data.lowThreshold !== undefined) action.lth = data.lowThreshold;
      break;
    case 'ct':
      if (data.targetSoc !== undefined) action.soc = data.targetSoc;
      if (data.maxPower !== undefined) action.maxp = data.maxPower;
      if (data.maxGridPower !== undefined) action.maxg = data.maxGridPower;
      if (data.strategy) action.str = data.strategy;
      if (data.usePid) action.pid = true;
      break;
    case 'dt':
      if (data.targetSoc !== undefined) action.soc = data.targetSoc;
      if (data.maxPower !== undefined) action.maxp = data.maxPower;
      if (data.minGridPower !== undefined) action.ming = data.minGridPower;
      if (data.strategy) action.str = data.strategy;
      if (data.usePid) action.pid = true;
      break;
  }
  return action;
}

function buildConditions(data: ScheduleRuleFormData): OptimizedConditions {
  const c: OptimizedConditions = {};
  if (data.timeStart) c.ts = parseTime(data.timeStart);
  if (data.timeEnd) c.te = parseTime(data.timeEnd);
  if (data.socMin !== undefined) c.sm = data.socMin;
  if (data.socMax !== undefined) c.sx = data.socMax;
  if (data.gridPowerOperator) c.gpo = data.gridPowerOperator;
  if (data.gridPowerValue !== undefined) c.gpv = data.gridPowerValue;
  if (data.gridPowerValueMax !== undefined) c.gpx = data.gridPowerValueMax;
  return c;
}
```

### Wire Format -> Form

```typescript
function optimizedRuleToFormData(
  rule: OptimizedScheduleRule,
  priority: Priority
): ScheduleRuleFormData {
  return {
    id: rule.id,
    priority,
    actionType: rule.a.t,
    active: rule.act !== false,
    power: rule.a.pw,
    usePid: rule.a.pid ?? false,
    highThreshold: rule.a.hth,
    lowThreshold: rule.a.lth,
    targetSoc: rule.a.soc,
    maxPower: rule.a.maxp,
    maxGridPower: rule.a.maxg,
    minGridPower: rule.a.ming,
    strategy: rule.a.str,
    timeStart: rule.c?.ts !== undefined ? formatTime(rule.c.ts) : undefined,
    timeEnd: rule.c?.te !== undefined ? formatTime(rule.c.te) : undefined,
    socMin: rule.c?.sm,
    socMax: rule.c?.sx,
    gridPowerOperator: rule.c?.gpo,
    gridPowerValue: rule.c?.gpv,
    gridPowerValueMax: rule.c?.gpx,
    weekdays: Array.isArray(rule.d) ? rule.d : weekdayShorthandToArray(rule.d),
    validFrom: rule.vf,
    validUntil: rule.vu,
  };
}
```

---

## Validation

```typescript
function validateRule(rule: OptimizedScheduleRule, priority: number): string[] {
  const errors: string[] = [];

  if (!rule.id || rule.id.length === 0) errors.push('Rule ID is required');
  if (rule.id && rule.id.length > 63) errors.push('Rule ID max 63 characters');
  if (priority < 4 || priority > 9) errors.push('Priority must be 4-9');

  switch (rule.a.t) {
    case 'ch':
    case 'dis':
      if (rule.a.pw === undefined || rule.a.pw < 0) errors.push('Power must be >= 0');
      break;
    case 'sl':
      if (rule.a.hth === undefined) errors.push('High threshold required');
      if (rule.a.lth === undefined) errors.push('Low threshold required');
      if (priority !== 9) errors.push('Site limit only allowed on P9');
      break;
    case 'ct':
    case 'dt':
      if (rule.a.soc === undefined) errors.push('Target SoC required');
      if (rule.a.soc !== undefined && (rule.a.soc < 0 || rule.a.soc > 100))
        errors.push('Target SoC must be 0-100');
      break;
  }

  if (rule.c?.sm !== undefined && (rule.c.sm < 0 || rule.c.sm > 100))
    errors.push('SoC min condition must be 0-100');
  if (rule.c?.sx !== undefined && (rule.c.sx < 0 || rule.c.sx > 100))
    errors.push('SoC max condition must be 0-100');
  if (rule.c?.sm !== undefined && rule.c?.sx !== undefined && rule.c.sm >= rule.c.sx)
    errors.push('SoC min must be less than SoC max');

  return errors;
}

function validateShadowSize(sch: Record<string, OptimizedScheduleRule[]>): boolean {
  return new TextEncoder().encode(JSON.stringify(sch)).length <= 7680;
}
```

---

## Display Helpers

```typescript
function formatTime(hhmm: number): string {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 100 + m;
}

function getDaysLabel(d: string | number[] | undefined): string {
  if (!d) return 'Everyday';
  if (Array.isArray(d)) {
    if (d.length === 0 || d.length === 7) return 'Everyday';
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return d.map(i => names[i]).join(', ');
  }
  const map: Record<string, string> = {
    weekdays: 'Mon-Fri', wd: 'Mon-Fri',
    weekend: 'Sat-Sun', we: 'Sat-Sun',
    everyday: 'Everyday', ed: 'Everyday', all: 'Everyday',
  };
  return map[d.toLowerCase()] || d;
}

function weekdayShorthandToArray(d: string | number[] | undefined): number[] {
  if (!d) return [0, 1, 2, 3, 4, 5, 6];
  if (Array.isArray(d)) return d;
  const map: Record<string, number[]> = {
    weekdays: [1, 2, 3, 4, 5], wd: [1, 2, 3, 4, 5],
    weekend: [0, 6], we: [0, 6],
    everyday: [0, 1, 2, 3, 4, 5, 6], ed: [0, 1, 2, 3, 4, 5, 6], all: [0, 1, 2, 3, 4, 5, 6],
  };
  return map[d.toLowerCase()] || [0, 1, 2, 3, 4, 5, 6];
}

function getRuleSummary(rule: OptimizedScheduleRule): string {
  const action = ACTION_TYPE_LABELS[rule.a.t] || rule.a.t;
  let detail = '';
  switch (rule.a.t) {
    case 'ch': case 'dis': detail = `${rule.a.pw} kW`; if (rule.a.pid) detail += ' (PID)'; break;
    case 'sl': detail = `${rule.a.lth} to ${rule.a.hth} kW`; break;
    case 'ct': case 'dt':
      detail = `to ${rule.a.soc}%`;
      if (rule.a.maxp) detail += `, max ${rule.a.maxp} kW`;
      break;
  }
  let time = '';
  if (rule.c?.ts !== undefined && rule.c?.te !== undefined)
    time = ` (${formatTime(rule.c.ts)}-${formatTime(rule.c.te)})`;
  const days = rule.d ? `, ${getDaysLabel(rule.d)}` : '';
  return `${action} ${detail}${time}${days}`;
}
```
