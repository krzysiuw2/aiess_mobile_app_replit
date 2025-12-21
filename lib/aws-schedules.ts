/**
 * AWS Schedules API Client
 * 
 * Handles communication with AWS API Gateway for BESS schedule rules.
 * Uses x-api-key authentication.
 */

import { Rule } from '@/types';

const API_ENDPOINT = process.env.EXPO_PUBLIC_AWS_ENDPOINT || '';
const API_KEY = process.env.EXPO_PUBLIC_AWS_API_KEY || '';

export interface SchedulesResponse {
  site_id: string;
  schedules: {
    priority_4?: Rule[];
    priority_5?: Rule[];
    priority_6?: Rule[];
    priority_7?: Rule[];
    priority_8?: Rule[];
    priority_9?: Rule[];
  };
  shadow_version: number;
}

export interface SaveScheduleResponse {
  message: string;
  site_id: string;
  shadow_version: number;
  updated_priorities: string[];
  total_rules: number;
}

/**
 * Get all schedules for a device
 */
export async function getSchedules(siteId: string): Promise<SchedulesResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS Schedules API configuration missing');
  }

  console.log('[Schedules] Fetching schedules for:', siteId);

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Schedules] API error:', response.status, errorText);
    throw new Error(`Failed to fetch schedules: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Schedules] Received schedules, shadow version:', data.shadow_version);
  return data;
}

/**
 * Get all rules flattened into a single array with priority info
 */
export function flattenRules(schedules: SchedulesResponse['schedules']): Rule[] {
  const allRules: Rule[] = [];
  
  // Process priorities 4-9 (user-accessible from cloud)
  for (let p = 4; p <= 9; p++) {
    const priorityKey = `priority_${p}` as keyof typeof schedules;
    const rules = schedules[priorityKey] || [];
    rules.forEach(rule => {
      allRules.push({ ...rule, p: rule.p || p });
    });
  }
  
  // Sort by priority (higher first), then by ID
  return allRules.sort((a, b) => {
    if (b.p !== a.p) return b.p - a.p;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Save a rule (create or update)
 * 
 * IMPORTANT: When priority changes, we must update BOTH old and new priorities!
 * The API replaces ALL rules in a priority - we must merge properly.
 * 
 * @param siteId - Device/site ID
 * @param rule - The rule to save (with new priority in rule.p)
 * @param existingSchedules - Current schedules from last GET
 * @param oldPriority - If editing and priority changed, pass the old priority to remove from
 */
export async function saveRule(
  siteId: string, 
  rule: Rule, 
  existingSchedules: SchedulesResponse['schedules'],
  oldPriority?: number
): Promise<SaveScheduleResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS Schedules API configuration missing');
  }

  const newPriorityKey = `priority_${rule.p}` as keyof typeof existingSchedules;
  const schedulesToUpdate: Record<string, Rule[]> = {};
  
  // Handle priority change - remove from old priority
  if (oldPriority !== undefined && oldPriority !== rule.p) {
    const oldPriorityKey = `priority_${oldPriority}` as keyof typeof existingSchedules;
    const oldRules = existingSchedules[oldPriorityKey] || [];
    // Filter out the rule being moved
    const filteredOldRules = oldRules.filter(r => (r.id || (r as any).rule_id) !== rule.id);
    schedulesToUpdate[oldPriorityKey] = filteredOldRules;
    console.log('[Schedules] Removing rule from old priority:', oldPriority);
  }

  // Add/update rule in new priority
  const existingRulesInNewPriority = [...(existingSchedules[newPriorityKey] || [])];
  
  // Filter out any existing rule with same ID (handles both same-priority update and cross-priority move)
  const filteredNewRules = existingRulesInNewPriority.filter(
    r => (r.id || (r as any).rule_id) !== rule.id
  );
  
  // Add the updated rule
  filteredNewRules.push(rule);
  schedulesToUpdate[newPriorityKey] = filteredNewRules;

  console.log('[Schedules] Saving rule:', rule.id, 'to priority', rule.p);
  console.log('[Schedules] Updating priorities:', Object.keys(schedulesToUpdate));

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_id: siteId,
      schedules: schedulesToUpdate,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Schedules] Save error:', response.status, errorText);
    throw new Error(`Failed to save rule: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Schedules] Rule saved, new shadow version:', data.shadow_version);
  return data;
}

/**
 * Delete a rule
 */
export async function deleteRule(
  siteId: string,
  ruleId: string,
  priority: number,
  existingSchedules: SchedulesResponse['schedules']
): Promise<SaveScheduleResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS Schedules API configuration missing');
  }

  const priorityKey = `priority_${priority}` as keyof typeof existingSchedules;
  const existingRules = existingSchedules[priorityKey] || [];
  const filteredRules = existingRules.filter(r => r.id !== ruleId);

  console.log('[Schedules] Deleting rule:', ruleId, 'from priority', priority);

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_id: siteId,
      schedules: {
        [priorityKey]: filteredRules,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Schedules] Delete error:', response.status, errorText);
    throw new Error(`Failed to delete rule: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Schedules] Rule deleted, new shadow version:', data.shadow_version);
  return data;
}

/**
 * Helper: Get human-readable action type
 */
export function getActionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ch: 'Charge',
    dis: 'Discharge',
    sb: 'Standby',
    ct: 'Charge to Target',
    dt: 'Discharge to Target',
    sl: 'Site Limit',
  };
  return labels[type] || type;
}

/**
 * Helper: Format time from HHMM integer to HH:MM string
 */
export function formatTime(time: number): string {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Helper: Parse HH:MM string to HHMM integer
 */
export function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 100 + minutes;
}

/**
 * Helper: Get weekday label from shorthand, digit string, or array
 */
export function getDaysLabel(days: string | string[] | undefined): string {
  console.log('[getDaysLabel] Input:', days, 'type:', typeof days);
  
  if (!days) return 'Everyday';
  
  // Handle array format (verbose) ["Mon", "Tue", ...]
  if (Array.isArray(days)) {
    if (days.length === 7) return 'Everyday';
    if (days.length === 0) return 'Everyday';
    return days.join(', ');
  }
  
  const daysStr = String(days);
  
  const shorthandLabels: Record<string, string> = {
    weekdays: 'Mon-Fri',
    wd: 'Mon-Fri',
    weekend: 'Sat-Sun',
    we: 'Sat-Sun',
    everyday: 'Everyday',
    ed: 'Everyday',
    all: 'Everyday',
  };
  
  if (shorthandLabels[daysStr.toLowerCase()]) {
    return shorthandLabels[daysStr.toLowerCase()];
  }
  
  // Handle digit string like "12345" (Mon-Fri) or "5" (Fri only)
  // Schema: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0 or 7=Sun
  if (/^[0-7]+$/.test(daysStr)) {
    const dayMap: Record<string, string> = {
      '0': 'Sun',
      '1': 'Mon',
      '2': 'Tue',
      '3': 'Wed',
      '4': 'Thu',
      '5': 'Fri',
      '6': 'Sat',
      '7': 'Sun',
    };
    const selectedDays = daysStr.split('').map(d => dayMap[d] || d);
    // Remove duplicates and join
    const uniqueDays = [...new Set(selectedDays)];
    return uniqueDays.join(', ');
  }
  
  // Handle range format like "mon-fri"
  if (daysStr.includes('-')) {
    return daysStr;
  }
  
  return daysStr;
}

/**
 * Helper: Get priority label
 */
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

