import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, format, isToday, isTomorrow, parseISO, startOfWeek } from 'date-fns';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { toSuperscript } from '@/lib/bible';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

const SUPERSCRIPT_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/;

// Verse text fetched via bible.ts already carries unicode superscript verse
// numbers. This is a render-time safety net for legacy reading rows stored
// before that conversion: if the text has no superscripts yet, promote
// standalone 1–3 digit tokens (verse markers) to superscript. Numbers attached
// to words ("1,000", "5th") are left alone.
function withVerseSuperscripts(text: string): string {
  if (SUPERSCRIPT_RE.test(text)) return text;
  return text.replace(/(^|\s)(\d{1,3})(?=\s|$)/g, (_m, pre: string, n: string) => `${pre}${toSuperscript(n)}`);
}
import type { GroupType, ProgramType, SlotStatus } from '@/types';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

// ─── colour helpers ──────────────────────────────────────────────────────────

const GROUP_PALETTE = [
  '#3A7FD8',
  '#4A7C59',
  '#C89441',
  '#8B5CF6',
  '#D97706',
  '#0891B2',
  '#C26A7C',
  '#059669',
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

// ─── kind display ────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  slot: 'Schedule',
  event: 'Event',
  program: 'Programme',
  reading: 'Reading',
};

const KIND_BG: Record<string, string> = {
  slot: colors.primaryLight,
  event: colors.openSoft,
  program: colors.accentTint,
  reading: colors.accentTint,
};

const KIND_COLOR: Record<string, string> = {
  slot: colors.primary,
  event: colors.open,
  program: colors.accent,
  reading: colors.accent,
};

// ─── types ───────────────────────────────────────────────────────────────────

type WeekItem = {
  id: string;
  kind: 'slot' | 'event' | 'program' | 'reading';
  date: string;
  sortKey: string;
  timeLabel: string | null;
  label: string;
  sublabel: string | null;
  body?: string | null;   // expandable full text (e.g. the reading's verse text)
  location: string | null;
  color: string;
  icon: IoniconsName;
  slotStatus?: SlotStatus;
};

