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
import { Calendar, type DateData } from 'react-native-calendars';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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
  const { session, isLeader } = useAuth();
  const userId = session?.user.id;
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);

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
    Alert.alert('Remove this date?', formatWeek(date), [
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
    ]);
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

    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Close', style: 'cancel' },
    ];
    if (open) {
      buttons.push({ text: "I'll lead", onPress: () => claim(date) });
    } else if (mine) {
      buttons.push({ text: 'Release', style: 'destructive', onPress: () => release(date) });
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
