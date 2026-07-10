import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CalendarClock, SunDim } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { LiveData } from '@/types';
import type { TranslationKeys } from '@/locales';

interface PlanChipsProps {
  liveData?: LiveData;
  t: TranslationKeys;
}

function formatAge(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

/**
 * Plan-state + PV-curtailment chips (display only). Each chip renders only
 * when its telemetry field is actually present — the ingest mapping is
 * rolling out separately, so absence simply hides the chip.
 */
export default function PlanChips({ liveData, t }: PlanChipsProps) {
  const planState = liveData?.planState;
  const pvCurtail = liveData?.pvCurtailActive;

  if (!planState && !pvCurtail) return null;

  const stateStyle =
    planState === 'active' ? styles.chipOk :
    planState === 'stale' ? styles.chipWarn :
    styles.chipError;
  const stateTextStyle =
    planState === 'active' ? styles.chipTextOk :
    planState === 'stale' ? styles.chipTextWarn :
    styles.chipTextError;
  const stateLabel =
    planState === 'active' ? t.monitor.planActive :
    planState === 'stale' ? t.monitor.planStale :
    t.monitor.planExpired;

  return (
    <View style={styles.row}>
      {planState && (
        <View style={[styles.chip, stateStyle]}>
          <CalendarClock size={12} color={StyleSheet.flatten(stateTextStyle).color as string} />
          <Text style={[styles.chipText, stateTextStyle]}>
            {stateLabel}
            {liveData?.planAgeSec !== undefined ? ` · ${formatAge(liveData.planAgeSec)}` : ''}
          </Text>
        </View>
      )}
      {pvCurtail && (
        <View style={[styles.chip, styles.chipWarn]}>
          <SunDim size={12} color="#92400E" />
          <Text style={[styles.chipText, styles.chipTextWarn]}>
            {liveData?.pvCurtailExportKwMax !== undefined
              ? t.monitor.pvCurtailWithLimit.replace('{kw}', String(liveData.pvCurtailExportKwMax))
              : t.monitor.pvCurtailActive}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipOk: { backgroundColor: 'rgba(34,197,94,0.12)' },
  chipTextOk: { color: '#15803d' },
  chipWarn: { backgroundColor: '#FEF3C7' },
  chipTextWarn: { color: '#92400E' },
  chipError: { backgroundColor: 'rgba(239,68,68,0.12)' },
  chipTextError: { color: Colors.error },
});
