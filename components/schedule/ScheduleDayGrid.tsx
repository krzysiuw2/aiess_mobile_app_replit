import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import Colors from '@/constants/colors';
import type { ScheduleRuleWithPriority } from '@/types';
import { mapRulesToBlocksForDay, RuleBlock, ACTION_COLORS } from '@/lib/schedule-calendar';
import { getActionTypeLabel, formatTime, getRuleSummary } from '@/lib/aws-schedules';

const HOUR_HEIGHT = 56;
const TIME_COL_WIDTH = 42;
const GRID_HEIGHT = 24 * HOUR_HEIGHT;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface ScheduleDayGridProps {
  rules: ScheduleRuleWithPriority[];
  date: Date;
  onRuleTap: (rule: ScheduleRuleWithPriority) => void;
}

export default function ScheduleDayGrid({ rules, date, onRuleTap }: ScheduleDayGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const colWidth = screenWidth - TIME_COL_WIDTH - 32;

  const blocks = useMemo(() => mapRulesToBlocksForDay(rules, date), [rules, date]);

  const earliestHour = useMemo(() => {
    if (blocks.length === 0) return 6;
    const earliest = Math.min(...blocks.filter(b => !b.isAlwaysTime).map(b => b.startMinute));
    return Math.max(0, Math.floor((earliest || 0) / 60) - 1);
  }, [blocks]);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: earliestHour * HOUR_HEIGHT, animated: false });
    }, 100);
  }, [earliestHour]);

  const renderBlock = (block: RuleBlock) => {
    const top = (block.startMinute / 1440) * GRID_HEIGHT;
    const height = Math.max(20, ((block.endMinute - block.startMinute) / 1440) * GRID_HEIGHT);
    const color = ACTION_COLORS[block.rule.a.t] || '#6b7280';
    const isActive = block.rule.act !== false;
    const blockWidth = colWidth / block.overlapCount;
    const left = block.overlapIndex * blockWidth;
    const actionLabel = getActionTypeLabel(block.rule.a.t);
    const hasTime = block.rule.c?.ts !== undefined && block.rule.c?.te !== undefined;
    const timeStr = hasTime
      ? `${formatTime(block.rule.c!.ts!)} - ${formatTime(block.rule.c!.te!)}`
      : 'All day';

    return (
      <TouchableOpacity
        key={`${block.rule.id}-${block.rule.priority}-${block.startMinute}`}
        activeOpacity={0.7}
        onPress={() => onRuleTap(block.rule)}
        style={[
          styles.block,
          {
            top,
            height,
            left,
            width: blockWidth - 2,
            backgroundColor: color,
            opacity: isActive ? 1 : 0.3,
          },
          block.isAlwaysTime && styles.blockAlways,
        ]}
      >
        <View style={styles.blockHeader}>
          <Text style={styles.blockId} numberOfLines={1}>{block.rule.id}</Text>
          <Text style={styles.blockPriority}>P{block.rule.priority}</Text>
          {block.rule.s === 'ai' && <View style={styles.aiDot} />}
        </View>
        {height > 30 && (
          <Text style={styles.blockAction} numberOfLines={1}>{actionLabel}{block.rule.a.pw ? ` ${block.rule.a.pw} kW` : ''}</Text>
        )}
        {height > 44 && (
          <Text style={styles.blockTime} numberOfLines={1}>{timeStr}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.gridScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.gridBody, { height: GRID_HEIGHT }]}>
          {HOURS.map((h) => (
            <View key={h} style={[styles.hourRow, { top: h * HOUR_HEIGHT }]}>
              <View style={styles.timeLabel}>
                <Text style={styles.timeLabelText}>{h.toString().padStart(2, '0')}:00</Text>
              </View>
              <View style={styles.hourLine} />
            </View>
          ))}

          <View style={[styles.dayColumn, { left: TIME_COL_WIDTH, width: colWidth }]}>
            {blocks.map(renderBlock)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridScroll: {
    flex: 1,
  },
  gridBody: {
    position: 'relative',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabel: {
    width: TIME_COL_WIDTH,
    paddingRight: 4,
    alignItems: 'flex-end',
  },
  timeLabelText: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: -7,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  dayColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  block: {
    position: 'absolute',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.4)',
  },
  blockAlways: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    opacity: 0.7,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  blockId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  blockPriority: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8b5cf6',
  },
  blockAction: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    marginTop: 2,
  },
  blockTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
});
