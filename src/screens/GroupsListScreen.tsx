import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Group, MemberRole, Profile } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;

type GroupWithRole = Group & { myRole: MemberRole };
type GroupWithLeaders = Group & { leaders: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[] };
type GroupSection = { title: string; data: GroupWithLeaders[]; isMember: boolean };

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
  const [newClassNumber, setNewClassNumber] = useState('');
  const [newVolunteerName, setNewVolunteerName] = useState('');
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
        .eq('role', 'leader')
        .limit(200),
    ]);

    if (myRes.error) console.warn('myGroups load failed', myRes.error);
    if (membersRes.error) console.warn('members load failed', membersRes.error);

    type MyGroupRow = { groups: Group; role: string };
    type MemberRow = { group_id: string; profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null };

    const myGroupIds = new Set<string>();
    const mapped: GroupWithRole[] = ((myRes.data ?? []) as unknown as MyGroupRow[]).map((row) => {
      myGroupIds.add(row.groups.id);
      return { ...row.groups, myRole: row.role as MemberRole };
    });
    setMyGroups(mapped);

    // Attach leaders to each group
    const leadersByGroup: Record<string, Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]> = {};
    for (const row of ((membersRes.data ?? []) as unknown as MemberRow[])) {
      if (!row.profiles) continue;
      const p = row.profiles;
      (leadersByGroup[row.group_id] ??= []).push({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
    }

    const withLeaders: GroupWithLeaders[] = ((allRes.data ?? []) as Group[]).map((g) => ({
      ...g,
      leaders: leadersByGroup[g.id] ?? [],
    }));
    setAllGroups(withLeaders);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useRealtime('groups', load);
  useRealtime('group_members', load);

  const openGroup = (g: GroupWithRole) => {
    navigation.navigate('GroupDetail', { group: g, myRole: g.myRole });
  };

  const createGroup = async () => {
    if (newType === 'class') {
      const n = parseInt(newClassNumber.trim(), 10);
      if (!newClassNumber.trim() || isNaN(n) || n <= 0) {
        setError('Enter a valid class number (e.g. 38)');
        return;
      }
    } else {
      if (!newVolunteerName.trim()) return;
    }
    setSaving(true);
    setError(null);

    const groupName = newType === 'class'
      ? `Class ${parseInt(newClassNumber.trim(), 10)}`
      : newVolunteerName.trim();

    const { data: grp, error: grpErr } = await supabase
      .from('groups')
      .insert({
        name: groupName,
        type: newType,
        description: newDesc.trim() || null,
        meeting_time: newMeetingTime.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (grpErr || !grp) {
      setError(
        grpErr?.message?.includes('duplicate') || grpErr?.message?.includes('unique')
          ? `${groupName} already exists`
          : (grpErr?.message ?? 'Failed to create group')
      );
      setSaving(false);
      return;
    }

    // Volunteer groups have no leaders — creator is added as a plain member.
    const creatorRole = newType === 'class' ? 'leader' : 'member';
    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ group_id: grp.id, user_id: userId, role: creatorRole });
    if (memberErr) {
      setError(`Group "${groupName}" was created, but you weren't added: ${memberErr.message}`);
      setSaving(false);
      load();
      return;
    }
    setSaving(false);
    setShowCreate(false);
    setNewClassNumber(''); setNewVolunteerName(''); setNewType('class'); setNewDesc(''); setNewMeetingTime('');
    load();
  };

  const myGroupIds = new Set(myGroups.map(g => g.id));

  const GroupCard = ({ item, isMember }: { item: GroupWithLeaders; isMember?: boolean }) => {
    const myVersion = myGroups.find(g => g.id === item.id);
    // Class groups have a single leader displayed inline ("Class 38 — Jane Doe").
    // Volunteer groups don't surface leaders at all.
    const isClass = item.type === 'class';
    const primaryLeader = isClass ? item.leaders[0] ?? null : null;
    const coLeaderCount = isClass ? Math.max(item.leaders.length - 1, 0) : 0;
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
            {isClass && primaryLeader && (
              <View style={styles.classLeader}>
                <Avatar uri={primaryLeader.avatar_url} name={primaryLeader.display_name} size={22} />
                <Text style={styles.classLeaderName} numberOfLines={1}>
                  {primaryLeader.display_name ?? 'Leader'}
                </Text>
                {coLeaderCount > 0 && (
                  <Text style={styles.classLeaderMore}>+{coLeaderCount}</Text>
                )}
              </View>
            )}
            <View style={[styles.typePill, { backgroundColor: TYPE_COLOR[item.type] + '22' }]}>
              <Text style={[styles.typePillText, { color: TYPE_COLOR[item.type] }]}>
                {TYPE_LABEL[item.type]}
              </Text>
            </View>
          </View>
          {!!item.description && (
            <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
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

  // Non-admins browsing the directory only see class groups. Volunteer groups
  // are admin-managed and not relevant to a normal member who isn't already
  // part of one — anyone who IS in a volunteer group still sees it under
  // "My Groups" so they can access its schedule and announcements.
  const otherGroups = allGroups.filter(g => {
    if (myGroupIds.has(g.id)) return false;
    if (!isAdmin && g.type !== 'class') return false;
    return true;
  });

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
          <Text style={styles.sectionHeader}>{(section as GroupSection).title}</Text>
        )}
        renderItem={({ item, section }) => (
          <GroupCard item={item} isMember={(section as GroupSection).isMember} />
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
            <TouchableOpacity onPress={() => {
              setShowCreate(false);
              setNewClassNumber(''); setNewVolunteerName(''); setNewType('class');
              setNewDesc(''); setNewMeetingTime(''); setError(null);
            }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['class', 'volunteer'] as const).map(t => (
                <Pressable key={t} style={[styles.typeOption, newType === t && styles.typeOptionActive]}
                  onPress={() => { setNewType(t); setError(null); }}>
                  <Text style={[styles.typeOptionText, newType === t && styles.typeOptionTextActive]}>
                    {t === 'class' ? 'Class Group' : 'Volunteer Group'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {newType === 'class' ? (
              <>
                <Text style={styles.fieldLabel}>Class number *</Text>
                <View style={styles.classNumberRow}>
                  <View style={styles.classPrefix}>
                    <Text style={styles.classPrefixText}>Class</Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, styles.classNumberInput]}
                    value={newClassNumber}
                    onChangeText={v => { setNewClassNumber(v.replace(/[^0-9]/g, '')); setError(null); }}
                    placeholder="38"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Group name *</Text>
                <TextInput style={styles.textInput} value={newVolunteerName} onChangeText={setNewVolunteerName}
                  placeholder="e.g. Hospitality Team" placeholderTextColor={colors.textMuted} />
              </>
            )}

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={newDesc} onChangeText={setNewDesc}
              placeholder="Optional" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Meeting time</Text>
            <TextInput style={styles.textInput} value={newMeetingTime} onChangeText={setNewMeetingTime}
              placeholder="e.g. Sundays at 9 AM" placeholderTextColor={colors.textMuted} />

            <TouchableOpacity
              style={[styles.createBtn, (saving || (newType === 'class' ? !newClassNumber.trim() : !newVolunteerName.trim())) && styles.createBtnDisabled]}
              onPress={createGroup}
              disabled={saving || (newType === 'class' ? !newClassNumber.trim() : !newVolunteerName.trim())}>
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
  classLeader: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 180 },
  classLeaderName: { fontSize: 13, color: colors.textSoft, fontWeight: '500' },
  classLeaderMore: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  miniAvatar: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: '#fff', fontWeight: '700' },
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
  classNumberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  classPrefix: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm, justifyContent: 'center' },
  classPrefixText: { fontSize: 15, color: colors.textSoft, fontWeight: '600' },
  classNumberInput: { flex: 1 },
  typeOption: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  typeOptionTextActive: { color: colors.primary },
  createBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: colors.surface },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
});
