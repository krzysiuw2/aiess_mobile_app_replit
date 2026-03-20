import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CalendarDays, Target, Lightbulb } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import type { WeeklyPlan } from '@/types/ai-agent';

interface WeeklyPlanCardProps {
  weeklyPlan: WeeklyPlan | null;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function WeeklyPlanCard({ weeklyPlan }: WeeklyPlanCardProps) {
  const { t } = useSettings();
  const wp = t.aiAgent.weeklyPlan;

  const todayKey = DAY_KEYS[new Date().getDay()];
  const todayGuidance = weeklyPlan?.daily_guidance?.[todayKey];

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CalendarDays size={18} color={Colors.primary} />
        <Text style={s.title}>{wp.title}</Text>
        {weeklyPlan?.week && (
          <Text style={s.weekLabel}>{weeklyPlan.week}</Text>
        )}
      </View>

      {!weeklyPlan ? (
        <Text style={s.placeholder}>{wp.noPlan}</Text>
      ) : (
        <View style={s.content}>
          {weeklyPlan.strategy && (
            <View style={s.row}>
              <Target size={14} color={Colors.textSecondary} />
              <Text style={s.strategyText}>{weeklyPlan.strategy}</Text>
            </View>
          )}

          {weeklyPlan.goals?.length > 0 && (
            <View style={s.goalsRow}>
              {weeklyPlan.goals.map((goal, i) => (
                <View key={i} style={s.goalChip}>
                  <Text style={s.goalText}>{goal}</Text>
                </View>
              ))}
            </View>
          )}

          {todayGuidance && (
            <View style={s.guidanceBox}>
              <Lightbulb size={14} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={s.guidanceLabel}>{wp.todayGuidance}</Text>
                <Text style={s.guidanceText}>{todayGuidance}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  weekLabel: { fontSize: 12, color: Colors.textSecondary, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  placeholder: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  content: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strategyText: { fontSize: 13, color: Colors.text, flex: 1, lineHeight: 18 },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  goalChip: { backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  goalText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  guidanceBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A' },
  guidanceLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  guidanceText: { fontSize: 12, color: '#78350F', lineHeight: 17 },
});
