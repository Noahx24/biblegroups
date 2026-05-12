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
import { supabase } from '@/lib/supabase';
import { fetchVerse } from '@/lib/bible';
import { formatWeek, nextWeekStart, weekStart } from '@/lib/week';
import { useAuth } from '@/hooks/useAuth';
import type { ScheduleEntry, WeeklyVerse } from '@/types';

export function ThisWeekScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [verse, setVerse] = useState<WeeklyVerse | null>(null);
  const [leader, setLeader] = useState<ScheduleEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const currentWeek = weekStart();
  const upcomingWeek = nextWeekStart();
  const leadingThisWeek = !!userId && leader?.leader_id === userId;

  const load = useCallback(async () => {
    // Find the schedule entry for any day inside this Sun-Sat window.
    // Leaders may add meeting dates that aren't Sundays, so an exact equality
    // on week_start would miss them.
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

    // Verses are keyed to a schedule entry's week_start (per RLS), so use the
    // matched date when one exists; otherwise fall back to the Sunday key.
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const saveVerse = async () => {
    if (!reference.trim() || !session?.user || !leader) return;
    setSaving(true);
    try {
      const fetched = await fetchVerse(reference);
      const { error } = await supabase.from('weekly_verses').upsert(
        {
          // Use the schedule entry's date so the row matches the leader's
          // schedule slot exactly (required by the RLS write policy).
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  weekLabel: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase' },
  verseRef: { fontSize: 18, fontWeight: '700' },
  verseText: { fontSize: 16, lineHeight: 24 },
  translation: { fontSize: 12, color: '#888', marginTop: 4 },
  muted: { color: '#888' },
  leaderName: { fontSize: 18, fontWeight: '600' },
  editor: { gap: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  primary: { backgroundColor: '#2c6cf5', borderRadius: 8, padding: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
