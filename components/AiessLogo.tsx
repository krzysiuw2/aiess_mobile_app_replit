import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface AiessLogoProps {
  size?: 'small' | 'medium' | 'large';
}

export default function AiessLogo({ size = 'large' }: AiessLogoProps) {
  const fontSize = size === 'large' ? 64 : size === 'medium' ? 48 : 32;
  
  return (
    <View style={styles.container}>
      <Text style={[styles.logo, { fontSize }]}>
        <Text style={styles.ai}>AI</Text>
        <Text style={styles.ess}>ESS</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontWeight: '700' as const,
    letterSpacing: -2,
  },
  ai: {
    color: Colors.primary,
  },
  ess: {
    color: Colors.text,
  },
});
