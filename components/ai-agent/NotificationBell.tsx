import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Bell, X, CalendarClock, UserCog, BarChart3, ShieldAlert } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAgentNotifications } from '@/hooks/useAgentDecisions';
import type { AgentNotification, AgentNotificationType } from '@/types/ai-agent';

const NOTIF_ICONS: Record<AgentNotificationType, typeof Bell> = {
  schedule_proposed: CalendarClock,
  profile_update_suggested: UserCog,
  weekly_report: BarChart3,
  rollback_alert: ShieldAlert,
};

const NOTIF_COLORS: Record<AgentNotificationType, string> = {
  schedule_proposed: Colors.primary,
  profile_update_suggested: '#D97706',
  weekly_report: '#059669',
  rollback_alert: '#DC2626',
};

export function NotificationBell() {
  const { t } = useSettings();
  const nt = t.aiAgent.notifications;
  const { notifications, unreadCount, markRead } = useAgentNotifications({ limit: 20 });
  const [showList, setShowList] = useState(false);

  const handlePress = (notif: AgentNotification) => {
    if (!notif.read) markRead(notif.id);
  };

  const renderItem = ({ item }: { item: AgentNotification }) => {
    const Icon = NOTIF_ICONS[item.type] || Bell;
    const color = NOTIF_COLORS[item.type] || Colors.textSecondary;

    return (
      <TouchableOpacity
        style={[s.notifItem, !item.read && s.notifUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[s.notifIcon, { backgroundColor: color + '15' }]}>
          <Icon size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.notifTitle}>{item.title}</Text>
          <Text style={s.notifMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={s.notifTime}>
            {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {!item.read && <View style={s.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity style={s.bellBtn} onPress={() => setShowList(true)}>
        <Bell size={22} color={Colors.text} />
        {unreadCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={showList} transparent animationType="fade" onRequestClose={() => setShowList(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowList(false)}>
          <View style={s.listContainer}>
            <View style={s.listHeader}>
              <Text style={s.listTitle}>{nt.title}</Text>
              <TouchableOpacity onPress={() => setShowList(false)}>
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {notifications.length === 0 ? (
              <Text style={s.emptyText}>{nt.noNotifications}</Text>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bellBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#DC2626', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 16 },
  listContainer: { backgroundColor: Colors.surface, borderRadius: 16, maxHeight: '70%', overflow: 'hidden' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  listTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 30 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifUnread: { backgroundColor: Colors.primaryLight + '30' },
  notifIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  notifTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  notifMessage: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },
  notifTime: { fontSize: 10, color: Colors.textSecondary, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
});
