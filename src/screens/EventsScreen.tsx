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
import { useFocusEffect } from '@react-navigation/native';
import { format, parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGroup } from '@/context/GroupContext';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { EventRsvp, GroupEvent, RsvpStatus } from '@/types';

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Not going' },
];

export function EventsScreen() {
  const { session } = useAuth();
  const { group, myRole } = useGroup();
  const userId = session?.user.id;
  const isLeader = myRole === 'leader';

  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GroupEvent | null>(null);

  const load = useCallback(async () => {
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('group_id', group.id)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(50);

    if (eventsError) {
      Alert.alert('Error', eventsError.message);
      return;
    }
    const loadedEvents = (eventsData as GroupEvent[]) ?? [];
    setEvents(loadedEvents);

    if (loadedEvents.length > 0) {
      const ids = loadedEvents.map(e => e.id);
      const { data: rsvpData, error: rsvpError } = await supabase
        .from('event_rsvps')
        .select('*')
        .in('event_id', ids);
      if (rsvpError) console.warn('rsvp load failed', rsvpError);
      setRsvps((rsvpData as EventRsvp[]) ?? []);
    } else {
      setRsvps([]);
    }
  }, [group.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  useRealtime('events', load, `group_id=eq.${group.id}`);
  // event_rsvps has no group_id column, but it's keyed by event_id; a stale
  // change in another group's RSVPs will just trigger an extra fetch that
  // returns the same data. Filtering by event_id would require a per-event
  // subscription; the per-group debouncing isn't worth it here.
  useRealtime('event_rsvps', load);

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

  const deleteEvent = async (ev: GroupEvent) => {
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) { Alert.alert('Could not delete', error.message); return; }
    await load();
  };

  const openMenu = (ev: GroupEvent) => {
    const canManage = ev.created_by === userId || isLeader;
    if (!canManage) return;
    Alert.alert(ev.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => { setEditing(ev); setModalOpen(true); } },
      {
        text: 'Delete', style: 'destructive',
        onPress: () =>
          Alert.alert('Delete event?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(ev) },
          ]),
      },
    ]);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const rsvpsByEvent = useMemo(() => {
    const m: Record<string, EventRsvp[]> = {};
    for (const r of rsvps) (m[r.event_id] ??= []).push(r);
    return m;
  }, [rsvps]);

  const goingTotal = useMemo(
    () => rsvps.filter(r => r.user_id === userId && r.status === 'going').length,
    [rsvps, userId],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={events}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.pageTitle}>Events</Text>
              <Text style={styles.pageSubtitle}>
                {events.length} upcoming
                {goingTotal > 0 ? ` · You're going to ${goingTotal}` : ''}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No upcoming events yet.{isLeader ? ' Tap + to add one.' : ''}
          </Text>
        }
        renderItem={({ item }) => {
          const eventRsvps = rsvpsByEvent[item.id] ?? [];
          const mine = eventRsvps.find(r => r.user_id === userId)?.status ?? null;
          const goingCount = eventRsvps.filter(r => r.status === 'going').length;
          const canManage = item.created_by === userId || isLeader;
          return (
            <EventCard
              event={item}
              myRsvp={mine}
              goingCount={goingCount}
              canManage={canManage}
              onRsvp={status => setRsvp(item.id, status)}
              onMenu={() => openMenu(item)}
            />
          );
        }}
      />

      {isLeader && (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          accessibilityLabel="Create event"
          onPress={() => { if (modalOpen || !userId) return; setEditing(null); setModalOpen(true); }}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      )}

      <EventModal
        visible={modalOpen}
        onClose={closeModal}
        onSaved={async () => { closeModal(); await load(); }}
        userId={userId ?? ''}
        groupId={group.id}
        editing={editing}
      />
    </SafeAreaView>
  );
}