type Section = {
  title: string;
  date: string;          // yyyy-MM-dd — needed for day-strip scroll
  data: WeekItem[];
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

// ─── day strip ───────────────────────────────────────────────────────────────

type DayChip = {
  isoDate: string;
  dayName: string;   // "Mon"
  dayNum: string;    // "14"
  hasItems: boolean;
};

function DayStrip({
  days,
  selectedDate,
  onSelect,
}: {
  days: DayChip[];
  selectedDate: string;
  onSelect: (isoDate: string) => void;
}) {
  const stripRef = useRef<ScrollView>(null);

  // Auto-scroll strip to keep selected chip centred
  useEffect(() => {
    const idx = days.findIndex(d => d.isoDate === selectedDate);
    if (idx < 0) return;
    // Each chip is ~52 px wide + 6 px gap
    const CHIP_W = 52 + 6;
    stripRef.current?.scrollTo({ x: Math.max(0, idx * CHIP_W - 80), animated: true });
  }, [selectedDate, days]);

  return (
    <View style={stripStyles.wrapper}>
      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={stripStyles.strip}
      >
        {days.map(chip => {
          const active = chip.isoDate === selectedDate;
          return (
            <Pressable
              key={chip.isoDate}
              style={[
                stripStyles.chip,
                active && stripStyles.chipActive,
                !chip.hasItems && stripStyles.chipEmpty,
              ]}
              onPress={() => onSelect(chip.isoDate)}
            >
              <Text style={[stripStyles.chipDay, active && stripStyles.chipTextActive]}>
                {chip.dayName}
              </Text>
              <Text style={[stripStyles.chipNum, active && stripStyles.chipTextActive]}>
                {chip.dayNum}
              </Text>
              {chip.hasItems && (
                <View style={[stripStyles.dot, active && stripStyles.dotActive]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  strip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  chip: {
    width: 52,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: 2,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipEmpty: {
    opacity: 0.45,
  },
  chipDay: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  chipNum: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  chipTextActive: {
    color: colors.surface,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
  dotActive: {
    backgroundColor: colors.surface,
  },
});

// ─── screen ──────────────────────────────────────────────────────────────────

export function MyWeekScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [rawSections, setRawSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasGroups, setHasGroups] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const listRef = useRef<SectionList<WeekItem, Section>>(null);

  // Build a 7-day chip list for the calendar week (Sunday → Saturday)
  const days = useMemo<DayChip[]>(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const isoDate = format(d, 'yyyy-MM-dd');
      return {
        isoDate,
        dayName: format(d, 'EEE'),
        dayNum: format(d, 'd'),
        hasItems: rawSections.some(s => s.date === isoDate),
      };
    });
  }, [rawSections]);

  const scrollToDate = useCallback((isoDate: string) => {
    setSelectedDate(isoDate);
    const sectionIndex = rawSections.findIndex(s => s.date === isoDate);
    if (sectionIndex < 0) return;
    try {
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true,
        viewOffset: 0,
      });
    } catch {
      // scrollToLocation can throw if layout hasn't settled yet; ignore
    }
  }, [rawSections]);

  const load = useCallback(async () => {
    if (!userId) return;

    const now = new Date();
    const weekStartDate = startOfWeek(now, { weekStartsOn: 0 });
    const winStart = format(weekStartDate, 'yyyy-MM-dd');
    const winEnd = format(addDays(weekStartDate, 6), 'yyyy-MM-dd');
    const winStartIso = weekStartDate.toISOString();
    const winEndIso = addDays(weekStartDate, 7).toISOString();

    const { data: memberRows, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id, role, groups(id, name, type)')
      .eq('user_id', userId);

    if (memberErr) {
      console.warn('MyWeek: memberships load failed', memberErr);
      return;
    }

    type MemberJoin = {
      group_id: string;
      groups: { id: string; name: string; type: GroupType } | null;
    };
    const rows = (memberRows ?? []) as unknown as MemberJoin[];
    const groupMap: Record<string, { name: string; type: GroupType }> = {};
    const groupIds: string[] = [];
    for (const r of rows) {
      if (!r.groups) continue;
      groupMap[r.group_id] = { name: r.groups.name, type: r.groups.type };
      groupIds.push(r.group_id);
    }
    setHasGroups(groupIds.length > 0);

    const [slotsRes, eventsRes, regsRes, readingsRes] = await Promise.all([
      // Show every scheduled session for the groups the user belongs to —
      // not just the slots assigned to them — so members see their group's
      // meetings, and leaders see who's covering each one.
      groupIds.length > 0
        ? supabase
            .from('schedule')
            .select('id, slot_date, slot_time, group_id, status, assignee_id, assignee:profiles!assignee_id(display_name), volunteer_programmes(name)')
            .in('group_id', groupIds)
            .gte('slot_date', winStart)
            .lte('slot_date', winEnd)
            .order('slot_date', { ascending: true })
        : Promise.resolve({ data: [], error: null }),

      groupIds.length > 0
        ? supabase
            .from('events')
            .select('id, title, starts_at, location, group_id')
            .in('group_id', groupIds)
            .gte('starts_at', winStartIso)
            .lt('starts_at', winEndIso)
            .order('starts_at', { ascending: true })
            .limit(50)
        : Promise.resolve({
            data: [] as { id: string; title: string; starts_at: string; location: string | null; group_id: string }[],
            error: null,
          }),

      supabase
        .from('program_registrations')
        .select('id, family_member_id, family_members(name), youth_programs(id, name, type, start_date, end_date)')
        .eq('registered_by', userId)
        .eq('status', 'active'),

      // The day's reading/verse for the user's groups.
      groupIds.length > 0
        ? supabase
            .from('reading_plan')
            .select('id, reading_date, reference, text, note, group_id')
            .in('group_id', groupIds)
            .gte('reading_date', winStart)
            .lte('reading_date', winEnd)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (slotsRes.error) console.warn('MyWeek: slots load failed', slotsRes.error);
    if (eventsRes.error) console.warn('MyWeek: events load failed', eventsRes.error);
    if (regsRes.error) console.warn('MyWeek: registrations load failed', regsRes.error);
    if (readingsRes.error) console.warn('MyWeek: readings load failed', readingsRes.error);

    const items: WeekItem[] = [];

    type SlotJoin = {
      id: string;
      slot_date: string;
      slot_time: string | null;
      group_id: string;
      status: string;
      assignee_id: string | null;
      assignee: { display_name: string | null } | null;
      volunteer_programmes: { name: string } | null;
    };
    for (const raw of ((slotsRes.data ?? []) as unknown as SlotJoin[])) {
      const group = groupMap[raw.group_id];
      const prog = raw.volunteer_programmes;
      const timeLabel = raw.slot_time ? raw.slot_time.slice(0, 5) : null;
      const mine = !!raw.assignee_id && raw.assignee_id === userId;
      const assigneeName = raw.assignee?.display_name ?? null;

      let label: string;
      let sublabel: string | null;
      if (group?.type === 'class') {
        label = group?.name ? `${group.name} meeting` : 'Group meeting';
        sublabel = mine
          ? 'You are leading'
          : assigneeName
          ? `Led by ${assigneeName}`
          : 'No leader assigned yet';
      } else {
        label = mine
          ? prog?.name
            ? `Volunteering — ${prog.name}`
            : 'Volunteering'
          : assigneeName
          ? `${assigneeName}${prog?.name ? ` — ${prog.name}` : ''}`
          : prog?.name
          ? `${prog.name} — open slot`
          : 'Open slot';
        sublabel = group?.name ?? null;
      }

      items.push({
        id: `slot-${raw.id}`,
        kind: 'slot',
        date: raw.slot_date,
        sortKey: timeLabel ?? '99:99',
        timeLabel,
        label,
        sublabel,
        location: null,
        color: groupColor(raw.group_id),
        icon: slotIcon(group?.type ?? 'class'),
        // Only surface the accept/pending status dot for the user's own slots.
        slotStatus: mine ? (raw.status as SlotStatus) : undefined,
      });
    }

    type ReadingRow = {
      id: string;
      reading_date: string;
      reference: string | null;
      text: string | null;
      note: string | null;
      group_id: string;
    };
    for (const r of ((readingsRes.data ?? []) as unknown as ReadingRow[])) {
      if (!r.reference && !r.note) continue;
      const group = groupMap[r.group_id];
      items.push({
        id: `reading-${r.id}`,
        kind: 'reading',
        date: r.reading_date,
        sortKey: '00:00', // readings sit at the top of their day
        timeLabel: null,
        label: r.reference ?? 'Reading',
        sublabel: [group?.name, r.note].filter(Boolean).join(' · ') || null,
        body: r.text,
        location: null,
        color: groupColor(r.group_id),
        icon: 'book',
      });
    }

    type EventRow = {
      id: string;
      title: string;
      starts_at: string;
      location: string | null;
      group_id: string;
    };
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

    type RegJoin = {
      id: string;
      family_members: { name: string } | null;
      youth_programs: {
        id: string;
        name: string;
        type: ProgramType;
        start_date: string | null;
        end_date: string | null;
      } | null;
    };
    for (const reg of ((regsRes.data ?? []) as unknown as RegJoin[])) {
      const prog = reg.youth_programs;
      const child = reg.family_members;
      if (!prog || !child) continue;
      const color = PROGRAM_COLOR[prog.type] ?? colors.accent;

      if (prog.start_date && prog.start_date >= winStart && prog.start_date <= winEnd) {
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
          icon: 'star',
        });
      }
      if (prog.end_date && prog.end_date >= winStart && prog.end_date <= winEnd) {
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
          icon: 'flag',
        });
      }
    }

    items.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : a.sortKey.localeCompare(b.sortKey);
    });

    const byDay = new Map<string, WeekItem[]>();
    for (const item of items) {
      const existing = byDay.get(item.date);
      if (existing) existing.push(item);
      else byDay.set(item.date, [item]);
    }

    setRawSections(
      Array.from(byDay.entries()).map(([date, data]) => ({
        title: dayLabel(date),
        date,
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
  useRealtime('reading_plan', load);
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

  const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 0 });
  const windowLabel = `${format(weekStartDate, 'MMM d')} – ${format(addDays(weekStartDate, 6), 'MMM d')}`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Page header — outside the list so it doesn't scroll away */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>My Week</Text>
          <Text style={styles.pageSubtitle}>{windowLabel}</Text>
        </View>
      </View>

      {/* Sticky day strip */}
      <DayStrip days={days} selectedDate={selectedDate} onSelect={scrollToDate} />

      <SectionList<WeekItem, Section>
        ref={listRef}
        sections={rawSections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={52} color={colors.border} style={styles.emptyIcon} />
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
                  Nothing scheduled this week — enjoy the break!
                </Text>
              </>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.dayHeader}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => <WeekCard item={item} />}
      />
    </SafeAreaView>
  );
}

// ─── card ─────────────────────────────────────────────────────────────────────

function WeekCard({ item }: { item: WeekItem }) {
  const kindBg = KIND_BG[item.kind] ?? colors.primaryLight;
  const kindColor = KIND_COLOR[item.kind] ?? colors.primary;
  const kindLabel = KIND_LABEL[item.kind] ?? item.kind;
  const hasBody = !!item.body;
  const [expanded, setExpanded] = useState(false);

  const row = (
    <View style={styles.cardRow}>
      {/* Icon circle */}
      <View style={[styles.iconCircle, { backgroundColor: kindBg }]}>
        <Ionicons name={item.icon} size={18} color={kindColor} />
      </View>

      {/* Text column */}
      <View style={styles.cardText}>
        <View style={styles.cardTopRow}>
          <View style={[styles.kindPill, { backgroundColor: kindBg }]}>
            <Text style={[styles.kindPillText, { color: kindColor }]}>{kindLabel}</Text>
          </View>
          {item.slotStatus === 'pending' && (
            <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
          )}
          {item.slotStatus === 'accepted' && (
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          )}
        </View>
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

      {/* Time badge */}
      {!!item.timeLabel && (
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>{item.timeLabel}</Text>
        </View>
      )}
      {hasBody && (
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      )}
    </View>
  );

  if (!hasBody) {
    return <View style={styles.card}>{row}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={() => setExpanded(v => !v)}
      accessibilityRole="button"
    >
      {row}
      {expanded && <Text style={styles.cardBody}>{withVerseSuperscripts(item.body!)}</Text>}
    </Pressable>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: { paddingBottom: spacing.xxl },

  pageHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
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
    marginTop: 3,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.primary,
    textTransform: 'uppercase',
    flex: 1,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    ...shadow.card,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardBody: {
    marginTop: spacing.sm,
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSoft,
  },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  cardText: { flex: 1, gap: 2 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  kindPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  kindPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  cardLabel: {
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  cardSublabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  cardLocation: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },

  timeBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    flexShrink: 0,
  },
  timeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
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
