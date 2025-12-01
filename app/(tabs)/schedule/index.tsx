import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Search, CheckCircle, Pencil } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { mockRules, getActionTypeLabel, formatTime, getDaysLabel } from '@/mocks/devices';
import { Rule } from '@/types';

interface RuleCardProps {
  rule: Rule;
  onEdit: () => void;
}

function RuleCard({ rule, onEdit }: RuleCardProps) {
  const { t } = useSettings();
  const actionLabel = getActionTypeLabel(rule.a.t);
  const daysLabel = rule.c?.d ? getDaysLabel(rule.c.d) : t.schedules.everyday;
  const timeRange = rule.c?.ts && rule.c?.te 
    ? `${formatTime(rule.c.ts)}-${formatTime(rule.c.te)}`
    : '-';
  
  const validFrom = rule.c?.vf 
    ? new Date(rule.c.vf * 1000).toLocaleDateString('en-GB')
    : '-';

  return (
    <View style={styles.ruleCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.ruleId}>Rule ID: {rule.id}</Text>
        <View style={styles.headerRight}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{t.devices.status}</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <TouchableOpacity style={styles.editButton} onPress={onEdit}>
            <Pencil size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.column}>
          <Text style={styles.columnTitle}>{t.schedules.actions}:</Text>
          <Text style={styles.columnText}>
            {t.schedules.type}: {rule.a.soc ? `${actionLabel} ${rule.a.soc}% SoC` : actionLabel}
          </Text>
          {rule.a.maxp !== undefined && (
            <Text style={styles.columnText}>
              {t.schedules.maxPower}: {rule.a.maxp} kW
            </Text>
          )}
          {rule.a.pw !== undefined && (
            <Text style={styles.columnText}>
              {t.schedules.maxPower}: {rule.a.pw} kW
            </Text>
          )}
          {rule.a.maxg !== undefined && (
            <Text style={styles.columnText}>
              {t.schedules.maxGrid}: {rule.a.maxg} kW
            </Text>
          )}
        </View>

        <View style={styles.column}>
          <Text style={styles.columnTitle}>{t.schedules.timeConditions}:</Text>
          <Text style={styles.columnText}>{daysLabel}</Text>
          <Text style={styles.columnText}>{timeRange}</Text>
          <Text style={styles.columnText}>{t.schedules.from} {validFrom}-∞</Text>
        </View>
      </View>
    </View>
  );
}

export default function ScheduleListScreen() {
  const { t } = useSettings();

  const handleEditRule = (ruleId: string) => {
    router.push({ pathname: '/(tabs)/schedule/[ruleId]', params: { ruleId } });
  };

  const handleAddRule = () => {
    router.push({ pathname: '/(tabs)/schedule/[ruleId]', params: { ruleId: 'new' } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.schedules.title}</Text>
          <Text style={styles.headerSubtitle}>{t.schedules.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Search size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {mockRules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onEdit={() => handleEditRule(rule.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddRule}>
          <Text style={styles.addButtonText}>{t.schedules.addRule}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  ruleCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ruleId: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.textOnDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    color: Colors.textOnDark,
  },
  editButton: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textOnDark,
    marginBottom: 8,
  },
  columnText: {
    fontSize: 13,
    color: Colors.textOnDarkSecondary,
    marginBottom: 4,
  },
  footer: {
    padding: 16,
    paddingBottom: 8,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
