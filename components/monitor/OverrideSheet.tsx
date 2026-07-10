import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BatteryCharging, Battery, Pause } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { OverrideValidationError, OVERRIDE_TTL_MAX_SEC } from '@/lib/aws-override';
import type { OverrideAction } from '@/types';
import type { TranslationKeys } from '@/locales';

type IssueAction = Exclude<OverrideAction, 'auto'>;

interface OverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onIssue: (req: { action: IssueAction; powerKw?: number; ttlSec: number; reason?: string }) => Promise<void>;
  maxChargeKw?: number;
  maxDischargeKw?: number;
  t: TranslationKeys;
}

const TTL_PRESETS: { sec: number; key: 'ttl15m' | 'ttl1h' | 'ttl4h' | 'ttl24h' }[] = [
  { sec: 15 * 60, key: 'ttl15m' },
  { sec: 60 * 60, key: 'ttl1h' },
  { sec: 4 * 60 * 60, key: 'ttl4h' },
  { sec: OVERRIDE_TTL_MAX_SEC, key: 'ttl24h' },
];

export default function OverrideSheet({
  visible,
  onClose,
  isSubmitting,
  onIssue,
  maxChargeKw,
  maxDischargeKw,
  t,
}: OverrideSheetProps) {
  const ov = t.override;
  const [action, setAction] = useState<IssueAction>('charge');
  const [power, setPower] = useState('50');
  const [ttlSec, setTtlSec] = useState(60 * 60);
  const [reason, setReason] = useState('');

  if (!visible) return null;

  const maxKw = action === 'charge' ? maxChargeKw : action === 'discharge' ? maxDischargeKw : undefined;

  const handleIssue = async () => {
    // power_kw is a MAGNITUDE (>= 0); direction comes from the action.
    const powerKw = action === 'standby' ? undefined : parseFloat(power);
    if (action !== 'standby' && (powerKw === undefined || isNaN(powerKw) || powerKw < 0)) {
      Alert.alert(t.common.error, ov.invalidPower);
      return;
    }
    try {
      await onIssue({
        action,
        powerKw,
        ttlSec,
        reason: reason.trim() || undefined,
      });
      onClose();
    } catch (err) {
      // Surface the Lambda's 400 `error` field verbatim.
      const message = err instanceof OverrideValidationError
        ? err.message
        : ov.failed;
      Alert.alert(t.common.error, message);
    }
  };

  const ACTIONS: { value: IssueAction; label: string; Icon: typeof Battery }[] = [
    { value: 'charge', label: ov.actionCharge, Icon: BatteryCharging },
    { value: 'discharge', label: ov.actionDischarge, Icon: Battery },
    { value: 'standby', label: ov.actionStandby, Icon: Pause },
  ];

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{ov.sheetTitle}</Text>
          <Text style={styles.subtitle}>{ov.sheetSubtitle}</Text>

          {/* Action */}
          <Text style={styles.label}>{ov.action}</Text>
          <View style={styles.actionRow}>
            {ACTIONS.map(({ value, label, Icon }) => (
              <TouchableOpacity
                key={value}
                style={[styles.actionChip, action === value && styles.actionChipActive]}
                onPress={() => setAction(value)}
              >
                <Icon size={16} color={action === value ? '#fff' : Colors.textSecondary} />
                <Text style={[styles.actionChipText, action === value && styles.actionChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Power */}
          {action !== 'standby' && (
            <>
              <Text style={styles.label}>{ov.powerKw}</Text>
              <TextInput
                style={styles.input}
                value={power}
                onChangeText={(v) => setPower(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={Colors.textSecondary}
              />
              {maxKw !== undefined && (
                <Text style={styles.hint}>max: {maxKw} kW</Text>
              )}
            </>
          )}

          {/* TTL */}
          <Text style={styles.label}>{ov.duration}</Text>
          <View style={styles.actionRow}>
            {TTL_PRESETS.map(({ sec, key }) => (
              <TouchableOpacity
                key={key}
                style={[styles.ttlChip, ttlSec === sec && styles.actionChipActive]}
                onPress={() => setTtlSec(sec)}
              >
                <Text style={[styles.actionChipText, ttlSec === sec && styles.actionChipTextActive]}>
                  {ov[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reason */}
          <Text style={styles.label}>{ov.reasonLabel}</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder={ov.reasonPlaceholder}
            placeholderTextColor={Colors.textSecondary}
            maxLength={120}
          />

          <TouchableOpacity
            style={styles.issueButton}
            onPress={handleIssue}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.issueButtonText}>{ov.issueButton}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 14, marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  ttlChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  actionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actionChipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  hint: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  issueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  issueButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelButtonText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
