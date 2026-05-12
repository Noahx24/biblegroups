import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@/types';

export function ProfileScreen() {
  const { session, signOut, isLeader, isAdmin } = useAuth();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  const [favoriteVerse, setFavoriteVerse] = useState('');
  const [favoriteHymn, setFavoriteHymn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<Profile[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, favorite_verse, favorite_hymn, is_leader, is_admin')
      .order('display_name', { ascending: true });
    setMembers((data as Profile[] | null) ?? []);
  }, [isAdmin]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setDisplayName(data?.display_name ?? '');
        setFavoriteVerse(data?.favorite_verse ?? '');
        setFavoriteHymn(data?.favorite_hymn ?? '');
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        favorite_verse: favoriteVerse.trim() || null,
        favorite_hymn: favoriteHymn.trim() || null,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Saved');
  };

  const toggleLeader = async (memberId: string, next: boolean) => {
    setTogglingId(memberId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_leader: next })
      .eq('id', memberId);
    setTogglingId(null);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await loadMembers();
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          style={styles.input}
        />

        <Text style={styles.label}>Favorite verse</Text>
        <TextInput
          value={favoriteVerse}
          onChangeText={setFavoriteVerse}
          placeholder="e.g. Philippians 4:13"
          multiline
          style={[styles.input, styles.multiline]}
        />

        <Text style={styles.label}>Favorite hymn</Text>
        <TextInput
          value={favoriteHymn}
          onChangeText={setFavoriteHymn}
          placeholder="e.g. How Great Thou Art"
          style={styles.input}
        />

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>

        <Text style={styles.email}>{session?.user.email}</Text>
        <View style={styles.badges}>
          {isAdmin && <Text style={[styles.badge, styles.adminBadge]}>Admin</Text>}
          {isLeader && <Text style={styles.badge}>Group leader</Text>}
        </View>

        {isAdmin && (
          <View style={styles.adminPanel}>
            <Text style={styles.sectionTitle}>Manage leaders</Text>
            <Text style={styles.sectionHint}>
              Toggle on to let a member edit verses, schedule, and override claims.
            </Text>
            {members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {m.display_name ?? 'Unnamed'}
                    {m.is_admin ? ' (admin)' : ''}
                  </Text>
                </View>
                <Switch
                  value={m.is_leader}
                  disabled={togglingId === m.id}
                  onValueChange={(v) => toggleLeader(m.id, v)}
                />
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 13, color: '#666', textTransform: 'uppercase', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primary: { backgroundColor: '#2c6cf5', borderRadius: 8, padding: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '600' },
  pressed: { opacity: 0.8 },
  email: { textAlign: 'center', color: '#666', marginTop: 24 },
  badges: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  badge: {
    backgroundColor: '#eef2ff',
    color: '#2c6cf5',
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  adminBadge: { backgroundColor: '#fff4e5', color: '#a26200' },
  adminPanel: { marginTop: 24, gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionHint: { color: '#666', fontSize: 13, marginBottom: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15 },
  signOut: { marginTop: 32, padding: 12, alignItems: 'center' },
  signOutText: { color: '#c0392b', fontWeight: '600' },
});
