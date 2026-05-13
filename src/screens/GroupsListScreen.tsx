import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Group, GroupMember, MemberRole, Profile } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;

type GroupWithRole = Group & { myRole: MemberRole };
type GroupWithLeaders = Group & { leaders: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[] };

const TYPE_LABEL: Record<string, string> = { class: 'Class', volunteer: 'Volunteer' };
const TYPE_COLOR: Record<string, string> = { class: colors.primary, volunteer: colors.accent };

function Avatar({ uri, name, size = 28 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const initials = (name ?? '?').split(' ').map(s => s[0] ?? '').join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.miniAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.miniAvatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function GroupsListScreen() {
  const { session, isAdmin } = useAuth();
  const navigation = useNavigation<Nav>();
  const userId = session?.user?.id ?? '';

  const [myGroups, setMyGroups] = useState<GroupWithRole[]>([]);
  const [allGroups, setAllGroups] = useState<GroupWithLeaders[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'class' | 'volunteer'>('class');
  const [newDesc, setNewDesc] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;

    const [myRes, allRes, membersRes] = await Promise.all([
      supabase.from('group_members').select('role, groups(*)').eq('user_id', userId),
      supabase.from('groups').select('*').order('name'),
      supabase
        .from('group_members')
        .select('group_id, role, profiles(id, display_name, avatar_url)')
        .eq('role', 'leader'),
    ]);

    const myGroupIds = new Set<string>();
    const mapped: GroupWithRole[] = (myRes.data ?? []).map((row: any) => {
      myGroupIds.add(row.groups.id);
      return { ...row.groups, myRole: row.role as MemberRole };
    });
    setMyGroups(mapped);

    // Attach leaders to each group
    const leadersByGroup: Record<string, Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]> = {};
    for (const row of (membersRes.data ?? []) as any[]) {
      if (!row.profiles) continue;
      const p = row.profiles;
      (leadersByGroup[row.group_id] ??= []).push({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
    }

    const withLeaders: GroupWithLeaders[] = (allRes.data ?? []).map((g: any) => ({
      ...g,
      leaders: leadersByGroup[g.id] ?? [],
    }));
    setAllGroups(withLeaders);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const openGroup = (g: GroupWithRole) => {
    navigation.navigate('GroupDetail', { group: g, myRole: g.myRole });
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);

    const { data: grp, error: grpErr } = await supabase
      .from('groups')
      .insert({
        name: newName.trim(),
        type: newType,
        description: newDesc.trim() || null,
        meeting_time: newMeetingTime.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (grpErr || !grp) {
      setError(grpErr?.message ?? 'Failed to create group');
      setSaving(false);
      return;
    }

    await supabase.from('group_members').insert({ group_id: grp.id, user_id: userId, role: 'leader' });
    setSaving(false);
    setShowCreate(false);
    setNewName(''); setNewType('class'); setNewDesc(''); setNewMeetingTime('');
    load();
  };

  const myGroupIds = new Set(myGroups.map(g => g.id));

  const GroupCard = ({ item, isMember }: { item: GroupWithLeaders; isMember?: boolean }) => {
    const myVersion = myGroups.find(g => g.id === item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => myVersion ? openGroup(myVersion) : undefined}
        activeOpacity={myVersion ? 0.75 : 1}
      >
        <View style={[styles.cardAccent, { backgroundColor: TYPE_COLOR[item.type] }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.cardName}>{item.name}</Text>
            <View style={[styles.typePill, { backgroundColor: TYPE_COLOR[item.type] + '22' }]}>
              <Text style={[styles.typePillText, { color: TYPE_COLOR[item.type] }]}>
                {TYPE_LABEL[item.type]}
              </Text>
            </View>
          </View>
          {!!item.description && (
            <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
          )}
          {item.leaders.length > 0 && (
            <View style={styles.leadersRow}>
              <View style={styles.avatarStack}>
                {item.leaders.slice(0, 3).map((l, i) => (
                  <View key={l.id} style={[styles.avatarWrap, { zIndex: 10 - i, marginLeft: i > 0 ? -8 : 0 }]}>
                    <Avatar uri={l.avatar_url} name={l.display_name} size={26} />
                  </View>
                ))}
              </View>
              <Text style={styles.leadersText}>
                {item.leaders.map(l => l.display_name ?? 'Leader').join(', ')}
              </Text>
            </View>
          )}
          {isMember && myVersion && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {myVersion.myRole === 'leader' ? 'Leader' : 'Member'}
              </Text>
            </View>
          )}
        </View>
        {myVersion && (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const otherGroups = allGroups.filter(g => !myGroupIds.has(g.id));

  return (
    <SafeAreaView style={styles.safe}>
      <SectionList
        sections={[
          { title: 'My Groups', data: myGroups.map(g => allGroups.find(ag => ag.id === g.id) ?? { ...g, leaders: [] }), isMember: true },
          { title: 'All Groups', data: otherGroups, isMember: false },
        ].filter(s => s.data.length > 0)}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Groups</Text>
            {isAdmin && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
                <Ionicons name="add" size={22} color={colors.surface} />
              </TouchableOpacity>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{(section as any).title}</Text>
        )}
        renderItem={({ item, section }) => (
          <GroupCard item={item as GroupWithLeaders} isMember={(section as any).isMember} />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No groups yet.</Text>
          </View>
        }
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Group</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Text style={styles.fieldLabel}>Group name *</Text>
            <TextInput style={styles.textInput} value={newName} onChangeText={setNewName}
              placeholder="e.g. Tuesday Morning Class" placeholderTextColor={colors.textMuted} />

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['class', 'volunteer'] as const).map(t => (
                <Pressable key={t} style={[styles.typeOption, newType === t && styles.typeOptionActive]}
                  onPress={() => setNewType(t)}>
                  <Text style={[styles.typeOptionText, newType === t && styles.typeOptionTextActive]}>
                    {t === 'class' ? 'Class Group' : 'Volunteer Group'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={newDesc} onChangeText={setNewDesc}
              placeholder="Optional" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Meeting time</Text>
            <TextInput style={styles.textInput} value={newMeetingTime} onChangeText={setNewMeetingTime}
              placeholder="e.g. Sundays at 9 AM" placeholderTextColor={colors.textMuted} />

            <TouchableOpacity
              style={[styles.createBtn, (!newName.trim() || saving) && styles.createBtnDisabled]}
              onPress={createGroup} disabled={!newName.trim() || saving}>
              {saving ? <ActivityIndicator color={colors.surface} size="small" /> :
                <Text style={styles.createBtnText}>Create Group</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.textMuted, textTransform: 'uppercase', paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 8 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card, marginBottom: spacing.sm },
  cardAccent: { width: 5, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardName: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  typePill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  typePillText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  leadersRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  avatarStack: { flexDirection: 'row' },
  avatarWrap: { borderRadius: 14, borderWidth: 1.5, borderColor: colors.surface },
  miniAvatar: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: '#fff', fontWeight: '700' },
  leadersText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  roleBadge: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.backgroundSoft, borderWidth: 1, borderColor: colors.border },
  roleBadgeText: { fontSize: 11, color: colors.textSoft, fontWeight: '600' },
  chevron: { paddingRight: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: 80 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: colors.text },
  modalBody: { padding: spacing.lg, gap: spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.sm },
  textInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm, fontSize: 15, color: colors.text },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeOption: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  typeOptionTextActive: { color: colors.primary },
  createBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: colors.surface },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
});
