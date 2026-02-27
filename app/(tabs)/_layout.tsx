import { Tabs } from 'expo-router';
import {
  Network,
  Gauge,
  MessageSquare,
  CalendarClock,
  BarChart3,
  Settings,
} from 'lucide-react-native';
import React from 'react';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';

export default function TabLayout() {
  const { t } = useSettings();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500' as const,
        },
      }}
    >
      <Tabs.Screen
        name="devices"
        options={{
          title: t.tabs.devices,
          tabBarIcon: ({ color, size }) => <Network size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: t.tabs.monitor,
          tabBarIcon: ({ color, size }) => <Gauge size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: t.tabs.ai,
          tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t.tabs.schedule,
          tabBarIcon: ({ color, size }) => <CalendarClock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t.tabs.analytics,
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
