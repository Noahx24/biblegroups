import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
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
import type { Group, GroupMember, MemberRole } from '@/types';
import type { AppStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;

type GroupWithRole = Group & { myRole: MemberRole };

const TYPE_LABEL: Record<string, string> = { class: 'Class Group', volunteer: 'Volunteer Group' };
const TYPE_COLOR: Record<string, string> = { class: colors.primary, volunteer: colors.accent };

export function GroupsListScreen() {
  const { session, isAdmin } = useAuth();
  const navigation = useNavigation<Nav>();
  const userId = session?.user?.id ?? '';

  const [groups, setGroups] = useState<GroupWithRole[]>([]);
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
    setLoading(true);
    const { data, error: err } = await supabase
      .from('group_members')
      .select('role, groups(*)')
      .eq('user_id', userId);

    if (err) {
      console.warn('groups load failed', err);
      setLoading(false);
      return;
    }

    const mapped: GroupWithRole[] = (data ?? []).map((row: any) => ({
      ...row.groups,
      myRole: row.role as MemberRole,
    }));
    setGroups(mapped);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

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

    // Add creator as leader
    await supabase.from('group_members').insert({
      group_id: grp.id,
      user_id: userId,
      role: 'leader',
    });

    setSaving(false);
    setShowCreate(false);
    setNewName('');
    setNewType('class');
    setNewDesc('');
    setNewMeetingTime('');
    load();
  };

  const renderItem = ({ item }: { item: GroupWithRole }) => (
    <TouchableOpacity style={styles.card} onPress={() => openGroup(item)} activeOpacity={0.75}>
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
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        )}
        {!!item.meeting_time && (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.meeting_time}</Text>
          </View>
        )}
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {item.myRole === 'leader' ? 'Leader' : 'Member'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>My Groups</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={22} color={colors.surface} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={colors.border} />
          <Text style={styles.emptyText}>You haven't been added to any groups yet.</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

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
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Tuesday Morning Class"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['class', 'volunteer'] as const).map(t => (
                <Pressable
                  key={t}
                  style={[styles.typeOption, newType === t && styles.typeOptionActive]}
                  onPress={() => setNewType(t)}
                >
                  <Text style={[styles.typeOptionText, newType === t && styles.typeOptionTextActive]}>
                    {TYPE_LABEL[t]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="Optional description"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Meeting time</Text>
            <TextInput
              style={styles.textInput}
              value={newMeetingTime}
              onChangeText={setNewMeetingTime}
              placeholder="e.g. Sundays at 9 AM"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity
              style={[styles.createBtn, (!newName.trim() || saving) && styles.createBtnDisabled]}
              onPress={createGroup}
              disabled={!newName.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.createBtnText}>Create Group</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardAccent: { width: 5, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  typePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typePillText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { fontSize: 12, color: colors.textMuted },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleBadgeText: { fontSize: 11, color: colors.textSoft, fontWeight: '600' },
  chevron: { paddingRight: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
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
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalBody: { padding: spacing.lg, gap: spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.sm },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  typeOptionTextActive: { color: colors.primary },
  createBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: colors.surface },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
});
