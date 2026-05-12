import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatWeek, upcomingWeeks, weekStart } from '@/lib/week';
import type { Profile, ScheduleEntry } from '@/types';

export function ScheduleScreen() {
  const { isLeader } = useAuth();
  const [schedule, setSchedule] = useState<Record<string, ScheduleEntry>>({});
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWeek, setEditingWeek] = useState<string | null>(null);

  const weeks = useMemo(() => upcomingWeeks(8), []);
  const currentWeek = weekStart();

  const load = useCallback(async () => {
    const [scheduleRes, membersRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('week_start, leader_id, notes, leader:profiles(id, display_name, avatar_url)')
        .gte('week_start', currentWeek),
      supabase.from('profiles').select('id, display_name, avatar_url, is_leader'),
    ]);
    const map: Record<string, ScheduleEntry> = {};
    for (const row of (scheduleRes.data as ScheduleEntry[] | null) ?? []) {
      map[row.week_start] = row;
    }
    setSchedule(map);
    setMembers((membersRes.data as Profile[] | null) ?? []);
  }, [currentWeek]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const assign = async (week: string, leaderId: string | null) => {
    const { error } = await supabase
      .from('schedule')
      .upsert({ week_start: week, leader_id: leaderId }, { onConflict: 'week_start' });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEditingWeek(null);
    await load();
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
        data={weeks}
        keyExtractor={(w) => w}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const entry = schedule[item];
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.week}>{formatWeek(item)}</Text>
                <Text style={styles.leader}>
                  {entry?.leader?.display_name ?? 'Unassigned'}
                </Text>
              </View>
              {isLeader && (
                <Pressable
                  onPress={() => setEditingWeek(item)}
                  style={({ pressed }) => [styles.assignBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.assignText}>Assign</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <Modal visible={!!editingWeek} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEditingWeek(null)}>
              <Text style={styles.cancel}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingWeek ? formatWeek(editingWeek) : ''}
            </Text>
            <View style={{ width: 50 }} />
          </View>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            ListHeaderComponent={
              <Pressable
                style={styles.memberRow}
                onPress={() => editingWeek && assign(editingWeek, null)}
              >
                <Text style={styles.memberName}>— Unassigned —</Text>
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.memberRow}
                onPress={() => editingWeek && assign(editingWeek, item.id)}
              >
                <Text style={styles.memberName}>{item.display_name ?? 'Unnamed'}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  rowMain: { flex: 1 },
  week: { fontSize: 13, color: '#888', marginBottom: 2 },
  leader: { fontSize: 17, fontWeight: '600' },
  assignBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  assignText: { color: '#2c6cf5', fontWeight: '600' },
  pressed: { opacity: 0.7 },
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
  cancel: { color: '#2c6cf5', fontSize: 16 },
  memberRow: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  memberName: { fontSize: 16 },
});
