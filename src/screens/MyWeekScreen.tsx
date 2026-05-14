import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, format, isToday, isTomorrow, parseISO } from 'date-fns';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { GroupType, ProgramType } from '@/types';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

// ─── colour helpers ──────────────────────────────────────────────────────────

const GROUP_PALETTE = [
  '#3A7FD8', // blue
  '#4A7C59', // green
  '#C89441', // gold
  '#8B5CF6', // purple
  '#D97706', // amber
  '#0891B2', // cyan
  '#C26A7C', // rose
  '#059669', // emerald
];

function groupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) & 0xffff;
  }
  return GROUP_PALETTE[hash % GROUP_PALETTE.length];
}

const PROGRAM_COLOR: Record<string, string> = {
  youth: colors.primary,
  childrens: colors.accent,
  holiday_club: colors.success,
};

// ─── unified item type ───────────────────────────────────────────────────────

type WeekItem = {
  id: string;
  kind: 'slot' | 'event' | 'program';
  date: string;         // yyyy-MM-dd for grouping
  sortKey: string;      // 'HH:MM' or '99:99' so no-time items sort last
  timeLabel: string | null;
  label: string;
  sublabel: string | null;
  location: string | null;
  color: string;
  icon: IoniconsName;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (isToday(dt)) return 'Today';
  if (isTomorrow(dt)) return 'Tomorrow';
  return format(dt, 'EEEE, d MMM');
}

function slotIcon(groupType: GroupType): IoniconsName {
  return groupType === 'class' ? 'book' : 'construct';
}

function programIcon(_type: ProgramType): IoniconsName {
  return 'star';
}

// ─── screen ──────────────────────────────────────────────────────────────────

