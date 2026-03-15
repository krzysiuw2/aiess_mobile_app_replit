import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ROIProgressCardProps {
  title: string;
  currentSavings: number;
  capex: number;
  breakEvenDate?: string;
  color: string;
  installationDate?: string;
  t: any;
}

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

function formatBreakEvenLabel(dateStr: string | undefined, t: any): string {
  if (!dateStr || dateStr === 'N/A') return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function ROIProgressCard({
  title,
  currentSavings,
  capex,
  breakEvenDate,
  color,
  installationDate,
  t,
}: ROIProgressCardProps) {
  const pct = capex > 0 ? Math.min((currentSavings / capex) * 100, 100) : 0;
  const paidOff = pct >= 100;
  const breakEvenLabel = formatBreakEvenLabel(breakEvenDate, t);

  return (
    <View style={[styles.container, { borderLeftColor: color }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <TrendingUp size={18} color={color} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>

      <Text style={[styles.percentage, { color }]}>{pct.toFixed(1)}%</Text>

      <Text style={styles.savingsDetail}>
        {formatPLN(currentSavings)} PLN {t.financial?.of ?? 'of'} {formatPLN(capex)} PLN
      </Text>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>

      <Text style={styles.breakEvenText}>
        {paidOff
          ? (t.financial?.alreadyPaidOff ?? 'Already paid off!')
          : breakEvenLabel
            ? `${t.financial?.estimatedBreakEven ?? 'Estimated break-even'}: ${breakEvenLabel}`
            : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  percentage: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  savingsDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakEvenText: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 8,
  },
});
