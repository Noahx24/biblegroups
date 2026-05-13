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
import { format, getMonth, getDate } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { formatWeek, weekStart } from '@/lib/week';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Profile, ScheduleEntry } from '@/types';

type Marked = Record<string, {
  selected?: boolean;
  selectedColor?: string;
  marked?: boolean;
  dotColor?: string;
  customStyles?: object;
}>;

type BirthdayProfile = Pick<Profile, 'id' | 'display_name' | 'birthday'>;

export function ScheduleScreen() {
  const { session, isLeader, isAdmin } = useAuth();
  const userId = session?.user.id;
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  // Tracked so we can disable the left arrow when the user is already at the
  // earliest reachable month (this week's month). Initialised from today so
  // it matches the calendar's initial render.
  const [displayMonth, setDisplayMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const load = useCallback(async () => {
    const [scheduleRes, profileRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
        .gte('week_start', weekStart())
        .order('week_start', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, birthday')
        .not('birthday', 'is', null),
    ]);
    if (scheduleRes.error) {
      Alert.alert('Error', scheduleRes.error.message);
      return;
    }
    setEntries((scheduleRes.data as unknown as ScheduleEntry[] | null) ?? []);
    setBirthdays((profileRes.data as BirthdayProfile[] | null) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtime('schedule', load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markedDates = useMemo<Marked>(() => {
    const m: Marked = {};
    for (const e of entries) {
      const isMine = e.leader_id && e.leader_id === userId;
      const isTaken = e.leader_id && e.leader_id !== userId;
      const dotColor = isMine ? colors.primary : isTaken ? colors.accent : colors.open;
      m[e.week_start] = {
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
  }, [entries, userId]);

  const addDate = async (date: string) => {
    setBusyDate(date);
    const { error } = await supabase
      .from('schedule')
      .insert({ week_start: date, leader_id: null });
    setBusyDate(null);
    if (error) {
      const msg = error.code === '23505'
        ? `${date} is already on the schedule.`
        : error.message;
      Alert.alert('Could not add date', msg);
      return;
    }
    await load();
  };

  const claim = async (date: string) => {
    if (!userId) return;
    setBusyDate(date);
    const { data, error } = await supabase
      .from('schedule')
      .update({ leader_id: userId })
      .eq('week_start', date)
      .is('leader_id', null)
      .select();
    setBusyDate(null);
    if (error) {
      Alert.alert('Could not claim', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Already taken', 'Someone else just claimed this slot.');
    }
    await load();
  };

  // Admin-only: take a slot already claimed by someone else. RLS policy
  // schedule_update_leader's WITH CHECK only permits leader_id reassignment
  // for admins, so non-admin leaders calling this would hit a 0-row update
  // and the silent-fail guard below would surface a clear message.
  const overrideClaim = async (date: string, currentLeaderName: string | null) => {
    if (!userId) return;
    Alert.alert(
      'Override claim?',
      `Take this slot from ${currentLeaderName ?? 'the current leader'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Override',
          style: 'destructive',
          onPress: async () => {
            setBusyDate(date);
            const { data, error } = await supabase
              .from('schedule')
              .update({ leader_id: userId })
              .eq('week_start', date)
              .select();
            setBusyDate(null);
            if (error) {
              Alert.alert('Could not override', error.message);
              return;
            }
            if (!data || data.length === 0) {
              Alert.alert(
                'Could not override',
                'Only admins can take a slot already claimed by someone else.',
              );
            }
            await load();
          },
        },
      ],
    );
  };

  const release = async (date: string) => {
    setBusyDate(date);
    const { data, error } = await supabase
      .from('schedule')
      .update({ leader_id: null })
      .eq('week_start', date)
      .select();
    setBusyDate(null);
    if (error) {
      Alert.alert('Could not release', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Could not release', 'You can only release a slot you own.');
    }
    await load();
  };

  const removeDate = (date: string) => {
    // The 0006 migration cascades weekly_verses on delete, so removing a
    // scheduled date silently drops any verse set for it. Surface that so a
    // leader doesn't lose a verse by accident.
    Alert.alert(
      'Remove this date?',
      `${formatWeek(date)}\n\nAny verse set for this date will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('schedule').delete().eq('week_start', date);
            if (error) Alert.alert('Error', error.message);
            else await load();
          },
        },
      ],
    );
  };

  const onDayPress = (day: DateData) => {
    const date = day.dateString;
    if (date < weekStart()) {
      Alert.alert('Past date', 'Pick a date this week or later.');
      return;
    }
    const entry = entries.find((e) => e.week_start === date);

    if (!entry) {
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

    const mine = entry.leader_id === userId;
    const open = !entry.leader_id;
    const someoneElse = !!entry.leader_id && !mine;

    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Close', style: 'cancel' },
    ];
    if (open) {
      buttons.push({ text: "I'll lead", onPress: () => claim(date) });
    } else if (mine) {
      buttons.push({ text: 'Release', style: 'destructive', onPress: () => release(date) });
    }
    if (someoneElse && isAdmin) {
      buttons.push({
        text: 'Override (assign to me)',
        style: 'destructive',
        onPress: () => overrideClaim(date, entry.leader?.display_name ?? null),
      });
    }
    if (isLeader) {
      buttons.push({ text: 'Remove from schedule', style: 'destructive', onPress: () => removeDate(date) });
    }

    const leaderLabel = open ? 'Open — no leader yet' : `Leader: ${entry.leader?.display_name ?? 'Unknown'}`;
    Alert.alert(formatWeek(date), leaderLabel, buttons);
  };

  // Birthdays this month
  const birthdaysThisMonth = useMemo(() => {
    const currentMonth = getMonth(new Date()); // 0-based
    return birthdays
      .filter((b) => {
        if (!b.birthday) return false;
        const [, mm] = b.birthday.split('-').map(Number);
        return mm - 1 === currentMonth;
      })
      .sort((a, b) => {
        const da = parseInt(a.birthday!.split('-')[2], 10);
        const db = parseInt(b.birthday!.split('-')[2], 10);
        return da - db;
      });
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

  // Disable the left chevron when the user is already viewing the earliest
  // reachable month, so they can't paginate back into a month with no
  // tappable days (the minDate prop only blocks day taps, not navigation).
  const minMonth = weekStart().slice(0, 7);
  const disableArrowLeft = displayMonth <= minMonth;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.pageTitle}>Schedule</Text>
          <Text style={styles.pageSubtitle}>Tuesdays · 18:00 · Online via Zoom</Text>
        </View>

        {/* Calendar */}
        <View style={styles.calendarCard}>
          <Calendar
            minDate={weekStart()}
            markingType="custom"
            markedDates={markedWithToday}
            onDayPress={onDayPress}
            onMonthChange={(m) => setDisplayMonth(`${m.year}-${String(m.month).padStart(2, '0')}`)}
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

        {/* Birthdays this month */}
        {birthdaysThisMonth.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Birthdays this month</Text>
            <View style={[styles.card, styles.birthdayCard]}>
              {birthdaysThisMonth.map((b, i) => {
                const day = getDate(new Date(b.birthday!.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '2000/$2/$3')));
                const monthName = format(new Date(2000, parseInt(b.birthday!.split('-')[1], 10) - 1, 1), 'MMMM');
                return (
                  <View
                    key={b.id}
                    style={[styles.birthdayRow, i < birthdaysThisMonth.length - 1 && styles.rowDivider]}
                  >
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

        {/* Upcoming */}
        <Text style={styles.sectionTitle}>Upcoming</Text>
        {entries.length === 0 ? (
          <Text style={styles.empty}>
            {isLeader
              ? 'Tap any date on the calendar to add it to the schedule.'
              : 'No dates scheduled yet.'}
          </Text>
        ) : (
          <View style={styles.upcomingList}>
            {entries.map((e) => {
              const mine = e.leader_id === userId;
              const open = !e.leader_id;
              const busy = busyDate === e.week_start;
              const tone = mine ? 'you' : open ? 'open' : 'taken';
              const barColor = mine ? colors.primary : open ? colors.open : colors.accent;
              return (
                <View key={e.week_start} style={styles.upcomingRow}>
                  <View style={[styles.upcomingBar, { backgroundColor: barColor }]} />
                  <View style={styles.flex1}>
                    <Text style={styles.upcomingDateLabel}>{formatWeek(e.week_start)}</Text>
                    <Text style={[styles.upcomingLeader, mine && styles.upcomingLeaderMine]}>
                      {open
                        ? 'Open slot'
                        : (e.leader?.display_name ?? 'Unknown')}
                    </Text>
                  </View>
                  {open && (
                    <Text style={[styles.upcomingTag, { color: colors.open }]}>Tap to claim</Text>
                  )}
                  {mine && (
                    <Text style={[styles.upcomingTag, { color: colors.primary }]}>You're leading</Text>
                  )}
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

  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  pageSubtitle: {
    fontSize: 13.5,
    color: colors.textMuted,
    marginTop: 4,
  },

  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  calendar: {
    borderRadius: radius.md,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 7, height: 7, borderRadius: 999 },
  legendLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.3 },
  cakeEmoji: { fontSize: 12 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: spacing.xl,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  birthdayCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  cakeBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C26A7C1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cakeBubbleText: { fontSize: 18 },
  birthdayName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  birthdayDate: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  chevron: { fontSize: 20, color: colors.textMutedSoft, lineHeight: 22 },

  upcomingList: {
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  upcomingBar: {
    width: 8,
    height: 38,
    borderRadius: 4,
    flexShrink: 0,
  },
  upcomingDateLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  upcomingLeader: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.1,
  },
  upcomingLeaderMine: { color: colors.primaryDark },
  upcomingTag: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
});
