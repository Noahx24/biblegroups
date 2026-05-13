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
import { addDays, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { fetchVerse } from '@/lib/bible';
import { formatWeek, nextWeekStart, weekStart } from '@/lib/week';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { ScheduleEntry, WeeklyVerse } from '@/types';

// Build Mon–Fri dates for the current week (week starts Sunday).
function getWeekReadingDays(sundayISO: string) {
  const [y, m, d] = sundayISO.split('-').map(Number);
  const sunday = new Date(y, m - 1, d);
  return [1, 2, 3, 4, 5].map((offset) => {
    const dt = addDays(sunday, offset);
    return {
      day: format(dt, 'EEE').slice(0, 3),
      date: format(dt, 'MMM d'),
      dateNum: format(dt, 'd'),
      isoDate: format(dt, 'yyyy-MM-dd'),
    };
  });
}

export function ThisWeekScreen() {
  const { session, isLeader } = useAuth();
  const userId = session?.user.id;
  const [verse, setVerse] = useState<WeeklyVerse | null>(null);
  const [leader, setLeader] = useState<ScheduleEntry | null>(null);
  const [nextLeader, setNextLeader] = useState<ScheduleEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const currentWeek = weekStart();
  const upcomingWeek = nextWeekStart();

  // Next week's Sunday
  const nextWeekSunday = upcomingWeek;

  const leadingThisWeek = !!userId && leader?.leader_id === userId;

  const load = useCallback(async () => {
    const [scheduleRes, nextRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
        .gte('week_start', currentWeek)
        .lt('week_start', upcomingWeek)
        .order('week_start', { ascending: true })
        .limit(1),
      supabase
        .from('schedule')
        .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
        .gte('week_start', upcomingWeek)
        .order('week_start', { ascending: true })
        .limit(1),
    ]);

    const scheduleEntry = (scheduleRes.data?.[0] as ScheduleEntry | undefined) ?? null;
    setLeader(scheduleEntry);
    setNextLeader((nextRes.data?.[0] as ScheduleEntry | undefined) ?? null);

    const verseDate = scheduleEntry?.week_start ?? currentWeek;
    const verseRes = await supabase
      .from('weekly_verses')
      .select('*')
      .eq('week_start', verseDate)
      .maybeSingle();
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

  useRealtime('schedule', load);
  useRealtime('weekly_verses', load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Claim an existing open schedule entry for this week. We deliberately do
  // NOT auto-insert a new schedule row keyed to Sunday: meeting dates are
  // arbitrary (a class may meet Wednesday), so blindly creating a Sunday
  // slot from this screen guesses wrong half the time. If no entry exists,
  // the leader is directed to the Schedule tab to pick the actual date.
  const claimThisWeek = async () => {
    if (!userId || !leader) return;
    setClaiming(true);
    try {
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

  // Only offer the claim button when an open schedule entry already exists
  // for this week. If none exists, the leader needs to add one via the
  // Schedule tab — we don't guess the meeting date for them.
  const showClaimButton = isLeader && !!leader && !leader.leader_id && !leadingThisWeek;
  const showAddDateHint = isLeader && !leader;
  const showMemberHint = !isLeader && !leader?.leader_id;
  const weekDays = getWeekReadingDays(currentWeek);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.pageTitle}>This Week</Text>
            <Text style={styles.pageSubtitle}>Week of {formatWeek(currentWeek)}</Text>
          </View>
        </View>

        {/* Verse of the Week */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Verse of the Week</Text>
          {verse ? (
            <>
              <Text style={styles.verseRef}>{verse.reference}</Text>
              <Text style={styles.verseText}>"{verse.text}"</Text>
              <View style={styles.verseDivider} />
              <View style={styles.verseFooter}>
                <Text style={styles.translation}>{verse.translation}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.muted}>No verse set yet for this week.</Text>
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
                  styles.primaryBtn,
                  (saving || !reference.trim()) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Set verse'}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Leading This Week */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Leading this Week</Text>
          {leader?.leader_id ? (
            <>
              <View style={styles.leaderRow}>
                <InitialsAvatar
                  name={leader.leader?.display_name ?? '?'}
                  tone="gold"
                  size={48}
                />
                <View style={styles.leaderMeta}>
                  <Text style={styles.leaderName}>
                    {leader.leader?.display_name ?? 'Unknown'}
                  </Text>
                  {leader.notes ? (
                    <Text style={styles.leaderDetail}>{leader.notes}</Text>
                  ) : null}
                </View>
              </View>
              {leader.notes ? (
                <View style={styles.themeBox}>
                  <Text style={styles.themeBoxLabel}>Theme</Text>
                  <Text style={styles.themeBoxText}>{leader.notes}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.noLeaderTitle}>No leader assigned</Text>
              <Text style={styles.muted}>The slot is still open.</Text>
              {showClaimButton && (
                <Pressable
                  onPress={claimThisWeek}
                  disabled={claiming}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.leadBtn,
                    claiming && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {claiming ? 'Taking…' : "I'll lead this week"}
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {showAddDateHint && (
            <Text style={styles.hint}>
              No meeting date set for this week yet. Open the Schedule tab to add one.
            </Text>
          )}

          {showMemberHint && (
            <Text style={styles.hint}>
              A leader needs to take this week before the verse can be set.
            </Text>
          )}
        </View>

        {/* Next Week */}
        {isLeader && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              Next Week · {formatWeek(nextWeekSunday)}
            </Text>
            {nextLeader?.leader_id ? (
              <View style={styles.leaderRow}>
                <InitialsAvatar
                  name={nextLeader.leader?.display_name ?? '?'}
                  tone="gold"
                  size={40}
                />
                <Text style={styles.leaderName}>
                  {nextLeader.leader?.display_name ?? 'Unknown'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.noLeaderTitle}>No leader assigned</Text>
                <Text style={styles.muted}>The slot is still open.</Text>
                <Pressable
                  onPress={async () => {
                    if (!userId) return;
                    setClaiming(true);
                    try {
                      await supabase
                        .from('schedule')
                        .upsert({ week_start: nextWeekSunday, leader_id: userId }, { onConflict: 'week_start' });
                      await load();
                    } catch (e) {
                      Alert.alert('Error', e instanceof Error ? e.message : String(e));
                    } finally {
                      setClaiming(false);
                    }
                  }}
                  disabled={claiming}
                  style={({ pressed }) => [styles.primaryBtn, styles.leadBtn, claiming && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>I'll lead next week</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* Reading Plan */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>Reading Plan</Text>
            <Text style={styles.cardLabelRight}>Mon – Fri</Text>
          </View>
          {weekDays.map((day, i) => {
            const isTue = day.day === 'Tue';
            const highlight = isTue && !!verse;
            return (
              <View
                key={day.isoDate}
                style={[styles.planRow, i < weekDays.length - 1 && styles.planRowBorder]}
              >
                <View style={[styles.planDayBadge, highlight && styles.planDayBadgeActive]}>
                  <Text style={[styles.planDayLabel, highlight && styles.planDayLabelActive]}>
                    {day.day}
                  </Text>
                  <Text style={[styles.planDayNum, highlight && styles.planDayNumActive]}>
                    {day.dateNum}
                  </Text>
                </View>
                <View style={styles.planMeta}>
                  {isTue && verse ? (
                    <>
                      <Text style={styles.planRef}>{verse.reference}</Text>
                      <Text style={styles.planTitle} numberOfLines={1}>Class verse</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.planRef}>{day.date}</Text>
                      <Text style={styles.planTitle}>Daily reading</Text>
                    </>
                  )}
                </View>
                <ChevronRight />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shared atoms ─────────────────────────────────────────────

function InitialsAvatar({
  name,
  tone,
  size = 48,
}: {
  name: string;
  tone: 'scarlet' | 'gold';
  size?: number;
}) {
  const initials = name
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const bg = tone === 'gold'
    ? { backgroundColor: colors.accent }
    : { backgroundColor: colors.primary };

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, bg]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function ChevronRight() {
  return (
    <Text style={styles.chevron}>›</Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },

  // Section header
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
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

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  cardLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardLabelRight: {
    fontSize: 12,
    color: colors.textMutedSoft,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Verse
  verseRef: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  verseText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 27,
    color: colors.textSoft,
  },
  verseDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
    marginTop: 12,
    marginBottom: 12,
  },
  verseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  translation: {
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  muted: { color: colors.textMuted, fontSize: 14 },

  // Leader
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 14,
  },
  leaderMeta: { flex: 1 },
  leaderName: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  leaderDetail: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
  },
  themeBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  themeBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  themeBoxText: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.textSoft,
    lineHeight: 23,
  },
  noLeaderTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },

  // Reading plan
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  planRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  planDayBadge: {
    width: 44,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    alignItems: 'center',
  },
  planDayBadgeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  planDayLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSoft,
    opacity: 0.7,
  },
  planDayLabelActive: { color: '#fff', opacity: 0.85 },
  planDayNum: {
    fontFamily: fonts.serif,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.textSoft,
  },
  planDayNumActive: { color: '#fff' },
  planMeta: { flex: 1, minWidth: 0 },
  planRef: {
    fontFamily: fonts.serif,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
  },
  planTitle: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMutedSoft,
    lineHeight: 22,
  },

  // Avatar
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#fff',
    fontFamily: fonts.serif,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  leadBtn: { marginTop: spacing.sm },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15, letterSpacing: 0.1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  // Verse editor
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
});