export function MyWeekScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [sections, setSections] = useState<{ title: string; data: WeekItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasGroups, setHasGroups] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;

    // Compute window bounds fresh on each load so date changes (e.g. midnight
    // rollover) are picked up without remounting.
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const windowEnd = format(addDays(now, 13), 'yyyy-MM-dd');
    const nowIso = now.toISOString();
    const windowEndIso = addDays(now, 14).toISOString();

    // Step 1: user's group memberships
    const { data: memberRows, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id, role, groups(id, name, type)')
      .eq('user_id', userId);

    if (memberErr) {
      console.warn('MyWeek: memberships load failed', memberErr);
      return;
    }

    type MemberJoin = { group_id: string; role: string; groups: { id: string; name: string; type: GroupType } | null };
    const rows = (memberRows ?? []) as unknown as MemberJoin[];
    const groupMap: Record<string, { name: string; type: GroupType }> = {};
    const groupIds: string[] = [];
    for (const r of rows) {
      if (!r.groups) continue;
      groupMap[r.group_id] = { name: r.groups.name, type: r.groups.type };
      groupIds.push(r.group_id);
    }
    setHasGroups(groupIds.length > 0);

    // Step 2: parallel fetch — schedule slots, events, child programme dates
    const [slotsRes, eventsRes, regsRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('id, slot_date, slot_time, group_id, status, volunteer_programmes(name)')
        .eq('assignee_id', userId)
        .gte('slot_date', today)
        .lte('slot_date', windowEnd)
        .in('status', ['accepted', 'pending'])
        .order('slot_date', { ascending: true }),

      groupIds.length > 0
        ? supabase
            .from('events')
            .select('id, title, starts_at, location, group_id')
            .in('group_id', groupIds)
            .gte('starts_at', nowIso)
            .lt('starts_at', windowEndIso)
            .order('starts_at', { ascending: true })
            .limit(50)
        : Promise.resolve({ data: [] as { id: string; title: string; starts_at: string; location: string | null; group_id: string }[], error: null }),

      supabase
        .from('program_registrations')
        .select('id, family_member_id, family_members(name), youth_programs(id, name, type, start_date, end_date)')
        .eq('registered_by', userId)
        .eq('status', 'active'),
    ]);

    if (slotsRes.error) console.warn('MyWeek: slots load failed', slotsRes.error);
    if (eventsRes.error) console.warn('MyWeek: events load failed', eventsRes.error);
    if (regsRes.error) console.warn('MyWeek: registrations load failed', regsRes.error);

    const items: WeekItem[] = [];

    // Schedule slots
    type SlotJoin = {
      id: string;
      slot_date: string;
      slot_time: string | null;
      group_id: string;
      status: string;
      volunteer_programmes: { name: string } | null;
    };
    for (const raw of ((slotsRes.data ?? []) as unknown as SlotJoin[])) {
      const group = groupMap[raw.group_id];
      const prog = raw.volunteer_programmes;
      const timeLabel = raw.slot_time ? raw.slot_time.slice(0, 5) : null;
      const label = group?.type === 'class'
        ? `Leading ${group.name}`
        : prog?.name
          ? `Volunteering — ${prog.name}`
          : `Volunteering for ${group?.name ?? 'group'}`;
      items.push({
        id: `slot-${raw.id}`,
        kind: 'slot',
        date: raw.slot_date,
        sortKey: timeLabel ?? '99:99',
        timeLabel,
        label,
        sublabel: group?.name ?? null,
        location: null,
        color: groupColor(raw.group_id),
        icon: slotIcon(group?.type ?? 'class'),
      });
    }

    // Events
    type EventRow = { id: string; title: string; starts_at: string; location: string | null; group_id: string };
    for (const ev of ((eventsRes.data ?? []) as EventRow[])) {
      const date = format(parseISO(ev.starts_at), 'yyyy-MM-dd');
      const timeLabel = format(parseISO(ev.starts_at), 'HH:mm');
      const group = groupMap[ev.group_id];
      items.push({
        id: `event-${ev.id}`,
        kind: 'event',
        date,
        sortKey: timeLabel,
        timeLabel,
        label: ev.title,
        sublabel: group?.name ?? null,
        location: ev.location ?? null,
        color: groupColor(ev.group_id),
        icon: 'calendar',
      });
    }

    // Child programme dates
    type RegJoin = {
      id: string;
      family_members: { name: string } | null;
      youth_programs: { id: string; name: string; type: ProgramType; start_date: string | null; end_date: string | null } | null;
    };
    for (const reg of ((regsRes.data ?? []) as unknown as RegJoin[])) {
      const prog = reg.youth_programs;
      const child = reg.family_members;
      if (!prog || !child) continue;
      const color = PROGRAM_COLOR[prog.type] ?? colors.accent;

      if (prog.start_date && prog.start_date >= today && prog.start_date <= windowEnd) {
        items.push({
          id: `reg-${reg.id}-start`,
          kind: 'program',
          date: prog.start_date,
          sortKey: '99:99',
          timeLabel: null,
          label: `${child.name} in ${prog.name}`,
          sublabel: 'Programme starts',
          location: null,
          color,
          icon: programIcon(prog.type),
        });
      }
      if (prog.end_date && prog.end_date >= today && prog.end_date <= windowEnd) {
        items.push({
          id: `reg-${reg.id}-end`,
          kind: 'program',
          date: prog.end_date,
          sortKey: '99:99',
          timeLabel: null,
          label: `${child.name} in ${prog.name}`,
          sublabel: 'Last day',
          location: null,
          color,
          icon: programIcon(prog.type),
        });
      }
    }

    // Group into day sections, sort by date then by time within day
    items.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.sortKey.localeCompare(b.sortKey);
    });

    const byDay = new Map<string, WeekItem[]>();
    for (const item of items) {
      (byDay.get(item.date) ?? (() => { const arr: WeekItem[] = []; byDay.set(item.date, arr); return arr; })()).push(item);
    }

    setSections(
      Array.from(byDay.entries()).map(([date, data]) => ({
        title: dayLabel(date),
        data,
      })),
    );
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useRealtime('schedule', load);
  useRealtime('events', load);
  useRealtime('program_registrations', load, `registered_by=eq.${userId}`);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const windowLabel = `${format(new Date(), 'MMM d')} – ${format(addDays(new Date(), 13), 'MMM d')}`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>My Week</Text>
            <Text style={styles.pageSubtitle}>{windowLabel}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={colors.border}
              style={styles.emptyIcon}
            />
            {!hasGroups ? (
              <>
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptyBody}>
                  Join a group from the Groups tab to see your scheduled slots and events here.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>All clear</Text>
                <Text style={styles.emptyBody}>
                  Nothing scheduled in the next two weeks — enjoy the break!
                </Text>
              </>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.dayHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => <WeekCard item={item} />}
      />
    </SafeAreaView>
  );
}

// ─── card component ───────────────────────────────────────────────────────────

function WeekCard({ item }: { item: WeekItem }) {
  return (
    <View style={[styles.card, { borderLeftColor: item.color }]}>
      <View style={[styles.iconCircle, { backgroundColor: item.color + '22' }]}>
        <Ionicons name={item.icon} size={16} color={item.color} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardLabel} numberOfLines={2}>{item.label}</Text>
        {!!item.sublabel && (
          <Text style={styles.cardSublabel} numberOfLines={1}>{item.sublabel}</Text>
        )}
        {!!item.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={styles.cardLocation} numberOfLines={1}>{item.location}</Text>
          </View>
        )}
      </View>
      {!!item.timeLabel && (
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>{item.timeLabel}</Text>
        </View>
      )}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxl },

  pageHeader: {
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

  dayHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.primary,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },

  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  cardText: { flex: 1 },
  cardLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  cardSublabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  cardLocation: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },

  timeBadge: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSoft,
    fontVariant: ['tabular-nums'],
  },

  emptyBox: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 2,
    gap: spacing.sm,
  },
  emptyIcon: { marginBottom: spacing.md },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
});
