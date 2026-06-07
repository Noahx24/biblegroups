import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, radius, spacing } from '@/theme';
import type { Group, GroupType, MemberRole } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;

type PendingAssignment = {
  slotId: string;
  what: string;
  when: string;
  group: Group;
  myRole: MemberRole;
};

type SlotRow = {
  id: string;
  slot_date: string;
  slot_time: string | null;
  group_id: string;
  groups: (Group & { type: GroupType }) | null;
  volunteer_programmes: { name: string } | null;
};

/**
 * Top-of-screen banner shown when the signed-in user has pending slot
 * assignments they haven't responded to. Appears on sign-in (on mount) and
 * updates live. Tapping opens the slot's group; the close button dismisses it
 * for the session.
 */
export function AssignmentBanner() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<PendingAssignment[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) { setAssignments([]); return; }
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('schedule')
      .select('id, slot_date, slot_time, group_id, groups(*), volunteer_programmes(name)')
      .eq('assignee_id', userId)
      .eq('status', 'pending')
      .gte('slot_date', today)
      .order('slot_date', { ascending: true });
    if (error) { console.warn('AssignmentBanner load failed', error); return; }

    const rows = (data ?? []) as unknown as SlotRow[];
    if (rows.length === 0) { setAssignments([]); return; }

    // Resolve the user's role in each group (for navigation into GroupDetail).
    const groupIds = Array.from(new Set(rows.map(r => r.group_id)));
    const { data: mems } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', userId)
      .in('group_id', groupIds);
    const roleByGroup: Record<string, MemberRole> = {};
    for (const m of (mems ?? []) as { group_id: string; role: MemberRole }[]) {
      roleByGroup[m.group_id] = m.role;
    }

    const built: PendingAssignment[] = [];
    for (const r of rows) {
      if (!r.groups) continue;
      const groupName = r.groups.name;
      const programmeName = r.volunteer_programmes?.name ?? null;
      const what =
        r.groups.type === 'class'
          ? `leading ${groupName}`
          : programmeName
          ? `volunteering for ${programmeName}`
          : `volunteering for ${groupName}`;
      const [y, m, d] = r.slot_date.split('-').map(Number);
      const timeShort = r.slot_time ? String(r.slot_time).slice(0, 5) : null;
      const when = `${format(new Date(y, m - 1, d), 'EEE, d MMM')}${timeShort ? ` at ${timeShort}` : ''}`;
      built.push({
        slotId: r.id,
        what,
        when,
        group: r.groups,
        myRole: roleByGroup[r.group_id] ?? 'member',
      });
    }
    setAssignments(built);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useRealtime('schedule', load);

  const visible = assignments.filter(a => !dismissed.has(a.slotId));
  if (visible.length === 0) return null;

  const first = visible[0];
  const extra = visible.length - 1;
  const message =
    visible.length === 1
      ? `You're ${first.what} on ${first.when}.`
      : `You're ${first.what} on ${first.when}, plus ${extra} more.`;

  const onPress = () => {
    navigation.navigate('GroupDetail', { group: first.group, myRole: first.myRole });
  };

  const onDismiss = () => {
    setDismissed(prev => {
      const next = new Set(prev);
      for (const a of visible) next.add(a.slotId);
      return next;
    });
  };

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <Pressable style={styles.banner} onPress={onPress} accessibilityRole="button">
        <Ionicons name="notifications" size={18} color="#fff" style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={styles.title}>New assignment</Text>
          <Text style={styles.body} numberOfLines={2}>{message} Tap to view.</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  icon: { flexShrink: 0 },
  textCol: { flex: 1 },
  title: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { color: '#fff', fontSize: 14, lineHeight: 19, marginTop: 2, opacity: 0.95 },
  closeBtn: { flexShrink: 0, padding: 2 },
});
