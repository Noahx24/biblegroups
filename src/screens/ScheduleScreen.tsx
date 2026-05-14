import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, type DateData } from 'react-native-calendars';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, getMonth } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { formatWeek, weekStart } from '@/lib/week';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { ScheduleSlot, VolunteerProgramme } from '@/types';

// ─── local types ──────────────────────────────────────────────────────────────

type Marked = Record<string, {
  selected?: boolean;
  selectedColor?: string;
  marked?: boolean;
  dotColor?: string;
  customStyles?: object;
}>;

type BirthdayProfile = {
  id: string;
  display_name: string | null;
  birth_month: number;
  birth_day: number;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
};

const STATUS_COLOR: Record<string, string> = {
  open: colors.open,
  pending: colors.accent,
  accepted: colors.success,
  declined: colors.rose,
};

// ─── conflict check ───────────────────────────────────────────────────────────
// Queries for any existing slot assigned to `assigneeId` on `date`.
// Returns true if the user confirmed or there is no conflict.

async function checkConflict(
  assigneeId: string,
  date: string,
  excludeSlotId?: string,
): Promise<boolean> {
  let query = supabase
    .from('schedule')
    .select('id, slot_time')
    .eq('slot_date', date)
    .eq('assignee_id', assigneeId);
  if (excludeSlotId) query = query.neq('id', excludeSlotId);
  const { data } = await query;
  if (!data || data.length === 0) return true;
  const times = data
    .map(s => (s.slot_time ? String(s.slot_time).slice(0, 5) : 'all day'))
    .join(', ');
  return new Promise<boolean>(resolve => {
    Alert.alert(
      'Schedule conflict',
      `This person is already assigned on ${formatWeek(date)} (${times}). Assign anyway?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Assign anyway', onPress: () => resolve(true) },
      ],
    );
  });
}

// ─── DatePickerField ──────────────────────────────────────────────────────────

function DatePickerField({
  label,
  value,
  minimumDate,
  onChange,
}: {
  label: string;
  value: Date | null;
  minimumDate?: Date;
  onChange: (date: Date) => void;
}) {
  const [showing, setShowing] = useState(false);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowing(false);
      if (_event.type === 'set' && selected) onChange(selected);
    } else {
      if (selected) onChange(selected);
    }
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={styles.pickerField}
        onPress={() => setShowing(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={value ? format(value, 'EEEE d MMMM yyyy') : 'Select date'}
      >
        <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
        <Text style={[styles.pickerFieldText, !value && styles.pickerFieldPlaceholder]}>
          {value ? format(value, 'EEE, d MMMM yyyy') : 'Tap to select date'}
        </Text>
        <Ionicons
          name={showing && Platform.OS === 'ios' ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textMuted}
        />
      </Pressable>
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

// ─── TimePickerField ──────────────────────────────────────────────────────────

function TimePickerField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;  // 'HH:MM'
  onChange: (time: string) => void;
  onClear: () => void;
}) {
  const [showing, setShowing] = useState(false);

  const pickerDate = useMemo(() => {
    const d = new Date();
    if (value) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  }, [value]);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    const toHHMM = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (Platform.OS === 'android') {
      setShowing(false);
      if (_event.type === 'set' && selected) onChange(toHHMM(selected));
    } else {
      if (selected) onChange(toHHMM(selected));
    }
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.timePickerRow}>
        <Pressable
          style={[styles.pickerField, { flex: 1 }]}
          onPress={() => setShowing(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={value ?? 'Set time (optional)'}
        >
          <Ionicons name="time-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.pickerFieldText, !value && styles.pickerFieldPlaceholder]}>
            {value ?? 'Optional — tap to set'}
          </Text>
          <Ionicons
            name={showing && Platform.OS === 'ios' ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </Pressable>
        {!!value && (
          <Pressable onPress={onClear} hitSlop={8} style={styles.clearTimeBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {showing && Platform.OS === 'ios' && (
        <View style={styles.inlinePicker}>
          <DateTimePicker
            mode="time"
            value={pickerDate}
            onChange={handleChange}
            display="spinner"
            is24Hour
            style={{ height: 180 }}
          />
          <Pressable style={styles.inlinePickerDone} onPress={() => setShowing(false)}>
            <Text style={styles.inlinePickerDoneText}>Done</Text>
          </Pressable>
        </View>
      )}
      {showing && Platform.OS === 'android' && (
        <DateTimePicker
          mode="time"
          value={pickerDate}
          onChange={handleChange}
          display="default"
          is24Hour
        />
      )}
    </View>
  );
}

// ─── AddClassSlotModal ────────────────────────────────────────────────────────
// Used by class-group leaders to add a new meeting date (with optional time).

function AddClassSlotModal({
  visible,
  initialDate,
  groupId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialDate: string;
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const minDate = useMemo(() => {
    const [y, m, d] = weekStart().split('-').map(Number);
    return new Date(y, m - 1, d);
  }, []);

  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const [y, m, d] = initialDate.split('-').map(Number);
      setDate(new Date(y, m - 1, d));
      setTime(null);
    }
  }, [visible, initialDate]);

  const save = async () => {
    if (!date) return;
    const isoDate = format(date, 'yyyy-MM-dd');
    if (isoDate < weekStart()) {
      Alert.alert('Past date', 'Pick a date this week or later.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('schedule').insert({
      group_id: groupId,
      slot_date: isoDate,
      slot_time: time ?? null,
      assignee_id: null,
      status: 'open',
    });
    setSaving(false);
    if (error) {
      Alert.alert(
        'Could not add date',
        error.code === '23505' ? `${formatWeek(isoDate)} is already on the schedule.` : error.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Add to schedule</Text>
          <Pressable onPress={save} disabled={saving || !date}>
            <Text style={[styles.modalAction, (saving || !date) && { opacity: 0.4 }]}>
              {saving ? '…' : 'Add'}
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <DatePickerField
            label="Date"
            value={date}
            minimumDate={minDate}
            onChange={setDate}
          />
          <TimePickerField
            label="Meeting time (optional)"
            value={time}
            onChange={setTime}
            onClear={() => setTime(null)}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── EditSlotModal ────────────────────────────────────────────────────────────
// Edit or delete an existing slot. Works for both class and volunteer groups.

type GroupMemberRow = { user_id: string; display_name: string | null; email: string | null };

function EditSlotModal({
  visible,
  slot,
  groupId,
  isClass,
  isAdmin,
  programmes,
  onClose,
  onSaved,
}: {
  visible: boolean;
  slot: ScheduleSlot | null;
  groupId: string;
  isClass: boolean;
  isAdmin: boolean;
  programmes: VolunteerProgramme[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const minDate = useMemo(() => {
    const [y, m, d] = weekStart().split('-').map(Number);
    return new Date(y, m - 1, d);
  }, []);

  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Populate fields when slot changes
  useEffect(() => {
    if (!visible || !slot) return;
    const [y, m, d] = slot.slot_date.split('-').map(Number);
    setDate(new Date(y, m - 1, d));
    setTime(slot.slot_time ? String(slot.slot_time).slice(0, 5) : null);
    setProgrammeId(slot.programme_id);
    setAssigneeId(slot.assignee_id);
    setNotes(slot.notes ?? '');
  }, [visible, slot]);

  // Load members for the assignee picker (only needed by admins)
  useEffect(() => {
    if (!visible || !isAdmin) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('group_members')
        .select('user_id, profiles(display_name, email)')
        .eq('group_id', groupId);
      if (cancelled) return;
      type Row = { user_id: string; profiles: { display_name: string | null; email: string | null } | null };
      const rows: GroupMemberRow[] = ((data ?? []) as unknown as Row[]).map(r => ({
        user_id: r.user_id,
        display_name: r.profiles?.display_name ?? null,
        email: r.profiles?.email ?? null,
      }));
      rows.sort((a, b) => (a.display_name ?? a.email ?? '').localeCompare(b.display_name ?? b.email ?? ''));
      if (!cancelled) setMembers(rows);
    })();
    return () => { cancelled = true; };
  }, [visible, isAdmin, groupId]);

  const save = async () => {
    if (!slot || !date) return;
    const isoDate = format(date, 'yyyy-MM-dd');
    if (isoDate < weekStart()) {
      Alert.alert('Past date', 'Pick a date this week or later.');
      return;
    }
    // Conflict check: warn about double-booking whenever the assignee, date,
    // or time changed. Time matters because the DB unique on
    // (group_id, slot_date, slot_time) only prevents two slots at the *same*
    // time — moving Bob's 10:00 to 14:30 on a day he's also at 14:00 is fine
    // for the index but still a double-booking.
    const assigneeChanged = assigneeId !== slot.assignee_id;
    const dateChanged = isoDate !== slot.slot_date;
    const currentTime = time ?? null;
    const originalTime = slot.slot_time ? String(slot.slot_time).slice(0, 5) : null;
    const timeChanged = currentTime !== originalTime;
    if (assigneeId && (assigneeChanged || dateChanged || timeChanged)) {
      const ok = await checkConflict(assigneeId, isoDate, slot.id);
      if (!ok) return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('schedule')
      .update({
        slot_date: isoDate,
        slot_time: time ?? null,
        programme_id: programmeId,
        assignee_id: assigneeId,
        notes: notes.trim() || null,
      })
      .eq('id', slot.id);
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    onSaved();
  };

  const deleteSlot = () => {
    if (!slot) return;
    Alert.alert(
      'Remove this slot?',
      `${formatWeek(slot.slot_date)}${slot.slot_time ? ` at ${String(slot.slot_time).slice(0, 5)}` : ''}\n\nAny verse set for this week will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('schedule').delete().eq('id', slot.id);
            if (error) Alert.alert('Error', error.message);
            else onSaved();
          },
        },
      ],
    );
  };

  if (!slot) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Edit slot</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.modalAction, saving && { opacity: 0.5 }]}>{saving ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">

          <DatePickerField
            label="Date"
            value={date}
            minimumDate={minDate}
            onChange={setDate}
          />
          <TimePickerField
            label="Time (optional)"
            value={time}
            onChange={setTime}
            onClear={() => setTime(null)}
          />

          {!isClass && programmes.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Programme</Text>
              <View style={styles.pickerRow}>
                <Pressable
                  style={[styles.pickerOption, programmeId === null && styles.pickerOptionActive]}
                  onPress={() => setProgrammeId(null)}
                >
                  <Text style={[styles.pickerOptionText, programmeId === null && styles.pickerOptionTextActive]}>
                    None
                  </Text>
                </Pressable>
                {programmes.map(p => (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerOption, programmeId === p.id && styles.pickerOptionActive]}
                    onPress={() => setProgrammeId(p.id)}
                  >
                    <Text style={[styles.pickerOptionText, programmeId === p.id && styles.pickerOptionTextActive]}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {isAdmin && members.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Assigned to</Text>
              <FlatList
                scrollEnabled={false}
                data={members}
                keyExtractor={m => m.user_id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.memberRow, assigneeId === item.user_id && styles.memberRowActive]}
                    onPress={() => setAssigneeId(item.user_id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{item.display_name ?? item.email ?? 'Member'}</Text>
                      {!!item.email && item.display_name && (
                        <Text style={styles.memberSubtle}>{item.email}</Text>
                      )}
                    </View>
                    {assigneeId === item.user_id && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
              {!!assigneeId && (
                <Pressable onPress={() => setAssigneeId(null)} style={styles.clearAssigneeBtn}>
                  <Text style={styles.clearAssigneeBtnText}>Clear assignment</Text>
                </Pressable>
              )}
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes for this slot…"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Pressable onPress={deleteSlot} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.deleteBtnText}>Remove this slot</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── AssignSlotModal ──────────────────────────────────────────────────────────
// Creates a new slot for a volunteer group with date/time pickers + conflict check.

function AssignSlotModal({
  visible,
  initialDate,
  groupId,
  programmes,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialDate?: string;
  groupId: string;
  programmes: VolunteerProgramme[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const minDate = useMemo(() => {
    const [y, m, d] = weekStart().split('-').map(Number);
    return new Date(y, m - 1, d);
  }, []);

  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [pickedUserId, setPickedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDate(null);
      setTime(null);
      setProgrammeId(null);
      setPickedUserId(null);
      return;
    }
    if (initialDate) {
      const [y, m, d] = initialDate.split('-').map(Number);
      setDate(new Date(y, m - 1, d));
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, profiles(display_name, email)')
        .eq('group_id', groupId);
      if (cancelled) return;
      if (error) { console.warn('member load failed', error); setMembers([]); return; }
      type Row = { user_id: string; profiles: { display_name: string | null; email: string | null } | null };
      const rows: GroupMemberRow[] = ((data ?? []) as unknown as Row[]).map(r => ({
        user_id: r.user_id,
        display_name: r.profiles?.display_name ?? null,
        email: r.profiles?.email ?? null,
      }));
      rows.sort((a, b) => (a.display_name ?? a.email ?? '').localeCompare(b.display_name ?? b.email ?? ''));
      if (!cancelled) setMembers(rows);
    })();
    return () => { cancelled = true; };
  }, [visible, initialDate, groupId]);

  const onPickProgramme = (p: VolunteerProgramme | null) => {
    setProgrammeId(p?.id ?? null);
    if (p?.default_time && !time) setTime(String(p.default_time).slice(0, 5));
  };

  const save = async () => {
    if (!date) { Alert.alert('Date required', 'Pick a date for the slot.'); return; }
    const isoDate = format(date, 'yyyy-MM-dd');
    if (isoDate < weekStart()) { Alert.alert('Past date', 'Pick a date this week or later.'); return; }
    if (!pickedUserId) { Alert.alert('Member required', 'Pick a member to assign.'); return; }

    const ok = await checkConflict(pickedUserId, isoDate);
    if (!ok) return;

    setSaving(true);
    const { error } = await supabase.from('schedule').insert({
      group_id: groupId,
      slot_date: isoDate,
      slot_time: time ?? null,
      programme_id: programmeId,
      assignee_id: pickedUserId,
      status: 'pending',
    });
    setSaving(false);
    if (error) {
      Alert.alert(
        'Could not assign',
        error.code === '23505' ? 'A slot already exists at that date and time.' : error.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Assign volunteer</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.modalAction, saving && { opacity: 0.5 }]}>{saving ? '…' : 'Assign'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <DatePickerField
            label="Date"
            value={date}
            minimumDate={minDate}
            onChange={setDate}
          />
          <TimePickerField
            label="Time (optional)"
            value={time}
            onChange={setTime}
            onClear={() => setTime(null)}
          />

          {programmes.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Programme</Text>
              <View style={styles.pickerRow}>
                <Pressable
                  style={[styles.pickerOption, programmeId === null && styles.pickerOptionActive]}
                  onPress={() => onPickProgramme(null)}
                >
                  <Text style={[styles.pickerOptionText, programmeId === null && styles.pickerOptionTextActive]}>None</Text>
                </Pressable>
                {programmes.map(p => (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerOption, programmeId === p.id && styles.pickerOptionActive]}
                    onPress={() => onPickProgramme(p)}
                  >
                    <Text style={[styles.pickerOptionText, programmeId === p.id && styles.pickerOptionTextActive]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>Volunteer</Text>
          {members.length === 0 ? (
            <Text style={styles.progEmpty}>No members in this group yet.</Text>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={members}
              keyExtractor={m => m.user_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.memberRow, pickedUserId === item.user_id && styles.memberRowActive]}
                  onPress={() => setPickedUserId(item.user_id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{item.display_name ?? item.email ?? 'Member'}</Text>
                    {!!item.email && item.display_name && (
                      <Text style={styles.memberSubtle}>{item.email}</Text>
                    )}
                  </View>
                  {pickedUserId === item.user_id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── ManageProgrammesModal ────────────────────────────────────────────────────

function ManageProgrammesModal({
  visible,
  groupId,
  programmes,
  onClose,
  onChanged,
}: {
  visible: boolean;
  groupId: string;
  programmes: VolunteerProgramme[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [defaultTime, setDefaultTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setName(''); setDefaultTime(null); }
  }, [visible]);

  const addProgramme = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert('Name required'); return; }
    setSaving(true);
    const { error } = await supabase.from('volunteer_programmes').insert({
      group_id: groupId,
      name: trimmedName,
      default_time: defaultTime ?? null,
    });
    setSaving(false);
    if (error) {
      Alert.alert(
        'Could not add programme',
        error.code === '23505' ? `A programme called "${trimmedName}" already exists.` : error.message,
      );
      return;
    }
    setName(''); setDefaultTime(null);
    onChanged();
  };

  const removeProgramme = (p: VolunteerProgramme) => {
    Alert.alert(
      'Delete programme?',
      `${p.name} will be removed. Slots assigned to it will keep the time but lose the programme label.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('volunteer_programmes').delete().eq('id', p.id);
            if (error) Alert.alert('Could not delete', error.message);
            else onChanged();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Close</Text></Pressable>
          <Text style={styles.modalTitle}>Programmes</Text>
          <View style={{ minWidth: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Programme name</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Friday Night Youth"
            placeholderTextColor={colors.textMuted}
          />
          <TimePickerField
            label="Default time (optional)"
            value={defaultTime}
            onChange={setDefaultTime}
            onClear={() => setDefaultTime(null)}
          />
          <Pressable
            onPress={addProgramme}
            disabled={saving || !name.trim()}
            style={[styles.adminBtn, { alignSelf: 'flex-start', marginTop: spacing.md, opacity: saving || !name.trim() ? 0.5 : 1 }]}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.adminBtnText}>{saving ? 'Adding…' : 'Add programme'}</Text>
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Existing programmes</Text>
          {programmes.length === 0 ? (
            <Text style={styles.progEmpty}>No programmes yet</Text>
          ) : (
            programmes.map(p => (
              <View key={p.id} style={styles.progRow}>
                <View style={styles.progRowInfo}>
                  <Text style={styles.progRowName}>{p.name}</Text>
                  {!!p.default_time && (
                    <Text style={styles.progRowMeta}>Default time {String(p.default_time).slice(0, 5)}</Text>
                  )}
                </View>
                <Pressable onPress={() => removeProgramme(p)} hitSlop={6}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── ScheduleScreen ───────────────────────────────────────────────────────────

export function ScheduleScreen() {
  const { session, isAdmin } = useAuth();
  const { group, myRole } = useGroup();
  const userId = session?.user.id;
  const isLeader = myRole === 'leader';
  const isClass = group.type === 'class';

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayProfile[]>([]);
  const [programmes, setProgrammes] = useState<VolunteerProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  // Modal state
  const [addClassModal, setAddClassModal] = useState<{ date: string } | null>(null);
  const [showAssign, setShowAssign] = useState<{ date?: string } | null>(null);
  const [showProgrammes, setShowProgrammes] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ScheduleSlot | null>(null);

  const load = useCallback(async () => {
    const [scheduleRes, profileRes, programmesRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('*, assignee:profiles(id, display_name, avatar_url), programme:volunteer_programmes(id, name, default_time)')
        .eq('group_id', group.id)
        .gte('slot_date', weekStart())
        .order('slot_date', { ascending: true })
        .order('slot_time', { ascending: true, nullsFirst: false })
        .limit(52),
      supabase
        .from('group_members')
        .select('profiles(id, display_name, birth_month, birth_day)')
        .eq('group_id', group.id)
        .not('profiles.birth_month', 'is', null),
      supabase
        .from('volunteer_programmes')
        .select('*')
        .eq('group_id', group.id)
        .order('name', { ascending: true }),
    ]);

    if (scheduleRes.error) { Alert.alert('Error', scheduleRes.error.message); return; }
    setSlots((scheduleRes.data as unknown as ScheduleSlot[] | null) ?? []);

    const bdays = ((profileRes.data ?? []) as unknown as { profiles: BirthdayProfile[] }[])
      .flatMap(r => r.profiles)
      .filter((p): p is BirthdayProfile => !!p && p.birth_month != null && p.birth_day != null);
    setBirthdays(bdays);
    setProgrammes((programmesRes.data as VolunteerProgramme[] | null) ?? []);
  }, [group.id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime('schedule', load, `group_id=eq.${group.id}`);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markedDates = useMemo<Marked>(() => {
    const m: Marked = {};
    for (const s of slots) {
      const isMine = s.assignee_id === userId;
      const isTaken = !!s.assignee_id && !isMine;
      const dotColor = isMine ? colors.primary : isTaken ? colors.accent : colors.open;
      m[s.slot_date] = {
        marked: true, dotColor,
        customStyles: {
          container: {
            backgroundColor: isMine ? colors.primaryLight : 'transparent',
            borderRadius: radius.sm,
            borderWidth: isMine ? 1 : 0,
            borderColor: isMine ? colors.primary : 'transparent',
          },
          text: { color: isMine ? colors.primaryDark : colors.text, fontWeight: '600' },
        },
      };
    }
    return m;
  }, [slots, userId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const claim = async (slotId: string) => {
    if (!userId) return;
    setBusyDate(slotId);
    const { data, error } = await supabase
      .from('schedule')
      .update({ assignee_id: userId, status: 'accepted' })
      .eq('id', slotId)
      .is('assignee_id', null)
      .select();
    setBusyDate(null);
    if (error) { Alert.alert('Could not claim', error.message); return; }
    if (!data || data.length === 0) Alert.alert('Already taken', 'Someone else just claimed this slot.');
    await load();
  };

  const release = async (slotId: string) => {
    setBusyDate(slotId);
    const { data, error } = await supabase
      .from('schedule')
      .update({ assignee_id: null, status: 'open' })
      .eq('id', slotId)
      .eq('assignee_id', userId)
      .select();
    setBusyDate(null);
    if (error) { Alert.alert('Could not release', error.message); return; }
    if (!data || data.length === 0) Alert.alert('Could not release', 'You can only release a slot you own.');
    await load();
  };

  const overrideClaim = async (slotId: string, currentLeaderName: string | null) => {
    if (!userId) return;
    Alert.alert('Override claim?', `Take this slot from ${currentLeaderName ?? 'the current leader'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Override', style: 'destructive',
        onPress: async () => {
          setBusyDate(slotId);
          const { error } = await supabase
            .from('schedule')
            .update({ assignee_id: userId, status: 'accepted' })
            .eq('id', slotId);
          setBusyDate(null);
          if (error) Alert.alert('Could not override', error.message);
          await load();
        },
      },
    ]);
  };

  const respondToSlot = async (slotId: string, status: 'accepted' | 'declined') => {
    setBusyDate(slotId);
    const { data, error } = await supabase
      .from('schedule')
      .update({ status })
      .eq('id', slotId)
      .eq('assignee_id', userId)
      .select();
    setBusyDate(null);
    if (error) { Alert.alert('Error', error.message); await load(); return; }
    if (!data || data.length === 0) Alert.alert('Could not update', 'This slot may have been removed or reassigned.');
    await load();
  };

  // ── Day-press handler ────────────────────────────────────────────────────────

  const onDayPress = (day: DateData) => {
    const date = day.dateString;
    if (date < weekStart()) { Alert.alert('Past date', 'Pick a date this week or later.'); return; }
    const slot = slots.find(s => s.slot_date === date);

    if (!slot) {
      if (!isClass && isAdmin) { setShowAssign({ date }); return; }
      if (!isLeader && !isAdmin) { Alert.alert('Not scheduled', 'A leader needs to add this date first.'); return; }
      setAddClassModal({ date });
      return;
    }

    const mine = slot.assignee_id === userId;
    const open = !slot.assignee_id;
    const someoneElse = !!slot.assignee_id && !mine;

    if (isClass) {
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
        { text: 'Close', style: 'cancel' },
      ];
      if (open && isLeader) buttons.push({ text: "I'll lead", onPress: () => claim(slot.id) });
      if (mine) buttons.push({ text: 'Release', style: 'destructive', onPress: () => release(slot.id) });
      if (someoneElse && isAdmin) {
        buttons.push({
          text: 'Override (assign to me)', style: 'destructive',
          onPress: () => overrideClaim(slot.id, slot.assignee?.display_name ?? null),
        });
      }
      if (isLeader || isAdmin) {
        buttons.push({ text: 'Edit slot', onPress: () => setEditingSlot(slot) });
      }
      const leaderLabel = open ? 'Open — no leader yet' : `Leader: ${slot.assignee?.display_name ?? 'Unknown'}`;
      Alert.alert(formatWeek(date), leaderLabel, buttons);
    } else {
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
        { text: 'Close', style: 'cancel' },
      ];
      // Once a volunteer accepts, the commitment is sealed — only admins
      // can change the schedule from here on. Decline is offered only while
      // the slot is still pending. Accept can still be offered to a
      // volunteer who previously declined, before they commit.
      if (mine && slot.status !== 'accepted') buttons.push({ text: 'Accept', onPress: () => respondToSlot(slot.id, 'accepted') });
      if (mine && slot.status === 'pending') buttons.push({ text: 'Decline', style: 'destructive', onPress: () => respondToSlot(slot.id, 'declined') });
      if (isAdmin) buttons.push({ text: 'Edit slot', onPress: () => setEditingSlot(slot) });
      const statusLabel = STATUS_LABEL[slot.status] ?? slot.status;
      const assigneeLabel = slot.assignee?.display_name ?? (open ? 'Open' : 'Assigned');
      Alert.alert(formatWeek(date), `${assigneeLabel} · ${statusLabel}`, buttons);
    }
  };

  // ── Birthdays ────────────────────────────────────────────────────────────────

  const birthdaysThisMonth = useMemo(() => {
    const currentMonth = getMonth(new Date()) + 1; // getMonth is 0-indexed
    return birthdays
      .filter(b => b.birth_month === currentMonth)
      .sort((a, b) => a.birth_day - b.birth_day);
  }, [birthdays]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const markedWithToday: Marked = {
    ...markedDates,
    [today]: {
      ...(markedDates[today] ?? {}),
      selected: true,
      selectedColor: markedDates[today] ? colors.primaryLight : colors.background,
    },
  };

  const minMonth = weekStart().slice(0, 7);
  const disableArrowLeft = displayMonth <= minMonth;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.pageTitle}>Schedule</Text>
          {group.meeting_time ? <Text style={styles.pageSubtitle}>{group.meeting_time}</Text> : null}
          {!isClass && isAdmin && (
            <View style={styles.adminActions}>
              <Pressable style={styles.adminBtn} onPress={() => setShowAssign({})}>
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.adminBtnText}>Assign slot</Text>
              </Pressable>
              <Pressable style={styles.adminBtn} onPress={() => setShowProgrammes(true)}>
                <Ionicons name="list" size={16} color={colors.primary} />
                <Text style={styles.adminBtnText}>Programmes</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.calendarCard}>
          <Calendar
            minDate={weekStart()}
            markingType="custom"
            markedDates={markedWithToday}
            onDayPress={onDayPress}
            onMonthChange={m => setDisplayMonth(`${m.year}-${String(m.month).padStart(2, '0')}`)}
            disableArrowLeft={disableArrowLeft}
            theme={{
              calendarBackground: colors.surface,
              textSectionTitleColor: colors.textMuted,
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: colors.borderSoft,
              arrowColor: colors.text,
              monthTextColor: colors.text,
              textMonthFontWeight: '600',
              textMonthFontSize: 18,
              textDayFontWeight: '500',
              textDayHeaderFontWeight: '700',
              textDayHeaderFontSize: 10.5,
            }}
            style={styles.calendar}
          />
          <View style={styles.legend}>
            <LegendDot color={colors.open} label="Open" />
            <LegendDot color={colors.primary} label="You" />
            <LegendDot color={colors.accent} label="Taken" />
            {birthdaysThisMonth.length > 0 && (
              <View style={styles.legendItem}>
                <Text style={styles.cakeEmoji}>🎂</Text>
                <Text style={styles.legendLabel}>Birthday</Text>
              </View>
            )}
          </View>
        </View>

        {birthdaysThisMonth.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Birthdays this month</Text>
            <View style={[styles.card, styles.birthdayCard]}>
              {birthdaysThisMonth.map((b, i) => {
                const monthName = format(new Date(2000, b.birth_month - 1, 1), 'MMMM');
                return (
                  <View key={b.id} style={[styles.birthdayRow, i < birthdaysThisMonth.length - 1 && styles.rowDivider]}>
                    <View style={styles.cakeBubble}>
                      <Text style={styles.cakeBubbleText}>🎂</Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.birthdayName}>{b.display_name ?? 'Member'}</Text>
                      <Text style={styles.birthdayDate}>{monthName} {b.birth_day}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Upcoming</Text>
        {slots.length === 0 ? (
          <Text style={styles.empty}>
            {isLeader ? 'Tap any date on the calendar to add it to the schedule.' : 'No dates scheduled yet.'}
          </Text>
        ) : (
          <View style={styles.upcomingList}>
            {slots.map(s => {
              const mine = s.assignee_id === userId;
              const open = !s.assignee_id;
              const busy = busyDate === s.id;
              const barColor = mine ? colors.primary : open ? colors.open : colors.accent;
              const statusColor = STATUS_COLOR[s.status] ?? colors.textMuted;
              const timeShort = s.slot_time ? String(s.slot_time).slice(0, 5) : null;
              const programmeName = s.programme?.name ?? null;
              const canEdit = isAdmin || isLeader;

              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [styles.upcomingRow, pressed && canEdit && { opacity: 0.85 }]}
                  onPress={canEdit ? () => setEditingSlot(s) : undefined}
                  accessibilityRole={canEdit ? 'button' : undefined}
                >
                  <View style={[styles.upcomingBar, { backgroundColor: barColor }]} />
                  <View style={styles.flex1}>
                    <Text style={styles.upcomingDateLabel}>
                      {formatWeek(s.slot_date)}{timeShort ? ` · ${timeShort}` : ''}
                    </Text>
                    <Text style={[styles.upcomingLeader, mine && styles.upcomingLeaderMine]}>
                      {open ? 'Open slot' : (s.assignee?.display_name ?? 'Unknown')}
                    </Text>
                    {!!programmeName && <Text style={styles.upcomingProgramme}>{programmeName}</Text>}
                  </View>
                  {!isClass && mine && s.status === 'pending' ? (
                    // Inline respond actions for the assignee. Nested
                    // Pressables prevent the row's onPress from also firing.
                    <View style={styles.respondRow}>
                      <Pressable
                        onPress={() => respondToSlot(s.id, 'accepted')}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.respondBtn, styles.respondAccept,
                          pressed && styles.respondPressed, busy && { opacity: 0.5 },
                        ]}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Accept this slot"
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.respondBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => respondToSlot(s.id, 'declined')}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.respondBtn, styles.respondDecline,
                          pressed && styles.respondPressed, busy && { opacity: 0.5 },
                        ]}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Decline this slot"
                      >
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                  ) : !isClass && mine && s.status === 'declined' ? (
                    // After declining, let them flip back to accepting.
                    <Pressable
                      onPress={() => respondToSlot(s.id, 'accepted')}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.respondBtn, styles.respondAccept,
                        pressed && styles.respondPressed, busy && { opacity: 0.5 },
                      ]}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Change mind and accept"
                    >
                      <Ionicons name="refresh" size={14} color="#fff" />
                      <Text style={styles.respondBtnText}>Accept</Text>
                    </Pressable>
                  ) : !isClass && !open ? (
                    <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Text>
                    </View>
                  ) : null}
                  {isClass && open && <Text style={[styles.upcomingTag, { color: colors.open }]}>Tap to claim</Text>}
                  {isClass && mine && <Text style={[styles.upcomingTag, { color: colors.primary }]}>You're leading</Text>}
                  {busy && <ActivityIndicator color={colors.primary} size="small" />}
                  {canEdit && <Ionicons name="create-outline" size={16} color={colors.textMutedSoft} />}
                  {!canEdit && <Text style={styles.chevron}>›</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {isClass && addClassModal !== null && (
        <AddClassSlotModal
          visible
          initialDate={addClassModal.date}
          groupId={group.id}
          onClose={() => setAddClassModal(null)}
          onSaved={() => { setAddClassModal(null); load(); }}
        />
      )}

      {!isClass && isAdmin && (
        <>
          <AssignSlotModal
            visible={showAssign !== null}
            initialDate={showAssign?.date}
            groupId={group.id}
            programmes={programmes}
            onClose={() => setShowAssign(null)}
            onSaved={() => { setShowAssign(null); load(); }}
          />
          <ManageProgrammesModal
            visible={showProgrammes}
            groupId={group.id}
            programmes={programmes}
            onClose={() => setShowProgrammes(false)}
            onChanged={() => { load(); }}
          />
        </>
      )}

      <EditSlotModal
        visible={editingSlot !== null}
        slot={editingSlot}
        groupId={group.id}
        isClass={isClass}
        isAdmin={isAdmin}
        programmes={programmes}
        onClose={() => setEditingSlot(null)}
        onSaved={() => { setEditingSlot(null); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── LegendDot ────────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  flex1: { flex: 1 },

  sectionHeader: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  pageTitle: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.4, lineHeight: 34 },
  pageSubtitle: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },

  calendarCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card,
    overflow: 'hidden', padding: spacing.sm,
  },
  calendar: { borderRadius: radius.md },
  legend: {
    flexDirection: 'row', justifyContent: 'center', gap: 18,
    paddingVertical: 14, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft,
    marginTop: 4, flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 7, height: 7, borderRadius: 999 },
  legendLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.3 },
  cakeEmoji: { fontSize: 12 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted,
    textTransform: 'uppercase', marginTop: 24, marginBottom: 10, paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card,
  },
  birthdayCard: { paddingHorizontal: spacing.lg, paddingVertical: 6 },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  cakeBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C26A7C1A', alignItems: 'center', justifyContent: 'center' },
  cakeBubbleText: { fontSize: 18 },
  birthdayName: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: -0.1, lineHeight: 20 },
  birthdayDate: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.textMutedSoft, lineHeight: 22 },

  upcomingList: { paddingHorizontal: spacing.lg, gap: 8 },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card,
  },
  upcomingBar: { width: 8, height: 38, borderRadius: 4, flexShrink: 0 },
  upcomingDateLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.2, marginBottom: 2 },
  upcomingLeader: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.1 },
  upcomingLeaderMine: { color: colors.primaryDark },
  upcomingProgramme: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  upcomingTag: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  respondRow: { flexDirection: 'row', gap: 6 },
  respondBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1,
  },
  respondAccept: { backgroundColor: colors.success, borderColor: colors.success },
  respondDecline: { backgroundColor: colors.surface, borderColor: colors.danger },
  respondPressed: { opacity: 0.7 },
  respondBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md, paddingHorizontal: spacing.xl },

  adminActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  adminBtnText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Shared modal styles
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.text },
  modalCancel: { fontSize: 15, color: colors.textMuted, minWidth: 60 },
  modalAction: { fontSize: 15, color: colors.primary, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  modalBody: { padding: spacing.lg, gap: spacing.sm },

  fieldLabel: {
    fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2,
    color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 15, color: colors.text,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },

  // DatePickerField / TimePickerField
  pickerField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm + 2,
  },
  pickerFieldText: { flex: 1, fontSize: 15, color: colors.text },
  pickerFieldPlaceholder: { color: colors.textMuted },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearTimeBtn: { padding: 4 },
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

  // Programme picker
  pickerRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  pickerOption: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pickerOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  pickerOptionTextActive: { color: colors.primary },

  // Programme list rows
  progRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  progRowInfo: { flex: 1 },
  progRowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  progRowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  progEmpty: { padding: spacing.lg, fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  // Member picker
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm + 2, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft,
  },
  memberRowActive: { backgroundColor: colors.primaryLight, borderRadius: radius.sm },
  memberName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  memberSubtle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  clearAssigneeBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  clearAssigneeBtnText: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },

  // Delete button in EditSlotModal
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft,
  },
  deleteBtnText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
});
