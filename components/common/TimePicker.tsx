/**
 * Bottom-sheet wheel-style HH:MM picker (5-minute steps).
 * Extracted from the schedule rule editor so it can be reused by the
 * notifications quiet-hours settings. `pickerStyles` is exported for the
 * sibling DatePicker in the schedule editor, which shares the same look.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import Colors from '@/constants/colors';

export interface TimePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (time: string) => void;
  initialTime?: string;
  title: string;
  doneLabel: string;
  hourLabel: string;
  minuteLabel: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

export default function TimePicker({
  visible,
  onClose,
  onSelect,
  initialTime,
  title,
  doneLabel,
  hourLabel,
  minuteLabel,
}: TimePickerProps) {
  const [hour, setHour] = useState(initialTime?.split(':')[0] || '12');
  const [minute, setMinute] = useState(initialTime?.split(':')[1] || '00');

  const handleConfirm = () => {
    onSelect(`${hour}:${minute}`);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide">
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>{title}</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={pickerStyles.doneButton}>{doneLabel}</Text>
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.pickerRow}>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{hourLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[pickerStyles.item, hour === h && pickerStyles.itemSelected]}
                    onPress={() => setHour(h)}
                  >
                    <Text style={[pickerStyles.itemText, hour === h && pickerStyles.itemTextSelected]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={pickerStyles.separator}>:</Text>
            <View style={pickerStyles.column}>
              <Text style={pickerStyles.columnLabel}>{minuteLabel}</Text>
              <ScrollView style={pickerStyles.scrollView} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[pickerStyles.item, minute === m && pickerStyles.itemSelected]}
                    onPress={() => setMinute(m)}
                  >
                    <Text style={[pickerStyles.itemText, minute === m && pickerStyles.itemTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  container: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontWeight: '600', color: Colors.text },
  doneButton: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  pickerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  column: { alignItems: 'center', marginHorizontal: 8 },
  columnLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  scrollView: { height: 180, width: 70 },
  item: { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderRadius: 8 },
  itemSelected: { backgroundColor: Colors.primaryLight },
  itemText: { fontSize: 20, color: Colors.text },
  itemTextSelected: { color: Colors.primary, fontWeight: '700' },
  separator: { fontSize: 28, fontWeight: '700', color: Colors.text, marginHorizontal: 4 },
});
