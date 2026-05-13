import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Announcement } from '@/types';

export function AnnouncementsScreen() {
  const { session } = useAuth();
  const { group, myRole } = useGroup();
  const userId = session?.user.id;
  const isLeader = myRole === 'leader';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, author:profiles(id, display_name, avatar_url)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false });
    if (error) { Alert.alert('Could not load announcements', error.message); return; }
    setAnnouncements((data as Announcement[]) ?? []);
  }, [group.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime('announcements', load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const deleteAnnouncement = (a: Announcement) => {
    Alert.alert('Delete announcement?', a.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('announcements').delete().eq('id', a.id);
          if (error) Alert.alert('Error', error.message);
          else await load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={announcements}
        keyExtractor={a => a.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Announcements</Text>
              <Text style={styles.subtitle}>{group.name}</Text>
            </View>
            {isLeader && (
              <Pressable
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setModalOpen(true)}
              >
                <Text style={styles.addBtnText}>+</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No announcements yet.</Text>
            {isLeader && (
              <Text style={styles.emptyHint}>Tap + to post one.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {isLeader && item.created_by === userId && (
                  <Pressable onPress={() => deleteAnnouncement(item)} hitSlop={10}>
                    <Text style={styles.deleteBtn}>✕</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.cardBody2}>{item.body}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  {item.author?.display_name ?? 'Leader'}
                  {' · '}
                  {format(new Date(item.created_at), 'MMM d, yyyy')}
                </Text>
              </View>
            </View>
          </View>
        )}
      />

      {isLeader && (
        <CreateModal
          visible={modalOpen}
          groupId={group.id}
          userId={userId ?? ''}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { setModalOpen(false); await load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function CreateModal({
  visible, groupId, userId, onClose, onSaved,
}: {
  visible: boolean;
  groupId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing info', 'Title and body are required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('announcements').insert({
      group_id: groupId,
      title: title.trim(),
      body: body.trim(),
      created_by: userId,
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setTitle(''); setBody('');
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.modalAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Announcement</Text>
            <Pressable onPress={save} disabled={saving}>
              <Text style={[styles.modalAction, styles.modalSave]}>{saving ? '…' : 'Post'}</Text>
            </Pressable>
          </View>
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder="Write your announcement…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  flex1: { flex: 1 },
  list: { paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.4, lineHeight: 34 },
  subtitle: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: colors.surface, fontSize: 22, lineHeight: 24, marginTop: -1 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  cardAccent: { width: 4, backgroundColor: colors.primary },
  cardBody: { flex: 1, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, lineHeight: 22 },
  deleteBtn: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },
  cardBody2: { fontSize: 14, color: colors.textSoft, lineHeight: 21, marginTop: 6 },
  cardMeta: { marginTop: spacing.sm },
  metaText: { fontSize: 12, color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: 16, color: colors.textMuted },
  emptyHint: { fontSize: 13, color: colors.textMutedSoft, fontStyle: 'italic' },
  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  modalAction: { fontSize: 16, color: colors.primary },
  modalSave: { fontWeight: '700' },
  form: { padding: spacing.lg, gap: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  textArea: { minHeight: 140 },
});
