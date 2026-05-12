import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function ProfileScreen() {
  const { session, signOut, isLeader } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setDisplayName(data?.display_name ?? '');
        setLoading(false);
      });
  }, [session?.user?.id]);

  const save = async () => {
    if (!session?.user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Saved');
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
      <View style={styles.content}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
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
        {isLeader && <Text style={styles.badge}>Group leader</Text>}

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
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
  primary: { backgroundColor: '#2c6cf5', borderRadius: 8, padding: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '600' },
  pressed: { opacity: 0.8 },
  email: { textAlign: 'center', color: '#666', marginTop: 24 },
  badge: {
    alignSelf: 'center',
    backgroundColor: '#eef2ff',
    color: '#2c6cf5',
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  signOut: { marginTop: 32, padding: 12, alignItems: 'center' },
  signOutText: { color: '#c0392b', fontWeight: '600' },
});
