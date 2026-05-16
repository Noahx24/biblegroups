/**
 * AdminScreen - accessible to admins from ProfileScreen.
 *
 * Manage group membership by browsing a group, then opening
 * AdminGroupMembersScreen to search the directory of registered users and
 * add / remove / change roles. The "Add" flow in AdminGroupMembersScreen
 * supports multi-select so an admin can add many existing users to a group
 * in one pass.
 *
 * Bulk CSV imports for migrating existing data are run by developers via
 * scripts/bulk_import_members.ts → admin_bulk_assign_members SQL RPC.
 * They're intentionally NOT exposed in the app UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRealtime } from '@/hooks/useRealtime';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Group } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Admin'>;
type GroupSummary = Group & { member_count: number };

export function AdminScreen() {
  const navigation = useNavigation<Nav>();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupQuery, setGroupQuery] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadGroups = useCallback(async () => {
    const [groupsRes, countsRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('group_members').select('group_id'),
    ]);
    if (!mountedRef.current) return;

    if (groupsRes.error) console.warn('groups load failed', groupsRes.error);
    if (countsRes.error) console.warn('group_member count load failed', countsRes.error);

    const counts: Record<string, number> = {};
    for (const row of (countsRes.data ?? []) as { group_id: string }[]) {
      counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
    }

    setGroups(((groupsRes.data ?? []) as Group[]).map(g => ({
      ...g,
      member_count: counts[g.id] ?? 0,
    })));
    setGroupsLoading(false);
  }, []);

  // Reload on focus so changes made in AdminGroupMembersScreen show up here too.
  useFocusEffect(useCallback(() => { loadGroups(); }, [loadGroups]));

  useRealtime('groups', loadGroups);
  useRealtime('group_members', loadGroups);

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, groupQuery]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionLabel}>Group Membership</Text>
        <View style={styles.card}>
          <Text style={styles.instructions}>
            Browse a group to add or remove leaders and members. You can search
            registered users by name or email and assign them directly.
          </Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={groupQuery}
              onChangeText={setGroupQuery}
              placeholder="Filter groups…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {groupQuery.length > 0 && (
              <Pressable onPress={() => setGroupQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {groupsLoading ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filteredGroups.length === 0 ? (
            <Text style={styles.emptyText}>
              {groups.length === 0 ? 'No groups exist yet.' : `No groups match "${groupQuery.trim()}".`}
            </Text>
          ) : (
            <View style={styles.groupList}>
              {filteredGroups.map((g, i) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupRow, i < filteredGroups.length - 1 && styles.groupRowDivider]}
                  onPress={() => navigation.navigate('AdminGroupMembers', { group: g })}
                >
                  <View style={[styles.groupTypeDot, { backgroundColor: g.type === 'class' ? colors.primary : colors.accent }]} />
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupMeta}>
                      {g.type === 'class' ? 'Class' : 'Volunteer'} · {g.member_count} member{g.member_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft, ...shadow.card, gap: spacing.md },
  instructions: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm - 2,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  groupList: { backgroundColor: colors.backgroundSoft, borderRadius: radius.md, overflow: 'hidden' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  groupRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  groupTypeDot: { width: 9, height: 9, borderRadius: 5 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  groupMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
