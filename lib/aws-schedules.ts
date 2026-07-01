import type {
  ActionType,
  GridOperator,
  Strategy,
  Priority,
  OptimizedAction,
  OptimizedConditions,
  OptimizedScheduleRule,
  ScheduleRuleWithPriority,
  SchedulesResponse,
  SaveSchedulesResponse,
  ScheduleRuleFormData,
  ConfigSectionId,
  ConfigSectionEnvelope,
  DeviceManifest,
  PutSectionResponse,
} from '@/types';
import { callAwsProxy, callAwsConfigProxy } from '@/lib/edge-proxy';

// ─── API Methods ────────────────────────────────────────────────

export async function getSchedules(siteId: string): Promise<SchedulesResponse> {
  const response = await callAwsProxy(`/schedules/${siteId}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Schedules] API error:', response.status, errorText);
    throw new Error(`Failed to fetch schedules: ${response.status}`);
  }

  return response.json();
}

export async function saveSchedules(
  siteId: string,
  schedules: Record<string, OptimizedScheduleRule[]>,
  options?: {
    safety?: { soc_min: number; soc_max: number };
  }
): Promise<SaveSchedulesResponse> {
  const body: any = { site_id: siteId, sch: schedules };
  if (options?.safety) body.safety = options.safety;

  const response = await callAwsProxy(`/schedules/${siteId}`, 'POST', body);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Schedules] Save error:', response.status, errorText);
    throw new Error(`Failed to save schedules: ${response.status}`);
  }

  return response.json();
}

// ─── DDB Config-Plane API (per-section; behind use_ddb_config_plane) ──

/** Another writer updated the section between our GET and PUT (HTTP 412). */
export class ConfigConflictError extends Error {
  constructor(public sectionId: string) {
    super(`Section ${sectionId} was modified concurrently (412)`);
    this.name = 'ConfigConflictError';
  }
}

/** Server-side JSON Schema validation failure (HTTP 400 with details[]). */
export class ConfigValidationError extends Error {
  constructor(public sectionId: string, public details: string[]) {
    super(`Section ${sectionId} failed validation: ${details.join('; ')}`);
    this.name = 'ConfigValidationError';
  }
}

export async function getManifest(siteId: string): Promise<DeviceManifest> {
  const response = await callAwsConfigProxy(`/devices/${siteId}/manifest`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ConfigPlane] Manifest error:', response.status, errorText);
    throw new Error(`Failed to fetch manifest: ${response.status}`);
  }
  return response.json();
}

export async function getSection<T>(
  siteId: string,
  sectionId: ConfigSectionId,
): Promise<ConfigSectionEnvelope<T>> {
  const response = await callAwsConfigProxy(`/devices/${siteId}/sections/${sectionId}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ConfigPlane] Section GET error:', response.status, errorText);
    throw new Error(`Failed to fetch section ${sectionId}: ${response.status}`);
  }
  return response.json();
}

/**
 * Replaces the WHOLE section payload (not a merge). Callers must
 * fetch → modify → put, passing the etag from the fetch as `ifMatchEtag`
 * so concurrent writes surface as ConfigConflictError.
 */
export async function putSection<T>(
  siteId: string,
  sectionId: ConfigSectionId,
  payload: T,
  ifMatchEtag?: string,
): Promise<PutSectionResponse> {
  const headers = ifMatchEtag ? { 'If-Match': ifMatchEtag } : undefined;
  const response = await callAwsConfigProxy(
    `/devices/${siteId}/sections/${sectionId}`,
    'PUT',
    { payload },
    headers,
  );

  if (response.status === 412) {
    throw new ConfigConflictError(sectionId);
  }
  if (response.status === 400) {
    let details: string[] = [];
    try {
      const body = await response.json();
      details = Array.isArray(body?.details) ? body.details : [JSON.stringify(body)];
    } catch {
      details = ['Bad request'];
    }
    throw new ConfigValidationError(sectionId, details);
  }
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ConfigPlane] Section PUT error:', response.status, errorText);
    throw new Error(`Failed to write section ${sectionId}: ${response.status}`);
  }
  return response.json();
}

