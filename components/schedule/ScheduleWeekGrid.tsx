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
import { mapRulesToBlocks, RuleBlock, ACTION_COLORS } from '@/lib/schedule-calendar';

const HOUR_HEIGHT = 48;
const TIME_COL_WIDTH = 36;
const GRID_HEIGHT = 24 * HOUR_HEIGHT;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ScheduleWeekGridProps {
  rules: ScheduleRuleWithPriority[];
  weekStart: Date;
  onRuleTap: (rule: ScheduleRuleWithPriority) => void;
}

export default function ScheduleWeekGrid({ rules, weekStart, onRuleTap }: ScheduleWeekGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const dayColWidth = (screenWidth - TIME_COL_WIDTH - 16) / 7;

  const blocks = useMemo(() => mapRulesToBlocks(rules, weekStart), [rules, weekStart]);

  const todayDisplayIdx = useMemo(() => {
    const now = new Date();
    const monday = new Date(weekStart);
    monday.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (d.toDateString() === now.toDateString()) return i;
    }
    return -1;
  }, [weekStart]);

  const dayDates = useMemo(() => {
    const monday = new Date(weekStart);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.getDate();
    });
  }, [weekStart]);

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
    const height = Math.max(12, ((block.endMinute - block.startMinute) / 1440) * GRID_HEIGHT);
    const color = ACTION_COLORS[block.rule.a.t] || '#6b7280';
    const isActive = block.rule.act !== false;
    const colWidth = dayColWidth / block.overlapCount;
    const left = block.overlapIndex * colWidth;

    return (
      <TouchableOpacity
        key={`${block.rule.id}-${block.rule.priority}-${block.dayIndex}-${block.startMinute}`}
        activeOpacity={0.7}
        onPress={() => onRuleTap(block.rule)}
        style={[
          styles.block,
          {
            top,
            height,
            left,
            width: colWidth - 1,
            backgroundColor: color,
            opacity: isActive ? 1 : 0.3,
          },
          block.isAlwaysTime && styles.blockAlways,
        ]}
      >
        <Text style={styles.blockPriority} numberOfLines={1}>P{block.rule.priority}</Text>
        {height > 20 && (
          <Text style={styles.blockLabel} numberOfLines={1}>
            {block.rule.id.length > 6 ? block.rule.id.slice(0, 5) + '..' : block.rule.id}
          </Text>
        )}
        {block.rule.s === 'ai' && <View style={styles.aiDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Day header */}
      <View style={styles.headerRow}>
        <View style={{ width: TIME_COL_WIDTH }} />
        {DAY_LABELS.map((label, i) => (
          <View
            key={i}
            style={[
              styles.dayHeaderCell,
              { width: dayColWidth },
              todayDisplayIdx === i && styles.dayHeaderToday,
            ]}
          >
            <Text style={[styles.dayHeaderText, todayDisplayIdx === i && styles.dayHeaderTextToday]}>{label}</Text>
            <Text style={[styles.dayHeaderDate, todayDisplayIdx === i && styles.dayHeaderTextToday]}>{dayDates[i]}</Text>
          </View>
        ))}
      </View>

      {/* Scrollable grid */}
      <ScrollView
        ref={scrollRef}
        style={styles.gridScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.gridBody, { height: GRID_HEIGHT }]}>
          {/* Time labels + hour lines */}
          {HOURS.map((h) => (
            <View key={h} style={[styles.hourRow, { top: h * HOUR_HEIGHT }]}>
              <View style={styles.timeLabel}>
                <Text style={styles.timeLabelText}>{h.toString().padStart(2, '0')}</Text>
              </View>
              <View style={styles.hourLine} />
            </View>
          ))}

          {/* Day columns with blocks */}
          {Array.from({ length: 7 }, (_, di) => (
            <View
              key={di}
              style={[
                styles.dayColumn,
                {
                  left: TIME_COL_WIDTH + di * dayColWidth,
                  width: dayColWidth,
                },
                todayDisplayIdx === di && styles.dayColumnToday,
              ]}
            >
              {blocks.filter(b => b.dayIndex === di).map(renderBlock)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayHeaderCell: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  dayHeaderToday: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dayHeaderDate: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  dayHeaderTextToday: {
    color: Colors.primary,
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
    marginTop: -6,
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
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  dayColumnToday: {
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  block: {
    position: 'absolute',
    borderRadius: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
    overflow: 'hidden',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.4)',
  },
  blockAlways: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    opacity: 0.7,
  },
  blockPriority: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
  },
  blockLabel: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  aiDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#8b5cf6',
  },
});
