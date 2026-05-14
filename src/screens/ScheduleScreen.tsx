import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, type DateData } from 'react-native-calendars';
import { format, getDate, getMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { formatWeek, weekStart } from '@/lib/week';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Profile, ScheduleSlot } from '@/types';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const load = useCallback(async () => {
    const [scheduleRes, profileRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('*, assignee:profiles(id, display_name, avatar_url)')
        .eq('group_id', group.id)
        .gte('slot_date', weekStart())
        .order('slot_date', { ascending: true })
        .limit(52),
      supabase
        .from('group_members')
        .select('profiles(id, display_name, birthday)')
        .eq('group_id', group.id)
        .not('profiles.birthday', 'is', null),
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

              return (
                <View key={s.id} style={styles.upcomingRow}>
                  <View style={[styles.upcomingBar, { backgroundColor: barColor }]} />
                  <View style={styles.flex1}>
                    <Text style={styles.upcomingDateLabel}>{formatWeek(s.slot_date)}</Text>
                    <Text style={[styles.upcomingLeader, mine && styles.upcomingLeaderMine]}>
                      {open ? 'Open slot' : (s.assignee?.display_name ?? 'Unknown')}
                    </Text>
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
  upcomingTag: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md, paddingHorizontal: spacing.xl },
});
