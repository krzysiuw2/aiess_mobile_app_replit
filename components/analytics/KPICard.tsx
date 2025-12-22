import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: any; // Lucide icon component
  color?: string;
}

export function KPICard({ title, value, subtitle, icon: Icon, color = Colors.primary }: KPICardProps) {
  return (
    <View style={[styles.container, { borderLeftColor: color }]}>
      <View style={styles.content}>
        {Icon && (
          <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <Icon size={20} color={color} />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    minHeight: 90,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  title: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: Colors.textLight,
  },
});

