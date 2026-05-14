/**
 * AdminGroupMembersScreen — manage leaders and members of a single group.
 *
 * Accessible from AdminScreen for any admin (regular admin or super admin).
 *
 * Capabilities
 *   - View current leaders and members with avatars and names
 *   - Promote / demote between leader and member
 *   - Remove someone from the group
 *   - Add a user by searching the directory of registered users by name or email
 *   - Bulk select rows (long-press or "Select" header button) to remove or
 *     change role for multiple members at once
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Group, MemberRole, Profile } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type RouteParams = RouteProp<AppStackParamList, 'AdminGroupMembers'>;

type MemberRow = {
  user_id: string;
  role: MemberRole;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type DirectoryRow = Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>;

function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const initials = (name ?? '?')
    .split(' ')
    .map(s => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={[styles.initialsAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
    </View>
  );
}

export function AdminGroupMembersScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const group = route.params.group;

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, role, profiles(id, display_name, email, avatar_url)')
      .eq('group_id', group.id);
    if (!mountedRef.current) return;

    if (error) {
      console.warn('group_members load failed', error);
      setMembers([]);
    } else {
      type JoinRow = { user_id: string; role: string; profiles: { display_name: string | null; email: string | null; avatar_url: string | null } | null };
      const rows: MemberRow[] = ((data ?? []) as unknown as JoinRow[]).map((row) => ({
        user_id: row.user_id,
        role: row.role as MemberRole,
        display_name: row.profiles?.display_name ?? null,
        email: row.profiles?.email ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
      }));
      rows.sort((a, b) => (a.display_name ?? a.email ?? '').localeCompare(b.display_name ?? b.email ?? ''));
      setMembers(rows);
    }
    setLoading(false);
  }, [group.id]);

  useEffect(() => {
    load();
  }, [load]);

  const leaders = useMemo(() => members.filter(m => m.role === 'leader'), [members]);
  const regulars = useMemo(() => members.filter(m => m.role === 'member'), [members]);

  const toggleRole = async (m: MemberRow) => {
    const nextRole: MemberRole = m.role === 'leader' ? 'member' : 'leader';
    setBusyUserId(m.user_id);
    const { data, error } = await supabase
      .from('group_members')
      .update({ role: nextRole })
      .eq('group_id', group.id)
      .eq('user_id', m.user_id)
      .select();
    if (!mountedRef.current) return;
    setBusyUserId(null);
    if (error) {
      Alert.alert('Could not update role', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Could not update role', 'This member may have been removed by another admin.');
    }
    await load();
  };

  const confirmRemove = (m: MemberRow) => {
    const label = m.display_name ?? m.email ?? 'this user';
    Alert.alert(
      `Remove ${label}?`,
      `${label} will no longer be a ${m.role} of ${group.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMember(m),
        },
      ],
    );
  };

  const removeMember = async (m: MemberRow) => {
    setBusyUserId(m.user_id);
    const { data, error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', m.user_id)
      .select();
    if (!mountedRef.current) return;
    setBusyUserId(null);
    if (error) {
      Alert.alert('Could not remove member', error.message);
      return;
    }
    if (!data || data.length === 0) {
      // Already gone — either another admin removed them or RLS rejected
      // silently. Just refresh so the UI matches DB state.
    }
    await load();
  };

  const handleAdded = async () => {
    setShowAdd(false);
    await load();
  };

  const isVolunteer = group.type === 'volunteer';

  // ── Bulk select ────────────────────────────────────────────────────────────
  // Long-press a row to enter select mode; tap rows to toggle. Bulk remove uses
  // a single delete with .in('user_id', […]) so we don't make N round trips.

  const enterSelect = (initialId?: string) => {
    setSelectMode(true);
    if (initialId) setSelectedIds(new Set([initialId]));
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(members.map(m => m.user_id)));
  };

  const bulkRemove = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    Alert.alert(
      `Remove ${ids.length} member${ids.length === 1 ? '' : 's'}?`,
      `They will no longer belong to ${group.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            const { error } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', group.id)
              .in('user_id', ids);
            if (!mountedRef.current) return;
            setBulkBusy(false);
            if (error) { Alert.alert('Bulk remove failed', error.message); return; }
            exitSelect();
            await load();
          },
        },
      ],
    );
  };

  const bulkSetRole = (nextRole: MemberRole) => {
    if (selectedIds.size === 0) return;
    if (isVolunteer && nextRole === 'leader') {
      Alert.alert('Not allowed', 'Volunteer groups have members only.');
      return;
    }
    const ids = Array.from(selectedIds);
    (async () => {
      setBulkBusy(true);
      const { error } = await supabase
        .from('group_members')
        .update({ role: nextRole })
        .eq('group_id', group.id)
        .in('user_id', ids);
      if (!mountedRef.current) return;
      setBulkBusy(false);
      if (error) { Alert.alert('Bulk role change failed', error.message); return; }
      exitSelect();
      await load();
    })();
  };

  const renderMemberRow = (m: MemberRow, isLast: boolean) => {
    const busy = busyUserId === m.user_id;
    const selected = selectedIds.has(m.user_id);
    const onPress = selectMode ? () => toggleSelect(m.user_id) : undefined;
    const onLongPress = selectMode ? undefined : () => enterSelect(m.user_id);

    return (
      <TouchableOpacity
        key={m.user_id}
        style={[
          styles.memberRow,
          isLast && styles.memberRowLast,
          selected && styles.memberRowSelected,
        ]}
        activeOpacity={selectMode ? 0.7 : 1}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
      >
        {selectMode && (
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.primary : colors.textMuted}
          />
        )}
        <Avatar uri={m.avatar_url} name={m.display_name ?? m.email} size={38} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>
            {m.display_name ?? m.email ?? 'Unknown user'}
          </Text>
          {!!m.email && m.display_name && (
            <Text style={styles.memberEmail} numberOfLines={1}>{m.email}</Text>
          )}
        </View>
        {!selectMode && (isVolunteer ? (
          <View style={styles.rolePillStatic}>
            <Text style={styles.rolePillText}>Member</Text>
          </View>
        ) : (
          <Pressable
            style={styles.rolePill}
            onPress={() => toggleRole(m)}
            disabled={busy}
          >
            <Text style={styles.rolePillText}>{m.role === 'leader' ? 'Leader' : 'Member'}</Text>
            <Ionicons name="swap-vertical" size={11} color={colors.primary} />
          </Pressable>
        ))}
        {!selectMode && (
          <Pressable
            style={styles.removeBtn}
            onPress={() => confirmRemove(m)}
            disabled={busy}
            hitSlop={6}
          >
            {busy
              ? <ActivityIndicator size="small" color={colors.danger} />
              : <Ionicons name="close-circle" size={22} color={colors.danger} />}
          </Pressable>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {selectMode ? (
        <View style={[styles.header, styles.headerSelect]}>
          <Pressable onPress={exitSelect} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>
              {selectedIds.size} selected
            </Text>
            <Pressable onPress={selectAllVisible} hitSlop={4}>
              <Text style={styles.headerSelectAction}>Select all</Text>
            </Pressable>
          </View>
          {!isVolunteer && (
            <Pressable
              style={styles.bulkActionBtn}
              onPress={() => bulkSetRole('leader')}
              disabled={bulkBusy || selectedIds.size === 0}
              hitSlop={4}
              accessibilityLabel="Make selected members leaders"
              accessibilityRole="button"
            >
              <Ionicons name="star-outline" size={18} color={colors.primary} />
            </Pressable>
          )}
          {!isVolunteer && (
            <Pressable
              style={styles.bulkActionBtn}
              onPress={() => bulkSetRole('member')}
              disabled={bulkBusy || selectedIds.size === 0}
              hitSlop={4}
              accessibilityLabel="Make selected leaders members"
              accessibilityRole="button"
            >
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </Pressable>
          )}
          <Pressable
            style={[styles.bulkActionBtn, styles.bulkActionDanger]}
            onPress={bulkRemove}
            disabled={bulkBusy || selectedIds.size === 0}
            hitSlop={4}
            accessibilityLabel={`Remove ${selectedIds.size} selected members from group`}
            accessibilityRole="button"
          >
            {bulkBusy
              ? <ActivityIndicator size="small" color={colors.danger} />
              : <Ionicons name="trash-outline" size={18} color={colors.danger} />}
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.headerSub}>{group.type === 'class' ? 'Class group' : 'Volunteer group'}</Text>
          </View>
          {members.length > 0 && (
            <Pressable
              onPress={() => enterSelect()}
              hitSlop={6}
              style={styles.selectBtn}
            >
              <Text style={styles.selectBtnText}>Select</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.addBtn}
            onPress={() => setShowAdd(true)}
            hitSlop={6}
          >
            <Ionicons name="person-add" size={18} color={colors.surface} />
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!isVolunteer && (
            <>
              <Text style={styles.sectionLabel}>Leaders</Text>
              <View style={styles.card}>
                {leaders.length === 0
                  ? <Text style={styles.empty}>No leaders yet</Text>
                  : leaders.map((m, i) => renderMemberRow(m, i === leaders.length - 1))}
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>Members</Text>
          <View style={styles.card}>
            {(isVolunteer ? members : regulars).length === 0
              ? <Text style={styles.empty}>No members yet</Text>
              : (isVolunteer ? members : regulars).map((m, i) => {
                  const list = isVolunteer ? members : regulars;
                  return renderMemberRow(m, i === list.length - 1);
                })}
          </View>

          <Text style={styles.hint}>
            {selectMode
              ? 'Tap rows to add or remove from selection. Use the header icons to remove or change role for everyone selected.'
              : isVolunteer
                ? 'Volunteer groups have members only — no leader role. Tap the X to remove someone. Long-press a row or tap "Select" to bulk-edit.'
                : 'Tap the role pill to swap leader / member. Tap the X to remove a person. Long-press a row or tap "Select" to bulk-edit.'}
          </Text>
        </ScrollView>
      )}

      <AddMemberModal
        visible={showAdd}
        group={group}
        existingUserIds={members.map(m => m.user_id)}
        onClose={() => setShowAdd(false)}
        onAdded={handleAdded}
      />
    </SafeAreaView>
  );
}

/**
 * AddMemberModal — search the directory of all registered users by display_name
 * or email, pick one, choose a role, and upsert the group_member row.
 */
