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
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { formatWeek, weekStart } from '@/lib/week';
import { colors, radius, spacing } from '@/theme';
import type { ScheduleEntry } from '@/types';

type Marked = Record<string, {
  selected?: boolean;
  selectedColor?: string;
  marked?: boolean;
  dotColor?: string;
  customStyles?: object;
}>;

export function ScheduleScreen() {
  const { session, isLeader, isAdmin } = useAuth();
  const userId = session?.user.id;
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  // Tracked so we can disable the left arrow when the user is already at the
  // earliest reachable month (this week's month). Initialised from today so
  // it matches the calendar's initial render.
  const [displayMonth, setDisplayMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('schedule')
      .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
      .gte('week_start', weekStart())
      .order('week_start', { ascending: true });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEntries((data as ScheduleEntry[] | null) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live: another leader's claim or a new schedule date appears without
  // a manual refresh.
  useRealtime('schedule', load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Build the date-keyed markers consumed by react-native-calendars.
  // Three states: open (blue dot), mine (burgundy), taken (gold).
  const markedDates = useMemo<Marked>(() => {
    const m: Marked = {};
    for (const e of entries) {
      const isMine = e.leader_id && e.leader_id === userId;
      const isTaken = e.leader_id && e.leader_id !== userId;
      const dotColor = isMine ? colors.primary : isTaken ? colors.accentDark : colors.open;
      m[e.week_start] = {
        marked: true,
        dotColor,
        customStyles: {
          container: {
            backgroundColor: isMine ? colors.primaryLight : 'transparent',
            borderRadius: radius.sm,
          },
          text: {
            color: colors.text,
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
    // Filter on leader_id IS NULL so the claim only succeeds on a truly open
    // slot. Without this, the schedule_update_leader RLS policy lets any
    // leader overwrite another leader's existing claim under concurrency.
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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
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
            textDisabledColor: colors.border,
            arrowColor: colors.primary,
            monthTextColor: colors.text,
            textMonthFontWeight: '700',
            textDayFontWeight: '500',
            textDayHeaderFontWeight: '600',
          }}
          style={styles.calendar}
        />

        <View style={styles.legend}>
          <LegendDot color={colors.open} label="Open" />
          <LegendDot color={colors.primary} label="You" />
          <LegendDot color={colors.accentDark} label="Taken" />
        </View>

        <Text style={styles.sectionTitle}>Upcoming</Text>
        {entries.length === 0 ? (
          <Text style={styles.empty}>
            {isLeader
              ? 'Tap any date on the calendar to add it to the schedule.'
              : 'No dates scheduled yet.'}
          </Text>
        ) : (
          entries.map((e) => {
            const mine = e.leader_id === userId;
            const open = !e.leader_id;
            const busy = busyDate === e.week_start;
            return (
              <View key={e.week_start} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowDate}>{formatWeek(e.week_start)}</Text>
                  <Text style={[styles.rowLeader, mine && styles.rowLeaderMine]}>
                    {open ? 'Open — tap on the calendar to lead' : e.leader?.display_name ?? 'Unknown'}
                  </Text>
                </View>
                {busy && <ActivityIndicator color={colors.primary} />}
              </View>
            );
          })
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
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  calendar: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, color: colors.textMuted },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowMain: { flex: 1 },
  rowDate: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  rowLeader: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowLeaderMine: { color: colors.primary },
});
