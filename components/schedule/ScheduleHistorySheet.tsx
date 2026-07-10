import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { X, PlusCircle, Pencil, Clock, Trash2, Bot, SlidersHorizontal, User, Timer } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { getScheduleHistory, getHistoryAttribution, type HistoryAttribution } from '@/lib/aws-schedules';
import type { ScheduleHistoryEvent, ScheduleHistoryEventType } from '@/types';

/**
 * Read-only audit trail (v1.1.0, 90-day horizon, no restore).
 * Site-wide activity feed when `ruleId` is omitted; per-rule history when set.
 */

interface ScheduleHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Filter to a single rule (per-rule history sheet in the editor). */
  ruleId?: string;
}

const EVENT_ICONS: Record<ScheduleHistoryEventType, React.ComponentType<{ size?: number; color?: string }>> = {
  added: PlusCircle,
  changed: Pencil,
  expired: Clock,
  deleted: Trash2,
};

const EVENT_COLORS: Record<ScheduleHistoryEventType, string> = {
  added: '#22c55e',
  changed: '#3b82f6',
  expired: '#f59e0b',
  deleted: '#ef4444',
};

const ATTRIBUTION_ICONS: Record<HistoryAttribution, React.ComponentType<{ size?: number; color?: string }>> = {
  app: User,
  settings: SlidersHorizontal,
  operator: Bot,
  expiry: Timer,
  other: User,
};

export default function ScheduleHistorySheet({ visible, onClose, ruleId }: ScheduleHistorySheetProps) {
  const { t } = useSettings();
  const h = t.schedules.history;
  const { selectedDevice } = useDevices();

  const [events, setEvents] = useState<ScheduleHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedDevice) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getScheduleHistory(selectedDevice.device_id, {
        rule_id: ruleId,
        limit: 100,
      });
      // Newest first.
      setEvents([...res.events].sort((a, b) => b.t - a.t));
    } catch {
      setError(h.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, ruleId, h.failedToLoad]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const attributionLabel = (attr: HistoryAttribution): string => {
    switch (attr) {
      case 'app': return h.by_app;
      case 'settings': return h.by_settings;
      case 'operator': return h.by_operator;
      case 'expiry': return h.by_expiry;
      default: return h.by_other;
    }
  };

  const eventLabel = (type: ScheduleHistoryEventType): string => {
    switch (type) {
      case 'added': return h.event_added;
      case 'changed': return h.event_changed;
      case 'expired': return h.event_expired;
      case 'deleted': return h.event_deleted;
    }
  };

  const formatTimestamp = (e: ScheduleHistoryEvent): string => {
    const d = e.t ? new Date(e.t * 1000) : new Date(e.at);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderEvent = ({ item }: { item: ScheduleHistoryEvent }) => {
    const Icon = EVENT_ICONS[item.event] || Pencil;
    const color = EVENT_COLORS[item.event] || Colors.textSecondary;
    const attr = getHistoryAttribution(item);
    const AttrIcon = ATTRIBUTION_ICONS[attr];
    return (
      <View style={styles.eventRow}>
        <View style={[styles.eventIcon, { backgroundColor: color + '18' }]}>
          <Icon size={16} color={color} />
        </View>
        <View style={styles.eventBody}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {eventLabel(item.event)}{!ruleId ? ` · ${item.rule_id}` : ''}
            </Text>
            <Text style={styles.eventTime}>{formatTimestamp(item)}</Text>
          </View>
          <View style={styles.eventMetaRow}>
            <AttrIcon size={11} color={Colors.textSecondary} />
            <Text style={styles.eventMeta}>{attributionLabel(attr)}</Text>
            {item.band ? <Text style={styles.eventMeta}>· {item.band}</Text> : null}
          </View>
          {item.event === 'changed' && item.changed_fields && item.changed_fields.length > 0 && (
            <Text style={styles.changedFields} numberOfLines={2}>
              {h.changedFields}: {item.changed_fields.join(', ')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{ruleId ? h.ruleHistory : h.title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color={Colors.text} />
            </Pressable>
          </View>
          {ruleId && <Text style={styles.subtitle} numberOfLines={1}>{ruleId}</Text>}

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>{h.loading}</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{h.empty}</Text>
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(e, i) => `${e.t}-${e.rule_id}-${e.version}-${i}`}
              renderItem={renderEvent}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          <Text style={styles.horizonNote}>{h.horizonNote}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '80%',
    minHeight: '50%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  loadingText: { fontSize: 13, color: Colors.textSecondary, marginTop: 10 },
  errorText: { fontSize: 13, color: Colors.error, textAlign: 'center' },
  emptyText: { fontSize: 13, color: Colors.textSecondary },
  listContent: { paddingVertical: 8 },

  eventRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  eventIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  eventBody: { flex: 1 },
  eventTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eventTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  eventTime: { fontSize: 11, color: Colors.textSecondary },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  eventMeta: { fontSize: 12, color: Colors.textSecondary },
  changedFields: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },

  horizonNote: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 10 },
});