// ─── Flatten & Sort ─────────────────────────────────────────────

export function flattenRules(sch: SchedulesResponse['sch']): ScheduleRuleWithPriority[] {
  const allRules: ScheduleRuleWithPriority[] = [];

  for (let p = 4; p <= 9; p++) {
    const key = `p_${p}` as keyof typeof sch;
    const rules = sch[key] || [];
    rules.forEach(rule => allRules.push({ ...rule, priority: p as Priority }));
  }

  return allRules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}

// ─── Form Conversion ────────────────────────────────────────────

export function formDataToOptimizedRule(data: ScheduleRuleFormData): OptimizedScheduleRule {
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

export function optimizedRuleToFormData(
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

// ─── Validation ─────────────────────────────────────────────────

export function validateRule(rule: OptimizedScheduleRule, priority: number): string[] {
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
      if (rule.a.hth === undefined) errors.push('High threshold required for site limit');
      if (rule.a.lth === undefined) errors.push('Low threshold required for site limit');
      if (priority !== 9) errors.push('Site limit action only allowed on P9');
      break;
    case 'ct':
    case 'dt':
      if (rule.a.soc === undefined) errors.push('Target SoC required');
      if (rule.a.soc !== undefined && (rule.a.soc < 0 || rule.a.soc > 100)) {
        errors.push('Target SoC must be 0-100');
      }
      break;
  }

  if (rule.c?.sm !== undefined && (rule.c.sm < 0 || rule.c.sm > 100)) {
    errors.push('SoC min must be 0-100');
  }
  if (rule.c?.sx !== undefined && (rule.c.sx < 0 || rule.c.sx > 100)) {
    errors.push('SoC max must be 0-100');
  }
  if (rule.c?.sm !== undefined && rule.c?.sx !== undefined && rule.c.sm >= rule.c.sx) {
    errors.push('SoC min must be less than SoC max');
  }

  return errors;
}

// ─── Display Helpers ────────────────────────────────────────────

export function formatTime(hhmm: number): string {
  const hours = Math.floor(hhmm / 100);
  const minutes = hhmm % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 100 + minutes;
}

// ─── Timezone-stable date helpers ───────────────────────────────
// IMPORTANT: vf/vu must round-trip in the user's LOCAL timezone.
// Using UTC (toISOString) caused dates to drift back by 1 day on each
// edit-save cycle for users in any non-UTC timezone, eventually pushing
// vu into the past and triggering EventBridge auto-deletion.

export function unixToLocalDateStr(ts: number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateStrToUnix(dateStr: string, endOfDay = false): number | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const date = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59)
    : new Date(y, m - 1, d, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

export function getActionTypeLabel(type: ActionType): string {
  const labels: Record<ActionType, string> = {
    ch: 'Charge',
    dis: 'Discharge',
    sb: 'Standby',
    sl: 'Site Limit',
    ct: 'Charge to Target',
    dt: 'Discharge to Target',
  };
  return labels[type] || type;
}

export function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    4: 'P4 - Reserved',
    5: 'P5 - Baseline',
    6: 'P6 - Low',
    7: 'P7 - Normal',
    8: 'P8 - High',
    9: 'P9 - Site Limit',
  };
  return labels[priority] || `P${priority}`;
}

export function getStrategyLabel(str: Strategy): string {
  const labels: Record<Strategy, string> = {
    eq: 'Equal Spread',
    agg: 'Aggressive',
    con: 'Conservative',
  };
  return labels[str] || str;
}

export function getGridOperatorLabel(op: GridOperator): string {
  const labels: Record<GridOperator, string> = {
    gt: 'Greater than',
    lt: 'Less than',
    gte: 'Greater or equal',
    lte: 'Less or equal',
    eq: 'Equal to',
    bt: 'Between',
  };
  return labels[op] || op;
}

