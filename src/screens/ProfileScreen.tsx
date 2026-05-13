import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { colors, radius, spacing } from '@/theme';
import type { Profile } from '@/types';

export function ProfileScreen() {
  const { session, signOut, isLeader, isAdmin } = useAuth();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  const [favoriteVerse, setFavoriteVerse] = useState('');
  const [favoriteHymn, setFavoriteHymn] = useState('');
  const [birthday, setBirthday] = useState('');
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
      .select('display_name, favorite_verse, favorite_hymn, birthday')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setDisplayName(data?.display_name ?? '');
        setFavoriteVerse(data?.favorite_verse ?? '');
        setFavoriteHymn(data?.favorite_hymn ?? '');
        setBirthday(data?.birthday ?? '');
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Refresh the admin members list whenever any profile row changes (live
  // is_leader toggles from another admin's device, name updates from members).
  useRealtime('profiles', loadMembers);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  const save = async () => {
    if (!userId) return;
    // Validate birthday: accept empty (clears it) or YYYY-MM-DD that parses to
    // a real calendar date. date-fns parse rejects e.g. 2026-13-99.
    const trimmedBirthday = birthday.trim();
    let birthdayValue: string | null = null;
    if (trimmedBirthday) {
      const parsed = parse(trimmedBirthday, 'yyyy-MM-dd', new Date());
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Bad birthday', 'Use format YYYY-MM-DD (e.g. 1990-04-15)');
        return;
      }
      birthdayValue = trimmedBirthday;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        favorite_verse: favoriteVerse.trim() || null,
        favorite_hymn: favoriteHymn.trim() || null,
        birthday: birthdayValue,
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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Favorite verse</Text>
          <TextInput
            value={favoriteVerse}
            onChangeText={setFavoriteVerse}
            placeholder="e.g. Philippians 4:13"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, styles.multiline]}
          />

          <Text style={styles.label}>Favorite hymn</Text>
          <TextInput
            value={favoriteHymn}
            onChangeText={setFavoriteHymn}
            placeholder="e.g. How Great Thou Art"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Birthday</Text>
          <TextInput
            value={birthday}
            onChangeText={setBirthday}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />

          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.primary, saving && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>

          <Text style={styles.email}>{session?.user.email}</Text>
          <View style={styles.badges}>
            {isAdmin && <Text style={[styles.badge, styles.adminBadge]}>Admin</Text>}
            {isLeader && <Text style={styles.badge}>Class leader</Text>}
          </View>

          {isAdmin && (
            <View style={styles.adminPanel}>
              <Text style={styles.sectionTitle}>Manage leaders</Text>
              <Text style={styles.sectionHint}>
                Toggle on to let a member edit verses, add schedule dates, and override claims.
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
                    trackColor={{ false: colors.border, true: colors.primary }}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  email: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  badges: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  adminBadge: { backgroundColor: '#FCEFD5', color: colors.accentDark },
  adminPanel: { marginTop: spacing.xl, gap: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionHint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, color: colors.text },
  signOut: { marginTop: spacing.xxl, padding: spacing.md, alignItems: 'center' },
  signOutText: { color: colors.primary, fontWeight: '600' },
});
