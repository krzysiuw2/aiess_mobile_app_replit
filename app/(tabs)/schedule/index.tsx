import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { 
  Plus, 
  CheckCircle, 
  XCircle, 
  Pencil, 
  Trash2,
  Zap,
  Battery,
  Clock,
  Calendar,
  CalendarCheck,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { useSchedules } from '@/hooks/useSchedules';
import { 
  getActionTypeLabel, 
  formatTime, 
  getDaysLabel,
  getPriorityLabel,
} from '@/lib/aws-schedules';
import { Rule } from '@/types';

interface RuleCardProps {
  rule: Rule;
  onEdit: () => void;
  onDelete: () => void;
  t: any;
}

// Format timestamp to readable date
const formatDate = (timestamp: number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '∞';
  // Timestamp could be Unix seconds or milliseconds
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  return date.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
};

// Get validity label
const getValidityLabel = (vf: number | undefined, vu: number | undefined): string => {
  const from = formatDate(vf);
  const until = formatDate(vu);
  
  if (from === '∞' && until === '∞') {
    return '∞'; // Always valid
  }
  
  // If same day, show only one date
  if (from !== '∞' && until !== '∞' && from === until) {
    return from;
  }
  
  return `${from} → ${until}`;
};

function RuleCard({ rule, onEdit, onDelete, t }: RuleCardProps) {
  const isActive = rule.act !== false; // Default is true
  const actionLabel = rule.a?.t ? getActionTypeLabel(rule.a.t) : 'Unknown';
  
  // Days field "d" is at top level of rule, NOT inside conditions "c"
  // Also check for verbose format "weekdays" field
  const daysValue = rule.d || rule.weekdays || rule.c?.d;
  const daysLabel = daysValue ? getDaysLabel(daysValue) : 'Everyday';
  const timeRange = rule.c?.ts !== undefined && rule.c?.te !== undefined
    ? `${formatTime(rule.c.ts)} - ${formatTime(rule.c.te)}`
    : 'Always';
  
  // Validity - check top level vf/vu or inside conditions
  const validFrom = rule.vf ?? rule.c?.vf;
  const validUntil = rule.vu ?? rule.c?.vu;
  const validityLabel = getValidityLabel(validFrom, validUntil);

  // Build action details string
  const getActionDetails = () => {
    if (!rule.a) return '-';
    
    const parts: string[] = [];
    
    if (rule.a.soc !== undefined) {
      parts.push(`${rule.a.soc}% SoC`);
    }
    if (rule.a.pw !== undefined) {
      parts.push(`${rule.a.pw} kW`);
    }
    if (rule.a.maxp !== undefined) {
      parts.push(`Max: ${rule.a.maxp} kW`);
    }
    if (rule.a.maxg !== undefined) {
      parts.push(`Grid max: ${rule.a.maxg} kW`);
    }
    if (rule.a.hth !== undefined) {
      parts.push(`High: ${rule.a.hth} kW`);
    }
    if (rule.a.lth !== undefined) {
      parts.push(`Low: ${rule.a.lth} kW`);
    }
    
    return parts.join(' • ') || '-';
  };

  return (
    <View style={[styles.ruleCard, !isActive && styles.ruleCardInactive]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.ruleId}>{rule.id}</Text>
          <Text style={styles.priorityBadge}>P{rule.p}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, !isActive && styles.statusBadgeInactive]}>
            {isActive ? (
              <CheckCircle size={16} color={Colors.success} />
            ) : (
              <XCircle size={16} color={Colors.textSecondary} />
            )}
            <Text style={[styles.statusText, !isActive && styles.statusTextInactive]}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Action */}
        <View style={styles.infoRow}>
          <Zap size={16} color={Colors.primary} />
          <Text style={styles.infoLabel}>Action:</Text>
          <Text style={styles.infoValue}>{actionLabel}</Text>
        </View>
        
        {/* Details */}
        <View style={styles.infoRow}>
          <Battery size={16} color={Colors.textSecondary} />
          <Text style={styles.infoLabel}>Details:</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{getActionDetails()}</Text>
        </View>

        {/* Time */}
        <View style={styles.infoRow}>
          <Clock size={16} color={Colors.textSecondary} />
          <Text style={styles.infoLabel}>Time:</Text>
          <Text style={styles.infoValue}>{timeRange}</Text>
        </View>

        {/* Days */}
        <View style={styles.infoRow}>
          <Calendar size={16} color={Colors.textSecondary} />
          <Text style={styles.infoLabel}>Days:</Text>
          <Text style={styles.infoValue}>{daysLabel}</Text>
        </View>

        {/* Validity */}
        <View style={styles.infoRow}>
          <CalendarCheck size={16} color={Colors.textSecondary} />
          <Text style={styles.infoLabel}>Valid:</Text>
          <Text style={styles.infoValue}>{validityLabel}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Pencil size={18} color={Colors.primary} />
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete}>
          <Trash2 size={18} color={Colors.error} />
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ScheduleListScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { rules, isLoading, error, refetch, removeRule, shadowVersion } = useSchedules();

  const handleEditRule = (rule: Rule) => {
    router.push({ 
      pathname: '/(tabs)/schedule/[ruleId]', 
      params: { ruleId: rule.id, priority: rule.p.toString() } 
    });
  };

  const handleDeleteRule = (rule: Rule) => {
    Alert.alert(
      'Delete Rule',
      `Are you sure you want to delete "${rule.id}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeRule(rule.id, rule.p);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete rule');
            }
          },
        },
      ]
    );
  };

  const handleAddRule = () => {
    router.push({ pathname: '/(tabs)/schedule/[ruleId]', params: { ruleId: 'new' } });
  };

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Device Selected</Text>
          <Text style={styles.emptySubtitle}>Please select a device from the Devices tab</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.schedules.title}</Text>
          <Text style={styles.headerSubtitle}>
            {selectedDevice.name} • {rules.length} rules
            {shadowVersion && ` • v${shadowVersion}`}
          </Text>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading schedules...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rules.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Rules</Text>
          <Text style={styles.emptySubtitle}>Create your first schedule rule</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
        >
          {rules.map((rule) => (
            <RuleCard
              key={`${rule.p}-${rule.id}`}
              rule={rule}
              onEdit={() => handleEditRule(rule)}
              onDelete={() => handleDeleteRule(rule)}
              t={t}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAddRule}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
  },
  errorText: {
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 12,
  },
  ruleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ruleCardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  ruleId: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  priorityBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeInactive: {
    backgroundColor: Colors.surfaceSecondary,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
  },
  statusTextInactive: {
    color: Colors.textSecondary,
  },
  cardContent: {
    gap: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    width: 55,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: Colors.error,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
