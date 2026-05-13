import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing } from '@/theme';
import type { EventRsvp, GroupEvent, RsvpStatus } from '@/types';

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
];

export function EventsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const [eventsRes, rsvpsRes] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true }),
      supabase.from('event_rsvps').select('*'),
    ]);
    if (eventsRes.error) {
      Alert.alert('Error', eventsRes.error.message);
      return;
    }
    if (rsvpsRes.error) {
      console.warn('rsvp fetch failed', rsvpsRes.error);
    }
    setEvents((eventsRes.data as GroupEvent[]) ?? []);
    setRsvps((rsvpsRes.data as EventRsvp[]) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setRsvp = async (eventId: string, status: RsvpStatus) => {
    if (!userId) return;
    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        { event_id: eventId, user_id: userId, status, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' },
      );
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await load();
  };

  const rsvpsByEvent = useMemo(() => {
    const m: Record<string, EventRsvp[]> = {};
    for (const r of rsvps) (m[r.event_id] ??= []).push(r);
    return m;
  }, [rsvps]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No upcoming events yet. Tap + to add one.</Text>
        }
        renderItem={({ item }) => {
          const eventRsvps = rsvpsByEvent[item.id] ?? [];
          const mine = eventRsvps.find((r) => r.user_id === userId)?.status ?? null;
          const goingCount = eventRsvps.filter((r) => r.status === 'going').length;
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.when}>
                {format(new Date(item.starts_at), 'EEE, MMM d • h:mm a')}
              </Text>
              {item.location ? <Text style={styles.location}>{item.location}</Text> : null}
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}

              <View style={styles.rsvpRow}>
                {RSVP_OPTIONS.map((opt) => {
                  const active = mine === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setRsvp(item.id, opt.value)}
                      style={({ pressed }) => [
                        styles.rsvpBtn,
                        active && styles.rsvpBtnActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.rsvpText, active && styles.rsvpTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text style={styles.count}>{goingCount} going</Text>
              </View>
            </View>
          );
        }}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        onPress={() => setModalOpen(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <NewEventModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={async () => {
          setModalOpen(false);
          await load();
        }}
        userId={userId ?? ''}
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
    const parsed = parse(whenISO.trim(), 'yyyy-MM-dd HH:mm', new Date());
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Bad date', 'Use format YYYY-MM-DD HH:MM (e.g. 2026-06-01 19:00)');
      return;
    }
    if (parsed <= new Date()) {
      Alert.alert('Past date', 'Events must be scheduled in the future.');
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
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              style={styles.input}
            />
            <TextInput
              placeholder="When (YYYY-MM-DD HH:MM)"
              placeholderTextColor={colors.textMuted}
              value={whenISO}
              onChangeText={setWhenISO}
              autoCapitalize="none"
              style={styles.input}
            />
            <TextInput
              placeholder="Location (optional)"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
              style={styles.input}
            />
            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  when: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  location: { fontSize: 14, color: colors.textMuted },
  description: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rsvpBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rsvpBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rsvpText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  rsvpTextActive: { color: '#fff' },
  count: { marginLeft: 'auto', color: colors.textMuted, fontSize: 13 },
  pressed: { opacity: 0.75 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  headerAction: { fontSize: 16, color: colors.primary },
  save: { fontWeight: '700' },
  form: { padding: spacing.lg, gap: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
});
