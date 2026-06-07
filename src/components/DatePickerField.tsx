import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, radius, spacing } from '@/theme';

/**
 * Tappable date field with an inline (iOS) / dialog (Android) date picker.
 * Extracted from ScheduleScreen so the schedule and youth-programme modals
 * share one implementation.
 */
export function DatePickerField({
  label,
  value,
  minimumDate,
  placeholder = 'Tap to select date',
  onChange,
  onClear,
}: {
  label: string;
  value: Date | null;
  minimumDate?: Date;
  placeholder?: string;
  onChange: (date: Date) => void;
  onClear?: () => void;
}) {
  const [showing, setShowing] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowing(false);
      if (event.type === 'set' && selected) onChange(selected);
    } else if (selected) {
      onChange(selected);
    }
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.pickerField, { flex: 1 }]}
          onPress={() => setShowing(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={value ? format(value, 'EEEE d MMMM yyyy') : placeholder}
        >
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.pickerFieldText, !value && styles.pickerFieldPlaceholder]}>
            {value ? format(value, 'EEE, d MMMM yyyy') : placeholder}
          </Text>
          <Ionicons
            name={showing && Platform.OS === 'ios' ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </Pressable>
        {!!value && onClear && (
          <Pressable onPress={onClear} hitSlop={8} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {showing && Platform.OS === 'ios' && (
        <View style={styles.inlinePicker}>
          <DateTimePicker
            mode="date"
            value={value ?? new Date()}
            minimumDate={minimumDate}
            onChange={handleChange}
            display="spinner"
            style={{ height: 180 }}
          />
          <Pressable style={styles.inlinePickerDone} onPress={() => setShowing(false)}>
            <Text style={styles.inlinePickerDoneText}>Done</Text>
          </Pressable>
        </View>
      )}
      {showing && Platform.OS === 'android' && (
        <DateTimePicker
          mode="date"
          value={value ?? new Date()}
          minimumDate={minimumDate}
          onChange={handleChange}
          display="default"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2,
    color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickerField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm + 2,
  },
  pickerFieldText: { flex: 1, fontSize: 15, color: colors.text },
  pickerFieldPlaceholder: { color: colors.textMuted },
  clearBtn: { padding: 4 },
  inlinePicker: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft,
    borderRadius: radius.md, marginTop: 4, overflow: 'hidden',
  },
  inlinePickerDone: {
    alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft,
  },
  inlinePickerDoneText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
