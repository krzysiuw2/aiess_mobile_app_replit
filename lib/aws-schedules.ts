/**
 * AWS Schedules API Client
 * 
 * Handles communication with AWS API Gateway for BESS schedule rules.
 * Uses x-api-key authentication.
 */

import { Rule } from '@/types';

const API_ENDPOINT = process.env.EXPO_PUBLIC_AWS_ENDPOINT;
const API_KEY = process.env.EXPO_PUBLIC_AWS_API_KEY;

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
 */
export async function saveRule(
  siteId: string, 
  rule: Rule, 
  existingSchedules: SchedulesResponse['schedules']
): Promise<SaveScheduleResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS Schedules API configuration missing');
  }

  const priorityKey = `priority_${rule.p}` as keyof typeof existingSchedules;
  const existingRules = [...(existingSchedules[priorityKey] || [])];
  
  // Find and update or add new rule
  const existingIndex = existingRules.findIndex(r => r.id === rule.id);
  if (existingIndex >= 0) {
    existingRules[existingIndex] = rule;
  } else {
    existingRules.push(rule);
  }

  console.log('[Schedules] Saving rule:', rule.id, 'to priority', rule.p);

  const response = await fetch(`${API_ENDPOINT}/schedules/${siteId}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_id: siteId,
      schedules: {
        [priorityKey]: existingRules,
      },
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
 * Helper: Get weekday label from shorthand
 */
export function getDaysLabel(days: string | undefined): string {
  if (!days) return 'Everyday';
  
  const shorthandLabels: Record<string, string> = {
    weekdays: 'Mon-Fri',
    wd: 'Mon-Fri',
    weekend: 'Sat-Sun',
    we: 'Sat-Sun',
    everyday: 'Everyday',
    ed: 'Everyday',
    all: 'Everyday',
  };
  
  if (shorthandLabels[days.toLowerCase()]) {
    return shorthandLabels[days.toLowerCase()];
  }
  
  // Handle digit string like "12345" (Mon-Fri)
  if (/^\d+$/.test(days)) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const selectedDays = days.split('').map(d => dayNames[parseInt(d)] || d);
    return selectedDays.join(', ');
  }
  
  return days;
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

