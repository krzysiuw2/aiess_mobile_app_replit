import type { ScheduleRuleWithPriority, ActionType } from '@/types';
import { weekdayShorthandToArray, formatTime, getRuleSummary } from '@/lib/aws-schedules';

export interface RuleBlock {
  rule: ScheduleRuleWithPriority;
  dayIndex: number; // 0=Mon .. 6=Sun (display order, NOT JS weekday)
  startMinute: number;
  endMinute: number;
  isAlwaysTime: boolean;
  overlapIndex: number;
  overlapCount: number;
}

export const ACTION_COLORS: Record<ActionType, string> = {
  ch: '#22c55e',
  dis: '#f97316',
  sb: '#9ca3af',
  sl: '#64748b',
  ct: '#3b82f6',
  dt: '#a855f7',
};

/**
 * Convert HHMM integer (e.g. 1430) to minutes since midnight (870).
 */
function hhmmToMinutes(hhmm: number): number {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return h * 60 + m;
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/**
 * JS weekday (0=Sun) -> display index (0=Mon .. 6=Sun).
 */
function jsWeekdayToDisplayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Check if a given date falls within a rule's validity period.
 */
function isDateInValidity(date: Date, vf?: number, vu?: number): boolean {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const ts = dayStart.getTime() / 1000;

  if (vf && ts < vf) return false;
  if (vu && ts > vu + 86400) return false;
  return true;
}

/**
 * Map schedule rules to positioned blocks for a given week.
 */
export function mapRulesToBlocks(
  rules: ScheduleRuleWithPriority[],
  weekStart: Date,
): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  const monday = getMonday(weekStart);

  for (const rule of rules) {
    if (rule.priority === 9) continue;

    const activeDays = weekdayShorthandToArray(rule.d);
    const hasTime = rule.c?.ts !== undefined && rule.c?.te !== undefined;
    const startMin = hasTime ? hhmmToMinutes(rule.c!.ts!) : 0;
    const endMin = hasTime ? hhmmToMinutes(rule.c!.te!) : 1440;
    const isOvernight = hasTime && endMin <= startMin;

    for (let di = 0; di < 7; di++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + di);
      const jsDay = date.getDay(); // 0=Sun

      if (!activeDays.includes(jsDay)) continue;
      if (!isDateInValidity(date, rule.vf, rule.vu)) continue;

      if (isOvernight) {
        blocks.push({
          rule,
          dayIndex: di,
          startMinute: startMin,
          endMinute: 1440,
          isAlwaysTime: false,
          overlapIndex: 0,
          overlapCount: 1,
        });
        if (di + 1 < 7) {
          blocks.push({
            rule,
            dayIndex: di + 1,
            startMinute: 0,
            endMinute: endMin,
            isAlwaysTime: false,
            overlapIndex: 0,
            overlapCount: 1,
          });
        }
      } else {
        blocks.push({
          rule,
          dayIndex: di,
          startMinute: startMin,
          endMinute: endMin,
          isAlwaysTime: !hasTime,
          overlapIndex: 0,
          overlapCount: 1,
        });
      }
    }
  }

  resolveOverlaps(blocks);
  return blocks;
}

/**
 * For a single day, map rules to blocks.
 */
export function mapRulesToBlocksForDay(
  rules: ScheduleRuleWithPriority[],
  date: Date,
): RuleBlock[] {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay();
  const displayIdx = jsWeekdayToDisplayIndex(jsDay);

  const blocks: RuleBlock[] = [];

  for (const rule of rules) {
    if (rule.priority === 9) continue;

    const activeDays = weekdayShorthandToArray(rule.d);
    if (!activeDays.includes(jsDay)) continue;
    if (!isDateInValidity(d, rule.vf, rule.vu)) continue;

    const hasTime = rule.c?.ts !== undefined && rule.c?.te !== undefined;
    const startMin = hasTime ? hhmmToMinutes(rule.c!.ts!) : 0;
    const endMin = hasTime ? hhmmToMinutes(rule.c!.te!) : 1440;
    const isOvernight = hasTime && endMin <= startMin;

    if (isOvernight) {
      blocks.push({
        rule,
        dayIndex: displayIdx,
        startMinute: startMin,
        endMinute: 1440,
        isAlwaysTime: false,
        overlapIndex: 0,
        overlapCount: 1,
      });
      blocks.push({
        rule,
        dayIndex: displayIdx,
        startMinute: 0,
        endMinute: endMin,
        isAlwaysTime: false,
        overlapIndex: 0,
        overlapCount: 1,
      });
    } else {
      blocks.push({
        rule,
        dayIndex: displayIdx,
        startMinute: startMin,
        endMinute: endMin,
        isAlwaysTime: !hasTime,
        overlapIndex: 0,
        overlapCount: 1,
      });
    }
  }

  resolveOverlaps(blocks);
  return blocks;
}

function resolveOverlaps(blocks: RuleBlock[]) {
  const byDay = new Map<number, RuleBlock[]>();
  for (const b of blocks) {
    if (!byDay.has(b.dayIndex)) byDay.set(b.dayIndex, []);
    byDay.get(b.dayIndex)!.push(b);
  }

  for (const dayBlocks of byDay.values()) {
    dayBlocks.sort((a, b) => a.rule.priority - b.rule.priority);

    for (let i = 0; i < dayBlocks.length; i++) {
      const overlapping: RuleBlock[] = [];
      for (let j = 0; j < dayBlocks.length; j++) {
        if (dayBlocks[i].startMinute < dayBlocks[j].endMinute &&
            dayBlocks[i].endMinute > dayBlocks[j].startMinute) {
          overlapping.push(dayBlocks[j]);
        }
      }
      if (overlapping.length > 1) {
        overlapping.sort((a, b) => a.rule.priority - b.rule.priority);
        for (let k = 0; k < overlapping.length; k++) {
          overlapping[k].overlapCount = Math.max(overlapping[k].overlapCount, overlapping.length);
          overlapping[k].overlapIndex = k;
        }
      }
    }
  }
}

export function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
  const yr = monday.getFullYear() !== sunday.getFullYear()
    ? ` ${monday.getFullYear()}`
    : '';
  return `${fmt(monday)}${yr} – ${fmt(sunday)} ${sunday.getFullYear()}`;
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
