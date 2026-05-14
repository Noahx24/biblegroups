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
import { format, getDate, getMonth } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { formatWeek, weekStart } from '@/lib/week';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Profile, ScheduleSlot, VolunteerProgramme } from '@/types';

type Marked = Record<string, {
  selected?: boolean;
  selectedColor?: string;
  marked?: boolean;
  dotColor?: string;
  customStyles?: object;
}>;

type BirthdayProfile = Pick<Profile, 'id' | 'display_name' | 'birthday'>;

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
  const [showAssign, setShowAssign] = useState<{ date?: string } | null>(null);
  const [showProgrammes, setShowProgrammes] = useState(false);

  const load = useCallback(async () => {
    const [scheduleRes, profileRes, programmesRes] = await Promise.all([
      supabase
        .from('schedule')
        .select(
          '*, assignee:profiles(id, display_name, avatar_url), programme:volunteer_programmes(id, name, default_time)'
        )
        .eq('group_id', group.id)
        .gte('slot_date', weekStart())
        .order('slot_date', { ascending: true })
        .order('slot_time', { ascending: true, nullsFirst: false })
        .limit(52),
      supabase
        .from('group_members')
        .select('profiles(id, display_name, birthday)')
        .eq('group_id', group.id)
        .not('profiles.birthday', 'is', null),
      // Programmes only matter for volunteer groups. We always fetch them
      // (returns [] for class groups) to keep load() simple.
      supabase
        .from('volunteer_programmes')
        .select('*')
        .eq('group_id', group.id)
        .order('name', { ascending: true }),
    ]);

    if (scheduleRes.error) {
      Alert.alert('Error', scheduleRes.error.message);
      return;
    }
    setSlots((scheduleRes.data as unknown as ScheduleSlot[] | null) ?? []);
    const bdays = ((profileRes.data ?? []) as unknown as { profiles: BirthdayProfile[] }[])
      .flatMap(r => r.profiles)
      .filter((p): p is BirthdayProfile => !!p && !!p.birthday && p.birthday.trim().length > 0);
    setBirthdays(bdays);
    setProgrammes((programmesRes.data as VolunteerProgramme[] | null) ?? []);
  }, [group.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
        marked: true,
        dotColor,
        customStyles: {
          container: {
            backgroundColor: isMine ? colors.primaryLight : 'transparent',
            borderRadius: radius.sm,
            borderWidth: isMine ? 1 : 0,
            borderColor: isMine ? colors.primary : 'transparent',
          },
          text: {
            color: isMine ? colors.primaryDark : colors.text,
            fontWeight: '600',
          },
        },
      };
    }
    return m;
  }, [slots, userId]);

  // ── Class-group actions ────────────────────────────────────────────────────

  const addDate = async (date: string) => {
    setBusyDate(date);
    const { error } = await supabase
      .from('schedule')
      .insert({ group_id: group.id, slot_date: date, assignee_id: null, status: 'open' });
    setBusyDate(null);
    if (error) {
      Alert.alert('Could not add date', error.code === '23505'
        ? `${date} is already on the schedule.`
        : error.message);
      return;
    }
    await load();
  };

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
          const { data, error } = await supabase
            .from('schedule')
            .update({ assignee_id: userId, status: 'accepted' })
            .eq('id', slotId)
            .select();
          setBusyDate(null);
          if (error) { Alert.alert('Could not override', error.message); return; }
          if (!data || data.length === 0) Alert.alert('Could not override', 'Only admins can take a claimed slot.');
          await load();
        },
      },
    ]);
  };

  const removeSlot = (slot: ScheduleSlot) => {
    Alert.alert(
      'Remove this date?',
      `${formatWeek(slot.slot_date)}\n\nAny verse set for this date will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('schedule').delete().eq('id', slot.id);
            if (error) Alert.alert('Error', error.message);
            else await load();
          },
        },
      ],
    );
  };

  // ── Volunteer-group actions ────────────────────────────────────────────────

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
    if (!data || data.length === 0) {
      Alert.alert('Could not update', 'This slot may have been removed or reassigned. Pull to refresh.');
    }
    await load();
  };

  // ── Day-press handler ──────────────────────────────────────────────────────

  const onDayPress = (day: DateData) => {
    const date = day.dateString;
    if (date < weekStart()) {
      Alert.alert('Past date', 'Pick a date this week or later.');
      return;
    }
    const slot = slots.find(s => s.slot_date === date);

    if (!slot) {
      if (!isClass && isAdmin) {
        // Volunteer group admin: open the Assign Slot modal pre-filled with the date.
        setShowAssign({ date });
        return;
      }
      if (!isLeader) {
        Alert.alert('Not scheduled', 'A leader needs to add this date first.');
        return;
      }
      Alert.alert('Add to schedule?', formatWeek(date), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => addDate(date) },
      ]);
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
      if (isLeader) buttons.push({ text: 'Remove from schedule', style: 'destructive', onPress: () => removeSlot(slot) });

      const leaderLabel = open ? 'Open — no leader yet' : `Leader: ${slot.assignee?.display_name ?? 'Unknown'}`;
      Alert.alert(formatWeek(date), leaderLabel, buttons);
    } else {
      // Volunteer group
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
        { text: 'Close', style: 'cancel' },
      ];
      if (mine && slot.status !== 'accepted') buttons.push({ text: 'Accept', onPress: () => respondToSlot(slot.id, 'accepted') });
      if (mine && slot.status !== 'declined') buttons.push({ text: 'Decline', style: 'destructive', onPress: () => respondToSlot(slot.id, 'declined') });
      if (isLeader) buttons.push({ text: 'Remove from schedule', style: 'destructive', onPress: () => removeSlot(slot) });

      const statusLabel = STATUS_LABEL[slot.status] ?? slot.status;
      const assigneeLabel = slot.assignee?.display_name ?? (open ? 'Open' : 'Assigned');
      Alert.alert(formatWeek(date), `${assigneeLabel} · ${statusLabel}`, buttons);
    }
  };

  // ── Birthdays ──────────────────────────────────────────────────────────────

  const birthdaysThisMonth = useMemo(() => {
    const currentMonth = getMonth(new Date());
    const dayOfMonth = (iso: string): number | null => {
      const parts = iso.split('-');
      if (parts.length !== 3) return null;
      const d = Number(parts[2]);
      return Number.isFinite(d) ? d : null;
    };
    const monthOfYear = (iso: string): number | null => {
      const parts = iso.split('-');
      if (parts.length !== 3) return null;
      const m = Number(parts[1]);
      return Number.isFinite(m) ? m : null;
    };
    return birthdays
      .filter(b => {
        if (!b.birthday) return false;
        const m = monthOfYear(b.birthday);
        return m !== null && m - 1 === currentMonth;
      })
      .sort((a, b) => (dayOfMonth(a.birthday!) ?? 99) - (dayOfMonth(b.birthday!) ?? 99));
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.pageTitle}>Schedule</Text>
          {group.meeting_time ? (
            <Text style={styles.pageSubtitle}>{group.meeting_time}</Text>
          ) : null}
          {!isClass && isAdmin && (
            <View style={styles.adminActions}>
              <Pressable
                style={styles.adminBtn}
                onPress={() => setShowAssign({})}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.adminBtnText}>Assign slot</Text>
              </Pressable>
              <Pressable
                style={styles.adminBtn}
                onPress={() => setShowProgrammes(true)}
              >
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
                const day = getDate(new Date(b.birthday!.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '2000/$2/$3')));
                const monthName = format(new Date(2000, parseInt(b.birthday!.split('-')[1], 10) - 1, 1), 'MMMM');
                return (
                  <View key={b.id} style={[styles.birthdayRow, i < birthdaysThisMonth.length - 1 && styles.rowDivider]}>
                    <View style={styles.cakeBubble}>
                      <Text style={styles.cakeBubbleText}>🎂</Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.birthdayName}>{b.display_name ?? 'Member'}</Text>
                      <Text style={styles.birthdayDate}>{monthName} {day}</Text>
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
            {isLeader
              ? 'Tap any date on the calendar to add it to the schedule.'
              : 'No dates scheduled yet.'}
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
              return (
                <View key={s.id} style={styles.upcomingRow}>
                  <View style={[styles.upcomingBar, { backgroundColor: barColor }]} />
                  <View style={styles.flex1}>
                    <Text style={styles.upcomingDateLabel}>
                      {formatWeek(s.slot_date)}{timeShort ? ` · ${timeShort}` : ''}
                    </Text>
                    <Text style={[styles.upcomingLeader, mine && styles.upcomingLeaderMine]}>
                      {open ? 'Open slot' : (s.assignee?.display_name ?? 'Unknown')}
                    </Text>
                    {!!programmeName && (
                      <Text style={styles.upcomingProgramme}>{programmeName}</Text>
                    )}
                  </View>
                  {!isClass && !open && (
                    <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Text>
                    </View>
                  )}
                  {isClass && open && <Text style={[styles.upcomingTag, { color: colors.open }]}>Tap to claim</Text>}
                  {isClass && mine && <Text style={[styles.upcomingTag, { color: colors.primary }]}>You're leading</Text>}
                  {busy && <ActivityIndicator color={colors.primary} size="small" />}
                  <Text style={styles.chevron}>›</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

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
    </SafeAreaView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── ManageProgrammesModal ───────────────────────────────────────────────────

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
  const [defaultTime, setDefaultTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setDefaultTime('');
    }
  }, [visible]);

  const addProgramme = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert('Name required'); return; }
    const trimmedTime = defaultTime.trim();
    if (trimmedTime) {
      const tm = trimmedTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!tm) { Alert.alert('Bad time', 'Use HH:MM format (e.g. 11:00 or 19:30).'); return; }
      const hh = Number(tm[1]); const mins = Number(tm[2]);
      if (hh > 23 || mins > 59) { Alert.alert('Bad time', `${trimmedTime} isn't a real time.`); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('volunteer_programmes').insert({
      group_id: groupId,
      name: trimmedName,
      default_time: trimmedTime || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not add programme',
        error.code === '23505' ? `A programme called "${trimmedName}" already exists.` : error.message);
      return;
    }
    setName('');
    setDefaultTime('');
    onChanged();
  };

  const removeProgramme = (p: VolunteerProgramme) => {
    Alert.alert('Delete programme?', `${p.name} will be removed. Slots assigned to it will keep the time but lose the programme label.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('volunteer_programmes').delete().eq('id', p.id);
          if (error) Alert.alert('Could not delete', error.message);
          else onChanged();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Close</Text></Pressable>
          <Text style={styles.modalTitle}>Programmes</Text>
          <View style={{ minWidth: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.fieldLabel}>Add a programme</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Friday Night Youth"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.fieldLabel}>Default time (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={defaultTime}
            onChangeText={setDefaultTime}
            placeholder="HH:MM (e.g. 11:00)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
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

// ─── AssignSlotModal ─────────────────────────────────────────────────────────

type GroupMemberRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

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
  const [date, setDate] = useState(initialDate ?? '');
  const [time, setTime] = useState('');
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [pickedUserId, setPickedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDate('');
      setTime('');
      setProgrammeId(null);
      setPickedUserId(null);
      return;
    }
    setDate(initialDate ?? '');
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, profiles(id, display_name, email)')
        .eq('group_id', groupId);
      if (cancelled) return;
      if (error) {
        console.warn('member load failed', error);
        setMembers([]);
        return;
      }
      const rows: GroupMemberRow[] = (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        display_name: row.profiles?.display_name ?? null,
        email: row.profiles?.email ?? null,
      }));
      rows.sort((a, b) =>
        (a.display_name ?? a.email ?? '').localeCompare(b.display_name ?? b.email ?? '')
      );
      setMembers(rows);
    })();
    return () => { cancelled = true; };
  }, [visible, initialDate, groupId]);

  // When admin picks a programme, prefill the time with its default.
  const onPickProgramme = (p: VolunteerProgramme | null) => {
    setProgrammeId(p?.id ?? null);
    if (p?.default_time && !time.trim()) {
      setTime(String(p.default_time).slice(0, 5));
    }
  };

  const save = async () => {
    if (!date) { Alert.alert('Date required', 'Pick a date for the slot.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Bad date', 'Use YYYY-MM-DD.'); return; }
    // Detect overflowed dates (e.g. 2026-02-30 silently rolls to Mar 2).
    const [yy, mm, dd] = date.split('-').map(Number);
    const parsedDate = new Date(yy, mm - 1, dd);
    if (parsedDate.getFullYear() !== yy || parsedDate.getMonth() + 1 !== mm || parsedDate.getDate() !== dd) {
      Alert.alert('Bad date', `${date} isn't a real date.`);
      return;
    }
    if (date < weekStart()) { Alert.alert('Past date', 'Pick a date this week or later.'); return; }
    if (!pickedUserId) { Alert.alert('Member required', 'Pick a member to assign.'); return; }
    const trimmedTime = time.trim();
    if (trimmedTime) {
      const tm = trimmedTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!tm) { Alert.alert('Bad time', 'Use HH:MM format (e.g. 19:30).'); return; }
      const hh = Number(tm[1]); const mins = Number(tm[2]);
      if (hh > 23 || mins > 59) { Alert.alert('Bad time', `${trimmedTime} isn't a real time.`); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('schedule').insert({
      group_id: groupId,
      slot_date: date,
      slot_time: trimmedTime || null,
      programme_id: programmeId,
      assignee_id: pickedUserId,
      status: 'pending',
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not assign',
        error.code === '23505' ? 'A slot already exists at that date and time.' : error.message);
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
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            style={styles.textInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Time</Text>
          <TextInput
            style={styles.textInput}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM (e.g. 19:30)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Programme</Text>
          {programmes.length === 0 ? (
            <Text style={styles.progEmpty}>No programmes yet — add one from the Programmes button.</Text>
          ) : (
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
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md, paddingHorizontal: spacing.xl },

  // Admin header actions (volunteer groups)
  adminActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  adminBtnText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Modal-shared styles
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
});
