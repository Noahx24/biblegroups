import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatWeek, weekStart } from '@/lib/week';
import type { ScheduleEntry } from '@/types';

export function ScheduleScreen() {
  const { session, isLeader } = useAuth();
  const userId = session?.user.id;
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('schedule')
      .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
      .gte('week_start', weekStart())
      .order('week_start', { ascending: true });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEntries((data as ScheduleEntry[] | null) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const claim = async (date: string) => {
    if (!userId) return;
    setBusyDate(date);
    // Chain .select() so we can detect the silent-no-op case where RLS filters
    // the row out (e.g. someone else just claimed it, so our claim_self USING
    // clause excludes the row and Postgres returns 0 affected rows + no error).
    const { data, error } = await supabase
      .from('schedule')
      .update({ leader_id: userId })
      .eq('week_start', date)
      .select();
    setBusyDate(null);
    if (error) {
      Alert.alert('Could not claim', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Already taken', 'Someone else just claimed this slot.');
    }
    await load();
  };

  const release = async (date: string) => {
    setBusyDate(date);
    const { data, error } = await supabase
      .from('schedule')
      .update({ leader_id: null })
      .eq('week_start', date)
      .select();
    setBusyDate(null);
    if (error) {
      Alert.alert('Could not release', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Could not release', 'You can only release a slot you own.');
    }
    await load();
  };

  const removeDate = (date: string) => {
    Alert.alert('Remove this date?', formatWeek(date), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('schedule').delete().eq('week_start', date);
          if (error) Alert.alert('Error', error.message);
          else await load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.week_start}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLeader ? 'Tap + to add a date.' : 'No schedule dates yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.leader_id && item.leader_id === userId;
          const claimed = !!item.leader_id;
          const busy = busyDate === item.week_start;
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.week}>{formatWeek(item.week_start)}</Text>
                <Text style={styles.leader}>
                  {item.leader?.display_name ?? 'Open — tap to lead'}
                </Text>
              </View>
              {mine ? (
                <Pressable
                  onPress={() => release(item.week_start)}
                  disabled={busy}
                  style={({ pressed }) => [styles.btn, styles.release, pressed && styles.pressed]}
                >
                  <Text style={styles.releaseText}>Release</Text>
                </Pressable>
              ) : !claimed ? (
                <Pressable
                  onPress={() => claim(item.week_start)}
                  disabled={busy}
                  style={({ pressed }) => [styles.btn, styles.claim, pressed && styles.pressed]}
                >
                  <Text style={styles.claimText}>I'll lead</Text>
                </Pressable>
              ) : null}
              {isLeader && (
                <Pressable
                  onPress={() => removeDate(item.week_start)}
                  style={({ pressed }) => [styles.delBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.delText}>×</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {isLeader && (
        <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <AddDateModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={async () => {
          setAddOpen(false);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function AddDateModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    // Parse rather than regex-match: /^\d{4}-\d{2}-\d{2}$/ would accept
    // "2026-13-99". date-fns parse rejects invalid month/day combinations.
    const parsed = parse(date.trim(), 'yyyy-MM-dd', new Date());
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Bad date', 'Use format YYYY-MM-DD (e.g. 2026-06-07)');
      return;
    }
    const normalized = format(parsed, 'yyyy-MM-dd');
    setSaving(true);
    const { error } = await supabase
      .from('schedule')
      .insert({ week_start: normalized, leader_id: null });
    setSaving(false);
    if (error) {
      // Postgres unique-violation code: date is already on the schedule.
      const msg = error.code === '23505'
        ? `${normalized} is already on the schedule.`
        : error.message;
      Alert.alert('Could not add date', msg);
      return;
    }
    setDate('');
    onAdded();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Add schedule date</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.headerAction, styles.headerSave]}>
              {saving ? '…' : 'Add'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Members can claim this date themselves from the Schedule tab.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 8,
  },
  rowMain: { flex: 1 },
  week: { fontSize: 13, color: '#888', marginBottom: 2 },
  leader: { fontSize: 17, fontWeight: '600' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  claim: { backgroundColor: '#eef2ff' },
  claimText: { color: '#2c6cf5', fontWeight: '600' },
  release: { backgroundColor: '#fff1f0' },
  releaseText: { color: '#c0392b', fontWeight: '600' },
  delBtn: { paddingHorizontal: 8 },
  delText: { color: '#999', fontSize: 22, lineHeight: 22 },
  pressed: { opacity: 0.7 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2c6cf5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  headerAction: { fontSize: 16, color: '#2c6cf5' },
  headerSave: { fontWeight: '700' },
  form: { padding: 16, gap: 8 },
  label: { fontSize: 13, color: '#666', textTransform: 'uppercase', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  hint: { color: '#888', fontSize: 13, marginTop: 4 },
});
