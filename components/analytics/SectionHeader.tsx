import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Icons from 'lucide-react-native';
import Colors from '@/constants/colors';

interface SectionHeaderProps {
  title: string;
  icon?: keyof typeof Icons;
}

export function SectionHeader({ title, icon }: SectionHeaderProps) {
  const Icon = icon ? Icons[icon] : null;
  
  return (
    <View style={styles.container}>
      {Icon && <Icon size={18} color={Colors.primary} />}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});