export function getDaysLabel(d: string | number[] | undefined): string {
  if (!d) return 'Everyday';

  if (Array.isArray(d)) {
    if (d.length === 0 || d.length === 7) return 'Everyday';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return d.map(i => dayNames[i]).join(', ');
  }

  const shorthand: Record<string, string> = {
    weekdays: 'Mon-Fri', wd: 'Mon-Fri',
    weekend: 'Sat-Sun', we: 'Sat-Sun',
    everyday: 'Everyday', ed: 'Everyday', all: 'Everyday',
  };

  const lower = d.toLowerCase();
  if (shorthand[lower]) return shorthand[lower];

  if (/^[0-7]+$/.test(d)) {
    const dayMap: Record<string, string> = {
      '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed',
      '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun',
    };
    const unique = [...new Set(d.split('').map(ch => dayMap[ch] || ch))];
    return unique.join(', ');
  }

  if (d.includes('-')) return d;

  return d;
}

export function weekdayShorthandToArray(d: string | number[] | undefined): number[] {
  if (!d) return [0, 1, 2, 3, 4, 5, 6];
  if (Array.isArray(d)) return d;

  const shorthandMap: Record<string, number[]> = {
    weekdays: [1, 2, 3, 4, 5],
    wd: [1, 2, 3, 4, 5],
    weekend: [0, 6],
    we: [0, 6],
    everyday: [0, 1, 2, 3, 4, 5, 6],
    ed: [0, 1, 2, 3, 4, 5, 6],
    all: [0, 1, 2, 3, 4, 5, 6],
  };

  const lower = d.toLowerCase();
  return shorthandMap[lower] || [0, 1, 2, 3, 4, 5, 6];
}

// ─── Rule detail lines (for list cards) ─────────────────────────

export type RuleDetailIcon =
  | 'clock'
  | 'calendar'
  | 'calendar-check'
  | 'zap'
  | 'battery'
  | 'gauge'
  | 'cpu'
  | 'target';

export interface RuleDetailLine {
  iconKey: RuleDetailIcon;
  text: string;
}

export interface RuleDetailLabels {
  always: string;
  everyday: string;
  permanent: string;
  from: string;
  until: string;
  gridLabel: string;
  socLabel: string;
  strategyLabel: string;
  pidLabel: string;
  maxGridLabel: string;
  minGridLabel: string;
  maxPowerLabel: string;
  targetLabel: string;
  strategies: Record<Strategy, string>;
}

