import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Hand, Radio, RotateCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { ActiveOverrideState } from '@/hooks/useOverride';
import type { LiveData } from '@/types';
import type { TranslationKeys } from '@/locales';
import { formatPower } from '@/lib/format';

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

  // Stacked layout: the long release-button label (esp. PL) squeezed the
  // title into a one-word-per-line column when everything shared one row.
  return (
    <View style={[styles.banner, styles.bannerApp]}>
      <View style={styles.topRow}>
        <Hand size={16} color={Colors.primary} />
        <Text style={styles.titleApp} numberOfLines={1}>
          {ov.bannerTitleApp}
          {active.action ? ` — ${actionLabel}` : ''}
        </Text>
      </View>
      <Text style={styles.bodyApp}>
        {actualKw !== undefined
          ? `${ov.actualPower}: ${formatPower(actualKw)}`
          : active.requestedPowerKw !== undefined
            ? `${ov.requestedPower}: ${formatPower(active.requestedPowerKw)}`
            : ''}
        {active.remainingSec !== undefined
          ? `${actualKw !== undefined || active.requestedPowerKw !== undefined ? ' · ' : ''}${ov.remaining}: ${formatCountdown(active.remainingSec)}`
          : ''}
        {active.optimistic ? `  ·  ${ov.pendingConfirm}` : ''}
      </Text>
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerApp: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary + '55',
  },
  bannerScada: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: { width: 28, alignItems: 'center' },
  textWrap: { flex: 1 },
  titleApp: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.primary },
  bodyApp: { fontSize: 12, color: Colors.text, marginTop: 4 },
  titleScada: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  bodyScada: { fontSize: 12, color: '#92400E', marginTop: 2 },
  releaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    marginTop: 8,
  },
  releaseText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
