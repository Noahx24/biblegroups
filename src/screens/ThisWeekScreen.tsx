import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { fetchVerse } from '@/lib/bible';
import { formatWeek, nextWeekStart, weekStart } from '@/lib/week';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, radius, spacing } from '@/theme';
import type { ScheduleEntry, WeeklyVerse } from '@/types';

export function ThisWeekScreen() {
  const { session, isLeader } = useAuth();
  const userId = session?.user.id;
  const [verse, setVerse] = useState<WeeklyVerse | null>(null);
  const [leader, setLeader] = useState<ScheduleEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const currentWeek = weekStart();
  const upcomingWeek = nextWeekStart();
  const leadingThisWeek = !!userId && leader?.leader_id === userId;

  const load = useCallback(async () => {
    const scheduleRes = await supabase
      .from('schedule')
      .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
      .gte('week_start', currentWeek)
      .lt('week_start', upcomingWeek)
      .order('week_start', { ascending: true })
      .limit(1);
    if (scheduleRes.error) {
      console.warn('schedule fetch failed', scheduleRes.error);
    }
    const scheduleEntry = (scheduleRes.data?.[0] as ScheduleEntry | undefined) ?? null;
    setLeader(scheduleEntry);

    const verseDate = scheduleEntry?.week_start ?? currentWeek;
    const verseRes = await supabase
      .from('weekly_verses')
      .select('*')
      .eq('week_start', verseDate)
      .maybeSingle();
    if (verseRes.error) {
      console.warn('verse fetch failed', verseRes.error);
    }
    setVerse((verseRes.data as WeeklyVerse | null) ?? null);
  }, [currentWeek, upcomingWeek]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live: a leader claiming this week or posting a verse appears immediately.
  useRealtime('schedule', load);
  useRealtime('weekly_verses', load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Combined "set me as leader for this week" flow. If there's no schedule
  // entry yet, insert one keyed to currentWeek (Sunday). If there's one with
  // no leader, claim it. RLS lets is_leader users insert; lets anyone claim
  // an open slot.
  const leadThisWeek = async () => {
    if (!userId) return;
    setClaiming(true);
    try {
      if (!leader) {
        const { error } = await supabase
          .from('schedule')
          .insert({ week_start: currentWeek, leader_id: userId });
        if (error) throw error;
      } else if (!leader.leader_id) {
        // Filter on leader_id IS NULL so we never overwrite another leader's
        // claim. The schedule_update_leader RLS policy would otherwise let
        // any leader silently steal a week from a peer who claimed it first.
        const { data, error } = await supabase
          .from('schedule')
          .update({ leader_id: userId })
          .eq('week_start', leader.week_start)
          .is('leader_id', null)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Someone else just claimed this slot.');
        }
      }
      await load();
    } catch (e) {
      Alert.alert("Couldn't take this week", e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  };

  const saveVerse = async () => {
    if (!reference.trim() || !session?.user || !leader) return;
    setSaving(true);
    try {
      const fetched = await fetchVerse(reference);
      const { error } = await supabase.from('weekly_verses').upsert(
        {
          week_start: leader.week_start,
          reference: fetched.reference,
          text: fetched.text,
          translation: fetched.translation,
          created_by: session.user.id,
        },
        { onConflict: 'week_start' },
      );
      if (error) throw error;
      setReference('');
      await load();
    } catch (e) {
      Alert.alert('Could not set verse', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const showLeadButton = isLeader && (!leader || !leader.leader_id) && !leadingThisWeek;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.weekLabel}>Week of {formatWeek(currentWeek)}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Verse of the week</Text>
          {verse ? (
            <>
              <Text style={styles.verseRef}>{verse.reference}</Text>
              <Text style={styles.verseText}>{verse.text}</Text>
              <Text style={styles.translation}>{verse.translation}</Text>
            </>
          ) : (
            <Text style={styles.muted}>No verse set yet.</Text>
          )}

          {leadingThisWeek && (
            <View style={styles.editor}>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="e.g. John 3:16-18"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                style={styles.input}
              />
              <Pressable
                onPress={saveVerse}
                disabled={saving || !reference.trim()}
                style={({ pressed }) => [
                  styles.primary,
                  (saving || !reference.trim()) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Set verse'}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leading this week</Text>
          <Text style={styles.leaderName}>
            {leader?.leader?.display_name ?? 'Not assigned yet'}
          </Text>
          {leader?.notes ? <Text style={styles.muted}>{leader.notes}</Text> : null}

          {showLeadButton && (
            <Pressable
              onPress={leadThisWeek}
              disabled={claiming}
              style={({ pressed }) => [
                styles.primary,
                styles.leadBtn,
                claiming && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {claiming ? 'Taking…' : "I'll lead this week"}
              </Text>
            </Pressable>
          )}

          {!isLeader && !leader?.leader_id && (
            <Text style={styles.hint}>
              A leader needs to take this week before the verse can be set.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  weekLabel: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verseRef: { fontSize: 18, fontWeight: '700', color: colors.primary },
  verseText: { fontSize: 16, lineHeight: 24, color: colors.text },
  translation: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  muted: { color: colors.textMuted },
  leaderName: { fontSize: 18, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  editor: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    backgroundColor: colors.background,
    color: colors.text,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  leadBtn: { marginTop: spacing.sm },
  primaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
