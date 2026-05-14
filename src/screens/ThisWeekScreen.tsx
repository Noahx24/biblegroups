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
import { fetchVerse, openInYouVersion } from '@/lib/bible';
import { formatWeek, nextWeekStart, weekStart } from '@/lib/week';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { ScheduleSlot, WeeklyVerse } from '@/types';

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
  const { session } = useAuth();
  const { group, myRole } = useGroup();
  const userId = session?.user.id;
  const isLeader = myRole === 'leader';

  const [verse, setVerse] = useState<WeeklyVerse | null>(null);
  const [slot, setSlot] = useState<ScheduleSlot | null>(null);
  const [nextSlot, setNextSlot] = useState<ScheduleSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reference, setReference] = useState('');
  const [translation, setTranslation] = useState<string>('web');
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const currentWeek = weekStart();
  const upcomingWeek = nextWeekStart();
  const [uy, um, ud] = upcomingWeek.split('-').map(Number);
  const weekAfterNext = format(addDays(new Date(uy, um - 1, ud), 7), 'yyyy-MM-dd');

  const leadingThisWeek = !!userId && slot?.assignee_id === userId;

  const load = useCallback(async () => {
    const [scheduleRes, nextRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('*, assignee:profiles(id, display_name, avatar_url)')
        .eq('group_id', group.id)
        .gte('slot_date', currentWeek)
        .lt('slot_date', upcomingWeek)
        .order('slot_date', { ascending: true })
        .limit(1),
      supabase
        .from('schedule')
        .select('*, assignee:profiles(id, display_name, avatar_url)')
        .eq('group_id', group.id)
        .gte('slot_date', upcomingWeek)
        .lt('slot_date', weekAfterNext)
        .order('slot_date', { ascending: true })
        .limit(1),
    ]);

    const currentSlot = (scheduleRes.data?.[0] as ScheduleSlot | undefined) ?? null;
    setSlot(currentSlot);
    setNextSlot((nextRes.data?.[0] as ScheduleSlot | undefined) ?? null);

    const verseDate = currentSlot?.slot_date ?? currentWeek;
    const verseRes = await supabase
      .from('weekly_verses')
      .select('*')
      .eq('group_id', group.id)
      .eq('week_start', verseDate)
      .maybeSingle();
    setVerse((verseRes.data as WeeklyVerse | null) ?? null);
  }, [group.id, currentWeek, upcomingWeek, weekAfterNext]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  useRealtime('schedule', load, `group_id=eq.${group.id}`);
  useRealtime('weekly_verses', load, `group_id=eq.${group.id}`);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const claimSlot = async (targetSlot: ScheduleSlot) => {
    if (!userId) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase
        .from('schedule')
        .update({ assignee_id: userId, status: 'accepted' })
        .eq('id', targetSlot.id)
        .is('assignee_id', null)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Someone else just claimed this slot.');
      }
      await load();
    } catch (e) {
      Alert.alert("Couldn't claim slot", e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  };

  const saveVerse = async () => {
    if (!reference.trim() || !session?.user || !slot) return;
    setSaving(true);
    try {
      const fetched = await fetchVerse(reference, translation);
      const { error } = await supabase.from('weekly_verses').upsert(
        {
          group_id: group.id,
          week_start: slot.slot_date,
          reference: fetched.reference,
          text: fetched.text,
          translation: fetched.translation,
          created_by: session.user.id,
        },
        { onConflict: 'group_id,week_start' },
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

  const showClaimButton = isLeader && !!slot && !slot.assignee_id && !leadingThisWeek;
  const showAddDateHint = isLeader && !slot;
  const showMemberHint = !isLeader && !slot?.assignee_id;
  const weekDays = getWeekReadingDays(currentWeek);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
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
                <Pressable
                  onPress={() => openInYouVersion(verse.reference)}
                  style={({ pressed }) => [styles.youversionBtn, pressed && styles.pressed]}
                  accessibilityLabel="Read in YouVersion"
                  accessibilityRole="link"
                >
                  <Text style={styles.youversionBtnText}>Read in YouVersion ↗</Text>
                </Pressable>
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
              <TranslationPicker value={translation} onChange={setTranslation} />
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
          {slot?.assignee_id ? (
            <>
              <View style={styles.leaderRow}>
                <InitialsAvatar name={slot.assignee?.display_name ?? '?'} tone="gold" size={48} />
                <View style={styles.leaderMeta}>
                  <Text style={styles.leaderName}>{slot.assignee?.display_name ?? 'Unknown'}</Text>
                  {slot.notes ? <Text style={styles.leaderDetail}>{slot.notes}</Text> : null}
                </View>
              </View>
              {slot.notes ? (
                <View style={styles.themeBox}>
                  <Text style={styles.themeBoxLabel}>Theme</Text>
                  <Text style={styles.themeBoxText}>{slot.notes}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.noLeaderTitle}>No leader assigned</Text>
              <Text style={styles.muted}>The slot is still open.</Text>
              {showClaimButton && (
                <Pressable
                  onPress={() => claimSlot(slot!)}
                  disabled={claiming}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryBtn, styles.leadBtn,
                    claiming && styles.disabled, pressed && styles.pressed,
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
            <Text style={styles.cardLabel}>Next Week · {formatWeek(upcomingWeek)}</Text>
            {nextSlot?.assignee_id ? (
              <View style={styles.leaderRow}>
                <InitialsAvatar name={nextSlot.assignee?.display_name ?? '?'} tone="gold" size={40} />
                <Text style={styles.leaderName}>{nextSlot.assignee?.display_name ?? 'Unknown'}</Text>
              </View>
            ) : nextSlot ? (
              <>
                <Text style={styles.noLeaderTitle}>No leader assigned</Text>
                <Text style={styles.muted}>The slot is still open.</Text>
                <Pressable
                  onPress={() => claimSlot(nextSlot)}
                  disabled={claiming}
                  style={({ pressed }) => [
                    styles.primaryBtn, styles.leadBtn,
                    claiming && styles.disabled, pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>I'll lead next week</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.noLeaderTitle}>No date scheduled yet</Text>
                <Text style={styles.hint}>
                  Open the Schedule tab to add next week's meeting date.
                </Text>
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

// bible-api.com provides free open-license translations. KJV is public domain.
// WEB closely mirrors modern English translations. For licensed translations
// (NIV, NLT, ESV), integrate api.bible with your own API key.
const TRANSLATIONS: { value: string; label: string; name: string }[] = [
  { value: 'kjv',    label: 'KJV', name: 'King James Version' },
  { value: 'web',    label: 'WEB', name: 'World English Bible' },
  { value: 'oeb-us', label: 'OEB', name: 'Open English Bible' },
  { value: 'bbe',    label: 'BBE', name: 'Bible in Basic English' },
];

function TranslationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.translationRow}>
      <Text style={styles.translationLabel}>Translation</Text>
      <View style={styles.translationOptions}>
        {TRANSLATIONS.map(t => (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityLabel={t.name}
            style={[styles.translationPill, value === t.value && styles.translationPillActive]}
          >
            <Text style={[styles.translationPillText, value === t.value && styles.translationPillTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function InitialsAvatar({ name, tone, size = 48 }: { name: string; tone: 'scarlet' | 'gold'; size?: number }) {
  const initials = name.split(' ').map(s => s[0] ?? '').join('').slice(0, 2).toUpperCase();
  const bg = tone === 'gold' ? { backgroundColor: colors.accent } : { backgroundColor: colors.primary };
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, bg]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function ChevronRight() {
  return <Text style={styles.chevron}>›</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pageTitle: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.4, lineHeight: 34 },
  pageSubtitle: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
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
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 10 },
  cardLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardLabelRight: { fontSize: 12, color: colors.textMutedSoft, fontWeight: '600', letterSpacing: 0.3 },
  verseRef: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: colors.primary, letterSpacing: -0.2, marginBottom: 10 },
  verseText: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 27, color: colors.textSoft },
  verseDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft, marginVertical: 12 },
  verseFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  translation: { fontSize: 12, color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600' },
  youversionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  youversionBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 14 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 14 },
  leaderMeta: { flex: 1 },
  leaderName: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.text, letterSpacing: -0.2, lineHeight: 26 },
  leaderDetail: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  themeBox: { backgroundColor: colors.background, borderRadius: radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft },
  themeBoxLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  themeBoxText: { fontFamily: fonts.serif, fontSize: 16, color: colors.textSoft, lineHeight: 23 },
  noLeaderTitle: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '600', color: colors.textMuted, letterSpacing: -0.1, marginBottom: 2 },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  planRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  planDayBadge: { width: 44, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, alignItems: 'center' },
  planDayBadgeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  planDayLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textSoft, opacity: 0.7 },
  planDayLabelActive: { color: '#fff', opacity: 0.85 },
  planDayNum: { fontFamily: fonts.serif, fontSize: 14, fontWeight: '700', lineHeight: 18, color: colors.textSoft },
  planDayNumActive: { color: '#fff' },
  planMeta: { flex: 1, minWidth: 0 },
  planRef: { fontFamily: fonts.serif, fontSize: 14.5, fontWeight: '700', color: colors.text, letterSpacing: -0.1 },
  planTitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 20, color: colors.textMutedSoft, lineHeight: 22 },
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontFamily: fonts.serif, fontWeight: '600', letterSpacing: 0.5 },
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
  editor: { gap: spacing.sm, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, backgroundColor: colors.background, color: colors.text },
  translationRow: { gap: 6 },
  translationLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' },
  translationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  translationPill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  translationPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  translationPillText: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  translationPillTextActive: { color: '#fff' },
});