export function getRuleDetailLines(
  rule: OptimizedScheduleRule,
  labels: RuleDetailLabels,
): RuleDetailLine[] {
  const lines: RuleDetailLine[] = [];

  // Time window
  const timeText =
    rule.c?.ts !== undefined && rule.c?.te !== undefined
      ? `${formatTime(rule.c.ts)} - ${formatTime(rule.c.te)}`
      : labels.always;
  lines.push({ iconKey: 'clock', text: timeText });

  // Weekdays
  lines.push({
    iconKey: 'calendar',
    text: rule.d ? getDaysLabel(rule.d) : labels.everyday,
  });

  // Validity window
  const validityText = formatValidity(rule.vf, rule.vu, labels);
  if (validityText !== labels.permanent) {
    lines.push({ iconKey: 'calendar-check', text: validityText });
  }

  // Grid power condition
  if (rule.c?.gpo && rule.c?.gpv !== undefined) {
    let gridText = '';
    if (rule.c.gpo === 'bt' && rule.c.gpx !== undefined) {
      gridText = `${labels.gridLabel} ${rule.c.gpv} ~ ${rule.c.gpx} kW`;
    } else {
      const opSym =
        rule.c.gpo === 'gt' ? '>' :
        rule.c.gpo === 'lt' ? '<' :
        rule.c.gpo === 'gte' ? '>=' :
        rule.c.gpo === 'lte' ? '<=' :
        rule.c.gpo === 'eq' ? '=' : rule.c.gpo;
      gridText = `${labels.gridLabel} ${opSym} ${rule.c.gpv} kW`;
    }
    lines.push({ iconKey: 'zap', text: gridText });
  }

  // SoC range
  if (rule.c?.sm !== undefined || rule.c?.sx !== undefined) {
    const lo = rule.c?.sm !== undefined ? `${rule.c.sm}%` : '0%';
    const hi = rule.c?.sx !== undefined ? `${rule.c.sx}%` : '100%';
    lines.push({ iconKey: 'battery', text: `${labels.socLabel} ${lo} - ${hi}` });
  }

  // Target SoC for ct/dt
  if ((rule.a.t === 'ct' || rule.a.t === 'dt') && rule.a.soc !== undefined) {
    lines.push({ iconKey: 'target', text: `${labels.targetLabel} ${rule.a.soc}%` });
  }

  // Max power for ct/dt
  if ((rule.a.t === 'ct' || rule.a.t === 'dt') && rule.a.maxp !== undefined) {
    lines.push({ iconKey: 'gauge', text: `${labels.maxPowerLabel} ${rule.a.maxp} kW` });
  }

  // Max grid (ct) / Min grid (dt)
  if (rule.a.t === 'ct' && rule.a.maxg !== undefined) {
    lines.push({ iconKey: 'zap', text: `${labels.maxGridLabel} ${rule.a.maxg} kW` });
  }
  if (rule.a.t === 'dt' && rule.a.ming !== undefined) {
    lines.push({ iconKey: 'zap', text: `${labels.minGridLabel} ${rule.a.ming} kW` });
  }

  // Strategy
  if ((rule.a.t === 'ct' || rule.a.t === 'dt') && rule.a.str) {
    const stratLabel = labels.strategies[rule.a.str] || rule.a.str;
    lines.push({ iconKey: 'cpu', text: `${labels.strategyLabel}: ${stratLabel}` });
  }

  // PID
  if (rule.a.pid) {
    lines.push({ iconKey: 'cpu', text: labels.pidLabel });
  }

  return lines;
}

function formatValidity(
  vf: number | undefined,
  vu: number | undefined,
  labels: { permanent: string; from: string; until: string },
): string {
  const fromStr = vf ? unixToLocalDateStr(vf) : '';
  const untilStr = vu ? unixToLocalDateStr(vu) : '';
  if (!fromStr && !untilStr) return labels.permanent;
  if (fromStr && untilStr && fromStr === untilStr) return fromStr;
  if (fromStr && !untilStr) return `${labels.from} ${fromStr}`;
  if (!fromStr && untilStr) return `${labels.until} ${untilStr}`;
  return `${fromStr} - ${untilStr}`;
}

export function getRuleSummary(rule: OptimizedScheduleRule): string {
  const action = getActionTypeLabel(rule.a.t);
  let detail = '';

  switch (rule.a.t) {
    case 'ch':
    case 'dis':
      detail = `${rule.a.pw} kW`;
      if (rule.a.pid) detail += ' (PID)';
      break;
    case 'sl':
      detail = `${rule.a.lth} to ${rule.a.hth} kW`;
      break;
    case 'ct':
    case 'dt':
      detail = `to ${rule.a.soc}%`;
      if (rule.a.maxp) detail += `, max ${rule.a.maxp} kW`;
      break;
  }

  let time = '';
  if (rule.c?.ts !== undefined && rule.c?.te !== undefined) {
    time = ` (${formatTime(rule.c.ts)}-${formatTime(rule.c.te)})`;
  }

  const days = rule.d ? `, ${getDaysLabel(rule.d)}` : '';

  return `${action} ${detail}${time}${days}`;
}