function EventCard({
  event, myRsvp, goingCount, canManage, onRsvp, onMenu,
}: {
  event: GroupEvent;
  myRsvp: RsvpStatus | null;
  goingCount: number;
  canManage: boolean;
  onRsvp: (s: RsvpStatus) => void;
  onMenu: () => void;
}) {
  const dateStr = format(new Date(event.starts_at), 'EEE · MMM d · HH:mm');

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
        {canManage && (
          <Pressable onPress={onMenu} hitSlop={12} accessibilityLabel="Event actions"
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
            <Text style={styles.menuDots}>⋯</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.eventDate}>{dateStr}</Text>

      {event.location ? (
        <View style={styles.locationRow}>
          <Text style={styles.locationPin}>⌖</Text>
          <Text style={styles.locationText}>{event.location}</Text>
        </View>
      ) : null}

      {event.description ? <Text style={styles.eventDesc}>{event.description}</Text> : null}

      <View style={styles.rsvpRow}>
        {RSVP_OPTIONS.map(opt => {
          const active = myRsvp === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onRsvp(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`RSVP ${opt.label}`}
              style={({ pressed }) => [
                styles.rsvpPill, active && styles.rsvpPillActive, pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.rsvpText, active && styles.rsvpTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
        <View style={styles.flex1} />
        <Text style={styles.goingCount}>{goingCount} going</Text>
      </View>
    </View>
  );
}

function EventModal({
  visible, onClose, onSaved, userId, groupId, editing,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  groupId: string;
  editing: GroupEvent | null;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [whenISO, setWhenISO] = useState('');
  const [saving, setSaving] = useState(false);

  const populate = (ev: GroupEvent | null) => {
    if (ev) {
      setTitle(ev.title);
      setLocation(ev.location ?? '');
      setDescription(ev.description ?? '');
      setWhenISO(format(new Date(ev.starts_at), 'yyyy-MM-dd HH:mm'));
    } else {
      setTitle(''); setLocation(''); setDescription(''); setWhenISO('');
    }
  };

  const save = async () => {
    if (!title.trim() || !whenISO) {
      Alert.alert('Missing info', 'Title and date/time are required.');
      return;
    }
    const trimmed = whenISO.trim();
    const parsed = parse(trimmed, 'yyyy-MM-dd HH:mm', new Date());
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Bad date', 'Use format YYYY-MM-DD HH:MM (e.g. 2026-06-01 19:00)');
      return;
    }
    // Catch overflow dates like Feb 30 or month 13 — date-fns rolls them forward silently
    const [datePart, timePart] = trimmed.split(' ');
    const [y, mo, d] = (datePart ?? '').split('-').map(Number);
    const [h, mi] = (timePart ?? '').split(':').map(Number);
    if (
      parsed.getFullYear() !== y ||
      parsed.getMonth() + 1 !== mo ||
      parsed.getDate() !== d ||
      parsed.getHours() !== h ||
      parsed.getMinutes() !== mi
    ) {
      Alert.alert('Bad date', 'Invalid date — check day, month and time values.');
      return;
    }
    if (parsed <= new Date()) {
      Alert.alert('Past date', 'Events must be scheduled in the future.');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      starts_at: parsed.toISOString(),
    };
    if (editing) {
      const { data: updated, error } = await supabase
        .from('events').update(payload).eq('id', editing.id).select();
      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
      if (!updated || updated.length === 0) {
        Alert.alert('Not found', 'This event may have been deleted. Please close and refresh.');
        return;
      }
    } else {
      const { data: created, error } = await supabase
        .from('events')
        .insert({ ...payload, group_id: groupId, created_by: userId })
        .select();
      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
      if (!created || created.length === 0) {
        Alert.alert('Could not create event', 'The event was not saved. You may not have permission to add events to this group.');
        return;
      }
    }
    onSaved();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={() => populate(editing)}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} accessibilityRole="button">
              <Text style={styles.modalAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{editing ? 'Edit event' : 'New event'}</Text>
            <Pressable onPress={save} disabled={saving} accessibilityRole="button">
              <Text style={[styles.modalAction, styles.modalSave]}>{saving ? '…' : 'Save'}</Text>
            </Pressable>
          </View>
          <View style={styles.form}>
            <TextInput placeholder="Title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} style={styles.input} />
            <TextInput placeholder="When (YYYY-MM-DD HH:MM)" placeholderTextColor={colors.textMuted} value={whenISO} onChangeText={setWhenISO} autoCapitalize="none" style={styles.input} />
            <TextInput placeholder="Location (optional)" placeholderTextColor={colors.textMuted} value={location} onChangeText={setLocation} style={styles.input} />
            <TextInput placeholder="Description (optional)" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} multiline style={[styles.input, styles.multiline]} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { paddingBottom: 100 },
  sectionHeader: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  pageTitle: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.4, lineHeight: 34 },
  pageSubtitle: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 4 },
  eventTitle: { fontFamily: fonts.serif, fontSize: 19, fontWeight: '600', color: colors.text, letterSpacing: -0.2, lineHeight: 24, flex: 1 },
  menuBtn: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  menuDots: { fontSize: 22, color: colors.textMuted, lineHeight: 22 },
  eventDate: { fontSize: 13, fontWeight: '700', color: colors.primary, letterSpacing: 0.1, marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  locationPin: { fontSize: 13, color: colors.textMuted },
  locationText: { fontSize: 13, color: colors.textMuted },
  eventDesc: { fontSize: 13.5, color: colors.textMuted, lineHeight: 20, marginBottom: 4 },
  rsvpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 14 },
  rsvpPill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  rsvpPillActive: { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  rsvpText: { fontSize: 13, fontWeight: '600', color: colors.textSoft, letterSpacing: 0.1 },
  rsvpTextActive: { color: '#fff' },
  goingCount: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, paddingHorizontal: spacing.xl },
  fab: {
    position: 'absolute', right: 18, bottom: 100, width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabIcon: { color: '#fff', fontSize: 28, lineHeight: 30, marginTop: -2 },
  pressed: { opacity: 0.75 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  modalAction: { fontSize: 16, color: colors.primary },
  modalSave: { fontWeight: '700' },
  form: { padding: spacing.lg, gap: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, backgroundColor: colors.surface, color: colors.text },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
});
