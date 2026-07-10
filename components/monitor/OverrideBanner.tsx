import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Hand, Radio, RotateCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { ActiveOverrideState } from '@/hooks/useOverride';
import type { LiveData } from '@/types';
import type { TranslationKeys } from '@/locales';

interface OverrideBannerProps {
  active: ActiveOverrideState;
  liveData?: LiveData;
  /** UI-only gating per ADR 0009 — owner/admin may release. */
  canRelease: boolean;
  isSubmitting: boolean;
  onRelease: () => void;
  t: TranslationKeys;
}

function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function OverrideBanner({
  active,
  liveData,
  canRelease,
  isSubmitting,
  onRelease,
  t,
}: OverrideBannerProps) {
  const ov = t.override;

  if (active.source === 'scada') {
    return (
      <View style={[styles.banner, styles.bannerScada]}>
        <View style={styles.iconWrap}>
          <Radio size={18} color="#b45309" />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.titleScada}>{ov.bannerTitleScada}</Text>
          <Text style={styles.bodyScada}>{ov.bannerScadaBody}</Text>
        </View>
      </View>
    );
  }

  const actionLabel =
    active.action === 'charge' ? ov.actionCharge :
    active.action === 'discharge' ? ov.actionDischarge :
    active.action === 'standby' ? ov.actionStandby :
    ov.bannerTitleApp;

  // Prefer the ACTUAL setpoint from telemetry over the requested value —
  // guardrails/site limits may have capped the request.
  const actualKw = liveData?.controlSource === 'operator'
    ? liveData.activeRulePower
    : undefined;

  return (
    <View style={[styles.banner, styles.bannerApp]}>
      <View style={styles.iconWrap}>
        <Hand size={18} color={Colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.titleApp}>
          {ov.bannerTitleApp}
          {active.action ? ` — ${actionLabel}` : ''}
        </Text>
        <Text style={styles.bodyApp}>
          {actualKw !== undefined
            ? `${ov.actualPower}: ${actualKw} kW`
            : active.requestedPowerKw !== undefined
              ? `${ov.requestedPower}: ${active.requestedPowerKw} kW`
              : ''}
          {active.remainingSec !== undefined
            ? `${actualKw !== undefined || active.requestedPowerKw !== undefined ? ' · ' : ''}${ov.remaining}: ${formatCountdown(active.remainingSec)}`
            : ''}
        </Text>
        {active.optimistic && (
          <Text style={styles.pendingText}>{ov.pendingConfirm}</Text>
        )}
      </View>
      {canRelease && (
        <TouchableOpacity
          style={styles.releaseButton}
          onPress={onRelease}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <RotateCcw size={14} color={Colors.primary} />
              <Text style={styles.releaseText}>{ov.returnToAuto}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
  },
  bannerApp: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary + '55',
  },
  bannerScada: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  iconWrap: { width: 28, alignItems: 'center' },
  textWrap: { flex: 1 },
  titleApp: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  bodyApp: { fontSize: 12, color: Colors.text, marginTop: 2 },
  pendingText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  titleScada: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  bodyScada: { fontSize: 12, color: '#92400E', marginTop: 2 },
  releaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  releaseText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
