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
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { GroupEvent } from '@/types';

export function EventsScreen() {
  const { session, isLeader } = useAuth();
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEvents((data as GroupEvent[]) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No upcoming events yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.when}>
              {format(new Date(item.starts_at), 'EEE, MMM d • h:mm a')}
            </Text>
            {item.location ? <Text style={styles.location}>{item.location}</Text> : null}
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          </View>
        )}
      />

      {isLeader && (
        <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <NewEventModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={async () => {
          setModalOpen(false);
          await load();
        }}
        userId={session?.user.id ?? ''}
      />
    </SafeAreaView>
  );
}

function NewEventModal({
  visible,
  onClose,
  onCreated,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  userId: string;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [whenISO, setWhenISO] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !whenISO) {
      Alert.alert('Missing info', 'Title and date/time are required.');
      return;
    }
    const parsed = new Date(whenISO);
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Bad date', 'Use format YYYY-MM-DD HH:MM (e.g. 2026-06-01 19:00)');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      starts_at: parsed.toISOString(),
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setTitle('');
    setLocation('');
    setDescription('');
    setWhenISO('');
    onCreated();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New event</Text>
          <Pressable onPress={save} disabled={saving}>
            <Text style={[styles.headerAction, styles.save]}>{saving ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
        <View style={styles.form}>
          <TextInput
            placeholder="Title"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />
          <TextInput
            placeholder="When (YYYY-MM-DD HH:MM)"
            value={whenISO}
            onChangeText={setWhenISO}
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            placeholder="Location (optional)"
            value={location}
            onChangeText={setLocation}
            style={styles.input}
          />
          <TextInput
            placeholder="Description (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700' },
  when: { fontSize: 14, color: '#2c6cf5', fontWeight: '600' },
  location: { fontSize: 14, color: '#555' },
  description: { fontSize: 14, color: '#333', marginTop: 4 },
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
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerAction: { fontSize: 16, color: '#2c6cf5' },
  save: { fontWeight: '700' },
  form: { padding: 16, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
});