function AddMemberModal({
  visible,
  group,
  existingUserIds,
  onClose,
  onAdded,
}: {
  visible: boolean;
  group: Group;
  existingUserIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<DirectoryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedRole, setPickedRole] = useState<MemberRole>('member');
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!visible) {
      setTerm('');
      setResults([]);
    }
    // Volunteer groups are members-only; always reset to 'member'
    setPickedRole('member');
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      // Strip characters that have special meaning in PostgREST's .or() filter
      // syntax. ilike treats % as a wildcard, so wrapping in %...% is the
      // intended match anyway.
      const safe = trimmed.replace(/[%,()]/g, '');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url')
        .or(`display_name.ilike.%${safe}%,email.ilike.%${safe}%`)
        .limit(20);
      if (!mountedRef.current) return;
      if (reqId !== reqIdRef.current) return;
      if (error) {
        console.warn('user search failed', error);
        setResults([]);
      } else {
        setResults((data ?? []) as DirectoryRow[]);
      }
      setSearching(false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [term, visible]);

  const addUser = async (user: DirectoryRow) => {
    if (existingUserIds.includes(user.id)) {
      Alert.alert('Already in group', `${user.display_name ?? user.email ?? 'This user'} is already in ${group.name}.`);
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from('group_members')
      .upsert(
        { group_id: group.id, user_id: user.id, role: pickedRole },
        { onConflict: 'group_id,user_id' },
      );
    setAdding(false);
    if (error) {
      const msg = error.message.includes('one class group')
        ? `${user.display_name ?? user.email ?? 'This user'} is already in a different class group.`
        : error.message;
      Alert.alert('Could not add member', msg);
      return;
    }
    onAdded();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add to {group.name}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.modalBody}>
          {group.type === 'volunteer' ? (
            <View style={styles.volunteerRoleNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
              <Text style={styles.volunteerRoleNoteText}>
                Volunteer groups have members only — no leader role.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.roleRow}>
                {(['member', 'leader'] as const).map(r => (
                  <Pressable
                    key={r}
                    style={[styles.roleOption, pickedRole === r && styles.roleOptionActive]}
                    onPress={() => setPickedRole(r)}
                  >
                    <Text style={[styles.roleOptionText, pickedRole === r && styles.roleOptionTextActive]}>
                      {r === 'leader' ? 'Leader' : 'Member'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>Search by name or email</Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              autoFocus
              value={term}
              onChangeText={setTerm}
              placeholder="Start typing a name…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {term.length > 0 && (
              <Pressable onPress={() => setTerm('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {term.trim().length < 2 ? (
            <Text style={styles.searchHint}>Type at least 2 characters to search.</Text>
          ) : searching ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : results.length === 0 ? (
            <Text style={styles.searchHint}>No users match "{term.trim()}".</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={u => u.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const already = existingUserIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.searchResult, already && styles.searchResultDisabled]}
                    disabled={already || adding}
                    onPress={() => addUser(item)}
                  >
                    <Avatar uri={item.avatar_url} name={item.display_name ?? item.email} size={36} />
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {item.display_name ?? item.email ?? 'Unknown'}
                      </Text>
                      {!!item.email && (
                        <Text style={styles.memberEmail} numberOfLines={1}>{item.email}</Text>
                      )}
                    </View>
                    {already
                      ? <Text style={styles.alreadyText}>In group</Text>
                      : <Ionicons name="add-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  selectBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  headerSelect: { backgroundColor: colors.primaryLight, gap: spacing.sm },
  headerSelectAction: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  bulkActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft,
  },
  bulkActionDanger: { backgroundColor: '#fff' },

  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
    overflow: 'hidden',
  },
  empty: { padding: spacing.lg, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  memberRowLast: { borderBottomWidth: 0 },
  memberRowSelected: { backgroundColor: colors.primaryLight },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  memberEmail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 },
  rolePillStatic: {
    backgroundColor: colors.borderSoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  removeBtn: { padding: 2 },

  initialsAvatar: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#fff', fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },

  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
  modalBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  roleOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  roleOptionTextActive: { color: colors.primary },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  searchHint: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 4, paddingTop: spacing.sm },

  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
  },
  searchResultDisabled: { opacity: 0.5 },
  searchResultInfo: { flex: 1 },
  alreadyText: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft },

  volunteerRoleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  volunteerRoleNoteText: { fontSize: 13, color: colors.textMuted, flex: 1 },
});
